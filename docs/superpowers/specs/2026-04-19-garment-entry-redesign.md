# Gelişmiş Kıyafet Girişi — Tasarım Dokümanı

**Tarih:** 2026-04-19  
**Kapsam:** AVS Laundry Kiosk kıyafet giriş formu yeniden tasarımı + admin yönetim paneli

---

## 1. Hedef

Mevcut kiosk çanta kayıt formundaki kıyafet girişi yalnızca tür dropdown + adet sayısı içeriyor. Kullanıcı her kıyafet için tür, renk(ler)/desen, adet girebilmeli. Kıyafet tipleri yöneticiler tarafından özelleştirilebilmeli (ekleme, düzenleme, gizleme, emoji/resim atama).

---

## 2. Veri Katmanı

### Yeni Tablo: `laundry_garment_types`

```sql
CREATE TABLE laundry_garment_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  emoji       TEXT,
  image_url   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- `emoji` veya `image_url`'den biri dolu olur; ikisi de varsa `image_url` önceliklidir.
- `is_active = 0` ile tip gizlenir; silinmez (geçmiş verilere referans bozulmasın).
- `sort_order` sürükle-bırak sıralaması için kullanılır.

### Seed Verileri (başlangıç tipleri)

| name | emoji |
|------|-------|
| Gömlek | 👔 |
| Pantolon | 👖 |
| Mont | 🧥 |
| Elbise | 👗 |
| Kazak | 🧣 |
| İç Çamaşır | 🩲 |
| Çorap | 🧤 |
| Tişört | 👕 |
| Şort | 🩳 |
| Pijama | 🛌 |
| Havlu | 🪣 |

### Migration

`v6_garment_types` migration olarak eklenir; idempotency check ile korunur.

---

## 3. Backend Endpoints

### Garment Types (public — kiosk ve hub erişebilir)

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/laundry/garment-types` | Aktif tipleri sıraya göre listele |
| GET | `/laundry/garment-types/all` | Admin: tüm tipler (pasifler dahil) |
| POST | `/laundry/garment-types` | Yeni tip ekle |
| PATCH | `/laundry/garment-types/:id` | Tip güncelle (name/emoji/image_url/sort_order/is_active) |
| POST | `/laundry/garment-types/reorder` | `[{id, sort_order}]` array ile toplu sıra güncelle |

Auth: `GET /garment-types` → `requireKioskOrStaff`. `GET /garment-types/all` → `laundryFull`. POST/PATCH/reorder → `laundryFull`.

---

## 4. Kiosk Kıyafet Girişi Akışı

### Mevcut Durum

`BagForm` içinde basit bir satır: tür dropdown + adet sayısı. Çanta başına tek kıyafet tipi giriliyor.

### Yeni Akış

`BagForm` içindeki kıyafet giriş bölümü, aşağıdaki bileşenle değiştirilir:

**`GarmentPicker` bileşeni** — tek ekran, adımlar aşağı doğru açılır:

1. **Tür seçimi (Emoji Grid)**
   - 4 sütun grid, büyük dokunma hedefleri (min 72px × 72px)
   - Her hücre: resim varsa `<img>` yoksa emoji + tip adı
   - Seçilen hücre highlight (mavi border + arka plan)

2. **Renk / Desen seçimi** (tip seçilince açılır)
   - Chip listesi, çoklu seçim
   - **Renkler:** Beyaz · Mavi · Siyah · Gri · Kırmızı · Yeşil · Sarı · Mor · Bej · Kahve
   - **Desenler:** Çizgili · Kareli · Desenli · Renkli
   - Seçilen chip'ler vurgulanır; seçim zorunlu değil (pas geçilebilir)

3. **Adet seçimi** (tip seçilince açılır)
   - Büyük − / + butonları, orta: sayı
   - Minimum 1

4. **"Ekle" butonu**
   - Seçilen kıyafet `garments[]` listesine eklenir: `{type_id, type_name, emoji, image_url, colors: [], count}`
   - Grid sıfırlanır, yeni kıyafet girilebilir

### Çanta Özet Listesi

Eklenen kıyafetler formun altında kart listesi olarak görünür:
- Emoji/resim + tip adı + renk chip'leri + adet
- Kalem ikonu: düzenleme (kıyafeti picker'a geri yükler)
- Çöp ikonu: listeden siler

### Gönderim

`POST /laundry-kiosk/bag` body'sine `garments` alanı eklenir:
```json
{
  "room_id": 5,
  "garments": [
    { "type_id": 1, "type_name": "Gömlek", "colors": ["Beyaz", "Çizgili"], "count": 2 },
    { "type_id": 3, "type_name": "Mont", "colors": ["Siyah"], "count": 1 }
  ]
}
```
Backend bu alanı `laundry_items.garments_json` TEXT kolonuna JSON olarak saklar. `notes` kolonu mevcut kullanımıyla çakışmaması için ayrı bir kolon eklenir. Migration'da `ALTER TABLE laundry_items ADD COLUMN garments_json TEXT` yapılır.

---

## 5. Admin Yönetim Paneli

**Konum:** LaundryHub → Ayarlar sekmesi → "Kıyafet Tipleri" bölümü.

### Özellikler

- Tüm tipleri (aktif + pasif) listele
- Sıralama: yukarı/aşağı ok butonları (yeni bağımlılık eklenmez)
- **Yeni tip ekleme formu:**
  - İsim (text input)
  - Emoji (text input, örn: 👔)
  - Resim yükle (file input → mevcut `/laundry/upload-photo` endpoint)
  - Kaydet butonu
- **Düzenleme:** Her satırda inline edit (isim, emoji, resim)
- **Aktif/Pasif toggle:** Anahtarla gizleme

### Resim Yükleme

Mevcut `/laundry/upload-photo` multipart endpoint kullanılır. Dönen `url` değeri `image_url` kolonuna kaydedilir.

---

## 6. Etkilenen Dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `backend/src/modules/laundry/migrations.js` | v6 migration: `laundry_garment_types` tablosu + seed |
| `backend/src/modules/laundry/queries.js` | garment type CRUD sorguları |
| `backend/src/modules/laundry/routes.js` | `/garment-types` endpoint'leri |
| `backend/src/modules/self-service/routes.js` | `POST /laundry-kiosk/bag` body'e `garments` alanı eklenir |
| `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` | `GarmentPicker` bileşeni, `BagForm` güncelleme |
| `frontend/src/modules/laundry/LaundryHub.jsx` | Ayarlar sekmesine "Kıyafet Tipleri" yönetim bölümü |
| `frontend/src/modules/laundry/api.js` | garment type API çağrıları |

---

## 7. Kapsam Dışı

- Kıyafet bazında hasar/durum bayrağı (kasıtlı olarak çıkarıldı)
- Kıyafet bazında ayrı DB tablosu (notes JSON embed yeterli)
- Mobil uygulama entegrasyonu
