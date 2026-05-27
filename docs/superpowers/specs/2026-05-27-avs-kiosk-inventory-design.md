# AVS Kiosk — Envanter Çıkış (Zimmet) Tasarımı

**Tarih:** 2026-05-27
**Durum:** Tasarım onaylandı, plan bekliyor
**Kapsam:** Yalnız AVS kiosk envanter çıkışı. Personel/self-service kiosku ve diğer temizlik geliştirmeleri ayrı tur(lar)da.

## Amaç

AVS personeli (Temizlik / Teknik / Çamaşırhane) ürün/malzeme aldığında AVS kiosktan (`/avs-kiosk`) hızlıca stoktan düşsün; "kim ne kadar aldı" yapısal olarak kayda geçsin. Mal kabul (giriş) **kapsam dışı** — bu özellik yalnız çıkış/zimmet.

## Doğrulanmış Kod Gerçekleri

Tasarım bu doğrulanmış gerçeklere dayanır:

| Konu | Gerçek |
|---|---|
| Staff checkout altyapısı | `checkoutToStaff(itemId, staffId, qty, note, userId, fromLocationId?)` (inventory/service.js:155) → `checkoutItem` (queries.js:232) zaten AVS staff için yazılmış: `staff WHERE id=? AND is_active=1` kontrolü, hata "AVS personeli bulunamadi veya pasif". Stok düşer, `inventory_checkouts(staff_id)` kaydı, lot (FIFO) / lokasyon, `stock_movements type='out'` yazar. |
| `inventory_checkouts.staff_id` | Migration ile eklenmiş (`db/index.js:1342` ALTER + `idx_inv_checkouts_staff`). `personnel_id` ile yan yana durur; staff checkout `staff_id` kolonunu kullanır. |
| Raporlar staff join'li | `getActiveCheckouts` / `getStaffCheckouts` / checkout report (queries.js ~321-437) `JOIN staff s ON s.id=ic.staff_id` — admin'de kişi bazlı görünüm anında çalışır. |
| `created_by` kısıtı | `inventory_checkouts.created_by` ve `stock_movements.created_by` → `NOT NULL REFERENCES users(id)`. Kiosk worker'ı `staff.id`, `users` değil → sistem kullanıcısı gerekli. |
| Item listeleme | `getAllItems(category)` (queries.js:9) — kategori filtreli, `ITEM_SELECT_WITH_SUPPLIER`. Kiosk endpoint'i `track_locations`/`quantity`/`unit`/`item_name`/`category` alanlarını açıkça döndürmeli. |
| Lokasyon listesi | `inventory_locations` tablosu; admin route `mgr` korumalı. Kiosk için item bazlı lokasyon listesi avs-self-service içinde inline sorgulanır (admin route reuse edilmez, rol uymaz). |
| Kategoriler | `inventory.category IN ('laundry','maintenance','housekeeping','general')`. Etiketler: laundry=Çamaşır, maintenance=Bakım, housekeeping=Temizlik. |
| Departman id'leri | 1 Güvenlik · 2 Temizlik · 3 Mutfak · 4 İdari · 5 Teknik · 6 Bahçe · 7 Sağlık · 8 Çamaşırhane. Dispatch **departman ADI** ile (id sırası prod'da değişebilir). |
| JWT | `req.user.workerId = staff.id`, role `avs_kiosk`. |

## Mimari

`avs-self-service` modülüne 3 yeni endpoint (mevcut `inventory` servisini/queries'ini reuse — **şema değişikliği yok**). Frontend `AvsSelfServicePage`'e koşullu yeni sekme. Tüm endpoint'ler `requireAvsKiosk` + `req.user.workerId` ile filtreli.

### Departman → Kategori Eşlemesi

Saf yardımcı fonksiyon (backend ve frontend ortak mantık, ayrı ayrı tanımlanır):

```
departmentToCategory(name):
  lower = name.toLowerCase()
  'temizlik' içeriyorsa        → 'housekeeping'
  'teknik' içeriyorsa          → 'maintenance'
  'çama' veya 'cama' içeriyorsa → 'laundry'
  aksi halde                    → null   (envanter erişimi yok)
```

Eşleşmeyen departmanlar (Güvenlik, Mutfak, İdari, Bahçe, Sağlık) → envanter sekmesi yok, endpoint'ler 403.

Item sorgusu her zaman worker kategorisi **+ `general`** döndürür (ortak sarf malzemeleri herkese açık).

### Sistem Kullanıcısı (`created_by` çözümü)

İdempotent helper `getKioskSystemUserId()` (avs-self-service veya shared/auth içinde):

```sql
INSERT OR IGNORE INTO users(username, password_hash, role, full_name)
VALUES('avs_kiosk_system', '!', 'housekeeper', 'AVS Kiosk Sistemi');
SELECT id FROM users WHERE username='avs_kiosk_system';
```

- `password_hash='!'` geçerli bcrypt hash değil → `bcrypt.compareSync` daima false → bu hesapla login **imkansız**.
- `role='housekeeper'` CHECK constraint'i karşılar (en düşük etkili rol).
- id modül kapsamında cache'lenir.
- **Gerçek "kim aldı" = `inventory_checkouts.staff_id` = workerId.** `created_by` yalnız "kaydı oluşturan sistem" anlamında. Admin raporları staff_id ile çalıştığından worker doğru görünür.
- Not: bu hesap admin UsersPage listesinde "AVS Kiosk Sistemi" olarak görünebilir (kabul edilebilir; servis hesabı).

### Endpoint'ler

**`GET /api/avs-self-service/inventory/items`**
- Worker'ın departmanından kategori belirlenir. Kategori `null` ise → `403 { error: 'Envanter erişiminiz yok' }`.
- `getAllItems` mantığıyla `category IN (workerCategory,'general')` ürünleri döner; her ürün: `id, item_name, category, quantity, unit, reorder_threshold, track_locations`.
- Stoğu 0 olanlar da döner (frontend "tükendi" gösterir, seçtirmez).

**`POST /api/avs-self-service/inventory/checkout`**
- Body: `{ item_id, quantity, note?, from_location_id? }`.
- Doğrulama: `quantity` pozitif sayı; worker'ın kategori erişimi yoksa → 403; ürün worker kategorisi veya `general` dışındaysa → 403 (`{ error: 'Bu ürüne erişiminiz yok' }`).
- `checkoutToStaff(item_id, req.user.workerId, quantity, note, systemUserId, from_location_id)` çağrılır.
- Servis hataları geçirilir: yetersiz stok → 400, lokasyon-takipli ürün + `from_location_id` yok → 400.
- `audit_log`'a ek kayıt: `action='kiosk_avs_inventory_checkout'`, detail `{ workerId, item_id, quantity }` (mevcut maintenance/feedback deseni).
- Başarı: `201 { ok: true, quantity: kalanStok }`.

**`GET /api/avs-self-service/inventory/my-checkouts`**
- `getStaffCheckouts(req.user.workerId)` — worker'ın açık (iade edilmemiş) zimmetleri: ürün adı, miktar, tarih.

**`GET /api/avs-self-service/my-info` (mevcut, genişletilir)**
- SELECT'e departmandan türetilen `inventory_category` eklenir (frontend sekme koşulu). Hesaplama route içinde `departmentToCategory(department_name)` ile yapılabilir (SQL'e gömülmez).

## Frontend (`AvsSelfServicePage.jsx`)

- **Yeni sekme:** `{ key: 'inventory', icon: '📦', i18n: 'avs_kiosk.nav.inventory' }`. `TAB_KEYS` artık `my-info.inventory_category` doluysa 10. sekmeyi içerecek şekilde koşullu üretilir. 10 sekme → **mevcut "Daha fazla" overflow'a** doğal olarak düşer (4 birincil + 6 taşan).
- **Akış:**
  1. Kategori-filtreli ürün listesi (`GET inventory/items`, sekme aktifken). İstemci tarafı arama kutusu.
  2. Ürün seç → miktar stepper (1..stok), opsiyonel not. Ürün `track_locations` ise zorunlu kaynak lokasyon dropdown'u (item bazlı lokasyon listesi endpoint'inden).
  3. "Aldım" → `POST checkout`. Başarıda: toast + `items` ve `my-checkouts` query invalidate.
  4. Altında "Aldıklarım" mini-listesi (`GET my-checkouts`).
- **Durumlar:** stok 0 → "Tükendi", seçilemez; yetersiz stok / lokasyon gerekli / erişim yok → kiosk içi hata mesajı.
- `departmentToCategory` saf fonksiyon ayrı dosyada (`components/` altında), birim testi ile (`navTabs.test.js` deseni — node ortamı, jsdom yok).

## i18n

`avs_kiosk.nav.inventory` (kısa: tr "Malzeme" / en "Supplies" / ar "المستلزمات") + `avs_kiosk.inventory.*` grubu (başlık, ara, miktar, not, al, aldıklarım, tükendi, yetersiz stok, lokasyon seç, erişim yok, başarı) — tr/en/ar.

## Hata Yönetimi

- Kategori erişimi yok → 403, frontend sekmeyi hiç göstermez (savunma için endpoint de korur).
- Yetersiz stok → 400 (servis mesajı), kiosk gösterir.
- Lokasyon-takipli ürün + lokasyon yok → 400, frontend lokasyon dropdown'unu zorunlu kılar (proaktif).
- Tüm endpoint'ler `requireAvsKiosk`; token yok → 401.

## Test (TDD)

**Backend** (`avs-self-service.test.js`'e eklenir; test worker Temizlik departmanlı, M1, mevcut beforeAll):
- Temizlik worker → `GET inventory/items` housekeeping + general döner, başka kategori dönmez.
- Eşleşmeyen departmanlı worker → `GET inventory/items` 403.
- `POST checkout` → stok düşer, `inventory_checkouts` satırı `staff_id=workerId` ile oluşur, `stock_movements type='out'` yazılır, `audit_log` kaydı.
- Yetersiz stok → 400.
- `GET my-checkouts` → worker'ın açık zimmetini içerir.
- `my-info` → Temizlik worker'da `inventory_category='housekeeping'`.

**Frontend** (saf mantık):
- `departmentToCategory`: temizlik→housekeeping, teknik→maintenance, çamaşır→laundry, bilinmeyen→null.

**Regresyon:** `npx vitest run` (backend full suite) yeşil kalmalı; `checkoutToStaff` mevcut admin testleri bozulmamalı.

## Kapsam Dışı (YAGNI)

- Mal kabul / goods receipt (giriş) — admin'de zaten var.
- Kioskta yeni ürün oluşturma — yalnız admin.
- İade akışı kiosktan — şimdilik yok (admin "Aldıklarım"ı iade eder); kiosk "Aldıklarım" salt görüntüleme.
- Personel/self-service kiosku ve diğer temizlik özellikleri — ayrı tur.
- Departman→kategori eşlemesinin admin'den yapılandırılması — sabit kod yeterli; gerekirse sonra.
