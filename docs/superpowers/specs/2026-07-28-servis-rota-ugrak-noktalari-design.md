# Servis Rota Haritası: Uğrak Noktaları ile Yol Düzeltme

**Tarih:** 2026-07-28
**Durum:** Onaylandı — uygulamaya geçiliyor
**Önceki spec:** `2026-07-27-servis-rota-haritasi-design.md` (bu spec onun elle-çizim bölümünü değiştirir)

## Problem

`2026-07-27` spec'i ile gelen "elle yol düzeltme" pratikte kullanılamadı. Kullanıcının ifadesi: *"tam düzenleyemiyorum hala yolu, daha basitleştir daha pratik işlevsel hale getir."*

Üç somut kusur:

1. **Konulan nokta bir daha tutulamıyor.** `insertViaPoint` yalnızca ekler. Bırakılan bükme noktası taslakta sabit bir köşeye dönüşür; sonradan kaydırılamaz, silinemez. İnce ayar için "↩ Geri Al" ile adımın tamamı iptal edilip baştan başlanması gerekir.
2. **Düzeltme rotayı bozuyor.** Elle mod, OSRM'in yüzlerce noktalı yol takipli eğrisini (canlıdaki Çaycuma TOKİ rotasında ~22.800 karakterlik geometri) atıp yerine 3-4 köşeli düz çizgi koyuyor. Yani "düzeltme" işlemi, projenin asıl amacı olan yol takibini yok ediyor.
3. **Mod ceremonisi.** Çizgiye tıkla → bük → Kaydet/Vazgeç/Geri Al. Aynı ekrandaki durak sürükleme anında kaydediliyor; iki farklı etkileşim dili bir arada.

Ayrıca ilgili bir kusur: durak sürüklemede görünmez **120 metre kuralı** (`classifyDrop`) var — durak çizgiye yakın bırakılırsa sırası, uzağa bırakılırsa konumu değişiyor. Hangisinin olacağı ekranda hiç belli değil.

**Veri maliyeti yok:** canlıda `path_is_manual = 1` olan rota yok (3 rotanın hepsi `0`). Model değiştirmek kimsenin emeğini silmiyor.

## Çözüm

Serbest çizim tamamen kaldırılır. Yerine **uğrak noktası** (via point) gelir: "rota buradan geçsin" dersin, OSRM gerçek yollardan o noktaya uğrayarak rotayı yeniden çizer. Çizgi hiçbir zaman düzleşmez.

## Kapsam

### Haritadaki etkileşim (düzenleme modu)

Üç hareket, üçü de **anında kaydedilir** — Kaydet/Vazgeç/Geri Al yoktur:

| Hareket | Sonuç |
|---|---|
| Rota çizgisine tıkla | O noktaya uğrak düşer, rota yollardan oraya uğrayarak yeniden çizilir |
| Uğrak noktasını sürükle | Uğrak taşınır, rota yeniden çizilir |
| Uğrak noktasına sağ tıkla | Uğrak silinir, rota yeniden çizilir |

Durak sürükleme sadeleşir: **durağı sürüklemek her zaman konumunu taşır.** `classifyDrop` / `SNAP_THRESHOLD_M` silinir. Sıra değiştirme, sol paneldeki rota düzenlemeye alındığında açılan durak listesindeki **↑/↓ düğmelerine** taşınır.

Boş haritaya tıklamak yeni durak oluşturmaya devam eder (değişmez). Özet kural: **çizgiye tıkla = uğrak, boşluğa tıkla = durak.**

Sol panelde iki düğme: **↻ Yeniden hesapla** (OSRM'e tekrar sor) ve **⌫ Uğrakları temizle** (tüm sapmaları sıfırla).

### Veri modeli (migration `064_route_via_points.sql`)

```sql
ALTER TABLE routes ADD COLUMN via_points TEXT;
UPDATE routes SET path_is_manual = 0;
```

`via_points`: `JSON.stringify([{ after_stop_id, lat, lng }, ...])`. Dizideki sıra anlamlıdır — aynı durağa bağlı birden çok uğrak bu sırayla gezilir.

Uğrak bir **route_stop**'a bağlıdır (`after_stop_id`), böylece:
- durak sırası değişirse uğrak kendi durağıyla birlikte taşınır (ek iş gerekmez),
- durak silinirse ona bağlı uğraklar da silinir,
- yeni durak eklemek başka uğrakları bozmaz.

Son bacak (son durak → Filyos) için uğraklar son durağın id'sine bağlanır.

`path_geometry` artık **her zaman** OSRM çıktısıdır; "makine mi çizdi insan mı" ikiliği kalkar. `path_is_manual` kolonuna bağlı tüm "üzerine yazma" mantığı koddan silinir. Kolonun kendisi veritabanında ölü olarak bırakılır (`0`'a çekilir) — canlıda hiçbir satırda `1` olmadığı için `DROP COLUMN` riskinin karşılığı yok.

### Rota hesaplama

`buildWaypoints(routeId)` sırası:

```
durak₁, [durak₁'e bağlı uğraklar], durak₂, [durak₂'ye bağlı uğraklar], …, son durak, [son durağa bağlı uğraklar], WORK_SITE
```

Koordinatsız duraklar atlanır. `after_stop_id`'si mevcut duraklardan hiçbiriyle eşleşmeyen uğraklar yok sayılır (savunmacı).

### API

- **`PUT /api/transport/routes/:id/via-points`** (mgr) — body `{ via_points: [{ after_stop_id, lat, lng }, ...] }`. Doğrular, OSRM'i **senkron** çağırır. Başarılıysa uğrakları ve yeni geometriyi kaydedip `{ ok: true, path_geometry, via_points }` döner. OSRM başarısızsa **hiçbir şey kaydedilmez**, `502` döner — yarım durum oluşmaz.
- **`PUT /api/transport/routes/:id/path`** kaldırılır (serbest çizim kaydı).
- **`POST /api/transport/routes/:id/recompute-path`** kalır; artık mevcut uğraklarla hesaplar, uğrakları silmez.
- `GET /transport/routes` cevabındaki her rota `via_points` alanını parse edilmiş dizi (ya da `[]`) olarak taşır.

### Frontend saf mantık (`logic/routeMap.js`)

**Eklenecek:**
- `nearestPathIndex(geometry, point)` — bir latlng'ye en yakın geometri noktasının indeksi.
- `insertViaAtPoint({ geometry, stops, viaPoints, point })` — tıklanan noktanın hangi durağın ardına, mevcut uğraklar arasında hangi sıraya gireceğini hesaplayıp **yeni `via_points` dizisini** döner.
  - **Çapa (anchor):** yol üzerindeki indeksi tıklama indeksinden küçük veya eşit olan **son durak**. Böyle bir durak yoksa (tıklama ilk duraktan önce) ilk durak kullanılır.
  - **Aynı çapaya bağlı uğraklar arası sıra:** her uğrağın ve tıklama noktasının yol üzerindeki indeksi karşılaştırılır; yeni uğrak, indeksi kendisinden büyük olan ilk uğrağın önüne girer. Yoksa o çapanın uğraklarının sonuna eklenir.
  - **Geometri yoksa** (OSRM hiç başarılı olmamış) veya 2 noktadan kısaysa, indeks hesabı için `buildRoutePolyline` çıktısı geometri yerine kullanılır.
- `moveStopInOrder(stopIds, stopId, direction)` — ↑/↓ için yeni sıra dizisi; uçlarda değişiklik yapmaz.

**Silinecek:** `SNAP_THRESHOLD_M`, `classifyDrop`, `reorderedStopIds`, `insertViaPoint`, `distanceToSegmentMeters` (hepsi bu değişiklikle ölür; testleriyle birlikte kaldırılır).

**Kalacak:** `buildRoutePolyline`, `pointsWithCoords`, `pointsWithoutCoords`.

### Frontend bileşenler

`RouteMap.jsx`:
- `ManualPathEditor`, `manualDraft`, `manualHistory`, `startManualEdit`/`updateManualDraft`/`undoManualDraft`/`cancelManualEdit`, Kaydet/Vazgeç/Geri Al çubuğu — **silinir**.
- `EditableStop`: `classifyDrop` çağrısı çıkar, `dragend` her zaman `onMoveStop` çağırır. Sağ tık (durağı rotadan çıkar) korunur.
- Yeni `ViaMarker`: küçük dolu nokta; `dragend` → `onMoveVia(index, lat, lng)`, `contextmenu` → `onDeleteVia(index)`.
- Düzenlenen rotanın çizgisi kalın (weight 8) ve `click` → `onAddVia(lat, lng)`.
- Toolbar tek satırlık ipucu + hesaplama sırasında "hesaplanıyor…" göstergesi.

`MapTab.jsx`:
- `savePathMut` → `saveViaPointsMut` (tek mutation: yeni `via_points` dizisini gönderir; ekleme/taşıma/silme hepsi bunu kullanır).
- Sol panelde düzenlenen rotanın durak listesi ↑/↓ düğmeleriyle açılır (`reorderMut`'a bağlanır).
- "⌫ Uğrakları temizle" düğmesi (`via_points: []` gönderir).

## Hata durumları

- OSRM ulaşılamaz → `502`, uğrak kaydedilmez, kullanıcıya toast; harita eski haliyle kalır.
- Yetkisiz rol → mevcut `requireRole` ile `403` (yeni davranış yok).
- Koordinatlı durak 1'den az → uğrak eklenemez; rota zaten çizilmiyor.

## Test planı

**Backend:**
- `buildWaypoints` uğrakları doğru sırada araya sokuyor mu; eşleşmeyen `after_stop_id` yok sayılıyor mu.
- `via_points` round-trip (kaydet → oku).
- Durak silinince ona bağlı uğrakların da silinmesi.
- `PUT /via-points`: happy path (200 + geometri döner), yetkisiz rol (403), geçersiz gövde (400), OSRM başarısız (502 **ve** veritabanında değişiklik yok).

**Frontend:**
- `nearestPathIndex` — düz ve eğri geometride doğru indeks.
- `insertViaAtPoint` — doğru durağa çapalama; aynı bacakta iki uğrağın sırası; geometrisiz rota fallback'i.
- `moveStopInOrder` — orta eleman, ilk eleman (yukarı no-op), son eleman (aşağı no-op).
- `MapTab.smoke` — ✎ düğmesi rol geçidi korunuyor.

## Kapsam dışı

- `MapPicker.jsx` içindeki tekil rota önizlemesi (RoutesTab durak modalı) — dokunulmaz.
- Yollardan gitmeyen serbest güzergah çizimi (şantiye içi yol vb.) — kullanıcı bu ihtiyacı belirtmedi, YAGNI.
- OSRM self-host — genel demo sunucusu kullanılmaya devam eder.
