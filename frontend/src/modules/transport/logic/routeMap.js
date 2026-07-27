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
