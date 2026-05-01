# Yeni Blok Seed Genişletmesi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AVSKAMP DB seed'ine 11 yeni blok (D, A1, A2, A3, A4, B, E, F, G, H, J — toplam 410 oda) ekleyerek toplam oda sayısını 324'ten 734'e çıkarmak. Yatak kapasiteleri bu fazda placeholder=1; doğru sayılar sonradan düzenlenecek.

**Architecture:** Mevcut `seedProdRooms.js` (idempotent INSERT OR IGNORE) üzerine üç döngü grubu eklenir: (1) 2-katlı 20 odalı bloklar (A1-A4, B), (2) 3-katlı bloklar (E ve G 20'şer oda, F 10'ar oda), (3) tek-katlı bloklar (D 101–120, H ve J 1–20). Şema değişmez; tüm CHECK constraint'ler ve INSERT OR IGNORE garantisi mevcut M/S verisini koruyor.

**Tech Stack:** SQLite (`better-sqlite3`), Vitest, Node.js ES modules

**Spec:** `docs/superpowers/specs/2026-05-01-yeni-bloklar-design.md`

---

## File Structure

| Dosya | Eylem | Sorumluluk |
|-------|-------|------------|
| `backend/src/shared/db/seedProdRooms.js` | Modify | Yeni 11 blok için INSERT OR IGNORE döngüleri ekle |
| `backend/src/shared/db/seedProdRooms.test.js` | Modify | Mevcut "324" testlerini "734" beklentisine güncelle, yeni blok testleri ekle |

Başka dosyaya dokunulmuyor. Şema (`schema.js`) değişmiyor.

---

### Task 1: Test dosyasını yeni blok yapısına göre genişlet (RED phase)

**Files:**
- Modify: `backend/src/shared/db/seedProdRooms.test.js`

Bu task'ta tüm yeni testler ve mevcut testlerin güncellenmiş halleri yazılır. Implementation henüz yapılmadığı için testler **fail** etmelidir — bu beklenen "red phase".

- [ ] **Step 1: Mevcut "toplam 324" testini "toplam 734" olarak güncelle**

`backend/src/shared/db/seedProdRooms.test.js` içindeki şu testi:

```js
it('M1-M3 + S1-S3 toplam 324 oda olusturur', () => {
  const stats = seedProdRooms()
  expect(stats.inserted).toBe(324)
  expect(stats.skipped).toBe(0)
  expect(stats.total_in_db).toBe(324)
})
```

şununla değiştir:

```js
it('M1-M3 + S1-S3 + yeni 11 blok toplam 734 oda olusturur', () => {
  const stats = seedProdRooms()
  expect(stats.inserted).toBe(734)
  expect(stats.skipped).toBe(0)
  expect(stats.total_in_db).toBe(734)
})
```

- [ ] **Step 2: Idempotent testini 734'e güncelle**

Şunu:

```js
it('idempotent — ikinci cagrida yeni oda eklenmez', () => {
  seedProdRooms()
  const stats = seedProdRooms()
  expect(stats.inserted).toBe(0)
  expect(stats.skipped).toBe(324)
  expect(stats.total_in_db).toBe(324)
})
```

şununla değiştir:

```js
it('idempotent — ikinci cagrida yeni oda eklenmez', () => {
  seedProdRooms()
  const stats = seedProdRooms()
  expect(stats.inserted).toBe(0)
  expect(stats.skipped).toBe(734)
  expect(stats.total_in_db).toBe(734)
})
```

- [ ] **Step 3: 2-katlı 20 odalı bloklar (A1-A4, B) için sayım testi ekle**

Mevcut testlerin sonuna, `describe` bloğunun kapanışından önce ekle:

```js
it('A1-A4 ve B bloklari her biri 40 oda (2 kat x 20), tumu kapasite 1', () => {
  seedProdRooms()
  const db = getDB()
  for (const block of ['A1', 'A2', 'A3', 'A4', 'B']) {
    const count = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE block=?').get(block).c
    expect(count).toBe(40)
    const cap1 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND capacity=1").get(block).c
    expect(cap1).toBe(40)
  }
})
```

- [ ] **Step 4: 3-katlı bloklar (E, G, F) için sayım testi ekle**

```js
it('E ve G her biri 60 oda (3 kat x 20), F 30 oda (3 kat x 10), kapasite 1', () => {
  seedProdRooms()
  const db = getDB()
  for (const block of ['E', 'G']) {
    const count = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE block=?').get(block).c
    expect(count).toBe(60)
  }
  const fCount = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block='F'").get().c
  expect(fCount).toBe(30)
  for (const block of ['E', 'G', 'F']) {
    const cap1 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND capacity=1").get(block).c
    const total = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=?").get(block).c
    expect(cap1).toBe(total)
  }
})
```

- [ ] **Step 5: Tek katlı bloklar (D, H, J) için sayım testi ekle**

```js
it('D 20 oda (101-120), H ve J 20 oda (1-20 duz numarali), kapasite 1', () => {
  seedProdRooms()
  const db = getDB()
  for (const block of ['D', 'H', 'J']) {
    const count = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE block=?').get(block).c
    expect(count).toBe(20)
    const cap1 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND capacity=1").get(block).c
    expect(cap1).toBe(20)
  }
})
```

- [ ] **Step 6: H/J düz numaralandırma testi ekle**

```js
it('H ve J oda numaralari 1-20 araliginda (100lu format degil)', () => {
  seedProdRooms()
  const db = getDB()
  for (const block of ['H', 'J']) {
    const range = db.prepare("SELECT MIN(CAST(room_no AS INTEGER)) as mn, MAX(CAST(room_no AS INTEGER)) as mx FROM rooms WHERE block=?").get(block)
    expect(range.mn).toBe(1)
    expect(range.mx).toBe(20)
  }
})
```

- [ ] **Step 7: D blok 101-120 numaralandırma testi ekle**

```js
it('D blok oda numaralari 101-120 araliginda', () => {
  seedProdRooms()
  const db = getDB()
  const range = db.prepare("SELECT MIN(CAST(room_no AS INTEGER)) as mn, MAX(CAST(room_no AS INTEGER)) as mx FROM rooms WHERE block='D'").get()
  expect(range.mn).toBe(101)
  expect(range.mx).toBe(120)
})
```

- [ ] **Step 8: 3-katlı blok kat dağılımı testi ekle**

```js
it('E blok 3 kat (101-120, 201-220, 301-320), G blok ayni, F blok 3 kat 10ar oda', () => {
  seedProdRooms()
  const db = getDB()
  for (const block of ['E', 'G']) {
    for (let floor = 1; floor <= 3; floor++) {
      const count = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND floor=?").get(block, floor).c
      expect(count).toBe(20)
      const range = db.prepare("SELECT MIN(CAST(room_no AS INTEGER)) as mn, MAX(CAST(room_no AS INTEGER)) as mx FROM rooms WHERE block=? AND floor=?").get(block, floor)
      expect(range.mn).toBe(floor * 100 + 1)
      expect(range.mx).toBe(floor * 100 + 20)
    }
  }
  for (let floor = 1; floor <= 3; floor++) {
    const count = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block='F' AND floor=?").get(floor).c
    expect(count).toBe(10)
    const range = db.prepare("SELECT MIN(CAST(room_no AS INTEGER)) as mn, MAX(CAST(room_no AS INTEGER)) as mx FROM rooms WHERE block='F' AND floor=?").get(floor)
    expect(range.mn).toBe(floor * 100 + 1)
    expect(range.mx).toBe(floor * 100 + 10)
  }
})
```

- [ ] **Step 9: M/S blok kapasite koruma testi ekle**

Yeni seed çalıştığında M/S bloklarının kapasiteleri (6 ve S2 2.kat 4) değişmemiş olmalı.

```js
it('yeni bloklar eklendiginde M/S bloklarinin kapasiteleri korunur', () => {
  seedProdRooms()
  const db = getDB()
  const mCap = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block IN ('M1','M2','M3') AND capacity=6").get().c
  expect(mCap).toBe(180)
  const s1s3Cap = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block IN ('S1','S3') AND capacity=6").get().c
  expect(s1s3Cap).toBe(96)
  const s2f1Cap = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block='S2' AND floor=1 AND capacity=6").get().c
  expect(s2f1Cap).toBe(24)
  const s2f2Cap = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block='S2' AND floor=2 AND capacity=4").get().c
  expect(s2f2Cap).toBe(24)
})
```

- [ ] **Step 10: Testleri çalıştır ve fail ettiklerini doğrula**

Run:
```bash
cd backend && npx vitest run src/shared/db/seedProdRooms.test.js
```

Expected: Yeni eklenen 7 test ve güncellenen 2 test fail eder. Test özeti yaklaşık şöyle olmalı:
- "M1-M3 + S1-S3 + yeni 11 blok toplam 734 oda olusturur" → FAIL (`expected 734, received 324`)
- "idempotent — ikinci cagrida yeni oda eklenmez" → FAIL (`expected 734, received 324`)
- "A1-A4 ve B bloklari her biri 40 oda..." → FAIL (`expected 40, received 0`)
- "E ve G her biri 60 oda, F 30 oda..." → FAIL
- "D 20 oda (101-120), H ve J 20 oda..." → FAIL
- "H ve J oda numaralari 1-20 araliginda" → FAIL
- "D blok oda numaralari 101-120 araliginda" → FAIL
- "E blok 3 kat..., G blok ayni, F blok 3 kat 10ar oda" → FAIL
- "yeni bloklar eklendiginde M/S bloklarinin kapasiteleri korunur" → PASS (M/S zaten doğru, yeni bloklarla ilgili assertion yok)

Mevcut M/S testlerinden hiçbiri fail etmemeli (yeni implementation eklenmediği için davranış değişmedi).

- [ ] **Step 11: Sadece test dosyasını commit et (red phase)**

```bash
git add backend/src/shared/db/seedProdRooms.test.js
git commit -m "test(seed): yeni 11 blok icin sayim/numaralandirma/kapasite testleri (red)"
```

---

### Task 2: seedProdRooms.js'e yeni blok döngülerini ekle (GREEN phase)

**Files:**
- Modify: `backend/src/shared/db/seedProdRooms.js`

Bu task'ta üç döngü grubu mevcut S blok döngüsünden sonra (`tx` transaction'ı içinde) eklenir. Sonunda tüm testler geçmelidir.

- [ ] **Step 1: Header yorumunu güncelle**

`backend/src/shared/db/seedProdRooms.js` dosyasının başındaki yorum bloğunu (3-13. satırlar) şununla değiştir:

```js
// Production-safe room seeding: AVSKAMP kampüsü blokları.
//
// Layout (CLAUDE.md ve dev seed ile uyumlu):
//   M1, M2, M3 → 2 kat × 30 oda (101–130, 201–230) × kapasite 6
//   S1, S3     → 2 kat × 24 oda (101–124, 201–224) × kapasite 6
//   S2 1.kat   → 24 oda × kapasite 6
//   S2 2.kat   → 24 oda × kapasite 4   (DB CHECK constraint zorunluluğu)
//   D          → 1 kat × 20 oda (101–120) × kapasite 1 (placeholder)
//   A1-A4, B   → 2 kat × 20 oda (101–120, 201–220) × kapasite 1
//   E, G       → 3 kat × 20 oda (101–120, 201–220, 301–320) × kapasite 1
//   F          → 3 kat × 10 oda (101–110, 201–210, 301–310) × kapasite 1
//   H, J       → 1 kat × 20 oda (1–20 düz numaralı) × kapasite 1
//
// Toplam: 324 (M+S) + 410 (yeni 11 blok) = 734 oda
//
// Kapasite=1 placeholder; doğru yatak sayıları sonradan UI/SQL ile düzenlenecek.
//
// INSERT OR IGNORE → idempotent: birden fazla çağırsan da var olan odalar korunur.
```

- [ ] **Step 2: 2-katlı 20 odalı bloklar (A1-A4, B) döngüsünü ekle**

Mevcut S blok döngüsünün sonu (`tx` içinde, kapanış `}` öncesinde — yaklaşık 49. satır) şu şekilde:

```js
    // S blokları (S2 2.kat 4 kişilik)
    for (const block of ['S1', 'S2', 'S3']) {
      for (let floor = 1; floor <= 2; floor++) {
        const cap = (block === 'S2' && floor === 2) ? 4 : 6
        const base = floor === 1 ? 100 : 200
        for (let r = 1; r <= 24; r++) {
          const result = insert.run(block, floor, String(base + r), cap, cap, 'active')
          if (result.changes > 0) inserted++
          else skipped++
        }
      }
    }
  })
```

S blok döngüsü kapanışından (`    }` — son `}` `}` çiftinin ilki) sonra ve `tx` kapanışından (`  })`) önce şu yeni blokları ekle:

```js
    // 2 katlı 20 odalı bloklar — A1, A2, A3, A4, B (kapasite 1 placeholder)
    const TWO_FLOOR_BLOCKS = ['A1', 'A2', 'A3', 'A4', 'B']
    for (const block of TWO_FLOOR_BLOCKS) {
      for (let floor = 1; floor <= 2; floor++) {
        const base = floor === 1 ? 100 : 200
        for (let r = 1; r <= 20; r++) {
          const result = insert.run(block, floor, String(base + r), 1, 1, 'active')
          if (result.changes > 0) inserted++
          else skipped++
        }
      }
    }
```

- [ ] **Step 3: 3-katlı bloklar (E, G, F) döngüsünü ekle**

Önceki adımda eklenen TWO_FLOOR bloğunun hemen altına ekle:

```js
    // 3 katlı bloklar — E ve G 20'şer oda, F 10'ar oda (kapasite 1 placeholder)
    const THREE_FLOOR_BLOCKS = [
      { block: 'E', perFloor: 20 },
      { block: 'G', perFloor: 20 },
      { block: 'F', perFloor: 10 },
    ]
    for (const { block, perFloor } of THREE_FLOOR_BLOCKS) {
      for (let floor = 1; floor <= 3; floor++) {
        const base = floor * 100
        for (let r = 1; r <= perFloor; r++) {
          const result = insert.run(block, floor, String(base + r), 1, 1, 'active')
          if (result.changes > 0) inserted++
          else skipped++
        }
      }
    }
```

- [ ] **Step 4: Tek katlı bloklar (D, H, J) döngüsünü ekle**

Önceki adımda eklenen THREE_FLOOR bloğunun hemen altına ekle:

```js
    // Tek katlı bloklar — D 101-120, H ve J 1-20 düz numaralı (kapasite 1 placeholder)
    const SINGLE_FLOOR_SPECS = [
      { block: 'D', floor: 1, start: 101, end: 120 },
      { block: 'H', floor: 1, start: 1,   end: 20  },
      { block: 'J', floor: 1, start: 1,   end: 20  },
    ]
    for (const { block, floor, start, end } of SINGLE_FLOOR_SPECS) {
      for (let r = start; r <= end; r++) {
        const result = insert.run(block, floor, String(r), 1, 1, 'active')
        if (result.changes > 0) inserted++
        else skipped++
      }
    }
```

Bu üç ekleme `tx` transaction callback'inin içinde, S blok döngüsünden hemen sonra yer alır. Sonrasında transaction kapanışı (`  })`) ve `tx()` çağrısı mevcut haliyle kalır.

- [ ] **Step 5: Testleri çalıştır ve hepsinin geçtiğini doğrula**

Run:
```bash
cd backend && npx vitest run src/shared/db/seedProdRooms.test.js
```

Expected: **Tüm testler PASS**. Toplam ~16 test (mevcut 9 + yeni 7), hepsi yeşil. Hata varsa şu üç kontrolü yap:
1. `tx` transaction içindeki kapanış parantezi sayısı doğru mu? (Üç yeni döngü grubu da `tx` callback'inin **içinde** olmalı, dışında değil.)
2. `insert` prepared statement parametre sayısı (6 parametre: block, floor, room_no, capacity, active_beds, status) — yeni döngülerde de aynı sırada mı?
3. `inserted++` ve `skipped++` her döngüde doğru güncelleniyor mu?

- [ ] **Step 6: Tüm backend test paketini çalıştır (regresyon kontrolü)**

Run:
```bash
cd backend && npm run test
```

Expected: Tüm test paketi PASS. Başka bir test seedProdRooms davranışına bağımlıysa fail edebilir — etmemeli, ama olduysa o teste bak ve yeni 734 oda sayısına göre güncelle.

- [ ] **Step 7: seedProdRooms.js + (varsa) regresyon düzeltmelerini commit et**

```bash
git add backend/src/shared/db/seedProdRooms.js
git commit -m "feat(seed): 11 yeni blok ekle (D, A1-A4, B, E, F, G, H, J — toplam 410 oda)"
```

Eğer Step 6'da başka bir test güncellemesi gerektiyse onları ayrı commit et:

```bash
git add <regresyon-icin-degisen-test-dosyalari>
git commit -m "test: yeni blok eklenmesi kaynakli test guncellemeleri"
```

---

### Task 3: Lokal smoke doğrulaması

**Files:**
- Run: lokal `yys.db` (proje kökünde)

Bu task manueldir — kod commit edilmedi, sadece dev ortamında DB'nin gerçekten 734 odayla seed edildiğini ve frontend'in yeni blokları gösterdiğini doğrularız.

- [ ] **Step 1: Lokal yys.db'yi yedekle (varsa)**

Run:
```bash
[ -f yys.db ] && cp yys.db yys.db.bak.2026-05-01 || echo "yys.db yok, yedek atlanir"
```

Expected: Mevcut DB varsa `yys.db.bak.2026-05-01` adıyla kopyalanır. Yoksa "yedek atlanır" mesajı.

- [ ] **Step 2: yys.db'yi sil (geliştirme ortamı sıfırlama)**

Run:
```bash
rm -f yys.db yys.db-shm yys.db-wal
```

Expected: Üç dosya silinir (WAL ve SHM dosyaları varsa onlar da). Hata mesajı çıkmaz.

- [ ] **Step 3: initDB + seedProdRooms baştan çağır**

Run:
```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(()=>import('./src/shared/db/seedProdRooms.js')).then(m=>{const r=m.seedProdRooms(); console.log(JSON.stringify(r))})"
```

Expected: Konsola JSON çıktısı yazılır:
```json
{"inserted":734,"skipped":0,"total_in_db":734}
```

Eğer `inserted` 734 değilse Task 2'ye geri dön.

- [ ] **Step 4: SQL ile blok bazlı sayım kontrolü**

Run:
```bash
sqlite3 yys.db "SELECT block, COUNT(*) c, MIN(capacity) cap_min, MAX(capacity) cap_max FROM rooms GROUP BY block ORDER BY block"
```

Expected çıktı:
```
A1|40|1|1
A2|40|1|1
A3|40|1|1
A4|40|1|1
B|40|1|1
D|20|1|1
E|60|1|1
F|30|1|1
G|60|1|1
H|20|1|1
J|20|1|1
M1|60|6|6
M2|60|6|6
M3|60|6|6
S1|48|6|6
S2|48|4|6
S3|48|6|6
```

Sıralama lexicographic olduğu için yeni bloklar önce, M/S sonra gelir. Toplam 17 blok. M/S kapasitelerinin (6 ve S2'de min 4) **değişmemiş** olması kritik.

- [ ] **Step 5: H ve J düz numaralandırma kontrolü**

Run:
```bash
sqlite3 yys.db "SELECT block, room_no FROM rooms WHERE block IN ('H','J') ORDER BY block, CAST(room_no AS INTEGER) LIMIT 5"
```

Expected:
```
H|1
H|2
H|3
H|4
H|5
```

Numaralandırma "1, 2, ..." şeklinde başlamalı. Eğer "101, 102" görüyorsan implementation'da SINGLE_FLOOR_SPECS yanlış.

- [ ] **Step 6: Frontend'de yeni blokların listede göründüğünü görsel olarak doğrula**

Run (proje kökünden):
```bash
npm run dev
```

Tarayıcıda http://localhost:5173 → mudur/admin123 ile giriş → oda yönetim / dashboard sayfası. Yeni blokların (D, A1-A4, B, E, F, G, H, J) listede göründüğü ve klikleyince odaların açıldığı görülmeli. Tıklayınca odaların kapasiteleri "1" görünür, bu beklenen (placeholder).

Görsel kontrol bittikten sonra dev server'ı durdur (Ctrl+C).

- [ ] **Step 7: Smoke doğrulamasını commit notu olarak kaydet (kod değişikliği yok)**

Smoke doğrulaması başarılıysa commit gerekmez. Başarısızsa Task 1 veya 2'ye geri dön ve düzelt.

---

## Self-Review

Bu plan'ı yazdıktan sonra spec'e karşı kontrolüm:

1. **Spec coverage:**
   - "Yeni 11 blok seed" → Task 2 (Step 2-4)
   - "TWO_FLOOR / THREE_FLOOR / SINGLE_FLOOR pseudokod" → Task 2 birebir takip ediyor
   - "Test stratejisi 6 case" → Task 1 Step 1-9 birebir + ekstra (D ve 3-katlı kat dağılımı)
   - "Smoke doğrulaması" → Task 3
   - "Şema/constraint etkisi yok" → Task 2 Step 5'te tüm test paketi çalıştırılarak dolaylı doğrulama
   - "Production deploy kapsam dışı" → planda bu task yok, doğru

2. **Placeholder yok:** Tüm step'lerde tam komut/kod var, "TODO/TBD/sonra" ifadesi yok.

3. **Type/isim tutarlılığı:** `TWO_FLOOR_BLOCKS`, `THREE_FLOOR_BLOCKS`, `SINGLE_FLOOR_SPECS` adları Task 1 ve Task 2 boyunca tutarlı. Test isimleri ile implementation arasında çelişki yok.
