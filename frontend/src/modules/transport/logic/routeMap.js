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
