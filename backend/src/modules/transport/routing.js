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
