# Premium Çamaşır Takip Sistemi — 7 Fazlı Plan

> **Kapsam:** A1, A2, A3, A4, G, F, E, D, C, H, J, A, B blokları için kıyafet-bazlı premium takip.
> Mevcut M/S blok sistemi **değişmeden** kalır.

---

## Mimari Kararlar

1. **Paralel çalışma** — `laundry_items.clothing_items` JSON'a dokunulmaz. Premium kayıtlarda hem JSON hem `premium_garments` tablosu dolu tutulur.
2. **`is_premium` otomatik set** — `createItemService`'te oda bloku `laundry_block_config` ile kontrol edilir, frontend'den geçirilmez.
3. **Garment kod formatı** — `{BLOK}{ODA_NO}-{SIRA:3}` (ör: `A101-001`). Sıra her laundry_items kaydında sıfırdan başlar. `UNIQUE(item_id, seq)`.
4. **Parent item senkronu** — Garment durum değişince `syncParentStatus(item_id)` helper çağrılır. Kural: hepsi ready → item ready; hepsi delivered → item delivered; herhangi biri ironing → item ironing.
5. **Test stratejisi** — Her faz mevcut `laundry.test.js`'e `describe` blokları ekler. Mevcut 58 test regresyon testi görevi görür, bozulmamalı.

---

## FAZ 1 — Blok Tipi Altyapısı ve DB Temeli [✅]

### Amaç
Premium/Regular blok konfigürasyon tablosu + `laundry_items.is_premium` kolonu + `premium_garments` tablo iskeleti.

### DB (`backend/src/shared/db/index.js` — initDB sonuna)

```sql
-- laundry_block_config
CREATE TABLE IF NOT EXISTS laundry_block_config (
  block TEXT PRIMARY KEY,
  is_premium INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO laundry_block_config(block, is_premium) VALUES
  ('A1',1),('A2',1),('A3',1),('A4',1),('G',1),('F',1),
  ('E',1),('D',1),('C',1),('H',1),('J',1),('A',1),('B',1),
  ('M',0),('S',0),('S1',0),('S2',0);

-- laundry_items.is_premium
ALTER TABLE laundry_items ADD COLUMN is_premium INTEGER DEFAULT 0;

-- premium_garments (iskelet)
CREATE TABLE IF NOT EXISTS premium_garments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
  garment_code TEXT NOT NULL UNIQUE,
  garment_type TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  size TEXT,
  color TEXT,
  pattern TEXT,
  condition_notes TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK(status IN ('received','ironing','ready','delivered','lost')),
  ironed_by INTEGER REFERENCES users(id),
  ironed_at TEXT,
  delivered_to TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pg_item ON premium_garments(item_id);
CREATE INDEX IF NOT EXISTS idx_pg_code ON premium_garments(garment_code);
CREATE INDEX IF NOT EXISTS idx_pg_status ON premium_garments(status);
CREATE INDEX IF NOT EXISTS idx_pg_type ON premium_garments(garment_type);
CREATE INDEX IF NOT EXISTS idx_pg_brand ON premium_garments(brand);

-- premium_garment_history
CREATE TABLE IF NOT EXISTS premium_garment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garment_id INTEGER NOT NULL REFERENCES premium_garments(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  action_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pgh_garment ON premium_garment_history(garment_id);
```

### Backend

**`queries.js`** — Yeni fonksiyonlar:
- `getBlockConfigQuery()` → tüm blok konfigürasyonu
- `upsertBlockConfigQuery(block, is_premium, userId)`
- `isBlockPremiumQuery(block)` → boolean

**`service.js`** — Değişiklik:
- `createItemService` — oda seçilince blok adı alınır, `isBlockPremiumQuery` ile `is_premium` set edilir

**`routes.js`** — Yeni route'lar:
- `GET /laundry/block-config`
- `PUT /laundry/block-config/:block` → `{ is_premium }` (slaWrite yetkisi)

### Frontend

**`api.js`**:
- `getBlockConfig()`
- `updateBlockConfig(block, is_premium)`

**`LaundrySettings.jsx`** — Yeni sekme "Bloklar":
- Tablo: her blok için Regular/Premium toggle
- Premium bloklar altın renkte vurgulanır

### Testler (3 test)
1. `laundry_block_config` tablosu oluşur, A1 premium=1 varsayılan
2. `upsertBlockConfigQuery` premium değerini günceller
3. `createItemService` — premium odada is_premium=1 set edilir

---

## FAZ 2 — Premium Garment CRUD ve Kod Üretimi [✅]

### Amaç
Her premium parçaya `A101-001` formatında benzersiz kod üret, brand/model/beden/renk kaydet.

### Backend

**`queries.js`** — Yeni fonksiyonlar:
```js
// Kod üretimi: item'ın kaçıncı parçası olduğunu sayar
generateNextGarmentSeqQuery(item_id) → number

// Toplu parça ekleme (transaction)
insertPremiumGarmentsQuery(item_id, garments[]) → garment_code[]

// Listeleme
getPremiumGarmentsQuery(item_id)
getPremiumGarmentByCodeQuery(code)
getPremiumGarmentQuery(garment_id)
```

**`service.js`** — Yeni servisler:
```js
addPremiumGarmentsService(item_id, garments[], userId)
  // is_premium kontrolü
  // Transaction: her garment için kod üret, insert et
  // Üretilen kodları döner

getPremiumGarmentsService(item_id)
getPremiumGarmentByCodeService(code)
```

**`routes.js`** — Yeni route'lar:
```
GET  /laundry/items/:id/garments
POST /laundry/items/:id/garments   → [{ garment_type, brand, model, size, color, pattern, condition_notes }]
GET  /laundry/garments/by-code/:code
```

### Frontend

**Yeni:** `frontend/src/modules/laundry/components/PremiumIntakeModal.jsx`
- Form: her satır → type dropdown, brand, model, size, color, pattern, condition_notes
- "Satır Ekle" butonu
- Kaydet → üretilen kodlar liste halinde gösterilir (kopyalanabilir)

**`NewItemModal.jsx`** — Değişiklik:
- Seçilen oda premium blokta ise → kayıt oluşturulduktan sonra otomatik `PremiumIntakeModal` açılır
- Regular ise mevcut davranış korunur

**`api.js`**:
- `getPremiumGarments(item_id)`
- `addPremiumGarments(item_id, garments)`
- `getPremiumGarmentByCode(code)`

### Testler (4 test)
1. `insertPremiumGarmentsQuery` — 3 parça eklenir, A101-001/002/003 kodları üretilir
2. Aynı item'a 2. kez ekleme yapılınca numara 004'ten devam eder
3. Regular item'a garment eklemeye çalışınca 400 döner
4. `getPremiumGarmentByCodeQuery` kodu doğru parçayı döner

---

## FAZ 3 — Per-Item Durum Akışı [✅]

### Amaç
Her garment kendi durum makinesine sahip. Parent item durumu tüm garment'lardan otomatik hesaplanır.

### Backend

**`queries.js`** — Yeni fonksiyonlar:
```js
advancePremiumGarmentQuery(garment_id, to_status, userId) // + history insert
checkAllGarmentsStatusQuery(item_id)
  → { total, received, ironing, ready, delivered, lost }
bulkSetGarmentsStatusQuery(item_id, to_status, userId)   // toplu geçiş
```

**`service.js`** — Yeni servisler:
```js
syncParentStatusService(item_id)
  // checkAllGarments → hesapla → updateItemStatus

advancePremiumGarmentService(garment_id, userId)
  // received→ironing veya ironing→ready
  // Sonra syncParentStatus

bulkAdvancePremiumGarmentsService(item_id, garment_ids[], to_status, userId)
```

**`advanceItemService`** — Değişiklik:
- `is_premium=1` ve `status='washing'` ise → tüm garments `bulkSetGarmentsStatus` ile `ironing` veya `ready` yapılır (needs_ironing'e göre)

**`routes.js`** — Yeni route'lar:
```
PATCH /laundry/garments/:id/advance
POST  /laundry/items/:id/garments/bulk-advance  → { garment_ids[], to_status }
```

### Frontend

**Yeni:** `frontend/src/modules/laundry/components/PremiumGarmentList.jsx`
- Checkbox'lı satırlar: garment_code chip + type + brand/model/size + renk dot + status badge
- Tekil "İlerlet" butonu
- Toplu: seç + "Ütüye Al" / "Hazır Yap" toolbar
- Status badge renkleri: received=gri, ironing=mor, ready=yeşil, delivered=teal, lost=kırmızı

**`ItemCard.jsx`** — Değişiklik:
- `is_premium=1` ise expand/detay alanında `PremiumGarmentList` gösterilir

### Testler (4 test)
1. Garment `ironing→ready` geçince, diğerleri hala ironing ise parent değişmez
2. Son garment `ready`'ye geçince parent `ready` olur
3. `bulkSetGarmentsStatus` tüm parçaları günceller
4. Premium item washing→advance → tüm garments ironing'e gider (needs_ironing=1 ise)

---

## FAZ 4 — Teslim Akışı ve Per-Garment Delivery [✅]

### Amaç
Premium kayıtlarda tekil ve toplu garment teslimi, teslim belgesi oluşturma.

### DB

```sql
CREATE TABLE IF NOT EXISTS premium_garment_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garment_id INTEGER NOT NULL REFERENCES premium_garments(id),
  item_id INTEGER NOT NULL REFERENCES laundry_items(id),
  delivered_to TEXT NOT NULL,
  signature_data TEXT,
  delivered_by INTEGER REFERENCES users(id),
  delivered_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pgd_item ON premium_garment_deliveries(item_id);
```

### Backend

**`service.js`** — Değişiklik:
- `deliverItemService` — `is_premium=1` ise tüm `ready` garments → `delivered`, `premium_garment_deliveries` kaydı oluşturulur, sonra `syncParentStatus`

Yeni servisler:
```js
deliverPremiumGarmentService(garment_id, { delivered_to, signature_data }, userId)
getPremiumDeliveryReceiptService(item_id)
  → { item, garments: [{code, type, brand, model, size, ...}], delivered_to, delivered_at }
```

**`routes.js`** — Yeni route'lar:
```
PATCH /laundry/garments/:id/deliver
POST  /laundry/items/:id/premium-deliver  → toplu teslim
GET   /laundry/items/:id/delivery-receipt
```

### Frontend

**Yeni:** `frontend/src/modules/laundry/components/PremiumDeliveryModal.jsx`
- Checkbox'lı garment listesi (sadece `ready` olanlar)
- Teslim alan adı + imza canvas
- Kaydet → receipt önizleme (garment kodları + detaylar)

**`ItemCard.jsx`** — Değişiklik:
- Premium item'da `onDeliver` → `PremiumDeliveryModal` açar

### Testler (3 test)
1. Premium item teslim → tüm ready garments delivered olur, parent delivered
2. Kısmi teslim → sadece seçili garments delivered, parent hala ready
3. Teslim belgesi doğru garment kodlarını içerir

---

## FAZ 5 — Zengin Arşiv Arama ve Kayıp Araştırması [✅]

### Amaç
"Bu odada hangi markadan kaç gömlek vardı, bedeni ne, rengi ne?" sorusunu cevaplayacak arama motoru.

### DB (performans indeksleri)
```sql
CREATE INDEX IF NOT EXISTS idx_li_room_created ON laundry_items(room_id, created_at DESC);
```

### Backend

**`queries.js`** — Yeni fonksiyonlar:
```js
searchPremiumGarmentsQuery({
  block, room_no, garment_type, brand, size, color, status,
  from_date, to_date, page, limit
})
// JOIN: rooms ← laundry_items ← premium_garments
// Döner: garment_code, room, intake_date, type, brand, model, size, color, status

getRoomGarmentHistoryQuery(room_id, { from_date, to_date })
// Odanın tüm premium garment geçmişi (tarih sıralı)
```

**`routes.js`** — Yeni route'lar:
```
GET /laundry/garments/search
  ?block=&room_no=&type=&brand=&size=&color=&status=&from=&to=&page=&limit=

GET /laundry/rooms/:room_id/garment-history
```

### Frontend

**Yeni:** `frontend/src/modules/laundry/components/PremiumSearchPanel.jsx`
- Filtre paneli: blok, oda, tip, marka, beden, renk, durum, tarih
- Kayıp Araştırması toggle → sadece `lost` filtreler
- Sonuç tablosu + tıklanınca garment detay paneli
- CSV export

**`LaundryHub.jsx`** — Değişiklik:
- "Premium Ara" sekmesi eklenir (Archive'ın yanına)

**`ArchiveDetailPanel.jsx`** — Değişiklik:
- `is_premium=1` item'da kıyafet bölümü → `PremiumGarmentList` (readonly, tam detay)

**`api.js`**:
- `searchPremiumGarments(params)`
- `getRoomGarmentHistory(room_id, params)`

### Testler (3 test)
1. `searchPremiumGarmentsQuery` blok filtresi çalışır
2. `status=lost` filtresi sadece kayıpları döner
3. `getRoomGarmentHistoryQuery` belirli oda + tarih aralığı çalışır

---

## FAZ 6 — Raporlar ve Blok Yönetimi UI [✅]

### Amaç
Yönetici panelinde premium istatistikler, kayıp analizi, blok yönetim ekranı.

### Backend

**`queries.js`** — Yeni:
```js
getPremiumReportQuery({ from_date, to_date })
  // - Blok bazında dağılım
  // - Tip bazında garment sayısı
  // - Kayıp listesi (marka/model/beden dahil)
  // - En çok işlem gören odalar
  // - Ort. teslim süresi (premium vs regular)
```

**`routes.js`**:
```
GET /laundry/reports/premium?from=&to=
GET /laundry/reports/export-premium?from=&to= → CSV
  Kolonlar: garment_code, block, room_no, type, brand, model, size, color,
            status, intake_date, delivery_date, total_hours
```

### Frontend

**`LaundrySettings.jsx`** — Yeni sekmeler:
1. "Blok Yönetimi" — tüm bloklar tablo, Regular/Premium toggle, premium altın renkli
2. (Opsiyonel) Premium rapor KPI kartları inline

**`LaundryReport.jsx`** — Değişiklik:
- "Premium Özet" bölümü + "Premium CSV" butonu eklenir

**`api.js`**:
- `getPremiumReport(params)`
- `exportPremiumCsv(params)`

### Testler (3 test)
1. `getPremiumReportQuery` kayıp sayısını doğru hesaplar
2. CSV export garment_code sütununu içerir
3. Blok konfigürasyon PUT → GET'te güncel gelir

---

## FAZ 7 — Barkod/Kod Tarama ve Hızlı Aksiyon [✅]

### Amaç
Garment kodunu gir/tara → anında durum güncelle. Mobil ütüleme akışı.

### DB
```sql
CREATE TABLE IF NOT EXISTS garment_scan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garment_code TEXT NOT NULL,
  scanned_by INTEGER REFERENCES users(id),
  action TEXT NOT NULL CHECK(action IN ('lookup','advance','deliver','lost')),
  scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Backend

**`routes.js`** — Yeni route'lar:
```
GET  /laundry/garments/by-code/:code
  → garment + parent item + oda bilgisi (hızlı lookup)

POST /laundry/garments/scan-action
  → { garment_code, action: 'advance'|'deliver'|'lost', delivered_to?, notes? }
  → Tek HTTP çağrısı ile tara ve ilerlet
  → scan_log kaydı oluşturulur
```

### Frontend

**Yeni:** `frontend/src/modules/laundry/components/GarmentScanModal.jsx`
- Büyük kod giriş kutusu (Enter ile lookup)
- Kıyafet bilgisi: kod + tip + brand/model/beden + mevcut durum
- Butonlar: "İlerlet" / "Kayıp" (büyük dokunma alanı, mobil-first)
- Başarı animasyonu

**`LaundryHub.jsx`** — Değişiklik:
- Üst toolbar'a "Kod Tara" butonu

**`api.js`**:
- `getGarmentByCode(code)`
- `scanAction(garment_code, action, extras)`

### Testler (3 test)
1. `GET /garments/by-code/A101-001` → doğru parça döner
2. `POST /garments/scan-action` advance → durum güncellenir, scan_log kaydı oluşur
3. Geçersiz kod → 404

---

## Bağımlılık Sırası

```
FAZ 1 (blok config + DB iskelet)
  ↓
FAZ 2 (garment CRUD + kod üretimi)
  ↓
FAZ 3 (per-item durum akışı — FAZ 2 tablolarına bağlı)
  ↓
FAZ 4 (teslim — FAZ 3 durum makinesine bağlı)
  ↓
FAZ 5 (arama — FAZ 2-4 verilerini sorgular)
  ↓
FAZ 6 (raporlar — FAZ 1-5 verilerini toplar)
  ↓
FAZ 7 (barkod — FAZ 2-4 API'larını kullanır, bağımsız da uygulanabilir)
```

## Dosya Değişiklik Özeti

| Dosya | FAZ |
|-------|-----|
| `backend/src/shared/db/index.js` | 1, 2*, 4 |
| `backend/src/modules/laundry/queries.js` | 1, 2, 3, 4, 5, 6, 7 |
| `backend/src/modules/laundry/service.js` | 1, 2, 3, 4 |
| `backend/src/modules/laundry/routes.js` | 1, 2, 3, 4, 5, 6, 7 |
| `backend/src/modules/laundry/laundry.test.js` | 1, 2, 3, 4, 5, 6, 7 |
| `frontend/src/modules/laundry/api.js` | 1, 2, 4, 5, 6, 7 |
| `frontend/src/modules/laundry/LaundryHub.jsx` | 5, 7 |
| `frontend/src/modules/laundry/LaundrySettings.jsx` | 1, 6 |
| `frontend/src/modules/laundry/LaundryReport.jsx` | 6 |
| `frontend/src/modules/laundry/components/NewItemModal.jsx` | 2 |
| `frontend/src/modules/laundry/components/ItemCard.jsx` | 3, 4 |
| `frontend/src/modules/laundry/components/ArchiveDetailPanel.jsx` | 5 |
| **YENİ** `PremiumIntakeModal.jsx` | 2 |
| **YENİ** `PremiumGarmentList.jsx` | 3 |
| **YENİ** `PremiumDeliveryModal.jsx` | 4 |
| **YENİ** `PremiumSearchPanel.jsx` | 5 |
| **YENİ** `GarmentScanModal.jsx` | 7 |
