# Servis Rota Haritası: Gerçek Yol Çizimi + Haritadan Düzenleme

**Tarih:** 2026-07-27
**Durum:** Onaylandı — uygulamaya geçiliyor

## Problem

`Servisler → Harita` sekmesi (`frontend/src/modules/transport/tabs/MapTab.jsx` → `RouteMap.jsx`) tüm aktif rotaları aynı anda gösterir, ama her rotanın çizgisi durakları **düz çizgiyle** birleştirir (`logic/routeMap.js#buildRoutePolyline`). Gerçek yol/kavşak takip etmez.

Ayrıca durak/sıra/yol değişikliği yapmak için haritadan hiçbir düzenleme imkânı yok — her şey liste tabanlı formlarla (`RoutesTab.jsx`'in "Durak Ekle/Düzenle" modalı) yapılıyor.

Not: `frontend/src/modules/transport/MapPicker.jsx` içinde **ayrı, aynı isimli** bir `RouteMap` fonksiyonu zaten var ve tekil rota önizlemesinde (`RoutesTab.jsx`'in durak modalı) OSRM'in genel demo sunucusundan (`router.project-osrm.org`) her render'da canlı yol rotası çekiyor, başarısız olursa kesikli düz çizgiye düşüyor. Bu iki bileşen birbirinden habersiz. Bu spec sadece ana "Harita" sekmesini (`MapTab.jsx`/`RouteMap.jsx`) kapsar; `MapPicker.jsx`'teki tekil önizleme aynı kalır (dokunulmaz).

## Kapsam

1. Ana harita sekmesindeki tüm rota çizgileri gerçek yol rotası (OSRM) ile çizilsin.
2. Yetkili roller (campus_manager, shift_supervisor) haritadan:
   - bir durağı sürükleyerek gerçek konumunu değiştirebilsin,
   - bir durağı rota üzerinde başka bir yere bırakarak sırasını değiştirebilsin,
   - rota çizgisinin kendisini sürükleyerek yolu elle düzeltebilsin (OSRM'in yanlış geçtiği durumlar için).

## Mimari

### Veri modeli (migration `063_route_path_geometry.sql`)

`routes` tablosuna:
- `path_geometry TEXT` — `JSON.stringify([[lat,lng], ...])`, işyeri (Filyos) dahil tam çizim.
- `path_is_manual INTEGER NOT NULL DEFAULT 0` — 1 ise elle düzeltilmiş, otomatik hesaplama onu ezmez.
- `path_computed_at TEXT` — son hesaplama zamanı (debug/görünürlük için).

`IF NOT EXISTS` gerekmez (ALTER TABLE ADD COLUMN, runner zaten tek-sefer garanti eder).

### Sunucu tarafı hesaplama

- `backend/src/modules/transport/routing.js` (yeni): `computeRoadRoute(waypoints)` — OSRM'e `router.project-osrm.org/route/v1/driving/...` isteği atar (Node 22 native `fetch`), başarılı olursa `[[lat,lng],...]` döner, başarısızsa `null` döner (network hatası, timeout, 4xx/5xx hepsi `null`'a düşer — exception fırlatmaz, çağıran karar verir).
- `backend/src/modules/transport/workSite.js` (yeni): `WORK_SITE = { lat: 41.5750, lng: 32.0264 }` — frontend `zonguldakBartin.js` ile aynı değer, backend'de de gerekli çünkü OSRM çağrısı işyerine kadar rota çizer.
- Waypoint listesi: `listRouteStops(routeId)` sonucu (zaten `sequence_order`'a göre sıralı) → koordinatlı olanlar filtrelenir → sona `WORK_SITE` eklenir. 2'den az waypoint varsa hesaplama atlanır, `path_geometry = null` kalır (frontend düz çizgiye/"durak yok" durumuna düşer).

### Yeniden hesaplama tetikleyicileri (job kuyruğu)

`backend/src/shared/jobs/handlers.js`'e yeni handler: `'transport.recompute-path': recomputeRoutePathJob`. Payload: `{ routeId }`. Handler DB'den güncel rota+durakları okur, `computeRoadRoute` çağırır:
- Başarılıysa `path_geometry` günceller, `path_is_manual = 0`, `path_computed_at = now`.
- Başarısızsa (OSRM ulaşılamaz) transient hata fırlatır → mevcut retry/backoff devreye girer, eski `path_geometry` korunur (silinmez).

**"Yapısal değişiklik"** — aşağıdakilerden biri olduğunda ilgili rota(lar) için bu job enqueue edilir VE `path_is_manual` otomatik `0`'a çekilir (elle çizim artık geçersiz sayılır):
- Durak eklenme/silinme (`addRouteStop`, `deleteRouteStop`)
- Sıra değişikliği (`reorderRouteStops`)
- Bir durağın koordinatı değişmesi (`updatePickupPoint` içinde `lat`/`lng` değiştiyse) — bu durakla ilişkili **tüm rotalar** (`route_stops` üzerinden `pickup_point_id` eşleşenler) için tetiklenir.

Bunların dışında (isim, plaka, şoför, kapasite gibi alan değişiklikleri) path'e dokunmaz.

### Yeni API uçları (`backend/src/modules/transport/routes.js`)

- `PUT /transport/routes/:id/path` (mgr only) — body `{ geometry: [[lat,lng],...] }`. Elle düzeltmeyi doğrudan kaydeder: `path_is_manual=1`, `path_computed_at=now`. OSRM çağrısı yok (geometri zaten istemcide hazır).
- `POST /transport/routes/:id/recompute-path` (mgr only) — "Otomatik yeniden hesapla" butonu için. `path_is_manual` ne olursa olsun **senkron** OSRM çağrısı yapar (job kuyruğuna atmaz — kullanıcı sonucu bekliyor), sonucu kaydedip döner. Başarısızsa `502` + hata mesajı.
- `GET /transport/routes?with_stops=1` (mevcut) genişler: her rotaya `path_geometry` (parse edilmiş dizi veya `null`) ve `path_is_manual` eklenir.

### Frontend

- `frontend/src/modules/transport/logic/routeMap.js` genişler:
  - `SNAP_THRESHOLD_M = 120` — sabit.
  - `distanceToSegmentMeters(point, a, b)` — nokta-çizgi mesafesi (haversine tabanlı, düz metrik yaklaşım yeterli çünkü bölge küçük).
  - `classifyDrop(dropPoint, routeGeometry, threshold)` → `{ type: 'reorder', afterStopIndex } | { type: 'move' }`.
  - `insertViaPoint(geometry, segmentIndex, point)` — elle yol düzeltme için diziye yeni nokta ekler.
- `RouteMap.jsx`: düzenleme modu (seçili rota + `editable` state). Duraklar `Marker draggable` olur; `dragend`'de `classifyDrop` çağrılır → `reorder-stops` ya da `pickup-points/:id` PUT'u tetiklenir. Rota çizgisi segment ortalarında küçük "hayalet" tutamaç noktaları gösterir (sadece düzenleme modunda) — sürüklenince `insertViaPoint`, bırakılınca yerel state'te birikir, "Kaydet" ile `PUT /routes/:id/path`.
- `MapTab.jsx`: legend'daki her rota satırına mgr rollerinde görünen "✎" düzenle butonu.

## Hata durumları

- OSRM ulaşılamazsa: mevcut `path_geometry` korunur; hiç yoksa harita düz çizgiye (`buildRoutePolyline` fallback) döner + rota üzerinde küçük "⚠ yol hesaplanamadı" rozeti.
- Job kuyruğu zaten retry/backoff yapıyor (bkz. `CLAUDE.md` Observability bölümü) — ek mekanizma gerekmez.
- Yetkisiz rol düzenleme uçlarına istek atarsa mevcut `requireRole` 403 döner (yeni davranış yok, mevcut desen).

## Test planı

**Backend:**
- `routing.js`: `computeRoadRoute` — başarılı parse + ağ hatasında `null` (fetch mock).
- `queries.js`: `saveRoutePath` (manual flag + geometry set), yapısal değişiklik sonrası `path_is_manual` sıfırlanması (addRouteStop/deleteRouteStop/reorderRouteStops/updatePickupPoint).
- `handlers.js`: `recomputeRoutePathJob` başarı/başarısızlık (transient throw → retry edilir mi kontrolü).
- `transport.test.js`: yeni uçlar için happy-path + yetki testleri.

**Frontend:**
- `routeMap.test.js` genişler: `distanceToSegmentMeters`, `classifyDrop` (eşik sınırında iki taraf), `insertViaPoint`.
- Mevcut `MapTab.smoke.test.jsx` / component smoke testleri: düzenle butonu sadece mgr rollerinde render ediliyor mu.

## Kapsam dışı

- `MapPicker.jsx`'teki tekil rota önizlemesi (RoutesTab modalı) değişmiyor.
- OSRM'in kendisini self-host etmek kapsam dışı — genel demo sunucusu kullanılmaya devam ediyor (mevcut kullanım deseniyle tutarlı).
- Rota dışı (iş yeri sonrası) segment düzenleme yok — sadece durak-durak arası ve son durak→işyeri segmenti düzenlenebilir.
