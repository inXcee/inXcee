# Envanter Sistemi Genişletme — Tasarım Dokümanı

**Tarih:** 2026-04-27
**Yaklaşım:** Pratik öncelik paketi (mobil/barkod scope dışı)
**Hedef:** Mevcut envanteri "yöneticinin tek panelden tedarikçi/sipariş/talep/lot/rapor yönettiği" detaylı bir sisteme dönüştürmek.

---

## 1. Bağlam ve Mevcut Durum

### Mevcut özellikler
- Ürün CRUD (ad, miktar, birim, eşik, kategori, konum string, birim fiyat)
- 4 kategori: laundry / maintenance / housekeeping / general
- Stock movement log (in / out / count / initial)
- Bulk count, personel checkout (zimmet) + iade (kısmi iade dahil)
- Goods receipts (mal giriş) — otomatik MG-numarası, PDF altyapısı yok ama pdfkit mevcut
- 14-günlük tahmin (kaç gün yeter), low-stock cron bildirim
- Stats, CSV export, audit log
- Frontend tek dosya: `InventoryPage.jsx` 1431 satır

### Boşluklar
- Tedarikçi profili yok (`goods_receipts.supplier` sadece string)
- Fiyat geçmişi yok
- Sipariş önerisi / PO yönetimi yok
- Personel "şu malzeme lazım" diye talep oluşturamıyor
- Lot / son kullanma tarihi izleme yok (FIFO yok)
- Hasarlı / kayıp / lokasyon transferi ayrı kayıt değil
- Ürün fotoğrafı yok, ABC analizi yok, departman tüketim raporu yok
- Frontend tek dosyada tüm sekmeler — yönetilemez büyüklükte

### Scope dışı (açıkça)
- Mobil arayüz (`/mobile/inventory`) — ayrı proje
- Barkod / QR kamera tarama — ayrı proje (donanım/kamera-permission scope)
- Multi-currency (sadece TL)
- Otomatik tedarikçiye email gönderimi (manuel PDF download yeterli)

---

## 2. Veri Modeli

### Yeni tablolar (8)

**suppliers** — Tedarikçi profili
```sql
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tax_no TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  payment_term TEXT DEFAULT 'cash' CHECK(payment_term IN ('cash','net_30','net_60','net_90')),
  default_lead_time_days INTEGER DEFAULT 7,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_suppliers_active ON suppliers(is_active);
```

**supplier_prices** — Ürün × tedarikçi × fiyat geçmişi
```sql
CREATE TABLE supplier_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  unit_price REAL NOT NULL,
  effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL CHECK(source IN ('manual','goods_receipt','po')),
  source_ref_id INTEGER
);
CREATE INDEX idx_supplier_prices_lookup ON supplier_prices(item_id, supplier_id, effective_from DESC);
```

**inventory_lots** — Lot bazlı stok parçaları (FIFO + expiry)
```sql
CREATE TABLE inventory_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  lot_no TEXT,
  quantity REAL NOT NULL,
  expiry_date DATE,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  supplier_id INTEGER REFERENCES suppliers(id),
  unit_cost REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','depleted','expired','damaged'))
);
CREATE INDEX idx_lots_fifo ON inventory_lots(item_id, status, received_at);
CREATE INDEX idx_lots_expiry ON inventory_lots(expiry_date) WHERE expiry_date IS NOT NULL;
```

**inventory_locations** — Çoklu raf/depo (opsiyonel kullanım)
```sql
CREATE TABLE inventory_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block TEXT,
  name TEXT NOT NULL,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);
```

**inventory_stock_by_location** — Lokasyon başına stok (opsiyonel kullanım)
```sql
CREATE TABLE inventory_stock_by_location (
  item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  quantity REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(item_id, location_id)
);
```

**purchase_orders** — Satınalma siparişleri
```sql
CREATE TABLE purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_no TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','sent','partial_received','received','cancelled')),
  expected_date DATE,
  notes TEXT,
  total_value REAL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  received_at DATETIME
);
CREATE INDEX idx_po_status ON purchase_orders(status, created_at DESC);
```

**purchase_order_items** — PO satırları
```sql
CREATE TABLE purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory(id),
  qty_ordered REAL NOT NULL,
  qty_received REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_po_items_po ON purchase_order_items(po_id);
```

**inventory_requests** — Personel talepleri
```sql
CREATE TABLE inventory_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  item_id INTEGER NOT NULL REFERENCES inventory(id),
  quantity REAL NOT NULL,
  reason TEXT,
  preferred_supplier_id INTEGER REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','fulfilled','cancelled')),
  approved_by INTEGER REFERENCES users(id),
  decision_at DATETIME,
  rejection_reason TEXT,
  fulfillment_checkout_id INTEGER REFERENCES inventory_checkouts(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_requests_status ON inventory_requests(status, created_at DESC);
CREATE INDEX idx_requests_requester ON inventory_requests(requester_id, created_at DESC);
```

### Mevcut tablolara eklenecek kolonlar

**inventory** (migration ile, IF NOT EXISTS pattern)
- `sku TEXT UNIQUE` — manuel girilebilir kısa kod
- `photo_url TEXT` — multer ile yükleme
- `preferred_supplier_id INTEGER REFERENCES suppliers(id)`
- `lead_time_days INTEGER DEFAULT 7`
- `safety_stock_days INTEGER DEFAULT 3`
- `track_lots INTEGER DEFAULT 0` — opt-in lot izleme
- `track_expiry INTEGER DEFAULT 0` — opt-in son kullanma izleme
- `track_locations INTEGER DEFAULT 0` — opt-in lokasyon izleme

**stock_movements**
- `type` CHECK enum'a yeni değerler: `'damage'`, `'loss'`, `'transfer'`, `'po_receive'`, `'request_fulfill'`. SQLite'da CHECK güncellemek için tablo rebuild migration gerekir (rooms tablosunda yapılan pattern uygulanır).
- `lot_id INTEGER REFERENCES inventory_lots(id)` — lot çıkışı için
- `from_location_id INTEGER REFERENCES inventory_locations(id)`
- `to_location_id INTEGER REFERENCES inventory_locations(id)`

**inventory_checkouts**
- `request_id INTEGER REFERENCES inventory_requests(id)` — talepten gelen zimmet bağlantısı

**goods_receipts** (data migration)
- `supplier_id INTEGER REFERENCES suppliers(id)` eklenir
- Migration: `SELECT DISTINCT supplier FROM goods_receipts` → her biri `suppliers` tablosuna `(name)` olarak insert → `UPDATE goods_receipts SET supplier_id = (SELECT id FROM suppliers WHERE name = goods_receipts.supplier)`. Eski `supplier` kolonu silinmez (deprecated, geriye dönük uyum).

---

## 3. Backend Mimari

### Klasör yapısı
```
backend/src/modules/inventory/
├── routes.js                  (mevcut + yeni alt-router'lar mount)
├── service.js, queries.js     (mevcut akış korunur)
├── suppliers/
│   ├── routes.js, service.js, queries.js, suppliers.test.js
├── purchase-orders/
│   ├── routes.js, service.js, queries.js, purchase-orders.test.js
├── requests/
│   ├── routes.js, service.js, queries.js, requests.test.js
├── lots/
│   ├── routes.js, service.js, queries.js, lots.test.js
└── analytics/
    ├── routes.js, service.js, queries.js, analytics.test.js
```

### Yeni endpoint'ler (özet)
- **suppliers**: `GET/POST/PUT/DELETE /api/inventory/suppliers`, `GET /:id/price-history`, `GET /:id/scorecard`
- **purchase-orders**: `GET/POST /api/inventory/po`, `POST /po/draft-from-low-stock`, `PATCH /po/:id/status`, `POST /po/:id/receive`, `GET /po/:id/pdf`
- **requests**: `GET/POST /api/inventory/requests`, `PATCH /:id/approve`, `PATCH /:id/reject`, `POST /:id/fulfill`
- **lots**: `GET /api/inventory/items/:id/lots`, `POST /lots`, `GET /api/inventory/lots/expiring?days=30`
- **analytics**: `GET /api/inventory/analytics/abc`, `GET /analytics/department-consumption`, `GET /analytics/heatmap`, `GET /analytics/monthly-pdf?month=YYYY-MM`

### Servis akışı detayları

**Sipariş önerisi (`POST /po/draft-from-low-stock`)**
1. `quantity <= reorder_threshold` olan tüm aktif ürünleri çek
2. Her ürün için son 14 günün `daily_avg`'ını hesapla
3. Önerilen miktar = `(daily_avg × (lead_time_days + safety_stock_days)) - quantity`. Negatif olursa 0.
4. Ürünü `preferred_supplier_id` ile grupla (yoksa "Tedarikçi atanmamış" grubu — manuel atanır)
5. Her supplier için 1 PO draft oluştur, status=`draft`
6. Yanıt: oluşturulan PO id'leri + grup başına önerilen toplam tutar

**PO Receive (`POST /po/:id/receive`)**
- Body: `{ items: [{ po_item_id, qty_received_now, lot_no?, expiry_date? }] }`
- Transaction: her satır için `qty_received += qty_received_now`, `inventory.quantity += qty_received_now`, `track_lots ise inventory_lots insert`, `stock_movements (type='po_receive', lot_id?)` insert
- Tüm satırlar tamamlandıysa `status='received'`, kısmi ise `'partial_received'`
- Goods receipt otomatik oluşturulur (mevcut `createReceipt` çağrısı + `supplier_id` doğru atanır)

**FIFO Lot çıkışı**
- `track_lots = 1` ürünlerde `adjustStock(out)` veya `checkout` çağrılırsa: en eski `active` lot'tan başlanıp tüketilir, lot biterse `status='depleted'`, sonraki lot'a geçilir. Birden fazla lot tüketildiyse her birine ayrı `stock_movements (lot_id)` kaydı.

**Talep onayı**
- `PATCH /requests/:id/approve` → `status='approved'`, `decision_at`, `approved_by`. Talep eden user'a bildirim.
- `POST /requests/:id/fulfill` → otomatik `checkoutItem` çağrısı, `request_id` ile bağlanır, request `status='fulfilled'`.

**Cron eklemeleri**
- Her gün 06:00 — son kullanma 30 gün altı lot'lar için müdüre warning bildirim (dedup_key: `expiry_${lot_id}_<date>`)
- Her ayın 1'i 03:00 — geçmiş ay aylık PDF rapor oluştur, audit log'a referansla kaydet (`withLock` kullanılır — production hardening'den)

### Bildirim entegrasyonu
- Yeni talep → `target_role='campus_manager'` notification, `module='inventory'`
- Talep onaylandı/reddedildi → `target_user_id=requester_id` notification
- Lot expiry → `target_role='campus_manager'`, dedup günlük
- PO receive partial → ilgili supplier için müdüre info

---

## 4. Frontend Mimari

### Reorganizasyon
```
frontend/src/modules/inventory/
├── InventoryPage.jsx           (~150 satır — sekme barı + role-based tab listesi)
├── tabs/
│   ├── ItemsTab.jsx            (mevcut listele/CRUD/edit/adjust)
│   ├── MovementsTab.jsx
│   ├── CheckoutsTab.jsx
│   ├── ReceiptsTab.jsx
│   ├── SuppliersTab.jsx        (yeni)
│   ├── PurchaseOrdersTab.jsx   (yeni)
│   ├── RequestsTab.jsx         (yeni — role bazlı görünüm)
│   ├── LotsExpiryTab.jsx       (yeni)
│   └── ReportsTab.jsx          (yeni — ABC + heatmap + PDF buton)
├── components/
│   ├── ItemPicker.jsx
│   ├── SupplierPicker.jsx
│   ├── LotPicker.jsx
│   ├── PhotoUploader.jsx
│   └── PriceHistoryChart.jsx
└── api.js                      (axios wrapper'lar — modül bazlı)
```

### Sekme erişim matrisi

| Sekme | campus_manager | shift_supervisor | laundry / housekeeper / technical |
|-------|----------------|------------------|------------------------------------|
| Items | ✓ | ✓ | ✓ (read-only) |
| Movements | ✓ | ✓ | — |
| Checkouts | ✓ | ✓ | — |
| Receipts | ✓ | ✓ | — |
| Suppliers | ✓ | ✓ | — |
| Purchase Orders | ✓ | ✓ | — |
| Requests | ✓ (Bekleyenler + Tümü) | ✓ (Bekleyenler) | ✓ ("Talep Aç" + "Geçmişim") |
| Lots / Expiry | ✓ | ✓ | — |
| Reports | ✓ | — | — |

### UI davranış notları
- F1 (refactor) sırasında mevcut UI **değişmez** — sadece dosya bölünür. Görsel veya akış değişikliği yok.
- Yeni sekmeler mevcut tasarım dilini takip eder (mono font, accent color, table density).
- Talep akışı kullanıcı için minimal: ürün dropdown (search) + miktar + neden — 3 alan.
- PO Receive için "barkod gerek" senaryosu yok; manuel adet girişi.

---

## 5. Faz Planı

| Faz | İçerik | Bağımlılık | Test odağı |
|-----|--------|------------|------------|
| **F1** | Frontend modülerleştirme (1431 → 9 dosya, davranış değişmez) | yok | Tüm sekmeler manuel açılır, regression yok |
| **F2** | DB migration: tüm yeni tablolar + kolonlar + stock_movements rebuild | yok | initDB temiz, idempotent, mevcut veri kayıpsız |
| **F3** | Tedarikçi modülü + supplier_prices + goods_receipts.supplier_id migration | F2 | Suppliers CRUD test, eski receipts patlamasın, fiyat geçmişi otomatik kayıt |
| **F4** | PO modülü (draft/sent/receive/PDF) + draft-from-low-stock | F3 | PO oluştur → receive → stock güncellensin, PDF açılır |
| **F5** | Talep–onay akışı + bildirim entegrasyonu | F2 | Talep aç → onayla → checkout oluş, role-based UI |
| **F6** | Lot/Expiry/FIFO + cron uyarısı (06:00) | F2 | track_lots ürün için FIFO çıkış + expiry warning |
| **F7** | Hasarlı/kayıp/transfer movement tipleri + UI menü | F6 | Her tip için movement kaydı + audit log |
| **F8** | Lokasyon (opsiyonel) + transfer tamamlanması | F7 | track_locations ürün için from/to log |
| **F9** | Ürün fotoğrafı upload (multer + magic byte mevcut) | F1 | Upload + UI thumbnail |
| **F10** | Raporlar UI: ABC + departman + heatmap (recharts) | F2 | Mock veriyle ABC sıralama doğru, heatmap render |
| **F11** | Aylık PDF rapor + cron (her ayın 1'i 03:00, withLock) | F10 | PDF düzgün render, cron overlap-safe |

Her faz **bağımsız commit** olur (semantic prefix: `feat:`, `refactor:`, `chore:`). CLAUDE.md kuralı: backend dosya değiştiyse `npx vitest run` geçmeli.

---

## 6. Test Stratejisi

- Her yeni servis için `*.test.js` — `:memory:` SQLite ile happy path + edge case
  - Yetersiz stok, negatif miktar, expired lot, PO double-receive, talep onaylanmadan fulfill, FIFO çoklu lot
- F1 (refactor): manuel her sekmenin açılışı + mevcut akışların regresyonu (item add, adjust, checkout, return, receipt create)
- F2 sonrası: `JWT_SECRET=x NODE_ENV=test node -e "import('./src/app.js')..."` import sağlık kontrolü
- Frontend: tab başına basit smoke (mount + boş state render)
- Pre-merge: tüm vitest suite + `npm run build` (frontend)

---

## 7. Riskler & Azaltıcılar

| Risk | Etki | Azaltıcı |
|------|------|----------|
| Eski `goods_receipts.supplier` (string) → FK migration veri kaybı | Yüksek | Distinct supplier'ları önce insert, sonra UPDATE; eski kolon silinmez (deprecated kalır) |
| F1 frontend refactor regression | Orta | Davranış değişmez — sadece bölünür; her tab ayrı PR-içi commit, hızlı revert |
| Lot FIFO mantığı yanlış → stok tutarsızlığı | Yüksek | Tek transaction içinde lot çıkış + stock_movements; dedicated unit test |
| PO receive iki kere tetiklenirse double stok | Yüksek | Status kontrol + transaction içinde `qty_received` artımı |
| stock_movements CHECK enum güncellemesi tablo rebuild gerektirir | Orta | rooms tablosunda kullanılan rebuild pattern uygulanır (PRAGMA foreign_keys=OFF, transaction içinde) |
| Çok faz tek oturumda (yorgunluk) | Orta | `/phase` skill kullanılır — tek faz tek commit kuralı |
| Aylık PDF cron overlap (büyük rapor uzun sürerse) | Düşük | `withLock` (production hardening'den eklendi) |
| Migrations idempotent değilse restart'ta hata | Yüksek | Tüm migration'lar `IF NOT EXISTS` + try/catch `duplicate column` pattern (mevcut codebase pattern'i) |

---

## 8. Açık Olmayanlar (kararlar)

| Soru | Karar |
|------|-------|
| Lokasyon zorunlu mu opsiyonel mi? | **Opsiyonel** (`inventory.track_locations` flag) |
| Talep akışı kioskta da olsun mu? | **Hayır**, sadece web staff (laundry/housekeeper/technical) |
| Eski `supplier` string kolonu silinsin mi? | **Hayır**, deprecated kalır (geriye dönük uyum) |
| Multi-currency? | **Hayır**, sadece TL |
| Otomatik tedarikçiye email PO? | **Hayır**, manuel PDF download yeterli |
| Mobil envanter? | **Scope dışı** — ayrı proje |
| Barkod/QR tarama? | **Scope dışı** — ayrı proje |
