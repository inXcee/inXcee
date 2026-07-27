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
                // Elle bukme her zaman KABA (durak+isyeri) cizgiden baslar — ince OSRM
                // egrisinin yuzlerce noktasi degil, yoksa her segment arasina bir hayalet
                // nokta koyunca ekran kullanilamaz hale gelir (bkz. spec: "kaba nokta dizisi").
                click: () => setManualDraft(buildRoutePolyline(editingRoute, WORK_SITE)),
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
