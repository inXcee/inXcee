# Transport Rota/Durak Haritası — Tasarım

**Tarih:** 2026-06-04
**Modül:** `transport`
**Kaynak:** 1 Haz operational-group spec'i Faz 3 ("transport canlı harita") — implementasyon-düzeyi tasarım.

## Bağlam

Transport modülü decomposition sonrası temiz (`TransportPage` orkestratör + `tabs/` 5 sekme: Daily/Routes/Points/People/Reports + `MapPicker` tek-nokta seçici). **Tüm rotaları/durakları tek haritada gösteren birleşik görünüm yok** — sadece nokta seçici (`MapPicker`) ve duraklar için Google Maps linkleri var.

**Önemli kısıt:** Sistemde GPS/araç konum beslemesi yok (sürücü uygulaması yok). Bu yüzden "canlı" = anlık araç konumu **değil**; kapsam statik **rota/durak genel bakış** haritası.

## Amaç

Yönetici rota kapsamını, çakışmaları ve boşlukları coğrafi olarak görür. Statik rota tanımları üzerinden çalışır (günden bağımsız).

## Kapsam (onaylı)

### Yerleşim
- TransportPage `TABS`'ine yeni `HARİTA` (🗺) sekmesi (`?tab=map`, `useUrlParamState`).

### Bileşenler
- **`tabs/MapTab.jsx`** — orkestratör: veri çekme (useQuery) + UI state (görünür rotalar `Set`, seçili rota, seçili durak) + legend + `RouteMap` render.
- **`RouteMap.jsx`** — izole Leaflet bileşeni, **lazy-load**. Saf görsel: marker'lar, polyline'lar, popup'lar. Tüm veri prop, tüm etkileşim callback.
- **`logic/routeMap.js`** — saf yardımcı fonksiyonlar (test edilebilir):
  - `buildRoutePolyline(route, workSite)` → rotanın sıralı stop'larını `[lat, lng]` dizisine çevirir, sona `workSite` ekler, koordinatsız (lat/lng null) stop'ları atlar.
  - `pointsWithCoords(points)` / `pointsWithoutCoords(points)` → koordinatlı/konumsuz durak ayrımı.

### Backend (minimal)
- `listRoutes` `withStops` sorgusuna `pp.lat, pp.lng` kolonları eklenir (tek satır, geriye uyumlu). **Yeni endpoint yok, Zod yok** (salt-okuma).
- Mevcut uçlar kullanılır: `GET /transport/routes?activeOnly=1&withStops=1` + `GET /transport/points?activeOnly=1`.

### Veri akışı
- MapTab mount → iki query paralel: aktif rotalar (withStops) + aktif duraklar.
- Her rota `r.color` ile çizilir; stop'ları `sequence_order`'a göre sıralı + `WORK_SITE`'a bağlanır.
- Tüm aktif duraklar marker; rotaya bağlı/bağsız ayrımı görsel (opaklık/kenar).

### Etkileşim (rota seçici + vurgulama)
- **Legend:** her rota satırı → renk + ad + plaka + durak sayısı. Tıkla → o rotayı vurgula (diğer polyline'lar solar). Göz ikonu → göster/gizle (`Set`).
- **Polyline'a tıkla** → rota seçili + popup: plaka, şoför, kapasite, durak sayısı.
- **Durak marker'ına tıkla** → popup: durak adı, ilçe/mahalle, bu durağı kullanan rotalar, `staff_count`.
- **`WORK_SITE`** özel marker (varış noktası).
- Varsayılan görünüm: `REGION_CENTER` (lat 41.55, lng 31.95, zoom 9).

### Hata / boş durumlar
- Koordinatsız (lat/lng null) durak haritada gösterilmez + "N durak konumsuz" uyarı şeridi.
- Hiç rota/durak yoksa boş durum mesajı.
- Leaflet lazy-load: yüklenene kadar skeleton/placeholder.

## Kapsam dışı (bilinçli — YAGNI)
- Haritadan düzenleme (durak sürükle, rotaya ekle/çıkar) — mevcut RoutesTab/PointsTab akışıyla çakışır.
- GPS / canlı araç konumu — veri kaynağı yok.
- Günlük doluluk/biniş katmanı (`route_assignments`) — amaç statik genel bakış; ileride toggle olarak eklenebilir.
- Haritadan rota oluşturma.

## Mimari / izolasyon
- Harita mantığı (`logic/routeMap.js`) saf fonksiyon → jsdom'da test edilir; Leaflet'e bağımlı değil.
- `RouteMap.jsx` "aptal görselleştirici" — Leaflet lazy-load, jsdom'da smoke edilmez.
- MapTab legend/state mantığı Leaflet'ten bağımsız → smoke edilebilir.

## Test stratejisi
- **`logic/routeMap.test.js`** (saf birim): polyline koord üretimi + WORK_SITE ekleme + konumsuz stop atlama; koordinatlı/konumsuz ayrımı.
- **`MapTab.smoke.test.jsx`**: mock api → legend rota adı + plaka render; gizle toggle görünür rotalar Set'ini günceller; "N durak konumsuz" uyarısı doğru sayıyı gösterir.
- **Backend** (`transport.test.js`): `listRoutes({withStops:true})` çıktısında stop'larda `lat`/`lng` döner.
- Leaflet harita render'ı (RouteMap.jsx) smoke edilmez — mantık logic'te izole.

## Önerilen uygulama sırası
1. Backend: withStops `pp.lat, pp.lng` + test.
2. `logic/routeMap.js` + saf test (TDD).
3. `RouteMap.jsx` (Leaflet, lazy-load).
4. `tabs/MapTab.jsx` + legend + state + smoke test.
5. TransportPage TABS'e `HARİTA` sekmesi + render.
6. Build + tüm transport testleri + manuel doğrulama.
