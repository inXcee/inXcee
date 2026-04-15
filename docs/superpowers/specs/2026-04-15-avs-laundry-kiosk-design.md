# AVS Çamaşırhane Kiosk & Hızlı Doluluk — Tasarım Dokümanı

**Tarih:** 2026-04-15  
**Durum:** Onaylandı

---

## Genel Bakış

Üç bağımsız geliştirme:

1. **AVS Çalışanları** — Yeni çalışan varlığı. Dormitory sakinlerinden (`personnel`) ve sistem yöneticilerinden (`users`) tamamen ayrı.
2. **Çamaşırhane Kiosk** (`/laundry-kiosk`) — AVS çalışanları için seri işlem ekranı. Torba al, hazır işaretle, kıyafet gir, teslim et, ütü, makine.
3. **Check-in Hızlı Doluluk** — Oda kartına "Hızlı Ekle" butonu. İsimsiz placeholder kaydı oluşturur, detay sonra doldurulur.

---

## 1. Veri Yapısı

### Yeni tablo: `avs_workers`

```sql
CREATE TABLE IF NOT EXISTS avs_workers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name  TEXT NOT NULL,
  role_label TEXT,                          -- "Çamaşırhane", "Ütü" vb.
  kiosk_pin  TEXT,                          -- bcrypt hash, 4 haneli
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
)
```

### Migration: `personnel` tablosuna kolon

```sql
ALTER TABLE personnel ADD COLUMN is_placeholder INTEGER DEFAULT 0
```

Placeholder kayıtlarda:
- `full_name = 'Anonim'`
- `tc_no = NULL`
- `is_placeholder = 1`
- Odaya atanmış, şirket/TC daha sonra doldurulur

---

## 2. Backend

### 2a. AVS Workers modülü (`backend/src/modules/avs-workers/`)

**`routes.js`** — prefix: `/avs-workers`, campus_manager only

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | Tüm çalışanları listele |
| POST | `/` | Yeni çalışan ekle (`full_name`, `role_label`) |
| PUT | `/:id` | Ad / rol etiketi güncelle |
| PUT | `/:id/pin` | PIN sıfırla (`new_pin`) |
| PUT | `/:id/toggle` | Aktif/pasif toggle |
| DELETE | `/:id` | Sil (pasif yapmak tercih edilir) |

**`queries.js`** — SQL sorguları  
**`avs-workers.test.js`** — Vitest + supertest testleri

### 2b. Auth modülü — AVS kiosk girişi

`backend/src/shared/auth/service.js`'e eklenir:

```js
searchAvsWorkers(q)        // isim arama, is_active=1
loginAvsKiosk(workerId, pin) // PIN doğrula, kiosk token üret (role: 'avs_kiosk')
```

`backend/src/shared/auth/routes.js`'e eklenir:

```
GET  /auth/avs-search?q=   // isim arama (public)
POST /auth/avs-login        // { worker_id, pin } → token
```

JWT payload: `{ workerId, role: 'avs_kiosk', full_name }`  
Token süresi: 4 saat

### 2c. Self-service modülü — laundry kiosk endpoint'leri

`backend/src/modules/self-service/routes.js`'e eklenir (middleware: `role === 'avs_kiosk'`):

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/laundry-kiosk/bag` | Torba al (yeni laundry item) |
| GET | `/laundry-kiosk/bags` | Blok/oda filtresiyle torbalar |
| PUT | `/laundry-kiosk/bags/:id/status` | Durum güncelle |
| POST | `/laundry-kiosk/garment` | Premium kıyafet gir |
| GET | `/laundry-kiosk/machines` | Makine listesi |
| PUT | `/laundry-kiosk/machines/:id/assign` | Torbayı makineye ata |
| GET | `/laundry-kiosk/room-persons` | Odadaki kişi listesi (`?block=A&room_no=205`) — `room_assignments JOIN personnel WHERE check_out_date IS NULL` |

**Torba Al** (`POST /laundry-kiosk/bag`) body:
```json
{
  "block": "A",
  "room_no": "205",
  "personnel_id": 42,       // opsiyonel
  "item_count": 2,
  "is_premium": false,
  "notes": "",
  "urgent": false,
  "intake_signature": "data:image/png;base64,..."
}
```

Mevcut `insertItemQuery` yeniden kullanılır — sadece `intake_signature` ve `room_id` lookup eklenir.

### 2d. Check-in modülü — placeholder endpoint

`backend/src/modules/checkin/routes.js`'e eklenir:

```
POST /checkin/placeholder-batch
body: { room_id, count }
```

`count` adet `is_placeholder=1` personnel oluşturur, odaya atar.  
Her biri için `full_name = 'Anonim'`, `tc_no = NULL`.

---

## 3. Frontend

### 3a. Admin — AVS Çalışanları (`/avs-workers`)

**Dosya:** `frontend/src/modules/admin/AvsWorkersPage.jsx`

**Düzen:** Vardiyalar sayfasıyla aynı pattern — sol liste + sağ panel.

Sol liste:
- Her kart: ad, rol etiketi, aktif/pasif rozeti
- Seçilen kart mavi vurgulanır
- Alt kısımda "Yeni Çalışan Ekle" butonu

Sağ panel (seçilen çalışan):
- Ad ve rol etiketi düzenleme inputları
- Kaydet butonu
- "PIN Sıfırla" → 4 haneli yeni PIN giriş alanı + onayla
- "Pasif Et" / "Aktif Et" toggle butonu
- Oluşturma tarihi

Sidebar: Admin grubuna `👷 AVS Çalışanları` eklenir (`campus_manager` only).

### 3b. Çamaşırhane Kiosk (`/laundry-kiosk`)

**Dosya:** `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`

App.jsx'e public route olarak eklenir (giriş gerektirmez, kendi token sistemi var).

**Giriş ekranı:**
- İsim arama (debounce 300ms, min 2 karakter)
- Sonuç listesi → kişi seç (PIN tanımlı olmayanlar disabled)
- PIN girişi (4 hane, gizli)
- Giriş butonu

**Ana ekran — 6 büyük buton (2x3 grid):**

```
🧺 Torba Al      ✅ Hazır İşaretle
👔 Kıyafet Gir   🚚 Teslim Et
🔥 Ütü           ⚙️ Makine
```

Üstte: çalışan adı + çıkış butonu.

**Torba Al akışı (modal/tam ekran form):**
1. Blok tab butonları — DB'deki `rooms` tablosundan `SELECT DISTINCT block` ile dinamik çekilir
2. Oda no (sayısal input)
3. Odadaki kişiler listesi (GET room-persons) → seç veya "Kişisiz" geç
4. Adet seç (1–8 buton)
5. Premium toggle — açıksa kıyafet türü + adet alanları açılır
6. Not alanı (opsiyonel)
7. Acil toggle
8. İmza canvas (react-signature-canvas veya mevcut canvas kodu)
9. Kaydet butonu

**Hazır İşaretle:** Oda/kişi arama → eşleşen torbalar listelenir → durum güncelle (collected→washing veya washing→ready)

**Kıyafet Gir:** Kişi arama → kıyafet türü + adet + imza → premium intake kaydı

**Teslim Et:** Hazır torbalar listesi → seç → imza → teslim edildi

**Ütü:** Torba ara → ütü durumu güncelle (bekliyor / devam ediyor / tamam)

**Makine:** Makine listesi → torbayı makineye ata / çıkar

### 3c. Check-in — Hızlı Doluluk

**Dosya:** `frontend/src/modules/checkin/CheckinPage.jsx` (veya ilgili oda liste bileşeni)

Her oda kartına **"Hızlı Ekle"** butonu eklenir.

Modal içeriği:
- "Bu odada kaç kişi var?" başlığı
- 1'den odanın kapasitesine kadar büyük sayı butonları
- Seç → `POST /checkin/placeholder-batch` → modal kapanır, liste yenilenir
- Listede `is_placeholder=1` kayıtlar **"Anonim · tamamlanmayı bekliyor"** + sarı rozet + "Düzenle" butonu olarak görünür

---

## 4. Güvenlik

- `/laundry-kiosk` route'u herkese açık (login ekranı kendi içinde)
- AVS kiosk token'ı `role: 'avs_kiosk'` — sadece `/self-service/laundry-kiosk/*` endpoint'lerine erişim sağlar
- AVS admin endpoint'leri `campus_manager` only
- Placeholder batch endpoint'i `requireAuth` + herhangi bir yetkili rol

---

## 5. Test Kapsamı

Her backend değişikliği için Vitest testleri:
- `avs-workers.test.js` — CRUD, PIN set/reset, toggle
- Auth testleri — AVS kiosk login (doğru/yanlış PIN, pasif çalışan)
- Self-service testleri — bag intake, status update, garment entry
- Checkin testleri — placeholder batch oluşturma

---

## 6. Faz Planı (Özet)

| Faz | İçerik |
|-----|--------|
| 1 | DB migration (avs_workers + is_placeholder) |
| 2 | AVS workers backend (CRUD + auth) |
| 3 | AVS workers frontend (admin sayfası + sidebar) |
| 4 | Laundry kiosk backend (bag, status, garment, machine endpoint'leri) |
| 5 | Laundry kiosk frontend (login + 6 işlem ekranı) |
| 6 | Check-in placeholder batch (backend + frontend) |
