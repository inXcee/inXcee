# Transport Rota/Durak Haritası Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transport modülüne, tüm aktif rotaları/durakları ve çalışma alanını tek Leaflet haritasında gösteren, rota seçici + vurgulamalı bir `HARİTA` sekmesi eklemek.

**Architecture:** Frontend-ağırlıklı. Backend'de tek geriye-uyumlu değişiklik (`listRoutes` withStops sorgusuna durak lat/lng). Harita mantığı saf fonksiyonlara (`logic/routeMap.js`) izole edilip test edilir; `RouteMap.jsx` lazy-load edilen "aptal" Leaflet görselleştiricisi; `tabs/MapTab.jsx` veri/state/legend orkestratörü.

**Tech Stack:** React, @tanstack/react-query, react-leaflet + leaflet (zaten kurulu, `MapPicker.jsx`'te kullanılıyor), vitest + @testing-library/react, backend better-sqlite3 + supertest.

---

## Dosya Yapısı

- **Modify** `backend/src/modules/transport/queries.js` — `listRoutes` withStops stop sorgusuna `pp.lat, pp.lng` ekle.
- **Modify** `backend/src/modules/transport/transport.test.js` — withStops çıktısında lat/lng döndüğü testi.
- **Create** `frontend/src/modules/transport/logic/routeMap.js` — saf harita yardımcıları.
- **Create** `frontend/src/modules/transport/logic/routeMap.test.js` — saf birim testler.
- **Create** `frontend/src/modules/transport/RouteMap.jsx` — izole Leaflet görselleştirici (lazy-load edilir).
- **Create** `frontend/src/modules/transport/tabs/MapTab.jsx` — sekme orkestratörü (veri + state + legend + RouteMap).
- **Create** `frontend/src/modules/transport/tabs/MapTab.smoke.test.jsx` — legend/uyarı/toggle smoke testi.
- **Modify** `frontend/src/modules/transport/TransportPage.jsx` — `HARİTA` sekmesi import + TABS + render.

API uçları (mevcut, değişmez):
- `GET /transport/routes?active=1&with_stops=1` → `[{ id, name, color, vehicle_plate, capacity, driver_name, stops:[{ id, sequence_order, scheduled_time, pickup_point_id, point_name, district, neighborhood, lat, lng, staff_count }] }]`
- `GET /transport/pickup-points?active=1` → `[{ id, name, district, neighborhood, lat, lng, staff_count, route_count, ... }]`

Sabitler: `zonguldakBartin.js` → `WORK_SITE = { name, short, lat, lng }`, `REGION_CENTER = { lat, lng, zoom }`.

---

## Task 1: Backend — withStops stop'larına lat/lng ekle

**Files:**
- Modify: `backend/src/modules/transport/queries.js` (listRoutes withStops, ~satır 101-109)
- Test: `backend/src/modules/transport/transport.test.js`

- [ ] **Step 1: Test yaz (failing)**

`transport.test.js` sonuna, mevcut `describe` bloklarının dışına ekle:

```js
describe('Transport — harita verisi', () => {
  it('withStops stop\'larda lat/lng dondurur', async () => {
    const res = await request(app).get('/api/transport/routes?active=1&with_stops=1')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const withStops = res.body.find(r => r.stops && r.stops.length > 0)
    // Seed'de en az bir rotanin duragi varsa lat/lng alanlari mevcut olmali
    if (withStops) {
      expect(withStops.stops[0]).toHaveProperty('lat')
      expect(withStops.stops[0]).toHaveProperty('lng')
    }
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js -t "lat/lng dondurur"`
Expected: FAIL — stop nesnesinde `lat`/`lng` property'leri yok (`toHaveProperty` başarısız) VEYA seed'de stop'lu rota varsa kesin fail.

- [ ] **Step 3: Sorguya lat/lng ekle**

`queries.js` içinde `listRoutes` fonksiyonundaki withStops bloğu, stop SELECT'ini güncelle:

```js
  if (withStops) {
    const stopsStmt = db.prepare(`
      SELECT rs.id, rs.route_id, rs.sequence_order, rs.scheduled_time,
        pp.id as pickup_point_id, pp.name as point_name, pp.district, pp.neighborhood,
        pp.lat, pp.lng,
        (SELECT COUNT(*) FROM staff WHERE pickup_point_id = pp.id AND is_active = 1) as staff_count
      FROM route_stops rs
      JOIN pickup_points pp ON pp.id = rs.pickup_point_id
      WHERE rs.route_id = ?
      ORDER BY rs.sequence_order, rs.id
    `)
    routes.forEach(r => { r.stops = stopsStmt.all(r.id) })
  }
```

(Tek değişiklik: `pp.neighborhood,` satırından sonra `pp.lat, pp.lng,` eklendi.)

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd backend && npx vitest run src/modules/transport/transport.test.js`
Expected: PASS (tüm transport testleri yeşil)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/transport/queries.js backend/src/modules/transport/transport.test.js
git commit -m "feat(transport): withStops sorgusuna durak lat/lng ekle (harita icin)"
```

---

## Task 2: Saf harita mantığı — logic/routeMap.js (TDD)

**Files:**
- Create: `frontend/src/modules/transport/logic/routeMap.js`
- Test: `frontend/src/modules/transport/logic/routeMap.test.js`

- [ ] **Step 1: Test yaz (failing)**

`frontend/src/modules/transport/logic/routeMap.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildRoutePolyline, pointsWithCoords, pointsWithoutCoords } from './routeMap.js'

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
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd frontend && npx vitest run src/modules/transport/logic/routeMap.test.js`
Expected: FAIL — `./routeMap.js` modülü yok ("Failed to resolve import").

- [ ] **Step 3: Saf fonksiyonları yaz**

`frontend/src/modules/transport/logic/routeMap.js`:

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
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd frontend && npx vitest run src/modules/transport/logic/routeMap.test.js`
Expected: PASS (5 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/transport/logic/routeMap.js frontend/src/modules/transport/logic/routeMap.test.js
git commit -m "feat(transport): harita saf mantik fonksiyonlari (routeMap logic)"
```

---

## Task 3: RouteMap.jsx — izole Leaflet görselleştirici

**Files:**
- Create: `frontend/src/modules/transport/RouteMap.jsx`

Bu bileşen lazy-load edilir ve jsdom'da smoke edilmez (mantık Task 2'de test edildi). Test adımı yok; kod adımı + manuel doğrulama.

- [ ] **Step 1: RouteMap bileşenini yaz**

`frontend/src/modules/transport/RouteMap.jsx`:

```jsx
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip, Popup, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { WORK_SITE, REGION_CENTER } from './zonguldakBartin.js'
import { buildRoutePolyline, pointsWithCoords } from './logic/routeMap.js'

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

// props:
//  routes: [{ id, name, color, vehicle_plate, capacity, driver_name, stops:[...] }]
//  points: tum aktif duraklar (lat/lng)
//  visibleRouteIds: Set<number> — gosterilecek rotalar
//  selectedRouteId: number | null — vurgulanan rota
//  onSelectRoute: (id) => void
export default function RouteMap({ routes, points, visibleRouteIds, selectedRouteId, onSelectRoute, height = 520 }) {
  return (
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

      {/* Rota cizgileri */}
      {routes.filter(r => visibleRouteIds.has(r.id)).map(r => {
        const line = buildRoutePolyline(r, WORK_SITE)
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
            </Popup>
          </Polyline>
        )
      })}

      {/* Durak marker'lari (koordinatli) */}
      {pointsWithCoords(points).map(p => (
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
  )
}
```

- [ ] **Step 2: Build kontrolü (import/sözdizimi)**

Run: `cd frontend && npx vite build 2>&1 | tail -3`
Expected: `✓ built in ...` — import hatası yok. (RouteMap henüz hiçbir yerden import edilmiyor; sadece derlenebilirlik kontrolü. Build temizse devam.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/transport/RouteMap.jsx
git commit -m "feat(transport): RouteMap Leaflet gorsellestiricisi (izole, lazy-load)"
```

---

## Task 4: MapTab.jsx — sekme orkestratörü + smoke test

**Files:**
- Create: `frontend/src/modules/transport/tabs/MapTab.jsx`
- Test: `frontend/src/modules/transport/tabs/MapTab.smoke.test.jsx`

- [ ] **Step 1: Smoke test yaz (failing)**

`frontend/src/modules/transport/tabs/MapTab.smoke.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

// RouteMap'i mock'la (Leaflet jsdom'da render edilmez)
vi.mock('../RouteMap.jsx', () => ({ default: () => <div data-testid="route-map" /> }))

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/routes')) return Promise.resolve({ data: [
        { id: 1, name: 'Kozlu Hatti', color: '#16a34a', vehicle_plate: '67 ABC 01', capacity: 16, driver_name: 'Ali', stops: [{ id: 1, sequence_order: 1, lat: 41.43, lng: 31.74 }] },
      ] })
      if (url.includes('/pickup-points')) return Promise.resolve({ data: [
        { id: 1, name: 'Kozlu Meydan', district: 'Kozlu', lat: 41.43, lng: 31.74, staff_count: 5, route_count: 1 },
        { id: 2, name: 'Konumsuz Durak', district: 'X', lat: null, lng: null, staff_count: 2, route_count: 0 },
      ] })
      return Promise.resolve({ data: [] })
    }),
  },
}))

import MapTab from './MapTab.jsx'

describe('transport/MapTab smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('legend rota adi + plaka render eder', async () => {
    renderWithProviders(<MapTab />)
    expect(await screen.findByText('Kozlu Hatti')).toBeInTheDocument()
    expect(screen.getByText(/67 ABC 01/)).toBeInTheDocument()
  })

  it('konumsuz durak uyarisini gosterir', async () => {
    renderWithProviders(<MapTab />)
    expect(await screen.findByText(/1 durak konumsuz/)).toBeInTheDocument()
  })

  it('rota gizle toggle\'i legend\'da calisir', async () => {
    renderWithProviders(<MapTab />)
    const toggle = await screen.findByLabelText('Kozlu Hatti rotasını gizle/göster')
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd frontend && npx vitest run src/modules/transport/tabs/MapTab.smoke.test.jsx`
Expected: FAIL — `./MapTab.jsx` yok.

- [ ] **Step 3: MapTab'i yaz**

`frontend/src/modules/transport/tabs/MapTab.jsx`:

```jsx
import { useState, useMemo, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { pointsWithoutCoords } from '../logic/routeMap.js'

const RouteMap = lazy(() => import('../RouteMap.jsx'))
const FALLBACK_COLOR = '#3b82f6'

export default function MapTab() {
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
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
                background: isSel ? 'var(--surface2)' : 'transparent', cursor: 'pointer',
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
              </div>
            )
          })}
        </div>
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
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd frontend && npx vitest run src/modules/transport/tabs/MapTab.smoke.test.jsx`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/transport/tabs/MapTab.jsx frontend/src/modules/transport/tabs/MapTab.smoke.test.jsx
git commit -m "feat(transport): MapTab orkestrator + legend + smoke test"
```

---

## Task 5: TransportPage'e HARİTA sekmesi bağla

**Files:**
- Modify: `frontend/src/modules/transport/TransportPage.jsx`

- [ ] **Step 1: Import + TABS + render ekle**

`TransportPage.jsx` üst import bloğuna ekle (diğer tab import'larının yanına):

```jsx
import MapTab from './tabs/MapTab.jsx'
```

`TABS` dizisine `reports`'tan sonra ekle:

```js
  { key: 'map', label: 'HARİTA', icon: '🗺' },
```

Render bloğuna `{tab === 'reports' && <ReportsTab />}` satırından sonra ekle:

```jsx
      {tab === 'map' && <MapTab />}
```

- [ ] **Step 2: Tüm transport testleri + build**

Run: `cd frontend && npx vitest run src/modules/transport/`
Expected: PASS (mevcut tab smoke testleri + yeni routeMap.test + MapTab.smoke)

Run: `cd frontend && npx vite build 2>&1 | tail -3`
Expected: `✓ built in ...`

- [ ] **Step 3: Manuel doğrulama**

`npm run dev` → Transport modülü → `HARİTA` sekmesi. Doğrula:
- Harita REGION_CENTER'da açılır, duraklar + rota çizgileri + FILYOS marker görünür.
- Legend'da rota tıkla → vurgulanır (diğerleri solar). Checkbox → gizler/gösterir.
- Durak/rota popup'ları doğru bilgi gösterir.
- Konumsuz durak varsa uyarı şeridi doğru sayıyı gösterir.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/transport/TransportPage.jsx
git commit -m "feat(transport): TransportPage'e HARITA sekmesi ekle"
```

---

## Notlar
- `routes[].color` null olabilir → `FALLBACK_COLOR` (#3b82f6) hem RouteMap hem MapTab'de kullanılır (tutarlı).
- Leaflet zaten `MapPicker.jsx` üzerinden bağımlılık; yeni paket kurulumu yok.
- e2e testi kapsam dışı (spec'te yok); manuel doğrulama yeterli.
- Deploy: tüm decomposition deploy'larındaki gibi `Scripts\deploy-yys.ps1` ile (kullanıcı onayıyla).
