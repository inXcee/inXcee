import { computeRoadRoute } from './routing.js'
import { getWorkSite } from './workSite.js'
import * as q from './queries.js'

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
  coords.push(getWorkSite())
  return coords
}

// Job kuyrugu handler'i — durak/sira/konum degisince arka planda cagrilir.
// Basarisiz olursa (permanent isaretlenmemis) hata firlatir, mevcut retry/backoff devreye girer.
export async function recomputeRoutePathJob({ routeId }) {
  const waypoints = buildWaypoints(routeId)
  if (!waypoints) return { skipped: 'no_coords' }
  const geometry = await computeRoadRoute(waypoints)
  if (!geometry) throw new Error(`Rota ${routeId}: OSRM yol hesaplanamadi`)
  q.saveRoutePath(routeId, geometry)
  return { ok: true }
}

// "Otomatik yeniden hesapla" butonu icin senkron cagri — kullanici sonucu bekliyor.
export async function recomputeRoutePathSync(routeId) {
  const waypoints = buildWaypoints(routeId)
  if (!waypoints) return null
  const geometry = await computeRoadRoute(waypoints)
  if (!geometry) return null
  q.saveRoutePath(routeId, geometry)
  return geometry
}
