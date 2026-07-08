# Su Takip — Marka, Boş Kap İadesi ve INDEX Pivot Raporu

**Tarih:** 2026-07-08
**Modül:** `water`
**Kaynak:** Kullanıcının INDEX Excel dosyası (firma × marka/ürün dağıtım matrisi + boş damacana/palet iade defteri)

## Amaç

Mevcut su takip modülü (giriş/dağıtım/FIFO irsaliye eşleştirme, günlük defter, grid, metinden
dağıtım, Excel export) güçlü. Excel'de olup modülde olmayan 4 boşluğu kapatmak:

1. **Marka/tedarikçi boyutu** — MİLA SU · AVRİL · ÇOBAN PINAR. Aynı ürün (damacana) farklı markadan.
2. **INDEX pivot raporu** — firma (satır) × marka-gruplu ürün (sütun) matrisi, firma başına TOPLAM,
   sütun toplamları, GENEL TOPLAM; Excel formatında indirme.
3. **Boş kap / palet iadesi** — TESLİM EDİLEN BOŞ DAMACANA / TAHTA PALET; depozito (dolaşım) bakiyesi.
4. **Gerçek verilerle seed** — ~30 firma + marka/ürün kataloğu.

## Kritik gözlem

`qty_base` zaten en küçük birim (adet/şişe/damacana) cinsinden normalize. Excel INDEX hücreleri de
her ürünün doğal birimindeki ham sayı. Dolayısıyla **pivot hücresi = `SUM(qty_base)`** — yeni veri
modeli gerekmez, mevcut `zoneTotals` matrise dönüştürülür.

## Veri modeli (migration `028_water_brands_returns.sql`)

- **`water_brands`** (yeni): `id, name UNIQUE, sort_order, is_active, created_at`
- **`water_products`** + 3 kolon: `brand_id` (FK nullable), `is_returnable` (0/1), `sort_order`
- **`water_returns`** (yeni): `id, product_id, move_date, qty_base, input_qty, input_unit, note,
  created_by, created_at` — boş kap iade defteri.

**Neden `water_returns` ayrı tablo (water_movements'a dokunmadan):** İade semantik olarak farklı —
bölge yok (tedarikçiye gider), irsaliye lot'u tüketmez, dolu stok `qty_base`'ini etkilemez. Ayrıca
`water_movements.type` CHECK'ini genişletmek tablo rebuild → allocations FK riski demekti. Ayrı tablo
daha temiz ve düşük riskli.

**Mevcut ürünler:** 4 varsayılan ürün silinmeden MİLA'ya bağlanır (production hareket geçmişi korunur).
Palet konfigleri (0.33/0.5) değiştirilmez — mevcut `humanize` testleri ve prod bakiyeleri stabil kalır.

## Backend

- `queries.js`: brand CRUD; `listProducts` brand JOIN + `ORDER BY brand.sort_order, product.sort_order`;
  return CRUD + `returnTotalsByProduct`; `depositBalances`; pivot için `zoneTotals` yeniden kullanılır.
- `service.js`: brand servisleri; product servisi `brand_id/is_returnable/sort_order` kabul eder;
  return servisleri (tek + batch, `is_returnable` doğrulaması); `pivotService(from,to)` matris kurar;
  `summaryService`'e depozito bölümü.
- `routes.js`: `/brands` CRUD, `/returns` (GET/POST/batch/DELETE), `/pivot`.

**Depozito formülü:** iade edilebilir ürün başına `outstanding = SUM(in) − SUM(return)` = dolaşımdaki
(henüz tedarikçiye iade edilmemiş) kap.

## Frontend (`WaterPage.jsx`)

Sekmeler: 📊 Özet · **📋 INDEX** · 📥 Giriş · 🚚 Dağıtım · **♻️ Boş İade** · 📍 Bölgeler · 💧 Ürünler

- **INDEX tab:** firma × (marka→ürün) matris; marka-gruplu başlık; TOPLAM sütunu; sütun toplamları;
  GENEL TOPLAM; Excel indirme (aynı düzen).
- **Boş İade tab:** iade defteri (tarih, ürün, miktar, not) + markaya göre dönem/genel toplam +
  depozito bakiyesi kartları.
- **Ürünler tab:** marka seçimi + "iade edilebilir" toggle + kompakt marka yönetimi (ekle/sil).

## Test

`water.test.js`: brand CRUD; brand_id/is_returnable'lı ürün; return create/batch + depozito bakiyesi;
pivot endpoint yapı & toplamları; seed firma/marka varlığı. Frontend smoke bozulmaz (yeni tablar
default mount olmaz, bilinmeyen URL mock `[]` döner).

## Seed

3 marka; ~30 firma (idempotent, per-name); marka bazlı katalog (İadesiz Damacana, Cam Su, AVRİL
Damacana, ÇOBAN İadesiz Damacana, Tahta Palet) — hepsi `WHERE NOT EXISTS` guard'lı, production-safe.
