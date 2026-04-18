# Çamaşırhane Kiosk Tam Entegrasyon — Tasarım Dokümanı

**Tarih:** 2026-04-19  
**Kapsam:** Kiosk ↔ LaundryHub tam entegrasyon; kıyafet bırak, torba topla, makine yükle, teslim akışları A'dan Z'ye

---

## 1. Statü Akışı

```
pending_collection → dirty → washing → ironing → ready → delivered
                                                        ↘ lost
```

- `pending_collection`: Sakin kiosk'ta torbayı bıraktı, fiziksel olarak henüz toplanmadı
- `dirty`: Görevli torbayı fiziksel topladı
- `washing / ironing / ready / delivered / lost`: Mevcut akış korunur

**Mevcut bug:** Kiosk `collected` status yazıyor — DB CHECK constraint'te bu değer yok. `pending_collection` ile düzeltilir.

---

## 2. DB Değişiklikleri

`laundry_items` tablosuna eklenir:

| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `bag_no` | TEXT UNIQUE | Torba numarası (ör. "T-00042") — bırakma anında otomatik atanır |
| `collected_by` | INTEGER FK → avs_workers.id | Torbayı toplayan görevli |
| `collected_at` | INTEGER | Unix timestamp — toplama zamanı |

`laundry_items.status` CHECK constraint güncellenir:
```sql
CHECK(status IN ('pending_collection','dirty','washing','ironing','ready','delivered','lost'))
```

`occupant_signature` kolonu zaten mevcut — teslim imzası için kullanılır.

---

## 3. Kiosk UI — 5 Sekme

### Sekme 1: Bırak *(mevcut, düzeltilir)*
- Sakin TC/isim ile arama veya PIN girişi
- Kıyafet türü ve adet seçimi
- Onay → `pending_collection` status + otomatik `bag_no` atanır
- Ekranda torba no gösterilir (görevliye verilecek)

### Sekme 2: Topla *(yeni — staff)*
- AVS worker PIN girişi
- `pending_collection` statüsündeki torbalar listelenir (sakin adı, torba no, bırakma saati)
- Torba no ile arama / liste üzerinden seç → "Toplandı" butonu
- Onay → `dirty` + `collected_by` + `collected_at` kaydedilir

### Sekme 3: Makineye Yükle *(yeni — staff)*
- AVS worker PIN girişi
- Torba no gir → torba bilgisi gösterilir
- Boş makineler listesi: ad, kapasite, tahmini süre; dolu makinelerde kalan süre gösterilir
- Makine seç → "Yükle" → `washing` + makine timer başlar

### Sekme 4: Teslim Et *(yeni — dual)*
**Staff teslimi (AVS PIN):**
- Torba no gir → teslim et → `delivered`; imza isteğe bağlı

**Sakin teslimi (TC/PIN):**
- Sakin giriş → `ready` statüsündeki torbalar listelenir
- Seç → imza canvas → onay → `delivered` + `occupant_signature` kaydedilir

### Sekme 5: Durum *(mevcut, iyileştirilir)*
- Sakin giriş → tüm torbalar, her birinin statüsü ve tahmini teslim süresi
- `pending_collection` durumu da gösterilir ("Toplanmayı bekliyor")

---

## 4. LaundryHub Değişiklikleri

- Kanban'a **`Bekliyor`** kolonu eklenir — en sola, `Kirli`'den önce (`pending_collection` statüsü)
- Kanban kartında torba no (bag_no) gösterilir
- `Bekliyor` kolonundaki kartlarda **"Toplandı"** aksiyon butonu → `dirty`'e geçirir (LaundryHub'dan da koleksiyon yapılabilir)
- Makine timer'ları kanban'da zaten görünür — değişiklik yok

---

## 5. Backend API

Tüm kiosk endpoint'leri `requireAvsKiosk` middleware ile korunur (Sekme 1 hariç — resident PIN ile giriş yapılan akışlar için ayrı auth).

### Yeni `/api/laundry-kiosk/` endpoint'leri

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/dropoff` | resident PIN | Torba bırak → `pending_collection` + bag_no atar |
| GET | `/pending-bags` | AVS PIN | `pending_collection` torbalar listesi |
| POST | `/collect/:bagId` | AVS PIN | Torbayı topla → `dirty` |
| GET | `/available-machines` | AVS PIN | Boş makineler + dolu olanların timer'ı |
| POST | `/load-machine` | AVS PIN | Torba → makineye yükle → `washing` + timer |
| GET | `/resident-ready/:personnelId` | resident PIN | Sakine ait `ready` torbalar |
| POST | `/deliver/:bagId` | AVS PIN | Staff teslimi → `delivered` |
| POST | `/deliver-resident/:bagId` | resident PIN | Sakin teslimi → `delivered` + imza |

### Mevcut `/api/laundry/` değişiklikleri

- `PATCH /:id/status` → `pending_collection` değerini kabul eder
- `POST /:id/collect` → "Toplandı" LaundryHub butonu için yeni endpoint

Mevcut `service.js` fonksiyonları yeniden kullanılır — kiosk route'ları sadece wrapper görevi görür.

---

## 6. Bag No Formatı

`T-XXXXX` — T prefix + 5 haneli sıralı sayı (ör. T-00001, T-00042).  
DB'de UNIQUE; çakışmada retry ile yeni no üretilir.

---

## 7. Uygulama Fazları

| Faz | İçerik | Test |
|-----|--------|------|
| **1** | DB migration: `pending_collection` status + `bag_no` + `collected_by` + `collected_at` | Migration temiz çalışıyor, seed verisi doğru |
| **2** | Backend: yeni kiosk endpoint'leri + laundry PATCH güncelleme | Vitest — tüm endpoint'ler |
| **3** | Kiosk UI: "Bırak" bug fix + "Topla" sekmesi | Manuel test |
| **4** | Kiosk UI: "Makineye Yükle" sekmesi + makine timer görünümü | Manuel test |
| **5** | Kiosk UI: "Teslim Et" sekmesi (staff + sakin + imza) | Manuel test |
| **6** | LaundryHub: `Bekliyor` kanban kolonu + "Toplandı" butonu | Manuel test |

Her faz: test → commit → bir sonraki faza geç.
