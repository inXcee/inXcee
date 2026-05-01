# Yeni Blok Seed Genişletmesi — Design

**Tarih:** 2026-05-01
**Durum:** Brainstorming → Spec onayı bekliyor
**İlgili dosya:** `backend/src/shared/db/seedProdRooms.js`

## Özet

AVSKAMP kampüsünün mevcut M ve S blok şemasına **ek olarak** 11 yeni blok (D, A1, A2, A3, A4, B, E, F, G, H, J) tanımlamak ve `seedProdRooms.js` üzerinden idempotent şekilde DB'ye eklemek. Yatak kapasiteleri bu fazda **placeholder=1** olarak girilecek; doğru sayılar sonraki bir aşamada blok bazlı düzenlenecek.

## Hedef ve kapsam

- **Kapsam içi:** `seedProdRooms.js` genişletmesi, ilgili testlerin güncellenmesi, dev ortamında doğrulama.
- **Kapsam dışı:** Yatak sayılarının doğru değerlere çekilmesi, frontend UI değişiklikleri, production deploy. Production'a açılması ayrı bir görev olarak sonra ele alınacak.
- **Üretim güvenliği:** Idempotent `INSERT OR IGNORE` deseni korunacağı için bu seed deploy edildiğinde mevcut M/S blokların kapasiteleri ya da odaları değişmez; sadece eksik blokların odaları eklenir.

## Mevcut durum

`backend/src/shared/db/seedProdRooms.js` (56 satır) şu an şunları seed ediyor:

| Blok | Kat | Kat başı oda | Numaralandırma | Kapasite | Toplam |
|------|-----|--------------|----------------|----------|--------|
| M1 | 2 | 30 | 101–130, 201–230 | 6 | 60 |
| M2 | 2 | 30 | 101–130, 201–230 | 6 | 60 |
| M3 | 2 | 30 | 101–130, 201–230 | 6 | 60 |
| S1 | 2 | 24 | 101–124, 201–224 | 6 | 48 |
| S2 | 2 | 24 | 101–124, 201–224 | 6 / 4 (2.kat) | 48 |
| S3 | 2 | 24 | 101–124, 201–224 | 6 | 48 |
| **Toplam** | | | | | **324** |

Şema notları:
- `rooms` tablosunda `room_no TEXT`, `UNIQUE(block, room_no)`.
- Tek CHECK constraint blok-spesifik: `block='S2' AND floor=2 → capacity<=4`. Diğer her şey `capacity<=6`.
- `INSERT OR IGNORE` sayesinde `seedProdRooms()` istenildiği kadar çağrılabilir, mevcut satırlar değişmez.

## Hedef durum

Eklenecek bloklar:

| Blok | Kat | Kat başı oda | Numaralandırma | Kapasite | Toplam |
|------|-----|--------------|----------------|----------|--------|
| D | 1 | 20 | 101–120 | 1 | 20 |
| A1 | 2 | 20 | 101–120, 201–220 | 1 | 40 |
| A2 | 2 | 20 | 101–120, 201–220 | 1 | 40 |
| A3 | 2 | 20 | 101–120, 201–220 | 1 | 40 |
| A4 | 2 | 20 | 101–120, 201–220 | 1 | 40 |
| B | 2 | 20 | 101–120, 201–220 | 1 | 40 |
| E | 3 | 20 | 101–120, 201–220, 301–320 | 1 | 60 |
| F | 3 | 10 | 101–110, 201–210, 301–310 | 1 | 30 |
| G | 3 | 20 | 101–120, 201–220, 301–320 | 1 | 60 |
| H | 1 | 20 | **1–20** (düz numaralandırma) | 1 | 20 |
| J | 1 | 20 | **1–20** (düz numaralandırma) | 1 | 20 |
| **Yeni toplam** | | | | | **410** |

**Genel toplam:** 324 (M+S) + 410 (yeni) = **734 oda**.

H ve J için "1–20" düz numaralandırması diğer tüm blokların "100'lü" formatından bilinçli olarak farklıdır. Şema TEXT olduğu için DB seviyesinde sorun çıkmaz; UI'da liste sıralaması doğal olarak "1, 10, 11, 12, 2, ..." gibi lexicographic sıralanabilir — bu sorunsa ileride ayrı bir UI iyileştirme olarak ele alınır.

## Çözüm tasarımı

### Kod organizasyonu

`seedProdRooms.js` mevcut M ve S döngülerinin altına üç ayrı döngü grubu eklenecek:

1. **2 katlı 20 odalı bloklar** — A1, A2, A3, A4, B → ortak döngü, kat başı 100/200.
2. **3 katlı bloklar** — E ve G (20 oda/kat), F (10 oda/kat) → konfigürasyon listesi üzerinden döngü, kat başı 100/200/300.
3. **Tek katlı, özel numaralandırmalı bloklar** — D (101–120), H (1–20), J (1–20) → küçük bir spec listesi, başlangıç ve bitiş numarası açık.

Tüm yeni odalarda `capacity=1, active_beds=1, status='active'` sabit. Mevcut tek `tx()` transaction'ı kullanılmaya devam edecek.

### Pseudokod

```js
// 2 katlı 20 odalı bloklar
const TWO_FLOOR_BLOCKS = ['A1','A2','A3','A4','B']
for (const block of TWO_FLOOR_BLOCKS) {
  for (let floor = 1; floor <= 2; floor++) {
    const base = floor === 1 ? 100 : 200
    for (let r = 1; r <= 20; r++) {
      insert.run(block, floor, String(base + r), 1, 1, 'active')
    }
  }
}

// 3 katlı bloklar — kat başı oda sayısı değişken
const THREE_FLOOR_BLOCKS = [
  { block: 'E', perFloor: 20 },
  { block: 'G', perFloor: 20 },
  { block: 'F', perFloor: 10 },
]
for (const { block, perFloor } of THREE_FLOOR_BLOCKS) {
  for (let floor = 1; floor <= 3; floor++) {
    const base = floor * 100
    for (let r = 1; r <= perFloor; r++) {
      insert.run(block, floor, String(base + r), 1, 1, 'active')
    }
  }
}

// Tek katlı, açık numaralandırma
const SINGLE_FLOOR_SPECS = [
  { block: 'D', floor: 1, start: 101, end: 120 },
  { block: 'H', floor: 1, start: 1,   end: 20  },
  { block: 'J', floor: 1, start: 1,   end: 20  },
]
for (const { block, floor, start, end } of SINGLE_FLOOR_SPECS) {
  for (let r = start; r <= end; r++) {
    insert.run(block, floor, String(r), 1, 1, 'active')
  }
}
```

`inserted` ve `skipped` sayaçları mevcut pattern ile uyumlu şekilde her insert sonrası güncellenecek.

### Şema/constraint etkisi

- Şu anki şema yeni blokları olduğu gibi kabul ediyor: blok adı için CHECK constraint yok, S2 dışı tüm odalar için `capacity<=6` constraint'i `capacity=1` ile uyumlu.
- `room_no TEXT` olduğu için H/J'nin "1"–"20" değerleri tip uyumlu.
- `UNIQUE(block, room_no)` her blok kendi içinde unique olduğu için H'nin "1"'i ve J'nin "1"'i çakışmaz.

## Test stratejisi

`backend/src/shared/db/seedProdRooms.test.js` aşağıdaki case'lerle genişletilecek:

- **Toplam oda sayısı:** seedProdRooms sonrası `COUNT(*) FROM rooms = 734`.
- **Blok bazlı sayı:** `D=20, A1=A2=A3=A4=B=40, E=G=60, F=30, H=J=20`.
- **H/J numaralandırma:** H ve J için `room_no` "1"–"20" formatında, "101" değil.
- **Kapasite:** Yeni 11 blok için `capacity=1 AND active_beds=1`.
- **Idempotency:** `seedProdRooms()` ikinci kez çağrıldığında `inserted=0, skipped=734`.
- **M/S koruma:** Yeni seed çalıştıktan sonra M1/M2/M3'ün kapasitesi 6, S2 2.kat kapasitesi 4 — değişmemiş olmalı.

Mevcut testler bozulmamalı — yeni eklenen testler ile birlikte tüm `seedProdRooms.test.js` yeşil olmalı.

## Doğrulama (smoke)

1. Lokal `yys.db` dosyası silinir, `initDB()` + `seedProdRooms()` baştan çalıştırılır.
2. SQLite kontrol sorgusu: `SELECT block, COUNT(*) c, MIN(capacity) cap_min, MAX(capacity) cap_max FROM rooms GROUP BY block ORDER BY block` — sonuç bu spec'teki tabloyla birebir.
3. Frontend dashboard / oda yönetim ekranında yeni blokların listede göründüğü görsel olarak doğrulanır.

## Riskler

- **UI sıralaması (düşük):** H ve J için "1, 10, 11, ..." şeklinde lexicographic sıralama ortaya çıkabilir. DB'yi etkilemez, ileride frontend'de zero-padding veya numeric sort ile çözülür.
- **Production deploy aşaması (kapsam dışı, sonradan):** Production DB'sinde aynı seed çalıştırıldığında M/S kayıtları değişmeden 410 oda eklenir; idempotent INSERT OR IGNORE bu güvenliği sağlıyor. Yine de deploy öncesi prod DB'nin yedeği alınmalı.

## Sonraki adımlar (bu spec'in dışında)

- Yatak kapasitelerinin blok bazlı doğru değerlere çekilmesi (UI veya ayrı SQL).
- Production deploy ve post-deploy smoke test.
