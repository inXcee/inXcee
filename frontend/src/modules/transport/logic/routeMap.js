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

// Haritadan isimsiz durak eklenirse artan numarali ad uretir.
// "Yeni Durak" (numarasiz) 1 sayilir; en buyuk numaranin bir fazlasi kullanilir.
const AUTO_STOP_PREFIX = 'Yeni Durak'
const AUTO_STOP_RE = /^Yeni Durak(?:\s+(\d+))?$/

export function nextAutoStopName(existingNames = []) {
  let max = 0
  for (const name of existingNames) {
    const match = AUTO_STOP_RE.exec(String(name ?? '').trim())
    if (!match) continue
    const num = match[1] ? Number(match[1]) : 1
    if (num > max) max = num
  }
  return `${AUTO_STOP_PREFIX} ${max + 1}`
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
