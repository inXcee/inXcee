# Tasarım: Stok Tüketim Tahmini + Acil İletişim Kişisi

**Tarih:** 2026-04-10  
**Durum:** Onaylandı

---

## 1. Stok Tüketim Tahmini

### Amaç

Envanter sayfasında her ürün için "kaç gün kaldı" tahmini göster. Kritik eşik geçilince kampüs yöneticisine SSE bildirimi gönder.

### Backend

**Yeni endpoint:** `GET /api/inventory/forecast`

- Son 14 günlük `stock_movements` tablosundaki `type='out'` hareketlerini her item için toplar
- `daily_avg = toplam_çıkış / 14`
- `days_left = quantity / daily_avg`
- `daily_avg = 0` olan ürünler (hiç çıkış olmamış) sonuca dahil edilmez
- Sadece `days_left <= 7` olan ürünler döner (frontend filtresi değil backend filtresi)

Yanıt formatı:
```json
[
  {
    "id": 5,
    "item_name": "Deterjan",
    "quantity": 3.5,
    "unit": "kg",
    "daily_avg": 0.5,
    "days_left": 7,
    "severity": "warning"
  }
]
```

Severity kuralı:
- `days_left <= 3` → `"critical"`
- `days_left <= 7` → `"warning"`

**SSE Bildirimi:**

Forecast endpoint çağrıldığında, `critical` veya `warning` item varsa `campus_manager` rolüne bildirim gönderilir. Aynı bildirimin tekrar atılmaması için `audit_log` tablosunda son 24 saat içinde `action='inventory_forecast_notify'` kaydı kontrol edilir. Yoksa bildirim + audit log kaydı oluşturulur.

**Dosyalar:**
- `backend/src/modules/inventory/queries.js` — `getForecast()` fonksiyonu eklenir
- `backend/src/modules/inventory/service.js` — `getForecast()` servisi + bildirim mantığı
- `backend/src/modules/inventory/routes.js` — `GET /forecast` endpoint'i
- `backend/src/modules/inventory/inventory.test.js` — forecast testleri

### Frontend

**InventoryPage — KPI Row:**

Mevcut 6 KPI kartına yeni kart eklenir:
- Label: `TÜKENME YAKLAŞAN`
- Değer: `days_left <= 7` olan item sayısı
- Renk: `var(--red)` (critical varsa) veya `var(--amber)` (sadece warning)
- Veri kaynağı: `GET /api/inventory/forecast` (ayrı query)

**InventoryPage — Stok Listesi:**

Her item satırına `days_left` badge'i eklenir:
- `≤3 gün` → kırmızı badge: `~2 gün`
- `≤7 gün` → amber badge: `~5 gün`
- `>7 gün` veya `daily_avg=0` → badge yok

Badge, item_name'in yanında gösterilir.

---

## 2. Acil İletişim Kişisi

### Amaç

`personnel` tablosuna `emergency_name` ve `emergency_phone` alanları ekle. Checkin formunda doldurulabilsin, capacity ve checkout sayfalarında görünsün.

### DB Migration

`backend/src/shared/db/index.js` içindeki migration bloğuna eklenir:

```js
try { db.exec('ALTER TABLE personnel ADD COLUMN emergency_name TEXT') } catch(_) {}
try { db.exec('ALTER TABLE personnel ADD COLUMN emergency_phone TEXT') } catch(_) {}
```

### Backend

- `checkin/queries.js` — `insertPersonnel` fonksiyonuna `emergency_name`, `emergency_phone` eklenir
- `checkin/routes.js` — mevcut kayıt endpoint'ine bu alanları kabul edecek şekilde güncellenir
- Tüm personel SELECT sorguları (`searchByName`, `getCompanyPersonnel`, vb.) bu 2 kolonu döner

Ayrı bir PATCH endpoint'e gerek yok — var olan checkin formuyla kayıt sırasında girilir. Sonradan düzenleme bu scope'un dışında.

### Frontend

**1. CheckinPage (`checkin/CheckinPage.jsx`)**

Kayıt formuna "Acil İletişim" bölümü eklenir — isteğe bağlı:
- `emergency_name` — metin alanı, placeholder: "Acil iletişim kişisi adı"
- `emergency_phone` — metin alanı, placeholder: "Telefon numarası"

**2. CapacityPage (`capacity/RoomCard.jsx` veya kişi detay paneli)**

Kişi kartı detayında acil kişi bilgisi görüntülenir:
- `emergency_name` ve `emergency_phone` varsa gösterilir, yoksa gizlenir

**3. CheckoutPage (`checkout/CheckoutPage.jsx`)**

Çıkış özeti panelinde acil kişi bilgisi görüntülenir (salt okunur).

---

## Kapsam Dışı

- Acil iletişim kişisinin sonradan düzenlenmesi
- Stok tüketim tahmini için özelleştirilebilir eşik değerleri
- Forecast verilerinin otomatik polling'i (manuel yenile yeterli)

---

## Test Planı

- `inventory.test.js`: `getForecast()` — out hareketi olmayan item dahil edilmemeli, 7 günden fazla kalan item dahil edilmemeli, severity hesabı doğru olmalı
- `checkin.test.js`: `insertPersonnel` emergency alanlarını kaydediyor mu
