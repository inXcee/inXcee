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
