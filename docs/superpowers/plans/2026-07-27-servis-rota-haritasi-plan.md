# Servis Rota Haritası: Gerçek Yol Çizimi + Haritadan Düzenleme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Servisler → Harita` sekmesindeki rota çizgilerini düz çizgiden gerçek yol rotasına (OSRM, sunucu tarafında önbelleklenmiş) çevirmek ve yetkili rollerin haritadan durak taşıma/sıra değiştirme/yol elle düzeltme yapabilmesini sağlamak.

**Architecture:** `routes` tablosuna `path_geometry`/`path_is_manual`/`path_computed_at` eklenir. Durak/sıra/konum değişikliğinde mevcut job kuyruğuna (`transport.recompute-path`) iş atılır, sunucu OSRM'in genel demo sunucusunu çağırıp sonucu kaydeder. Frontend haritayı bu önbellekten çizer (sayfa açılışında dış istek yok); düzenleme modunda durak pinleri sürüklenebilir hale gelir (yakına bırakılırsa sıra değişir, uzağa bırakılırsa fiziksel konum değişir), rota çizgisine tıklanırsa "hayalet" noktalarla elle bükülüp kaydedilebilir.

**Tech Stack:** Express + better-sqlite3 (backend), React + react-leaflet + Leaflet (frontend), Vitest (her iki taraf), Zod (validasyon), mevcut SQLite tabanlı job kuyruğu.

**Spec:** `docs/superpowers/specs/2026-07-27-servis-rota-haritasi-design.md`

---

## Faz 1 — Backend temel: veri modeli + OSRM çekirdeği

### Task 1.1: Migration — path kolonları

**Files:**
- Create: `backend/src/shared/db/migrations/063_route_path_geometry.sql`

- [ ] **Step 1: Migration dosyasını yaz**

```sql
-- Rota yol geometrisi: OSRM'den hesaplanan ya da elle duzeltilmis cizim.
-- path_is_manual=1 ise otomatik yeniden hesaplama onu ezmez (bkz. transport/jobs.js).
ALTER TABLE routes ADD COLUMN path_geometry TEXT;
ALTER TABLE routes ADD COLUMN path_is_manual INTEGER NOT NULL DEFAULT 0;
ALTER TABLE routes ADD COLUMN path_computed_at TEXT;
```

- [ ] **Step 2: Migration'ın temiz uygulandığını doğrula**

Run: `cd backend && node -e "import('./src/shared/db/index.js').then(m => { process.env.DB_PATH = ':memory:'; return m.initDB() }).then(() => console.log('OK'))"`
Expected: `OK` yazdırır, hata fırlatmaz.

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/db/migrations/063_route_path_geometry.sql
git commit -m "feat(transport): add route path geometry columns"
```

### Task 1.2: WORK_SITE backend sabiti

**Files:**
- Create: `backend/src/modules/transport/workSite.js`

- [ ] **Step 1: Dosyayı yaz**

```js
// Filyos Dogal Gaz Isleme Tesisi — frontend zonguldakBartin.js#WORK_SITE ile ayni deger.
export const WORK_SITE = { lat: 41.5750, lng: 32.0264 }
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/transport/workSite.js
git commit -m "feat(transport): add backend WORK_SITE constant"
```

### Task 1.3: OSRM çağrı çekirdeği (`routing.js`)

**Files:**
- Create: `backend/src/modules/transport/routing.js`
- Test: `backend/src/modules/transport/routing.test.js`

- [ ] **Step 1: Başarısız testi yaz**

```js
// backend/src/modules/transport/routing.test.js
import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeRoadRoute } from './routing.js'

afterEach(() => { vi.unstubAllGlobals() })

describe('transport/routing computeRoadRoute', () => {
  it('2\'den az waypoint icin fetch atmadan null doner', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await computeRoadRoute([{ lat: 41.5, lng: 32.0 }])
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('basarili OSRM cevabini [lat,lng] dizisine cevirir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ geometry: { coordinates: [[32.0, 41.5], [32.01, 41.51]] } }] }),
    }))
    const result = await computeRoadRoute([{ lat: 41.5, lng: 32.0 }, { lat: 41.51, lng: 32.01 }])
    expect(result).toEqual([[41.5, 32.0], [41.51, 32.01]])
  })

  it('OSRM 4xx/5xx donerse null doner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await computeRoadRoute([{ lat: 41.5, lng: 32.0 }, { lat: 41.51, lng: 32.01 }])
    expect(result).toBeNull()
  })

  it('ag hatasinda null doner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    const result = await computeRoadRoute([{ lat: 41.5, lng: 32.0 }, { lat: 41.51, lng: 32.01 }])
    expect(result).toBeNull()
  })

  it('bos routes dizisi donerse null doner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [] }) }))
    const result = await computeRoadRoute([{ lat: 41.5, lng: 32.0 }, { lat: 41.51, lng: 32.01 }])
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Testi çalıştır, `computeRoadRoute` tanımsız olduğu için fail etmeli**

Run: `cd backend && npx vitest run src/modules/transport/routing.test.js`
Expected: FAIL — `computeRoadRoute is not a function` / import hatası.

- [ ] **Step 3: `routing.js`'i yaz**

```js
// backend/src/modules/transport/routing.js
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

// OSRM'in genel demo sunucusundan gercek yol rotasi. Basarisizlik durumunda
// (network, 4xx/5xx, bos cevap) exception firlatmaz — null doner, cagiran karar verir.
export async function computeRoadRoute(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return null
  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';')
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const coordinates = data?.routes?.[0]?.geometry?.coordinates
    if (!Array.isArray(coordinates) || coordinates.length === 0) return null
    return coordinates.map(c => [c[1], c[0]])
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Testi tekrar çalıştır, geçmeli**

Run: `cd backend && npx vitest run src/modules/transport/routing.test.js`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/transport/routing.js backend/src/modules/transport/routing.test.js
git commit -m "feat(transport): add OSRM road route computation"
```

### Task 1.4: `queries.js` — path okuma/yazma + trigger'lar

**Files:**
- Modify: `backend/src/modules/transport/queries.js`
- Modify: `backend/src/modules/transport/transport.test.js`

- [ ] **Step 1: Başarısız testi yaz (transport.test.js'in sonuna ekle)**

```js
// backend/src/modules/transport/transport.test.js — dosyanın SONUNA ekle
describe('Transport — path sorguları (queries.js)', () => {
  it('saveRoutePath + getRoutePath round-trip çalışır', async () => {
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Query Path Hat' })).body.id
    const q = await import('./queries.js')
    q.saveRoutePath(routeId, [[41.40, 31.70], [41.42, 31.75]], { isManual: true })
    const saved = q.getRoutePath(routeId)
    expect(saved.geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
    expect(saved.is_manual).toBe(true)
  })

  it('addRouteStop path_is_manual bayrağını sıfırlar', async () => {
    const q = await import('./queries.js')
    const p1 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Trigger Durak', lat: 41.40, lng: 31.70 })).body.id
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Trigger Hat' })).body.id
    q.saveRoutePath(routeId, [[41.0, 31.0], [41.1, 31.1]], { isManual: true })
    q.addRouteStop(routeId, { pickup_point_id: p1 })
    expect(q.getRoutePath(routeId).is_manual).toBe(false)
  })
})
```

- [ ] **Step 2: Testi çalıştır, `saveRoutePath`/`getRoutePath` tanımsız olduğu için fail etmeli**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js -t "path sorguları"`
Expected: FAIL — `q.saveRoutePath is not a function`.

- [ ] **Step 3: `queries.js`'e path fonksiyonlarını ekle**

`backend/src/modules/transport/queries.js` dosyasının en altına (dosyanın sonuna, `getReports` fonksiyonundan sonra) ekle:

```js
// ── Rota yol geometrisi (path) ──
export function getRoutePath(routeId) {
  const row = getDB().prepare('SELECT path_geometry, path_is_manual, path_computed_at FROM routes WHERE id=?').get(routeId)
  if (!row) return null
  return {
    geometry: row.path_geometry ? JSON.parse(row.path_geometry) : null,
    is_manual: !!row.path_is_manual,
    computed_at: row.path_computed_at,
  }
}

export function saveRoutePath(routeId, geometry, { isManual }) {
  getDB().prepare(`
    UPDATE routes SET path_geometry=?, path_is_manual=?, path_computed_at=datetime('now') WHERE id=?
  `).run(JSON.stringify(geometry), isManual ? 1 : 0, routeId)
}
```

- [ ] **Step 4: Testi tekrar çalıştır, geçmeli (ikinci test hâlâ fail edecek — sıradaki adımda çözülüyor)**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js -t "path sorguları"`
Expected: İlk test PASS, ikinci test (`addRouteStop path_is_manual`) hâlâ FAIL (henüz sıfırlama eklenmedi).

- [ ] **Step 5: `addRouteStop`/`deleteRouteStop`/`updateRouteStop`/`reorderRouteStops`/`updatePickupPoint` fonksiyonlarını güncelle**

`queries.js` içinde şu 5 fonksiyonu **birebir bu haliyle** değiştir (mevcutlarının yerine):

```js
export function addRouteStop(routeId, data) {
  const db = getDB()
  // Sıra otomatik: en yüksek+1
  const max = db.prepare('SELECT COALESCE(MAX(sequence_order), 0) as m FROM route_stops WHERE route_id=?').get(routeId).m
  const id = db.prepare(`
    INSERT INTO route_stops(route_id, pickup_point_id, sequence_order, scheduled_time)
    VALUES(?,?,?,?)
  `).run(routeId, data.pickup_point_id, data.sequence_order ?? (max + 1), data.scheduled_time || null).lastInsertRowid
  db.prepare('UPDATE routes SET path_is_manual=0 WHERE id=?').run(routeId)
  return id
}

export function updateRouteStop(id, data) {
  const db = getDB()
  const fields = ['pickup_point_id', 'sequence_order', 'scheduled_time']
  const sets = []
  const params = []
  fields.forEach(f => {
    if (data[f] !== undefined) { sets.push(`${f}=?`); params.push(data[f] === '' ? null : data[f]) }
  })
  if (!sets.length) return
  params.push(id)
  db.prepare(`UPDATE route_stops SET ${sets.join(',')} WHERE id=?`).run(...params)
  const row = db.prepare('SELECT route_id FROM route_stops WHERE id=?').get(id)
  if (row) db.prepare('UPDATE routes SET path_is_manual=0 WHERE id=?').run(row.route_id)
}

export function deleteRouteStop(id) {
  const db = getDB()
  const row = db.prepare('SELECT route_id FROM route_stops WHERE id=?').get(id)
  db.prepare('DELETE FROM route_stops WHERE id=?').run(id)
  if (row) db.prepare('UPDATE routes SET path_is_manual=0 WHERE id=?').run(row.route_id)
  return row?.route_id ?? null
}

export function reorderRouteStops(routeId, orderedStopIds) {
  const db = getDB()
  const upd = db.prepare('UPDATE route_stops SET sequence_order = ? WHERE id = ? AND route_id = ?')
  const tx = db.transaction(() => {
    orderedStopIds.forEach((id, idx) => upd.run(idx + 1, id, routeId))
    db.prepare('UPDATE routes SET path_is_manual=0 WHERE id=?').run(routeId)
  })
  tx()
}
```

```js
export function updatePickupPoint(id, data) {
  const db = getDB()
  const fields = ['name', 'district', 'neighborhood', 'lat', 'lng', 'notes', 'is_active']
  const sets = []
  const params = []
  fields.forEach(f => {
    if (data[f] !== undefined) { sets.push(`${f}=?`); params.push(data[f] === '' ? null : data[f]) }
  })
  if (!sets.length) return []
  params.push(id)
  db.prepare(`UPDATE pickup_points SET ${sets.join(',')} WHERE id=?`).run(...params)
  if (data.lat === undefined && data.lng === undefined) return []
  const routeIds = db.prepare('SELECT DISTINCT route_id FROM route_stops WHERE pickup_point_id=?').all(id).map(r => r.route_id)
  routeIds.forEach(routeId => db.prepare('UPDATE routes SET path_is_manual=0 WHERE id=?').run(routeId))
  return routeIds
}
```

- [ ] **Step 6: `listRoutes` fonksiyonunu path alanlarını parse edecek şekilde güncelle**

`queries.js`'teki `listRoutes` fonksiyonunda, `routes` değişkeni oluşturulduktan hemen sonra (ilk `db.prepare(...).all()` çağrısının bittiği satırdan sonra, `if (!withStops && !workDate) return routes` satırından ÖNCE) şu bloğu ekle:

```js
  routes.forEach(r => {
    r.path_geometry = r.path_geometry ? JSON.parse(r.path_geometry) : null
    r.path_is_manual = !!r.path_is_manual
  })

```

- [ ] **Step 7: Tüm transport testlerini çalıştır, hepsi geçmeli**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js`
Expected: PASS (tüm testler, yeni ikisi dahil).

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/transport/queries.js backend/src/modules/transport/transport.test.js
git commit -m "feat(transport): add route path storage and staleness triggers"
```

---

## Faz 2 — Backend: job tetikleyicileri + API uçları

### Task 2.1: Job mantığı (`jobs.js`)

**Files:**
- Create: `backend/src/modules/transport/jobs.js`
- Create: `backend/src/modules/transport/jobs.test.js`

- [ ] **Step 1: Başarısız testi yaz**

```js
// backend/src/modules/transport/jobs.test.js
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./routing.js', () => ({ computeRoadRoute: vi.fn() }))

import { initDB, getDB } from '../../shared/db/index.js'
import { enqueue, tickOnce } from '../../shared/jobs/index.js'
import { computeRoadRoute } from './routing.js'
import { recomputeRoutePathJob, recomputeRoutePathSync } from './jobs.js'
import * as q from './queries.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  initDB()
})

function makeRouteWithStops() {
  const db = getDB()
  const ppA = db.prepare(`INSERT INTO pickup_points(name, lat, lng) VALUES('A', 41.40, 31.70)`).run().lastInsertRowid
  const ppB = db.prepare(`INSERT INTO pickup_points(name, lat, lng) VALUES('B', 41.42, 31.75)`).run().lastInsertRowid
  const routeId = db.prepare(`INSERT INTO routes(name) VALUES('Test Hat')`).run().lastInsertRowid
  db.prepare(`INSERT INTO route_stops(route_id, pickup_point_id, sequence_order) VALUES(?,?,1)`).run(routeId, ppA)
  db.prepare(`INSERT INTO route_stops(route_id, pickup_point_id, sequence_order) VALUES(?,?,2)`).run(routeId, ppB)
  return routeId
}

beforeEach(() => {
  getDB().exec('DELETE FROM job_queue; DELETE FROM route_stops; DELETE FROM routes; DELETE FROM pickup_points;')
  computeRoadRoute.mockReset()
})

describe('transport.recompute-path job', () => {
  it('basarili OSRM cevabinda path_geometry kaydeder ve path_is_manual sifirlar', async () => {
    const routeId = makeRouteWithStops()
    getDB().prepare('UPDATE routes SET path_is_manual=1 WHERE id=?').run(routeId)
    computeRoadRoute.mockResolvedValue([[41.40, 31.70], [41.41, 31.72], [41.42, 31.75]])

    enqueue('transport.recompute-path', { routeId })
    await tickOnce()

    const saved = q.getRoutePath(routeId)
    expect(saved.geometry).toEqual([[41.40, 31.70], [41.41, 31.72], [41.42, 31.75]])
    expect(saved.is_manual).toBe(false)
  })

  it('OSRM basarisiz olursa is yeniden denenir, eski geometri korunur', async () => {
    const routeId = makeRouteWithStops()
    q.saveRoutePath(routeId, [[41.40, 31.70], [41.42, 31.75]], { isManual: false })
    computeRoadRoute.mockResolvedValue(null)

    enqueue('transport.recompute-path', { routeId }, { maxAttempts: 5 })
    await tickOnce()

    const row = getDB().prepare('SELECT status, attempts FROM job_queue WHERE type=?').get('transport.recompute-path')
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    const saved = q.getRoutePath(routeId)
    expect(saved.geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
  })

  it('koordinatsiz durak yoksa atlanir, OSRM cagrilmaz', async () => {
    const db = getDB()
    const routeId = db.prepare(`INSERT INTO routes(name) VALUES('Bos Hat')`).run().lastInsertRowid
    enqueue('transport.recompute-path', { routeId })
    await tickOnce()
    expect(computeRoadRoute).not.toHaveBeenCalled()
    const row = getDB().prepare('SELECT status FROM job_queue WHERE type=?').get('transport.recompute-path')
    expect(row.status).toBe('done')
  })
})

describe('recomputeRoutePathSync', () => {
  it('basarili olursa geometry doner ve kaydeder', async () => {
    const routeId = makeRouteWithStops()
    computeRoadRoute.mockResolvedValue([[41.40, 31.70], [41.42, 31.75]])
    const geometry = await recomputeRoutePathSync(routeId)
    expect(geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
    expect(q.getRoutePath(routeId).is_manual).toBe(false)
  })

  it('OSRM basarisiz olursa null doner', async () => {
    const routeId = makeRouteWithStops()
    computeRoadRoute.mockResolvedValue(null)
    const geometry = await recomputeRoutePathSync(routeId)
    expect(geometry).toBeNull()
  })
})
```

- [ ] **Step 2: Testi çalıştır, `jobs.js` var olmadığı için fail etmeli**

Run: `cd backend && npx vitest run src/modules/transport/jobs.test.js`
Expected: FAIL — modül bulunamadı.

- [ ] **Step 3: `jobs.js`'i yaz**

```js
// backend/src/modules/transport/jobs.js
import { computeRoadRoute } from './routing.js'
import { WORK_SITE } from './workSite.js'
import * as q from './queries.js'

function buildWaypoints(routeId) {
  const stops = [...q.listRouteStops(routeId)].sort((a, b) => a.sequence_order - b.sequence_order)
  const coords = stops
    .filter(s => s.lat != null && s.lng != null)
    .map(s => ({ lat: s.lat, lng: s.lng }))
  if (coords.length === 0) return null
  coords.push(WORK_SITE)
  return coords
}

// Job kuyrugu handler'i — durak/sira/konum degisince arka planda cagrilir.
// Basarisiz olursa (permanent isaretlenmemis) hata firlatir, mevcut retry/backoff devreye girer.
export async function recomputeRoutePathJob({ routeId }) {
  const waypoints = buildWaypoints(routeId)
  if (!waypoints) return { skipped: 'no_coords' }
  const geometry = await computeRoadRoute(waypoints)
  if (!geometry) throw new Error(`Rota ${routeId}: OSRM yol hesaplanamadi`)
  q.saveRoutePath(routeId, geometry, { isManual: false })
  return { ok: true }
}

// "Otomatik yeniden hesapla" butonu icin senkron cagri — kullanici sonucu bekliyor.
export async function recomputeRoutePathSync(routeId) {
  const waypoints = buildWaypoints(routeId)
  if (!waypoints) return null
  const geometry = await computeRoadRoute(waypoints)
  if (!geometry) return null
  q.saveRoutePath(routeId, geometry, { isManual: false })
  return geometry
}
```

- [ ] **Step 4: Testi tekrar çalıştır, geçmeli**

Run: `cd backend && npx vitest run src/modules/transport/jobs.test.js`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/transport/jobs.js backend/src/modules/transport/jobs.test.js
git commit -m "feat(transport): add route path recompute job"
```

### Task 2.2: Handler kaydı

**Files:**
- Modify: `backend/src/shared/jobs/handlers.js`

- [ ] **Step 1: Import ve handler girişini ekle**

`backend/src/shared/jobs/handlers.js` dosyasında, mevcut importların altına ekle:

```js
import { recomputeRoutePathJob } from '../../modules/transport/jobs.js'
```

`export const handlers = { ... }` objesine son satır olarak ekle:

```js
  'transport.recompute-path': recomputeRoutePathJob,
```

(Sonuç: `handlers` objesi `'whatsapp.send': sendWhatsAppJob,` satırından sonra `'transport.recompute-path': recomputeRoutePathJob,` satırını da içermeli.)

- [ ] **Step 2: Mevcut jobs testlerinin bozulmadığını doğrula**

Run: `cd backend && npx vitest run src/shared/jobs`
Expected: PASS (mevcut tüm testler).

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/jobs/handlers.js
git commit -m "feat(transport): register route path recompute handler"
```

### Task 2.3: Zod şeması + API uçları

**Files:**
- Modify: `backend/src/modules/transport/schemas.js`
- Modify: `backend/src/modules/transport/routes.js`
- Modify: `backend/src/modules/transport/transport.test.js`

- [ ] **Step 1: Başarısız testleri yaz (transport.test.js'in sonuna ekle)**

```js
// backend/src/modules/transport/transport.test.js — dosyanın SONUNA ekle
describe('Transport — Rota yol geometrisi (path uçları)', () => {
  it('durak eklenince path yeniden hesaplama kuyruga alinir', async () => {
    const p1 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Path Durak A', lat: 41.40, lng: 31.70 })).body.id
    const p2 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Path Durak B', lat: 41.42, lng: 31.75 })).body.id
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Path Hat' })).body.id

    await request(app).post(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: p1 })
    await request(app).post(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: p2 })

    await tickOnce(); await tickOnce()

    const list = await request(app).get('/api/transport/routes?with_stops=1').set('Authorization', `Bearer ${token}`)
    const route = list.body.find(r => r.id === routeId)
    expect(route.path_geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
    expect(route.path_is_manual).toBe(false)
  })

  it('elle yol kaydi path_is_manual=1 yapar ve GET ile geri doner', async () => {
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Elle Hat' })).body.id

    const save = await request(app).put(`/api/transport/routes/${routeId}/path`).set('Authorization', `Bearer ${token}`)
      .send({ geometry: [[41.40, 31.70], [41.41, 31.73], [41.42, 31.75]] })
    expect(save.status).toBe(200)

    const list = await request(app).get('/api/transport/routes?with_stops=1').set('Authorization', `Bearer ${token}`)
    const route = list.body.find(r => r.id === routeId)
    expect(route.path_is_manual).toBe(true)
    expect(route.path_geometry).toEqual([[41.40, 31.70], [41.41, 31.73], [41.42, 31.75]])
  })

  it('gecersiz geometri (tek nokta) 400 doner', async () => {
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Gecersiz Hat' })).body.id
    const res = await request(app).put(`/api/transport/routes/${routeId}/path`).set('Authorization', `Bearer ${token}`)
      .send({ geometry: [[41.40, 31.70]] })
    expect(res.status).toBe(400)
  })

  it('yetkisiz rol path kaydedemez', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Yetki Hat' })).body.id
    const res = await request(app).put(`/api/transport/routes/${routeId}/path`).set('Authorization', `Bearer ${t}`)
      .send({ geometry: [[41.40, 31.70], [41.42, 31.75]] })
    expect(res.status).toBe(403)
  })

  it('otomatik yeniden hesapla ucu senkron calisir ve gecerli sonuc doner', async () => {
    const p1 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Recompute Durak A', lat: 41.40, lng: 31.70 })).body.id
    const p2 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Recompute Durak B', lat: 41.42, lng: 31.75 })).body.id
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Recompute Hat' })).body.id
    await request(app).post(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: p1 })
    await request(app).post(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: p2 })

    const res = await request(app).post(`/api/transport/routes/${routeId}/recompute-path`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
  })

  it('bir durak tasininca onu kullanan rota icin path yeniden hesaplanir', async () => {
    const p1 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tasima Durak A', lat: 41.40, lng: 31.70 })).body.id
    const p2 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tasima Durak B', lat: 41.42, lng: 31.75 })).body.id
    const routeId = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tasima Hat' })).body.id
    await request(app).post(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: p1 })
    await request(app).post(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: p2 })
    await tickOnce(); await tickOnce()
    await request(app).put(`/api/transport/routes/${routeId}/path`).set('Authorization', `Bearer ${token}`)
      .send({ geometry: [[41.40, 31.70], [41.41, 31.73], [41.42, 31.75]] })

    await request(app).put(`/api/transport/pickup-points/${p1}`).set('Authorization', `Bearer ${token}`)
      .send({ lat: 41.395, lng: 31.695 })
    await tickOnce()

    const list = await request(app).get('/api/transport/routes?with_stops=1').set('Authorization', `Bearer ${token}`)
    const route = list.body.find(r => r.id === routeId)
    expect(route.path_is_manual).toBe(false)
    expect(route.path_geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
  })
})
```

Ayrıca dosyanın **en üstündeki import bloğunu** şu şekilde değiştir:

```js
import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'

vi.mock('./routing.js', () => ({
  computeRoadRoute: vi.fn().mockResolvedValue([[41.40, 31.70], [41.42, 31.75]]),
}))

import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { tickOnce } from '../../shared/jobs/index.js'
```

- [ ] **Step 2: Testi çalıştır, yeni uçlar olmadığı için fail etmeli**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js -t "path uçları"`
Expected: FAIL — 404/undefined route.

- [ ] **Step 3: `schemas.js`'e şema ekle**

`backend/src/modules/transport/schemas.js` dosyasının sonuna ekle:

```js
export const savePathSchema = z.object({
  geometry: z.array(z.tuple([z.number(), z.number()])).min(2, 'En az 2 nokta gerekli'),
})
```

- [ ] **Step 4: `routes.js`'e importları ve uçları ekle**

Dosyanın üstündeki import bloğuna ekle:

```js
import { enqueue } from '../../shared/jobs/index.js'
import { recomputeRoutePathSync } from './jobs.js'
```

`import { createPickupPointSchema, ... } from './schemas.js'` satırındaki listeye `savePathSchema` ekle.

Mevcut 3 endpoint'i **birebir bu haliyle** değiştir (`PUT /stops/:id`, `DELETE /stops/:id`, `POST /routes/:id/reorder-stops`):

```js
transportRouter.put('/stops/:id', ...mgr, validate(stopUpdateSchema), (req, res) => {
  try {
    q.updateRouteStop(+req.params.id, req.validated)
    const row = getDB().prepare('SELECT route_id FROM route_stops WHERE id=?').get(+req.params.id)
    if (row) enqueue('transport.recompute-path', { routeId: row.route_id })
    res.json({ ok: true })
  }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.delete('/stops/:id', ...mgr, (req, res) => {
  try {
    const routeId = q.deleteRouteStop(+req.params.id)
    if (routeId) enqueue('transport.recompute-path', { routeId })
    res.json({ ok: true })
  }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.post('/routes/:id/reorder-stops', ...mgr, (req, res) => {
  try {
    const ids = req.body?.stop_ids
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'stop_ids dizisi gerekli' })
    q.reorderRouteStops(+req.params.id, ids)
    enqueue('transport.recompute-path', { routeId: +req.params.id })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

`transportRouter.post('/routes/:id/stops', ...)` içine, `const id = q.addRouteStop(...)` satırının hemen altına ekle:

```js
    enqueue('transport.recompute-path', { routeId: +req.params.id })
```

`transportRouter.put('/pickup-points/:id', ...)` endpoint'ini değiştir:

```js
transportRouter.put('/pickup-points/:id', ...mgr, validate(pickupPointUpdateSchema), (req, res) => {
  try {
    const affectedRouteIds = q.updatePickupPoint(+req.params.id, req.validated)
    affectedRouteIds.forEach(routeId => enqueue('transport.recompute-path', { routeId }))
    res.json({ ok: true })
  }
  catch (e) { res.status(400).json({ error: e.message }) }
})
```

Yeni iki uç ekle (`reorder-stops` endpoint'inden hemen sonra, `// ── Staff pickup ──` yorumundan önce):

```js
transportRouter.put('/routes/:id/path', ...mgr, validate(savePathSchema), (req, res) => {
  try {
    q.saveRoutePath(+req.params.id, req.validated.geometry, { isManual: true })
    logAudit(req.user.id, 'transport_route_path_manual', 'transport', +req.params.id, null)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.post('/routes/:id/recompute-path', ...mgr, async (req, res) => {
  try {
    const geometry = await recomputeRoutePathSync(+req.params.id)
    if (!geometry) return res.status(502).json({ error: 'Yol hesaplanamadı — OSRM ulaşılamadı ya da koordinatlı durak yok' })
    res.json({ ok: true, geometry })
  } catch (e) { logger.error('[Route] recompute-path:', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 5: Testi tekrar çalıştır, tüm transport testleri geçmeli**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js`
Expected: PASS (tüm testler).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/transport/schemas.js backend/src/modules/transport/routes.js backend/src/modules/transport/transport.test.js
git commit -m "feat(transport): add route path save/recompute endpoints"
```

### Task 2.4: Var olan rotalar için başlangıç hesaplama

**Files:**
- Modify: `backend/src/server.js`

- [ ] **Step 1: `server.js`'e backfill ekle**

`import { startWorker, stopWorker } from './shared/jobs/index.js'` satırını şu şekilde değiştir:

```js
import { startWorker, stopWorker, enqueue } from './shared/jobs/index.js'
```

`startWorker()` çağrısının hemen altına ekle:

```js

// Migration sonrasi path_geometry hic hesaplanmamis eski rotalar icin
// arka planda otomatik hesaplama kuyruga alinir (test ortaminda calismaz).
if (process.env.NODE_ENV !== 'test') {
  const missingPaths = getDB().prepare(
    "SELECT id FROM routes WHERE is_active = 1 AND path_geometry IS NULL"
  ).all()
  missingPaths.forEach(r => enqueue('transport.recompute-path', { routeId: r.id }))
}
```

- [ ] **Step 2: Backend'i lokal başlatıp hata vermediğini doğrula**

Run: `cd backend && npm run dev` (birkaç saniye sonra Ctrl+C ile durdur)
Expected: `YYS Backend http://localhost:3001` yazdırır, exception fırlatmaz.

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.js
git commit -m "feat(transport): backfill missing route paths on startup"
```

---

## Faz 3 — Frontend saf mantık (routeMap.js)

### Task 3.1: Sürükleme sınıflandırma + geometri yardımcıları

**Files:**
- Modify: `frontend/src/modules/transport/logic/routeMap.js`
- Modify: `frontend/src/modules/transport/logic/routeMap.test.js`

- [ ] **Step 1: Başarısız testleri yaz (routeMap.test.js'in sonuna ekle)**

```js
// frontend/src/modules/transport/logic/routeMap.test.js — dosyanın SONUNA ekle
describe('transport/logic/routeMap — düzenleme yardımcıları', () => {
  it('distanceToSegmentMeters: nokta segmentin tam ortasındaysa ~0 döner', () => {
    const a = [41.40, 31.70]
    const b = [41.42, 31.70]
    const mid = [41.41, 31.70]
    expect(distanceToSegmentMeters(mid, a, b)).toBeLessThan(1)
  })

  it('distanceToSegmentMeters: segmentten uzak nokta büyük mesafe döner', () => {
    const a = [41.40, 31.70]
    const b = [41.42, 31.70]
    const far = [41.41, 31.80]
    expect(distanceToSegmentMeters(far, a, b)).toBeGreaterThan(5000)
  })

  it('classifyDrop: eşik içinde reorder döner', () => {
    const stops = [
      { id: 1, lat: 41.40, lng: 31.70 },
      { id: 2, lat: 41.42, lng: 31.70 },
      { id: 3, lat: 41.44, lng: 31.70 },
    ]
    const drop = [41.41, 31.70]
    expect(classifyDrop(drop, stops)).toEqual({ type: 'reorder', afterStopId: 1 })
  })

  it('classifyDrop: eşik dışında move döner', () => {
    const stops = [
      { id: 1, lat: 41.40, lng: 31.70 },
      { id: 2, lat: 41.42, lng: 31.70 },
    ]
    const drop = [41.41, 31.90]
    expect(classifyDrop(drop, stops)).toEqual({ type: 'move' })
  })

  it('classifyDrop: 2den az koordinatlı durakta move döner', () => {
    expect(classifyDrop([41.41, 31.70], [{ id: 1, lat: 41.40, lng: 31.70 }])).toEqual({ type: 'move' })
  })

  it('reorderedStopIds: durak doğru pozisyona eklenir', () => {
    const stops = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(reorderedStopIds(stops, 3, 1)).toEqual([1, 3, 2])
    expect(reorderedStopIds(stops, 1, 2)).toEqual([2, 1, 3])
  })

  it('insertViaPoint: diziye doğru indekse nokta ekler', () => {
    const geometry = [[41.40, 31.70], [41.42, 31.75]]
    expect(insertViaPoint(geometry, 0, [41.41, 31.72])).toEqual([
      [41.40, 31.70], [41.41, 31.72], [41.42, 31.75],
    ])
  })
})
```

Dosyanın en üstündeki import satırını genişlet:

```js
import { describe, it, expect } from 'vitest'
import {
  buildRoutePolyline, pointsWithCoords, pointsWithoutCoords,
  distanceToSegmentMeters, classifyDrop, reorderedStopIds, insertViaPoint,
} from './routeMap.js'
```

- [ ] **Step 2: Testi çalıştır, yeni fonksiyonlar yok olduğu için fail etmeli**

Run: `cd frontend && npx vitest run src/modules/transport/logic/routeMap.test.js`
Expected: FAIL — import hatası.

- [ ] **Step 3: `routeMap.js`'e fonksiyonları ekle**

`frontend/src/modules/transport/logic/routeMap.js` dosyasının sonuna ekle:

```js
export const SNAP_THRESHOLD_M = 120

const EARTH_RADIUS_M = 6371000
const toRad = (deg) => deg * Math.PI / 180

function haversineMeters(a, b) {
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// Nokta ile [a,b] dogru parcasi arasindaki en kisa mesafe (metre). Bolge kucuk
// oldugu icin duzlem projeksiyonu (enlem/boyu dereceyi metreye cevirme) yeterli.
export function distanceToSegmentMeters(point, a, b) {
  const latRef = toRad(a[0])
  const mPerDegLat = 111320
  const mPerDegLng = 111320 * Math.cos(latRef)
  const toXY = (p) => [(p[1] - a[1]) * mPerDegLng, (p[0] - a[0]) * mPerDegLat]
  const [px, py] = toXY(point)
  const [bx, by] = toXY(b)
  const segLenSq = bx * bx + by * by
  if (segLenSq === 0) return haversineMeters(point, a)
  let t = (px * bx + py * by) / segLenSq
  t = Math.max(0, Math.min(1, t))
  const dx = px - bx * t
  const dy = py - by * t
  return Math.hypot(dx, dy)
}

// Bir durak pin'i rota cizgisi uzerine/yakinina birakilirsa 'reorder' (en yakin
// segmentin ilk durağından SONRA eklenir), uzagina birakilirsa 'move' sayilir.
// Not: bu gesture ile bir durak "en basa" tasinamaz — sadece baska bir durağın
// hemen ardina eklenebilir (v1 kisitlamasi, spec'te belirtildi).
export function classifyDrop(dropPoint, stops, threshold = SNAP_THRESHOLD_M) {
  const coordStops = stops.filter(s => s.lat != null && s.lng != null)
  if (coordStops.length < 2) return { type: 'move' }
  let best = { dist: Infinity, afterStopId: coordStops[0].id }
  for (let i = 0; i < coordStops.length - 1; i++) {
    const a = [coordStops[i].lat, coordStops[i].lng]
    const b = [coordStops[i + 1].lat, coordStops[i + 1].lng]
    const dist = distanceToSegmentMeters(dropPoint, a, b)
    if (dist < best.dist) best = { dist, afterStopId: coordStops[i].id }
  }
  if (best.dist <= threshold) return { type: 'reorder', afterStopId: best.afterStopId }
  return { type: 'move' }
}

// Suruklenen durağın yeni sequence_order dizisini (stop id'leri) hesaplar.
export function reorderedStopIds(stops, draggedStopId, afterStopId) {
  const rest = stops.filter(s => s.id !== draggedStopId).map(s => s.id)
  const idx = rest.indexOf(afterStopId)
  rest.splice(idx + 1, 0, draggedStopId)
  return rest
}

// Elle yol duzeltme: [segmentIndex, segmentIndex+1] arasina yeni nokta ekler.
export function insertViaPoint(geometry, segmentIndex, point) {
  const next = [...geometry]
  next.splice(segmentIndex + 1, 0, point)
  return next
}
```

- [ ] **Step 4: Testi tekrar çalıştır, geçmeli**

Run: `cd frontend && npx vitest run src/modules/transport/logic/routeMap.test.js`
Expected: PASS (tüm testler, eskiler + yeniler).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/transport/logic/routeMap.js frontend/src/modules/transport/logic/routeMap.test.js
git commit -m "feat(transport): add map edit-mode geometry helpers"
```

---

## Faz 4 — Frontend UI: düzenleme modu

### Task 4.1: `RouteMap.jsx` — yol geometrisi + düzenleme modu

**Files:**
- Modify: `frontend/src/modules/transport/RouteMap.jsx`

- [ ] **Step 1: Dosyanın tamamını aşağıdaki içerikle değiştir**

```jsx
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip, Popup, useMap } from 'react-leaflet'
import { useEffect, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { WORK_SITE, REGION_CENTER } from './zonguldakBartin.js'
import {
  buildRoutePolyline, pointsWithCoords,
  classifyDrop, reorderedStopIds, insertViaPoint,
} from './logic/routeMap.js'

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

function ghostIcon() {
  return L.divIcon({
    html: `<div style="width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #64748b;box-shadow:0 0 0 2px rgba(0,0,0,.15)"></div>`,
    className: 'route-ghost-point',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
}

// Rota duzenleme modunda: duraklar suruklenebilir numarali pin'e doner.
// Bir pin rota cizgisine yakin birakilirsa sira degisir, uzak birakilirsa
// durağın gercek konumu (pickup_point) degisir. Bkz: logic/routeMap.js#classifyDrop.
function EditableStop({ stop, index, allStops, onMoveStop, onReorderStop, color }) {
  const [pos, setPos] = useState([stop.lat, stop.lng])
  useEffect(() => { setPos([stop.lat, stop.lng]) }, [stop.lat, stop.lng])

  return (
    <Marker
      position={pos}
      draggable
      icon={numberedIcon(index + 1, color)}
      eventHandlers={{
        dragend: (e) => {
          const latlng = e.target.getLatLng()
          const dropPoint = [latlng.lat, latlng.lng]
          const decision = classifyDrop(dropPoint, allStops)
          if (decision.type === 'reorder') {
            setPos([stop.lat, stop.lng])
            onReorderStop(reorderedStopIds(allStops, stop.id, decision.afterStopId))
          } else {
            setPos(dropPoint)
            onMoveStop(stop.pickup_point_id, dropPoint[0], dropPoint[1])
          }
        },
      }}
    >
      <Tooltip>{index + 1}. {stop.point_name}</Tooltip>
    </Marker>
  )
}

// Elle yol duzeltme: kaba nokta dizisini (duraklar + isyeri) suruklenebilir
// hayalet noktalarla buker. "Kaydet" tiklaninca son hali backend'e gonderilir.
function ManualPathEditor({ initialGeometry, color, onDraftChange }) {
  const [draft, setDraft] = useState(initialGeometry)
  useEffect(() => { onDraftChange(draft) }, [draft, onDraftChange])

  return (
    <>
      <Polyline positions={draft} pathOptions={{ color, weight: 5, opacity: 0.95, dashArray: '2 8' }} />
      {draft.slice(0, -1).map((a, i) => {
        const b = draft[i + 1]
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        return (
          <Marker key={i} position={mid} draggable icon={ghostIcon()}
            eventHandlers={{
              dragend: (e) => {
                const latlng = e.target.getLatLng()
                setDraft(prev => insertViaPoint(prev, i, [latlng.lat, latlng.lng]))
              },
            }}
          />
        )
      })}
    </>
  )
}

// props:
//  routes: [{ id, name, color, vehicle_plate, capacity, driver_name, stops:[...], path_geometry, path_is_manual }]
//  points: tum aktif duraklar (lat/lng)
//  visibleRouteIds: Set<number> — gosterilecek rotalar
//  selectedRouteId: number | null — vurgulanan rota
//  onSelectRoute: (id) => void
//  editingRouteId: number | null — haritadan duzenlenen rota
//  onMoveStop: (pickupPointId, lat, lng) => void
//  onReorderStop: (routeId, stopIds) => void
//  onSaveManualPath: (routeId, geometry) => void
export default function RouteMap({
  routes, points, visibleRouteIds, selectedRouteId, onSelectRoute, height = 520,
  editingRouteId = null, onMoveStop, onReorderStop, onSaveManualPath,
}) {
  const editingRoute = routes.find(r => r.id === editingRouteId) || null
  const [manualDraft, setManualDraft] = useState(null)

  useEffect(() => { setManualDraft(null) }, [editingRouteId])

  const editingStops = editingRoute
    ? [...(editingRoute.stops || [])].filter(s => s.lat != null && s.lng != null).sort((a, b) => a.sequence_order - b.sequence_order)
    : []

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

        {/* Duzenlenen rota: gercek yol/elle cizim + suruklenebilir duraklar */}
        {editingRoute && editingStops.length > 0 && (
          manualDraft ? (
            <ManualPathEditor
              initialGeometry={manualDraft}
              color={editingRoute.color || FALLBACK_COLOR}
              onDraftChange={setManualDraft}
            />
          ) : (
            <Polyline
              positions={editingRoute.path_geometry?.length >= 2 ? editingRoute.path_geometry : buildRoutePolyline(editingRoute, WORK_SITE)}
              pathOptions={{ color: editingRoute.color || FALLBACK_COLOR, weight: 5, opacity: 0.95 }}
              eventHandlers={{
                click: () => setManualDraft(
                  editingRoute.path_geometry?.length >= 2 ? editingRoute.path_geometry : buildRoutePolyline(editingRoute, WORK_SITE)
                ),
              }}
            />
          )
        )}
        {editingRoute && editingStops.map((s, i) => (
          <EditableStop
            key={s.id}
            stop={s}
            index={i}
            allStops={editingStops}
            onMoveStop={onMoveStop}
            onReorderStop={(stopIds) => onReorderStop(editingRoute.id, stopIds)}
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
          borderRadius: 10, padding: '8px 10px', display: 'flex', gap: 6, alignItems: 'center',
          fontFamily: 'var(--mono)', fontSize: 10,
        }}>
          {manualDraft ? (
            <>
              <button
                type="button"
                onClick={() => { onSaveManualPath(editingRoute.id, manualDraft); setManualDraft(null) }}
                className="btn btn-primary btn-xs" style={{ borderRadius: 6 }}
              >✔ Kaydet</button>
              <button
                type="button"
                onClick={() => setManualDraft(null)}
                className="btn btn-ghost btn-xs" style={{ borderRadius: 6 }}
              >✕ Vazgeç</button>
            </>
          ) : (
            <span style={{ color: 'var(--text3)' }}>Yolu düzeltmek için çizgiye tıkla</span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/transport/RouteMap.jsx
git commit -m "feat(transport): render road-following routes with drag-edit mode"
```

### Task 4.2: `MapTab.jsx` — düzenleme modu entegrasyonu

**Files:**
- Modify: `frontend/src/modules/transport/tabs/MapTab.jsx`

- [ ] **Step 1: Dosyanın tamamını aşağıdaki içerikle değiştir**

```jsx
import { useState, useMemo, Suspense } from 'react'
import { lazyWithRetry as lazy } from '../../../shared/lazyWithRetry.js'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { pointsWithoutCoords } from '../logic/routeMap.js'
import { toast, toastErr } from '../shared.jsx'

const RouteMap = lazy(() => import('../RouteMap.jsx'))
const FALLBACK_COLOR = '#3b82f6'
const EDIT_ROLES = ['campus_manager', 'shift_supervisor']

export default function MapTab() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = !!user && EDIT_ROLES.includes(user.role)

  const { data: routes = [] } = useQuery({
    queryKey: ['transport-routes-map'],
    queryFn: () => api.get('/transport/routes?active=1&with_stops=1').then(r => r.data),
  })
  const { data: points = [] } = useQuery({
    queryKey: ['transport-points-map'],
    queryFn: () => api.get('/transport/pickup-points?active=1').then(r => r.data),
  })

  const [hiddenIds, setHiddenIds] = useState(() => new Set())
  const [selectedRouteId, setSelectedRouteId] = useState(null)
  const [editingRouteId, setEditingRouteId] = useState(null)

  const invalidateMap = () => {
    qc.invalidateQueries({ queryKey: ['transport-routes-map'] })
    qc.invalidateQueries({ queryKey: ['transport-points-map'] })
  }

  const moveStopMut = useMutation({
    mutationFn: ({ pickupPointId, lat, lng }) => api.put(`/transport/pickup-points/${pickupPointId}`, { lat, lng }),
    onSuccess: invalidateMap,
    onError: toastErr,
  })
  const reorderMut = useMutation({
    mutationFn: ({ routeId, stopIds }) => api.post(`/transport/routes/${routeId}/reorder-stops`, { stop_ids: stopIds }),
    onSuccess: invalidateMap,
    onError: toastErr,
  })
  const savePathMut = useMutation({
    mutationFn: ({ routeId, geometry }) => api.put(`/transport/routes/${routeId}/path`, { geometry }),
    onSuccess: () => { invalidateMap(); toast('Yol kaydedildi') },
    onError: toastErr,
  })
  const recomputeMut = useMutation({
    mutationFn: (routeId) => api.post(`/transport/routes/${routeId}/recompute-path`),
    onSuccess: () => { invalidateMap(); toast('Yol yeniden hesaplandı') },
    onError: toastErr,
  })

  const visibleRouteIds = useMemo(
    () => new Set(routes.filter(r => !hiddenIds.has(r.id)).map(r => r.id)),
    [routes, hiddenIds]
  )

  const noCoordCount = useMemo(() => pointsWithoutCoords(points).length, [points])

  function toggleRoute(id) {
    setHiddenIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleEdit(id) {
    setEditingRouteId(prev => prev === id ? null : id)
  }

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {/* Legend */}
      <div style={{ width: 240, flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
          ROTALAR ({routes.length})
        </div>
        {noCoordCount > 0 && (
          <div style={{ background: 'rgba(245,158,11,.12)', border: '1px solid #f59e0b', borderRadius: 8,
            padding: '6px 10px', marginBottom: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
            ⚠ {noCoordCount} durak konumsuz (haritada gösterilmiyor)
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {routes.map(r => {
            const isSel = selectedRouteId === r.id
            const isEditing = editingRouteId === r.id
            return (
              <div key={r.id} style={{
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
                    {r.vehicle_plate || '—'} · {r.stops?.length ?? 0} durak
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
            )
          })}
        </div>
        {editingRouteId != null && (
          <button
            type="button"
            onClick={() => recomputeMut.mutate(editingRouteId)}
            disabled={recomputeMut.isPending}
            className="btn btn-ghost btn-xs"
            style={{ borderRadius: 8, width: '100%', marginTop: 8 }}
          >↻ Otomatik yeniden hesapla</button>
        )}
      </div>

      {/* Harita */}
      <div style={{ flex: 1, minWidth: 320 }}>
        {routes.length === 0 && points.length === 0 ? (
          <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface2)', borderRadius: 12, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
            Gösterilecek rota veya durak yok
          </div>
        ) : (
          <Suspense fallback={
            <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface2)', borderRadius: 12, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
              Harita yükleniyor…
            </div>
          }>
            <RouteMap
              routes={routes}
              points={points}
              visibleRouteIds={visibleRouteIds}
              selectedRouteId={selectedRouteId}
              onSelectRoute={(id) => setSelectedRouteId(prev => prev === id ? null : id)}
              editingRouteId={editingRouteId}
              onMoveStop={(pickupPointId, lat, lng) => moveStopMut.mutate({ pickupPointId, lat, lng })}
              onReorderStop={(routeId, stopIds) => reorderMut.mutate({ routeId, stopIds })}
              onSaveManualPath={(routeId, geometry) => savePathMut.mutate({ routeId, geometry })}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/transport/tabs/MapTab.jsx
git commit -m "feat(transport): wire up map edit mode to mutations"
```

### Task 4.3: Rol-duyarlı düzenle butonu smoke testi

**Files:**
- Modify: `frontend/src/modules/transport/tabs/MapTab.smoke.test.jsx`

- [ ] **Step 1: Yeni describe bloğunu dosyanın sonuna ekle**

```jsx
// frontend/src/modules/transport/tabs/MapTab.smoke.test.jsx — dosyanın SONUNA ekle
describe('transport/MapTab smoke — düzenleme yetkisi', () => {
  afterEach(() => useAuthStore.setState({ user: null }))

  it('campus_manager için düzenle butonu görünür', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
    renderWithProviders(<MapTab />)
    expect(await screen.findByLabelText('Kozlu Hatti rotasını haritadan düzenle')).toBeInTheDocument()
  })

  it('yetkisiz rol için düzenle butonu görünmez', async () => {
    useAuthStore.setState({ user: { id: 2, role: 'laundry' } })
    renderWithProviders(<MapTab />)
    await screen.findByText('Kozlu Hatti')
    expect(screen.queryByLabelText('Kozlu Hatti rotasını haritadan düzenle')).not.toBeInTheDocument()
  })
})
```

Dosyanın en üstündeki import satırlarını genişlet:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'
```

- [ ] **Step 2: Testi çalıştır, geçmeli**

Run: `cd frontend && npx vitest run src/modules/transport/tabs/MapTab.smoke.test.jsx`
Expected: PASS (tüm testler, eskiler + yeniler).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/transport/tabs/MapTab.smoke.test.jsx
git commit -m "test(transport): cover role-gated map edit button"
```

---

## Faz 5 — Tam suite doğrulama + push/deploy

- [ ] **Step 1: Backend tam suite**

Run: `cd backend && npx vitest run`
Expected: PASS (tüm testler).

- [ ] **Step 2: Frontend tam suite**

Run: `cd frontend && npx vitest run`
Expected: PASS (tüm testler).

- [ ] **Step 3: Frontend production build**

Run: `cd frontend && npm run build`
Expected: Hatasız tamamlanır.

- [ ] **Step 4: Dev sunucuda tarayıcıdan hızlı doğrulama**

`Servisler → Harita` sekmesini aç, en az bir rotanın gerçek yol çizgisiyle çizildiğini, `campus_manager` ile giriş yapınca "✎" butonunun göründüğünü, bir durağı sürükleyip taşıma/sıra değiştirme davranışının çalıştığını gözle doğrula.

- [ ] **Step 5: Push + deploy**

Mevcut oturum akışına uygun şekilde (bkz. `feedback_push_deploy_automation` hafızası) commit'leri push et, `scripts/deploy/pre-deploy-check.sh` + sunucu `update.sh` ile deploy et, health check + bundle hash ile doğrula.
