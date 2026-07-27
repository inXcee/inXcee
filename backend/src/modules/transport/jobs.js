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
