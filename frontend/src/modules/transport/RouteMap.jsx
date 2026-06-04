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
