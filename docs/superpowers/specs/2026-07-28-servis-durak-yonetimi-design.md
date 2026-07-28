# Servis Durak Yönetimi: Taşınabilir İş Yeri + Gerçek Silme

**Tarih:** 2026-07-28
**Durum:** Onaylandı — uygulamaya geçiliyor
**İlgili spec:** `2026-07-28-servis-rota-ugrak-noktalari-design.md`

## Problem

Canlı veriden çıkan tablo (29 durak):

| Sorun | Kanıt |
|---|---|
| Aynı isimli çöp duraklar birikiyor | 29 durağın **23'ü "Yeni Durak"** adında |
| Silme yok, sadece pasifleştirme | `deletePickupPoint` yalnızca `is_active = 0` yapar; buton "KAPAT" |
| Pasif duraklar listeden hiç çıkmıyor | Kalıcı silme ucu yok; kullanıcı temizleyemiyor |
| İş yeri (Filyos) konumu sabit | `zonguldakBartin.js` ve `workSite.js` içinde sabit kod |

Kullanıcının ifadesi: *"son durak filyosun yerini değiştiremiyorum onu da düzelt ve durakları da silebileyim sadece kapatma seçeneği olmasın."*

Kök neden zinciri: haritada boşluğa tıklayarak durak ekleme özelliği her durağa `"Yeni Durak"` sabit ismini veriyor → kullanıcı denedikçe aynı isimli kayıtlar birikiyor → temizlemek isteyince yalnızca "KAPAT" bulunuyor → pasif kayıtlar sonsuza kadar listede kalıyor.

## Çözüm

Dört parça:

### 1. İş yeri (Filyos) taşınabilir olsun

- Konum `system_settings` tablosunda `transport_work_site` anahtarında `{"lat":…,"lng":…}` olarak saklanır. Ayrı tablo/migration gerekmez — `system_settings` zaten var ve kampüs haritası pinleri aynı deseni kullanıyor (`campus_map_pins`).
- Koddaki `41.5750, 32.0264` yalnızca **varsayılan** olur: ayar yoksa o kullanılır.
- **`GET /api/transport/work-site`** (view rolleri) → `{ lat, lng, name, short }`.
- **`PUT /api/transport/work-site`** (mgr) → `{ lat, lng }` doğrular, kaydeder, **tüm aktif rotalar** için `transport.recompute-path` işini kuyruğa atar (senkron değil — çok rota olabilir), `{ ok, lat, lng, requeued }` döner.
- Haritada Filyos işaretçisi yetkili rolde sürüklenebilir. Bırakınca **onay sorulur** (*"Tüm rotalar yeniden hesaplanacak"*) — bu geri alması zahmetli ve her rotayı etkileyen bir işlem, kazara sürüklemeye karşı koruma gerekir. Reddedilirse işaretçi eski yerine döner.
- Rotalar sekmesindeki küçük önizleme haritası (`MapPicker.jsx` içindeki `RouteMap`) da aynı konumu kullanır; yoksa iki ekran çelişir.

### 2. Kalıcı durak silme

- **`DELETE /api/transport/pickup-points/:id/permanent`** (mgr). Tek transaction içinde:
  1. Etkilenen rota id'leri toplanır (`route_stops` üzerinden).
  2. Silinecek `route_stops` id'lerine bağlı uğraklar ilgili rotaların `via_points` dizisinden çıkarılır.
  3. `route_stops` satırları silinir.
  4. `staff.pickup_point_id` bu durağı gösterenler `NULL` yapılır.
  5. `pickup_points` satırı silinir.
- Transaction sonrası etkilenen rotalar için `transport.recompute-path` kuyruğa atılır.
- Dönen değer: `{ ok, removed_stops, unassigned_staff, affected_routes }`.
- `route_assignments.stop_id` zaten `ON DELETE SET NULL` — ek işlem gerekmez.
- Foreign key'ler açık (`PRAGMA foreign_keys = ON`), bu yüzden sıralama önemlidir: önce referanslar, sonra durak.
- Arayüz: kartta **DÜZENLE · KAPAT · SİL**. "SİL" öncesi onay kutusu kullanımdaki sayıları gösterir (bu sayılar `staff_count` / `route_count` olarak zaten liste yanıtında var, ek istek gerekmez).
- "KAPAT" (pasifleştirme) kaldırılmaz — geçici olarak kullanımdan çıkarmak hâlâ geçerli bir ihtiyaç.

### 3. Toplu temizlik

- **`POST /api/transport/pickup-points/cleanup-unused`** (mgr) → `is_active = 0` **ve** hiçbir `route_stops`/`staff` kaydında geçmeyen durakları siler, `{ ok, deleted }` döner.
- Aktif duraklara ve kullanımdaki pasif duraklara **dokunmaz**.
- Arayüz: Duraklar sekmesinin üstünde `⌫ Kullanılmayan pasif durakları temizle (N)`. `N` istemcide mevcut listeden hesaplanır (`!is_active && staff_count === 0 && route_count === 0`), ek uç gerekmez. Buton yalnızca `N > 0` iken görünür ve onay ister.

### 4. Yeni durak eklerken isim sorulsun

- Haritada boşluğa tıklamak artık doğrudan durak yaratmaz; `MapTab` içinde bir isim kutusu (mevcut `ModalShell`) açılır.
- Onaylanınca durak o isimle yaratılıp rotaya eklenir. İptal edilirse hiçbir kayıt oluşmaz.
- İsim boş bırakılırsa **artan numaralı** ad üretilir: mevcut adlar arasında `Yeni Durak`, `Yeni Durak 7` gibi olanların en büyük numarası bulunup bir fazlası kullanılır (`Yeni Durak` numarasız ise 1 sayılır).
- Bu üretim saf bir fonksiyona alınır: `nextAutoStopName(existingNames)` — `logic/routeMap.js` içinde, birim testli.

## Hata durumları

- İş yeri kaydı sırasında geçersiz koordinat → `400`.
- Kalıcı silme sırasında durak bulunamazsa → `404`.
- Toplu temizlikte silinecek kayıt yoksa → `200` ve `{ deleted: 0 }` (hata değil).
- Yetkisiz rol → mevcut `requireRole` ile `403`.
- İş yeri taşındıktan sonra OSRM erişilemezse: iş kuyruğu zaten yeniden dener; eski geometri korunur (mevcut davranış).

## Test planı

**Backend:**
- `getWorkSite` ayar yokken varsayılanı, ayar varken kaydedileni döner.
- `PUT /work-site` kaydeder ve aktif rota sayısı kadar iş kuyruğa atar; geçersiz koordinat `400`; yetkisiz rol `403`.
- Kalıcı silme: rota kaydı, uğrak, personel bağı ve durak kaydı gider; etkilenen rota kuyruğa alınır; kullanılmayan durak da sorunsuz silinir; olmayan id `404`; yetkisiz rol `403`.
- Toplu temizlik: yalnızca pasif+kullanılmayanları siler; aktif olanı ve kullanımdaki pasifi bırakır.

**Frontend:**
- `nextAutoStopName`: boş liste → `Yeni Durak 1`; `["Yeni Durak"]` → `Yeni Durak 2`; `["Yeni Durak 7","Yeni Durak 3"]` → `Yeni Durak 8`; alakasız isimler sayılmaz.
- `PointsTab` smoke: `SİL` butonu ve toplu temizlik butonunun sayısı doğru render ediliyor.

## Kapsam dışı

- Pasif durağın rotada kalmaya devam etmesi (mevcut davranış) bu spec'te değiştirilmiyor — ayrı bir konu.
- İş yeri adının (`Filyos Doğal Gaz İşleme Tesisi`) düzenlenebilmesi; yalnızca konum taşınabilir.
- Silinen durakların geri alınması / çöp kutusu — YAGNI.
