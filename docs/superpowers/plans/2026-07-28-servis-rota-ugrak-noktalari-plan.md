# Servis Rota Uğrak Noktaları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanılamaz durumdaki serbest elle çizimi kaldırıp yerine "uğrak noktası" modelini getirmek — rota çizgisine tıklayınca oraya uğrak düşer ve rota gerçek yollardan o noktaya uğrayarak yeniden çizilir.

**Architecture:** `routes.via_points` (JSON `[{after_stop_id, lat, lng}]`) eklenir; OSRM `durak → uğraklar → durak → … → Filyos` sırasıyla çağrılır, böylece çizgi hep yol takipli kalır. Uğrak ekleme/taşıma/silme tek bir `PUT /routes/:id/via-points` ucundan senkron gider; OSRM başarısız olursa hiçbir şey kaydedilmez. `path_is_manual`'a bağlı tüm "üzerine yazma" mantığı ile `classifyDrop`/`SNAP_THRESHOLD_M` gizli kuralı koddan silinir; durak sırası ↑/↓ düğmelerine taşınır.

**Tech Stack:** Express + better-sqlite3, React + react-leaflet + Leaflet, Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-07-28-servis-rota-ugrak-noktalari-design.md`

---

## Dosya haritası

| Dosya | Sorumluluk | Değişim |
|---|---|---|
| `backend/src/shared/db/migrations/064_route_via_points.sql` | `via_points` kolonu | **yeni** |
| `backend/src/modules/transport/queries.js` | uğrak okuma/yazma, durak silince cascade, `path_is_manual` temizliği | değişir |
| `backend/src/modules/transport/jobs.js` | `buildWaypoints` uğrakları araya sokar | değişir |
| `backend/src/modules/transport/schemas.js` | `saveViaPointsSchema` | değişir |
| `backend/src/modules/transport/routes.js` | `PUT /via-points`, eski `PUT /path` silinir | değişir |
| `frontend/src/modules/transport/logic/routeMap.js` | `nearestPathIndex`, `insertViaAtPoint`, `moveStopInOrder`; ölü fonksiyonlar silinir | değişir |
| `frontend/src/modules/transport/RouteMap.jsx` | uğrak marker'ları, çizgiye tıkla, taslak/geri-al kalkar | değişir |
| `frontend/src/modules/transport/tabs/MapTab.jsx` | uğrak mutation'ı, ↑/↓ durak listesi, uğrak temizle | değişir |

---

## Faz 1 — Backend veri modeli

### Task 1.1: Migration

**Files:**
- Create: `backend/src/shared/db/migrations/064_route_via_points.sql`

- [ ] **Step 1: Migration dosyasını yaz**

```sql
-- Ugrak (via) noktalari: "rota buradan gecsin" isaretleri.
-- JSON: [{ after_stop_id, lat, lng }, ...] — ayni duraga bagli ugraklar dizideki sirayla gezilir.
-- Serbest elle cizim kaldirildi; path_is_manual artik okunmuyor, olu kolon olarak kalir.
ALTER TABLE routes ADD COLUMN via_points TEXT;
UPDATE routes SET path_is_manual = 0;
```

- [ ] **Step 2: Migration'ın temiz uygulandığını doğrula**

Run: `cd backend && node -e "process.env.DB_PATH=':memory:'; import('./src/shared/db/index.js').then(m => m.initDB()).then(() => console.log('OK'))"`
Expected: `OK` yazdırır, exception yok.

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/db/migrations/064_route_via_points.sql
git commit -m "feat(transport): add route via_points column"
```

### Task 1.2: queries.js — uğrak okuma/yazma + durak silince cascade

**Files:**
- Modify: `backend/src/modules/transport/queries.js`
- Test: `backend/src/modules/transport/transport.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`backend/src/modules/transport/transport.test.js` içindeki `describe('Transport — path sorguları (queries.js)', ...)` bloğunun **tamamını** aşağıdakiyle değiştir:

```js
describe('Transport — uğrak sorguları (queries.js)', () => {
  it('saveRouteViaPoints + getRouteViaPoints round-trip çalışır', async () => {
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Via Query Hat' })).body.id
    const q = await import('./queries.js')
    q.saveRouteViaPoints(routeId, [{ after_stop_id: 7, lat: 41.41, lng: 31.72 }])
    expect(q.getRouteViaPoints(routeId)).toEqual([{ after_stop_id: 7, lat: 41.41, lng: 31.72 }])
  })

  it('uğrağı olmayan rota boş dizi döner', async () => {
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bos Via Hat' })).body.id
    const q = await import('./queries.js')
    expect(q.getRouteViaPoints(routeId)).toEqual([])
  })

  it('durak silinince ona bağlı uğraklar da silinir, diğerleri kalır', async () => {
    const q = await import('./queries.js')
    const p1 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cascade Durak A', lat: 41.40, lng: 31.70 })).body.id
    const p2 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cascade Durak B', lat: 41.42, lng: 31.75 })).body.id
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cascade Hat' })).body.id
    const stop1 = q.addRouteStop(routeId, { pickup_point_id: p1 })
    const stop2 = q.addRouteStop(routeId, { pickup_point_id: p2 })
    q.saveRouteViaPoints(routeId, [
      { after_stop_id: stop1, lat: 41.41, lng: 31.71 },
      { after_stop_id: stop2, lat: 41.43, lng: 31.76 },
    ])

    q.deleteRouteStop(stop1)

    expect(q.getRouteViaPoints(routeId)).toEqual([{ after_stop_id: stop2, lat: 41.43, lng: 31.76 }])
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail etmeli**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js -t "uğrak sorguları"`
Expected: FAIL — `q.saveRouteViaPoints is not a function`.

- [ ] **Step 3: `queries.js` sonundaki path bölümünü değiştir**

Dosyanın sonundaki `// ── Rota yol geometrisi (path) ──` bloğunun **tamamını** şununla değiştir:

```js
// ── Rota yol geometrisi (path) ──
// path_geometry her zaman OSRM ciktisidir; elle serbest cizim yoktur (bkz. 064 migration).
export function getRoutePath(routeId) {
  const row = getDB().prepare('SELECT path_geometry, path_computed_at FROM routes WHERE id=?').get(routeId)
  if (!row) return null
  return {
    geometry: row.path_geometry ? JSON.parse(row.path_geometry) : null,
    computed_at: row.path_computed_at,
  }
}

export function saveRoutePath(routeId, geometry) {
  getDB().prepare(`
    UPDATE routes SET path_geometry=?, path_computed_at=datetime('now') WHERE id=?
  `).run(JSON.stringify(geometry), routeId)
}

// ── Ugrak (via) noktalari ──
function parseViaPoints(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getRouteViaPoints(routeId) {
  const row = getDB().prepare('SELECT via_points FROM routes WHERE id=?').get(routeId)
  return row ? parseViaPoints(row.via_points) : []
}

export function saveRouteViaPoints(routeId, viaPoints) {
  getDB().prepare('UPDATE routes SET via_points=? WHERE id=?').run(JSON.stringify(viaPoints), routeId)
}
```

- [ ] **Step 4: `deleteRouteStop`'u cascade yapacak şekilde değiştir**

`queries.js` içindeki mevcut `deleteRouteStop` fonksiyonunu **tamamen** şununla değiştir:

```js
export function deleteRouteStop(id) {
  const db = getDB()
  const row = db.prepare('SELECT route_id FROM route_stops WHERE id=?').get(id)
  db.prepare('DELETE FROM route_stops WHERE id=?').run(id)
  if (!row) return null
  saveRouteViaPoints(row.route_id, getRouteViaPoints(row.route_id).filter(v => v.after_stop_id !== id))
  return row.route_id
}
```

- [ ] **Step 5: `path_is_manual` yazan satırları kaldır**

`queries.js` içinde şu **dört** fonksiyondan `path_is_manual` güncelleyen satırları sil:

`addRouteStop` — şu satırı sil:
```js
  db.prepare('UPDATE routes SET path_is_manual=0 WHERE id=?').run(routeId)
```

`updateRouteStop` — şu iki satırı sil:
```js
  const row = db.prepare('SELECT route_id FROM route_stops WHERE id=?').get(id)
  if (row) db.prepare('UPDATE routes SET path_is_manual=0 WHERE id=?').run(row.route_id)
```

`reorderRouteStops` — transaction içindeki şu satırı sil:
```js
    db.prepare('UPDATE routes SET path_is_manual=0 WHERE id=?').run(routeId)
```

`updatePickupPoint` — şu satırı sil (`routeIds` hesabı ve `return routeIds` KALIR):
```js
  routeIds.forEach(routeId => db.prepare('UPDATE routes SET path_is_manual=0 WHERE id=?').run(routeId))
```

- [ ] **Step 6: `listRoutes` parse bloğunu güncelle**

`listRoutes` içindeki şu bloğu:

```js
  routes.forEach(r => {
    r.path_geometry = r.path_geometry ? JSON.parse(r.path_geometry) : null
    r.path_is_manual = !!r.path_is_manual
  })
```

şununla değiştir:

```js
  routes.forEach(r => {
    r.path_geometry = r.path_geometry ? JSON.parse(r.path_geometry) : null
    r.via_points = parseViaPoints(r.via_points)
  })
```

- [ ] **Step 7: Testi çalıştır, geçmeli**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js -t "uğrak sorguları"`
Expected: PASS (3 test).

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/transport/queries.js backend/src/modules/transport/transport.test.js
git commit -m "feat(transport): store via points, cascade on stop delete"
```

### Task 1.3: jobs.js — uğrakları waypoint sırasına sok

**Files:**
- Modify: `backend/src/modules/transport/jobs.js`
- Test: `backend/src/modules/transport/jobs.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`backend/src/modules/transport/jobs.test.js` dosyasının **sonuna** ekle:

```js
describe('uğrakların waypoint sırası', () => {
  it('uğraklar bağlı oldukları durağın hemen ardına girer', async () => {
    const routeId = makeRouteWithStops()
    const stops = getDB().prepare('SELECT id FROM route_stops WHERE route_id=? ORDER BY sequence_order').all(routeId)
    q.saveRouteViaPoints(routeId, [{ after_stop_id: stops[0].id, lat: 41.405, lng: 31.72 }])
    computeRoadRoute.mockResolvedValue([[41.40, 31.70], [41.42, 31.75]])

    await recomputeRoutePathSync(routeId)

    expect(computeRoadRoute).toHaveBeenCalledWith([
      { lat: 41.40, lng: 31.70 },
      { lat: 41.405, lng: 31.72 },
      { lat: 41.42, lng: 31.75 },
      { lat: 41.5750, lng: 32.0264 },
    ])
  })

  it('mevcut olmayan durağa bağlı uğrak yok sayılır', async () => {
    const routeId = makeRouteWithStops()
    q.saveRouteViaPoints(routeId, [{ after_stop_id: 99999, lat: 41.405, lng: 31.72 }])
    computeRoadRoute.mockResolvedValue([[41.40, 31.70], [41.42, 31.75]])

    await recomputeRoutePathSync(routeId)

    expect(computeRoadRoute).toHaveBeenCalledWith([
      { lat: 41.40, lng: 31.70 },
      { lat: 41.42, lng: 31.75 },
      { lat: 41.5750, lng: 32.0264 },
    ])
  })
})
```

- [ ] **Step 2: Mevcut testlerdeki `is_manual` beklentilerini temizle**

`jobs.test.js` içinde şu **üç** yeri düzelt:

1. `'basarili OSRM cevabinda path_geometry kaydeder ve path_is_manual sifirlar'` testinin adını ve gövdesini şununla değiştir:

```js
  it('basarili OSRM cevabinda path_geometry kaydeder', async () => {
    const routeId = makeRouteWithStops()
    computeRoadRoute.mockResolvedValue([[41.40, 31.70], [41.41, 31.72], [41.42, 31.75]])

    enqueue('transport.recompute-path', { routeId })
    await tickOnce()

    expect(q.getRoutePath(routeId).geometry).toEqual([[41.40, 31.70], [41.41, 31.72], [41.42, 31.75]])
  })
```

2. `'OSRM basarisiz olursa is yeniden denenir, eski geometri korunur'` testinde şu satırı:
```js
    q.saveRoutePath(routeId, [[41.40, 31.70], [41.42, 31.75]], { isManual: false })
```
şununla değiştir:
```js
    q.saveRoutePath(routeId, [[41.40, 31.70], [41.42, 31.75]])
```

3. `'basarili olursa geometry doner ve kaydeder'` testindeki şu satırı **sil**:
```js
    expect(q.getRoutePath(routeId).is_manual).toBe(false)
```

Ayrıca `beforeEach` içindeki temizlik satırına `routes` tablosu zaten dahil; değişiklik gerekmez.

- [ ] **Step 3: Testi çalıştır, yeni describe fail etmeli**

Run: `cd backend && npx vitest run src/modules/transport/jobs.test.js`
Expected: `uğrakların waypoint sırası` testleri FAIL (uğraklar waypoint listesine girmiyor), diğerleri PASS.

- [ ] **Step 4: `jobs.js` içindeki `buildWaypoints`'i değiştir**

`backend/src/modules/transport/jobs.js` içindeki `buildWaypoints` fonksiyonunu **tamamen** şununla değiştir:

```js
// Waypoint sirasi: durak₁, [durak₁'e bagli ugraklar], durak₂, …, son durak, [ugraklar], WORK_SITE.
// Koordinatsiz duraklar ve mevcut olmayan duraga bagli ugraklar atlanir.
function buildWaypoints(routeId) {
  const stops = [...q.listRouteStops(routeId)]
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .filter(s => s.lat != null && s.lng != null)
  if (stops.length === 0) return null

  const viaPoints = q.getRouteViaPoints(routeId)
  const coords = []
  for (const stop of stops) {
    coords.push({ lat: stop.lat, lng: stop.lng })
    for (const via of viaPoints) {
      if (via.after_stop_id === stop.id) coords.push({ lat: via.lat, lng: via.lng })
    }
  }
  coords.push(WORK_SITE)
  return coords
}
```

- [ ] **Step 5: `saveRoutePath` çağrılarını yeni imzaya uyarla**

`jobs.js` içinde şu **iki** satırı bul ve ikinci argümanı kaldır:

```js
  q.saveRoutePath(routeId, geometry, { isManual: false })
```
→
```js
  q.saveRoutePath(routeId, geometry)
```

(Biri `recomputeRoutePathJob`, biri `recomputeRoutePathSync` içinde.)

- [ ] **Step 6: Testi çalıştır, hepsi geçmeli**

Run: `cd backend && npx vitest run src/modules/transport/jobs.test.js`
Expected: PASS (7 test).

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/transport/jobs.js backend/src/modules/transport/jobs.test.js
git commit -m "feat(transport): route OSRM through via points"
```

---

## Faz 2 — Backend API

### Task 2.1: Zod şeması + `PUT /via-points` ucu

**Files:**
- Modify: `backend/src/modules/transport/schemas.js`
- Modify: `backend/src/modules/transport/routes.js`
- Test: `backend/src/modules/transport/transport.test.js`

- [ ] **Step 1: Başarısız testleri yaz**

`transport.test.js` içindeki `describe('Transport — Rota yol geometrisi (path uçları)', ...)` bloğunun **tamamını** aşağıdakiyle değiştir:

```js
describe('Transport — Uğrak noktaları (via-points ucu)', () => {
  async function makeRouteWithTwoStops(name) {
    const p1 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: `${name} A`, lat: 41.40, lng: 31.70 })).body.id
    const p2 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: `${name} B`, lat: 41.42, lng: 31.75 })).body.id
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name })).body.id
    const s1 = (await request(app).post(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: p1 })).body.id
    await request(app).post(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: p2 })
    while (await tickOnce()) { /* kuyruk temizlensin */ }
    return { routeId, stopId: s1, pickupId: p1 }
  }

  it('durak eklenince path yeniden hesaplama kuyruga alinir', async () => {
    const { routeId } = await makeRouteWithTwoStops('Kuyruk Hat')
    const list = await request(app).get('/api/transport/routes?with_stops=1').set('Authorization', `Bearer ${token}`)
    const route = list.body.find(r => r.id === routeId)
    expect(route.path_geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
    expect(route.via_points).toEqual([])
  })

  it('uğrak kaydedilir, geometri döner ve GET ile geri gelir', async () => {
    const { routeId, stopId } = await makeRouteWithTwoStops('Ugrak Hat')

    const save = await request(app).put(`/api/transport/routes/${routeId}/via-points`)
      .set('Authorization', `Bearer ${token}`)
      .send({ via_points: [{ after_stop_id: stopId, lat: 41.41, lng: 31.72 }] })
    expect(save.status).toBe(200)
    expect(save.body.path_geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])

    const list = await request(app).get('/api/transport/routes?with_stops=1').set('Authorization', `Bearer ${token}`)
    expect(list.body.find(r => r.id === routeId).via_points)
      .toEqual([{ after_stop_id: stopId, lat: 41.41, lng: 31.72 }])
  })

  it('gecersiz govde 400 doner', async () => {
    const { routeId } = await makeRouteWithTwoStops('Gecersiz Ugrak Hat')
    const res = await request(app).put(`/api/transport/routes/${routeId}/via-points`)
      .set('Authorization', `Bearer ${token}`)
      .send({ via_points: [{ after_stop_id: 1, lat: 999, lng: 31.72 }] })
    expect(res.status).toBe(400)
  })

  it('yetkisiz rol ugrak kaydedemez', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const { routeId, stopId } = await makeRouteWithTwoStops('Yetki Ugrak Hat')
    const res = await request(app).put(`/api/transport/routes/${routeId}/via-points`)
      .set('Authorization', `Bearer ${t}`)
      .send({ via_points: [{ after_stop_id: stopId, lat: 41.41, lng: 31.72 }] })
    expect(res.status).toBe(403)
  })

  it('OSRM basarisiz olursa 502 doner ve ugrak KAYDEDILMEZ', async () => {
    const { routeId, stopId } = await makeRouteWithTwoStops('Kirik Ugrak Hat')
    computeRoadRoute.mockResolvedValueOnce(null)

    const res = await request(app).put(`/api/transport/routes/${routeId}/via-points`)
      .set('Authorization', `Bearer ${token}`)
      .send({ via_points: [{ after_stop_id: stopId, lat: 41.41, lng: 31.72 }] })
    expect(res.status).toBe(502)

    const list = await request(app).get('/api/transport/routes?with_stops=1').set('Authorization', `Bearer ${token}`)
    expect(list.body.find(r => r.id === routeId).via_points).toEqual([])
  })

  it('otomatik yeniden hesapla ucu senkron calisir', async () => {
    const { routeId } = await makeRouteWithTwoStops('Recompute Ugrak Hat')
    const res = await request(app).post(`/api/transport/routes/${routeId}/recompute-path`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
  })

  it('bir durak tasininca onu kullanan rota icin path yeniden hesaplanir', async () => {
    const { routeId, pickupId } = await makeRouteWithTwoStops('Tasima Ugrak Hat')

    await request(app).put(`/api/transport/pickup-points/${pickupId}`).set('Authorization', `Bearer ${token}`)
      .send({ lat: 41.395, lng: 31.695 })
    while (await tickOnce()) { /* kuyruk temizlensin */ }

    const list = await request(app).get('/api/transport/routes?with_stops=1').set('Authorization', `Bearer ${token}`)
    expect(list.body.find(r => r.id === routeId).path_geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
  })
})
```

Ayrıca dosyanın en üstündeki mock bloğunu, testin `computeRoadRoute`'a erişebilmesi için şununla değiştir:

```js
import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'

vi.mock('./routing.js', () => ({ computeRoadRoute: vi.fn() }))

import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { tickOnce } from '../../shared/jobs/index.js'
import { computeRoadRoute } from './routing.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  computeRoadRoute.mockResolvedValue([[41.40, 31.70], [41.42, 31.75]])
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})
```

- [ ] **Step 2: Testi çalıştır, fail etmeli**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js -t "Uğrak noktaları"`
Expected: FAIL — `PUT /via-points` 404 döner.

- [ ] **Step 3: `schemas.js`'te şemayı değiştir**

`backend/src/modules/transport/schemas.js` sonundaki `savePathSchema` bloğunu **tamamen** şununla değiştir:

```js
export const saveViaPointsSchema = z.object({
  via_points: z.array(z.object({
    after_stop_id: z.coerce.number().int().positive(),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })).max(50, 'En fazla 50 uğrak'),
})
```

- [ ] **Step 4: `routes.js`'te import ve uçları değiştir**

`routes.js` import bloğundaki `savePathSchema` adını `saveViaPointsSchema` ile değiştir.

Mevcut `transportRouter.put('/routes/:id/path', ...)` endpoint'inin **tamamını** şununla değiştir:

```js
// Ugrak noktalari: ekleme/tasima/silme hepsi bu tek uctan gelir (istemci tam listeyi gonderir).
// OSRM hesaplayamazsa hicbir sey kaydedilmez — yarim durum olusmaz.
transportRouter.put('/routes/:id/via-points', ...mgr, validate(saveViaPointsSchema), async (req, res) => {
  try {
    const routeId = +req.params.id
    const previous = q.getRouteViaPoints(routeId)
    q.saveRouteViaPoints(routeId, req.validated.via_points)
    const geometry = await recomputeRoutePathSync(routeId)
    if (!geometry) {
      q.saveRouteViaPoints(routeId, previous)
      return res.status(502).json({ error: 'Yol hesaplanamadı — uğrak kaydedilmedi' })
    }
    logAudit(req.user.id, 'transport_route_vias', 'transport', routeId, `${req.validated.via_points.length} uğrak`)
    res.json({ ok: true, path_geometry: geometry, via_points: req.validated.via_points })
  } catch (e) {
    logger.error('[Route] via-points:', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})
```

- [ ] **Step 5: Testi çalıştır, geçmeli**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js`
Expected: PASS (tüm testler).

- [ ] **Step 6: Backend tam suite**

Run: `cd backend && npx vitest run`
Expected: PASS (133 dosya).

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/transport/schemas.js backend/src/modules/transport/routes.js backend/src/modules/transport/transport.test.js
git commit -m "feat(transport): add via-points endpoint, drop raw path save"
```

---

## Faz 3 — Frontend saf mantık

### Task 3.1: `logic/routeMap.js` — yeni yardımcılar, ölü kod temizliği

**Files:**
- Modify: `frontend/src/modules/transport/logic/routeMap.js`
- Test: `frontend/src/modules/transport/logic/routeMap.test.js`

- [ ] **Step 1: Test dosyasını yeniden yaz**

`frontend/src/modules/transport/logic/routeMap.test.js` dosyasının **tamamını** şununla değiştir:

```js
import { describe, it, expect } from 'vitest'
import {
  buildRoutePolyline, pointsWithCoords, pointsWithoutCoords,
  nearestPathIndex, insertViaAtPoint, moveStopInOrder,
} from './routeMap.js'

const workSite = { lat: 41.575, lng: 32.0264 }

describe('transport/logic/routeMap', () => {
  it('buildRoutePolyline sirali stop\'lari + workSite\'i koordinat dizisine cevirir', () => {
    const route = { stops: [
      { sequence_order: 1, lat: 41.45, lng: 31.79 },
      { sequence_order: 2, lat: 41.43, lng: 31.74 },
    ] }
    expect(buildRoutePolyline(route, workSite)).toEqual([
      [41.45, 31.79],
      [41.43, 31.74],
      [41.575, 32.0264],
    ])
  })

  it('buildRoutePolyline konumsuz stop\'lari atlar', () => {
    const route = { stops: [
      { sequence_order: 1, lat: 41.45, lng: 31.79 },
      { sequence_order: 2, lat: null, lng: null },
    ] }
    expect(buildRoutePolyline(route, workSite)).toEqual([
      [41.45, 31.79],
      [41.575, 32.0264],
    ])
  })

  it('buildRoutePolyline stop\'lari sequence_order\'a gore siralar', () => {
    const route = { stops: [
      { sequence_order: 2, lat: 41.43, lng: 31.74 },
      { sequence_order: 1, lat: 41.45, lng: 31.79 },
    ] }
    expect(buildRoutePolyline(route, workSite)[0]).toEqual([41.45, 31.79])
  })

  it('buildRoutePolyline koordinatli stop yoksa bos dizi doner (cizgi yok)', () => {
    expect(buildRoutePolyline({ stops: [] }, workSite)).toEqual([])
    expect(buildRoutePolyline({ stops: [{ sequence_order: 1, lat: null, lng: null }] }, workSite)).toEqual([])
  })

  it('pointsWithCoords / pointsWithoutCoords ayirir', () => {
    const points = [
      { id: 1, lat: 41.4, lng: 31.7 },
      { id: 2, lat: null, lng: null },
      { id: 3, lat: 41.5, lng: 31.8 },
    ]
    expect(pointsWithCoords(points).map(p => p.id)).toEqual([1, 3])
    expect(pointsWithoutCoords(points).map(p => p.id)).toEqual([2])
  })
})

describe('nearestPathIndex', () => {
  const path = [[41.40, 31.70], [41.41, 31.71], [41.42, 31.72], [41.43, 31.73]]

  it('en yakin geometri noktasinin indeksini doner', () => {
    expect(nearestPathIndex(path, [41.4201, 31.7201])).toBe(2)
    expect(nearestPathIndex(path, [41.40, 31.70])).toBe(0)
    expect(nearestPathIndex(path, [41.43, 31.73])).toBe(3)
  })

  it('bos geometride 0 doner', () => {
    expect(nearestPathIndex([], [41.40, 31.70])).toBe(0)
  })
})

describe('insertViaAtPoint', () => {
  // Yol: durak1 → durak2 → isyeri, duz hat uzerinde artan sirada.
  const geometry = [
    [41.40, 31.70], [41.41, 31.71], [41.42, 31.72], [41.43, 31.73], [41.44, 31.74],
  ]
  const stops = [
    { id: 1, sequence_order: 1, lat: 41.40, lng: 31.70 },
    { id: 2, sequence_order: 2, lat: 41.43, lng: 31.73 },
  ]

  it('tiklama iki durak arasindaysa ilk duraga capalanir', () => {
    const result = insertViaAtPoint({ geometry, stops, viaPoints: [], point: [41.41, 31.71] })
    expect(result).toEqual([{ after_stop_id: 1, lat: 41.41, lng: 31.71 }])
  })

  it('tiklama son duraktan sonraysa son duraga capalanir', () => {
    const result = insertViaAtPoint({ geometry, stops, viaPoints: [], point: [41.44, 31.74] })
    expect(result).toEqual([{ after_stop_id: 2, lat: 41.44, lng: 31.74 }])
  })

  it('ayni bacaktaki ugraklar yol boyunca dogru sirada dizilir', () => {
    const existing = [{ after_stop_id: 1, lat: 41.42, lng: 31.72 }]
    const result = insertViaAtPoint({ geometry, stops, viaPoints: existing, point: [41.41, 31.71] })
    expect(result).toEqual([
      { after_stop_id: 1, lat: 41.41, lng: 31.71 },
      { after_stop_id: 1, lat: 41.42, lng: 31.72 },
    ])
  })

  it('yeni ugrak mevcut ugragin ilerisindeyse ardina eklenir', () => {
    const existing = [{ after_stop_id: 1, lat: 41.41, lng: 31.71 }]
    const result = insertViaAtPoint({ geometry, stops, viaPoints: existing, point: [41.42, 31.72] })
    expect(result).toEqual([
      { after_stop_id: 1, lat: 41.41, lng: 31.71 },
      { after_stop_id: 1, lat: 41.42, lng: 31.72 },
    ])
  })

  it('baska capaya bagli ugraklar korunur', () => {
    const existing = [{ after_stop_id: 2, lat: 41.44, lng: 31.74 }]
    const result = insertViaAtPoint({ geometry, stops, viaPoints: existing, point: [41.41, 31.71] })
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ after_stop_id: 1, lat: 41.41, lng: 31.71 })
    expect(result).toContainEqual({ after_stop_id: 2, lat: 41.44, lng: 31.74 })
  })

  it('koordinatli durak yoksa dizi degismez', () => {
    const existing = [{ after_stop_id: 1, lat: 41.41, lng: 31.71 }]
    expect(insertViaAtPoint({ geometry, stops: [], viaPoints: existing, point: [41.41, 31.71] }))
      .toEqual(existing)
  })
})

describe('moveStopInOrder', () => {
  it('ortadaki durağı yukari tasir', () => {
    expect(moveStopInOrder([1, 2, 3], 2, 'up')).toEqual([2, 1, 3])
  })

  it('ortadaki durağı asagi tasir', () => {
    expect(moveStopInOrder([1, 2, 3], 2, 'down')).toEqual([1, 3, 2])
  })

  it('ilk durağı yukari tasimaya calisinca degismez', () => {
    expect(moveStopInOrder([1, 2, 3], 1, 'up')).toEqual([1, 2, 3])
  })

  it('son durağı asagi tasimaya calisinca degismez', () => {
    expect(moveStopInOrder([1, 2, 3], 3, 'down')).toEqual([1, 2, 3])
  })

  it('bilinmeyen durak id degisiklik yapmaz', () => {
    expect(moveStopInOrder([1, 2, 3], 99, 'up')).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail etmeli**

Run: `cd frontend && npx vitest run src/modules/transport/logic/routeMap.test.js`
Expected: FAIL — `nearestPathIndex is not a function`.

- [ ] **Step 3: `logic/routeMap.js` dosyasını yeniden yaz**

Dosyanın **tamamını** şununla değiştir:

```js
// Transport harita saf yardimcilari — Leaflet'e bagimsiz, test edilebilir.

const hasCoords = (o) => o && o.lat != null && o.lng != null

// Bir rotanin sirali stop'larini [lat,lng] dizisine cevirir, sona workSite ekler.
// Konumsuz stop'lar atlanir. Koordinatli stop yoksa bos dizi doner (cizgi cizilmez).
export function buildRoutePolyline(route, workSite) {
  const stops = [...(route?.stops || [])].sort((a, b) => a.sequence_order - b.sequence_order)
  const coords = stops.filter(hasCoords).map(s => [s.lat, s.lng])
  if (coords.length === 0) return []
  if (workSite && hasCoords(workSite)) coords.push([workSite.lat, workSite.lng])
  return coords
}

export function pointsWithCoords(points = []) {
  return points.filter(hasCoords)
}

export function pointsWithoutCoords(points = []) {
  return points.filter(p => !hasCoords(p))
}

const EARTH_RADIUS_M = 6371000
const toRad = (deg) => deg * Math.PI / 180

function haversineMeters(a, b) {
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// Bir noktaya en yakin geometri noktasinin indeksi. Bos geometride 0.
export function nearestPathIndex(geometry, point) {
  let bestIndex = 0
  let bestDist = Infinity
  for (let i = 0; i < geometry.length; i++) {
    const dist = haversineMeters(geometry[i], point)
    if (dist < bestDist) { bestDist = dist; bestIndex = i }
  }
  return bestIndex
}

// Cizgiye tiklandiginda yeni ugragin hangi duraga capalanacagini ve mevcut
// ugraklar arasinda nereye gireceğini hesaplar; yeni via_points dizisini doner.
// Capa: yol uzerindeki indeksi tiklama indeksinden kucuk/esit olan SON durak.
// Cagiran gecerli bir yol geometrisi (>=2 nokta) vermelidir.
export function insertViaAtPoint({ geometry, stops, viaPoints = [], point }) {
  const orderedStops = [...stops]
    .filter(hasCoords)
    .sort((a, b) => a.sequence_order - b.sequence_order)
  if (orderedStops.length === 0) return viaPoints

  const clickIndex = nearestPathIndex(geometry, point)

  let anchor = orderedStops[0]
  for (const stop of orderedStops) {
    if (nearestPathIndex(geometry, [stop.lat, stop.lng]) <= clickIndex) anchor = stop
  }

  const newVia = { after_stop_id: anchor.id, lat: point[0], lng: point[1] }
  const next = []
  let inserted = false
  for (const via of viaPoints) {
    if (!inserted
      && via.after_stop_id === anchor.id
      && nearestPathIndex(geometry, [via.lat, via.lng]) > clickIndex) {
      next.push(newVia)
      inserted = true
    }
    next.push(via)
  }
  if (!inserted) {
    const lastSameAnchor = next.map(v => v.after_stop_id).lastIndexOf(anchor.id)
    if (lastSameAnchor >= 0) next.splice(lastSameAnchor + 1, 0, newVia)
    else next.push(newVia)
  }
  return next
}

// Durak sirasini ↑/↓ ile bir basamak kaydirir. Uclarda degisiklik yapmaz.
export function moveStopInOrder(stopIds, stopId, direction) {
  const index = stopIds.indexOf(stopId)
  if (index < 0) return stopIds
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= stopIds.length) return stopIds
  const next = [...stopIds]
  next[index] = next[target]
  next[target] = stopId
  return next
}
```

- [ ] **Step 4: Testi çalıştır, geçmeli**

Run: `cd frontend && npx vitest run src/modules/transport/logic/routeMap.test.js`
Expected: PASS (18 test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/transport/logic/routeMap.js frontend/src/modules/transport/logic/routeMap.test.js
git commit -m "feat(transport): add via-point geometry helpers, drop snap heuristic"
```

---

## Faz 4 — Frontend UI

### Task 4.1: `RouteMap.jsx` — uğrak marker'ları, taslak/geri-al kaldırma

**Files:**
- Modify: `frontend/src/modules/transport/RouteMap.jsx`

- [ ] **Step 1: Dosyanın tamamını değiştir**

```jsx
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip, Popup, useMap, useMapEvents } from 'react-leaflet'
import { useEffect, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { WORK_SITE, REGION_CENTER } from './zonguldakBartin.js'
import { buildRoutePolyline, pointsWithCoords, insertViaAtPoint } from './logic/routeMap.js'

// Default marker icon fix (leaflet bundler issue)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const FALLBACK_COLOR = '#3b82f6'

function FitOnFirstLoad({ points }) {
  const map = useMap()
  useEffect(() => {
    const coords = pointsWithCoords(points).map(p => [p.lat, p.lng])
    coords.push([WORK_SITE.lat, WORK_SITE.lng])
    if (coords.length >= 2) {
      try { map.fitBounds(coords, { padding: [40, 40], maxZoom: 12 }) } catch { /* tek nokta */ }
    }
  }, [points, map])
  return null
}

function numberedIcon(num, color = '#3b82f6') {
  return L.divIcon({
    html: `<div style="
      background:${color};color:#fff;width:26px;height:26px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
      border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);font-family:monospace;font-weight:700;font-size:11px;
    "><span style="transform:rotate(45deg)">${num}</span></div>`,
    className: 'route-edit-stop-marker',
    iconSize: [26, 26],
    iconAnchor: [13, 24],
  })
}

function viaIcon(color = '#3b82f6') {
  return L.divIcon({
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5)"></div>`,
    className: 'route-via-point',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

// Durak pini: surukle → konumu tasi (her zaman), sag tik → rotadan cikar.
function EditableStop({ stop, index, onMoveStop, onDeleteStop, color }) {
  const [pos, setPos] = useState([stop.lat, stop.lng])
  useEffect(() => { setPos([stop.lat, stop.lng]) }, [stop.lat, stop.lng])

  return (
    <Marker
      position={pos}
      draggable
      icon={numberedIcon(index + 1, color)}
      eventHandlers={{
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng()
          setPos([lat, lng])
          onMoveStop(stop.pickup_point_id, lat, lng)
        },
        contextmenu: (e) => {
          e.originalEvent?.preventDefault?.()
          onDeleteStop(stop.id)
        },
      }}
    >
      <Tooltip>{index + 1}. {stop.point_name}<br />sürükle: taşı · sağ tık: rotadan çıkar</Tooltip>
    </Marker>
  )
}

// Ugrak noktasi: surukle → tasi, sag tik → sil. Her ikisi de aninda kaydedilir.
function ViaMarker({ via, index, onMoveVia, onDeleteVia, color }) {
  const [pos, setPos] = useState([via.lat, via.lng])
  useEffect(() => { setPos([via.lat, via.lng]) }, [via.lat, via.lng])

  return (
    <Marker
      position={pos}
      draggable
      icon={viaIcon(color)}
      eventHandlers={{
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng()
          setPos([lat, lng])
          onMoveVia(index, lat, lng)
        },
        contextmenu: (e) => {
          e.originalEvent?.preventDefault?.()
          onDeleteVia(index)
        },
      }}
    >
      <Tooltip>Uğrak · sürükle: taşı · sağ tık: sil</Tooltip>
    </Marker>
  )
}

// Duzenleme modunda bos haritaya tiklaninca yeni durak olusturulup rotaya eklenir.
function MapClickToAddStop({ onAddStop }) {
  useMapEvents({
    click(e) { onAddStop(e.latlng.lat, e.latlng.lng) },
  })
  return null
}

// props:
//  routes: [{ id, name, color, vehicle_plate, capacity, driver_name, stops:[...], path_geometry, via_points }]
//  points: tum aktif duraklar (lat/lng)
//  visibleRouteIds: Set<number> — gosterilecek rotalar
//  selectedRouteId: number | null — vurgulanan rota
//  onSelectRoute: (id) => void
//  editingRouteId: number | null — haritadan duzenlenen rota
//  onMoveStop: (pickupPointId, lat, lng) => void
//  onDeleteStop: (stopId) => void
//  onAddStop: (routeId, lat, lng) => void
//  onChangeViaPoints: (routeId, viaPoints) => void — ekleme/tasima/silme hepsi bunu cagirir
//  isBusy: boolean — ugrak hesaplamasi suruyor
export default function RouteMap({
  routes, points, visibleRouteIds, selectedRouteId, onSelectRoute, height = 520,
  editingRouteId = null, onMoveStop, onDeleteStop, onAddStop, onChangeViaPoints, isBusy = false,
}) {
  const editingRoute = routes.find(r => r.id === editingRouteId) || null

  const editingStops = editingRoute
    ? [...(editingRoute.stops || [])]
      .filter(s => s.lat != null && s.lng != null)
      .sort((a, b) => a.sequence_order - b.sequence_order)
    : []
  const viaPoints = editingRoute?.via_points || []
  const editingLine = editingRoute
    ? (editingRoute.path_geometry?.length >= 2
      ? editingRoute.path_geometry
      : buildRoutePolyline(editingRoute, WORK_SITE))
    : []

  function addViaAt(lat, lng) {
    onChangeViaPoints(editingRoute.id, insertViaAtPoint({
      geometry: editingLine, stops: editingStops, viaPoints, point: [lat, lng],
    }))
  }
  function moveVia(index, lat, lng) {
    onChangeViaPoints(editingRoute.id, viaPoints.map((v, i) => (i === index ? { ...v, lat, lng } : v)))
  }
  function deleteVia(index) {
    onChangeViaPoints(editingRoute.id, viaPoints.filter((_, i) => i !== index))
  }

  return (
    <div style={{ position: 'relative' }}>
      <MapContainer
        center={[REGION_CENTER.lat, REGION_CENTER.lng]}
        zoom={REGION_CENTER.zoom}
        style={{ height, width: '100%', borderRadius: 12 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitOnFirstLoad points={points} />

        {/* Rota cizgileri — path_geometry varsa gercek yol, yoksa duz cizgi fallback */}
        {routes.filter(r => visibleRouteIds.has(r.id) && r.id !== editingRouteId).map(r => {
          const line = r.path_geometry && r.path_geometry.length >= 2 ? r.path_geometry : buildRoutePolyline(r, WORK_SITE)
          if (line.length < 2) return null
          const isSel = selectedRouteId === r.id
          const dim = selectedRouteId != null && !isSel
          return (
            <Polyline
              key={r.id}
              positions={line}
              pathOptions={{
                color: r.color || FALLBACK_COLOR,
                weight: isSel ? 6 : 3,
                opacity: dim ? 0.25 : 0.9,
              }}
              bubblingMouseEvents={false}
              eventHandlers={{ click: () => onSelectRoute(r.id) }}
            >
              <Popup>
                <strong>{r.name}</strong><br />
                Plaka: {r.vehicle_plate || '—'}<br />
                Şoför: {r.driver_name || '—'}<br />
                Kapasite: {r.capacity ?? '—'} · Durak: {r.stops?.length ?? 0}
                {!r.path_geometry && <><br /><span style={{ color: '#f59e0b' }}>⚠ yol hesaplanamadı</span></>}
              </Popup>
            </Polyline>
          )
        })}

        {/* Duzenleme modunda bos haritaya tiklayinca yeni durak eklenir */}
        {editingRoute && <MapClickToAddStop onAddStop={(lat, lng) => onAddStop(editingRoute.id, lat, lng)} />}

        {/* Duzenlenen rota: kalin cizgi, tiklaninca o noktaya ugrak dusar */}
        {editingRoute && editingLine.length >= 2 && (
          <Polyline
            positions={editingLine}
            pathOptions={{ color: editingRoute.color || FALLBACK_COLOR, weight: 8, opacity: 0.95 }}
            bubblingMouseEvents={false}
            eventHandlers={{ click: (e) => addViaAt(e.latlng.lat, e.latlng.lng) }}
          />
        )}

        {editingRoute && viaPoints.map((via, i) => (
          <ViaMarker
            key={`via-${i}`}
            via={via}
            index={i}
            onMoveVia={moveVia}
            onDeleteVia={deleteVia}
            color={editingRoute.color || FALLBACK_COLOR}
          />
        ))}

        {editingRoute && editingStops.map((s, i) => (
          <EditableStop
            key={s.id}
            stop={s}
            index={i}
            onMoveStop={onMoveStop}
            onDeleteStop={onDeleteStop}
            color={editingRoute.color || FALLBACK_COLOR}
          />
        ))}

        {/* Durak marker'lari (koordinatli) — duzenlenen rotanin duraklari haric (cakismasin) */}
        {pointsWithCoords(points)
          .filter(p => !editingStops.some(s => s.pickup_point_id === p.id))
          .map(p => (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={6}
              pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#f59e0b', fillOpacity: 0.9 }}
              bubblingMouseEvents={false}
            >
              <Tooltip>{p.name}</Tooltip>
              <Popup>
                <strong>{p.name}</strong><br />
                {p.district || '—'}{p.neighborhood ? ` / ${p.neighborhood}` : ''}<br />
                Personel: {p.staff_count ?? 0} · Rota: {p.route_count ?? 0}
              </Popup>
            </CircleMarker>
          ))}

        {/* Calisma alani (varis) */}
        <Marker position={[WORK_SITE.lat, WORK_SITE.lng]}>
          <Tooltip permanent direction="top">{WORK_SITE.short}</Tooltip>
          <Popup>{WORK_SITE.name}</Popup>
        </Marker>
      </MapContainer>

      {editingRoute && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 1000,
          background: 'var(--surface, #fff)', border: '1px solid var(--border, #cbd5e1)',
          borderRadius: 10, padding: '8px 10px',
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)',
        }}>
          {isBusy ? 'yol hesaplanıyor…' : 'çizgiye tıkla: uğrak · boşluğa tıkla: durak'}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/transport/RouteMap.jsx
git commit -m "feat(transport): replace freehand path editing with via points"
```

### Task 4.2: `MapTab.jsx` — uğrak mutation'ı + ↑/↓ durak sırası

**Files:**
- Modify: `frontend/src/modules/transport/tabs/MapTab.jsx`

- [ ] **Step 1: Import satırını genişlet**

```jsx
import { pointsWithoutCoords, moveStopInOrder } from '../logic/routeMap.js'
```

- [ ] **Step 2: `savePathMut`'u uğrak mutation'ı ile değiştir**

Mevcut `savePathMut` bloğunu **tamamen** şununla değiştir:

```jsx
  const viaPointsMut = useMutation({
    mutationFn: ({ routeId, viaPoints }) =>
      api.put(`/transport/routes/${routeId}/via-points`, { via_points: viaPoints }),
    onSuccess: invalidateMap,
    onError: toastErr,
  })
```

- [ ] **Step 3: Sol panele durak sırası listesi ekle**

Legend içindeki `{routes.map(r => { … })}` bloğunun **tamamını** şununla değiştir. (Rota satırı artık bir sarmalayıcı `<div>` içinde; `key` sarmalayıcıya taşındı, çünkü satırın altına ikinci bir eleman ekleniyor.)

```jsx
          {routes.map(r => {
            const isSel = selectedRouteId === r.id
            const isEditing = editingRouteId === r.id
            const orderedStops = [...(r.stops || [])].sort((a, b) => a.sequence_order - b.sequence_order)
            return (
              <div key={r.id}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
                  background: isSel || isEditing ? 'var(--surface2)' : 'transparent', cursor: 'pointer',
                }} onClick={() => setSelectedRouteId(isSel ? null : r.id)}>
                  <input
                    type="checkbox"
                    aria-label={`${r.name} rotasını gizle/göster`}
                    checked={!hiddenIds.has(r.id)}
                    onChange={() => toggleRoute(r.id)}
                    onClick={e => e.stopPropagation()}
                  />
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: r.color || FALLBACK_COLOR, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                      {r.vehicle_plate || '—'} · {orderedStops.length} durak
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`${r.name} rotasını haritadan düzenle`}
                      onClick={(e) => { e.stopPropagation(); toggleEdit(r.id) }}
                      className="btn btn-ghost btn-xs"
                      style={{ borderRadius: 6, color: isEditing ? 'var(--accent)' : undefined }}
                    >✎</button>
                  )}
                </div>

                {isEditing && orderedStops.length > 0 && (
                  <div style={{ padding: '4px 8px 8px 28px', display: 'flex', flexDirection: 'column', gap: 2 }}
                    onClick={e => e.stopPropagation()}>
                    {orderedStops.map((s, i) => {
                      const stopIds = orderedStops.map(x => x.id)
                      return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            flex: 1, minWidth: 0, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {i + 1}. {s.point_name}
                          </span>
                          <button type="button" className="btn btn-ghost btn-xs" style={{ borderRadius: 4, padding: '0 4px' }}
                            aria-label={`${s.point_name} yukarı taşı`} disabled={i === 0}
                            onClick={() => reorderMut.mutate({ routeId: r.id, stopIds: moveStopInOrder(stopIds, s.id, 'up') })}
                          >↑</button>
                          <button type="button" className="btn btn-ghost btn-xs" style={{ borderRadius: 4, padding: '0 4px' }}
                            aria-label={`${s.point_name} aşağı taşı`} disabled={i === orderedStops.length - 1}
                            onClick={() => reorderMut.mutate({ routeId: r.id, stopIds: moveStopInOrder(stopIds, s.id, 'down') })}
                          >↓</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
```

- [ ] **Step 4: "Uğrakları temizle" düğmesini ekle**

Mevcut `↻ Otomatik yeniden hesapla` düğmesinin hemen **altına** ekle:

```jsx
        {editingRouteId != null && (
          <button
            type="button"
            onClick={() => viaPointsMut.mutate({ routeId: editingRouteId, viaPoints: [] })}
            disabled={viaPointsMut.isPending}
            className="btn btn-ghost btn-xs"
            style={{ borderRadius: 8, width: '100%', marginTop: 4 }}
          >⌫ Uğrakları temizle</button>
        )}
```

- [ ] **Step 5: `RouteMap`'e yeni prop'ları bağla**

`<RouteMap …>` çağrısındaki şu iki satırı:

```jsx
              onReorderStop={(routeId, stopIds) => reorderMut.mutate({ routeId, stopIds })}
              onSaveManualPath={(routeId, geometry) => savePathMut.mutate({ routeId, geometry })}
```

şununla değiştir:

```jsx
              onChangeViaPoints={(routeId, viaPoints) => viaPointsMut.mutate({ routeId, viaPoints })}
              isBusy={viaPointsMut.isPending}
```

- [ ] **Step 6: Frontend transport testleri**

Run: `cd frontend && npx vitest run src/modules/transport`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/modules/transport/tabs/MapTab.jsx
git commit -m "feat(transport): wire via points and explicit stop reordering"
```

---

## Faz 5 — Doğrulama + deploy

- [ ] **Step 1: Backend tam suite**

Run: `cd backend && npx vitest run`
Expected: PASS (133 dosya).

- [ ] **Step 2: Frontend tam suite**

Run: `cd frontend && npx vitest run`
Expected: PASS (147 dosya).

- [ ] **Step 3: Production build**

Run: `cd frontend && npm run build`
Expected: Hatasız tamamlanır.

- [ ] **Step 4: Tarayıcıda doğrula**

`.env`'e dokunmadan iki sunucuyu ayrı ayrı başlat:

```bash
cd backend && PORT=3001 node --env-file=../.env src/server.js
```

```bash
cd frontend && npm run dev
```

`mudur/admin123` ile gir → Servisler → HARİTA → bir rotayı ✎ ile düzenlemeye al. Kontrol et:
1. Çizgiye tıklayınca uğrak düşüyor ve rota **yollardan** yeniden çiziliyor mu (düz çizgiye dönmüyor).
2. Uğrak sağ tıkla siliniyor mu.
3. Durağı sürüklemek konumunu taşıyor mu (sırası değişmiyor).
4. Sol paneldeki ↑/↓ ile sıra değişiyor ve harita güncelleniyor mu.
5. `read_console_messages` ile konsol hatası yok.

Doğrulama bitince oluşturulan test verilerini sil ve sunucuları kapat.

- [ ] **Step 5: Push + deploy**

```bash
git push origin main
```

```bash
ssh -p 2222 root@avskamp.com "cd /opt/avskamp && bash scripts/deploy/update.sh"
```

Deploy sonrası bağımsız doğrula: `/api/health` 200, sunucu HEAD = yerel HEAD, `PUT /api/transport/routes/1/via-points` → **401** (404 değil), `.dist-rollback` temiz.
