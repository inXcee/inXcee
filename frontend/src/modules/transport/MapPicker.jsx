import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap, Tooltip, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { REGIONS, REGION_CENTER, WORK_SITE } from './zonguldakBartin.js'

// Default marker icon fix (leaflet bundler issue)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function ClickToPlace({ onPick }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng) },
  })
  return null
}

function FlyTo({ pos }) {
  const map = useMap()
  useEffect(() => { if (pos) map.flyTo([pos.lat, pos.lng], 13, { duration: 0.6 }) }, [pos, map])
  return null
}

export default function MapPicker({ initialLat, initialLng, onChange, height = 320 }) {
  const [pos, setPos] = useState(initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null)
  const [flyTo, setFlyTo] = useState(null)
  const containerRef = useRef(null)

  const pick = (lat, lng) => {
    setPos({ lat, lng })
    onChange?.(lat, lng)
  }

  const center = pos ? [pos.lat, pos.lng] : [REGION_CENTER.lat, REGION_CENTER.lng]
  const zoom = pos ? 13 : REGION_CENTER.zoom

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', alignSelf: 'center', marginRight: 4 }}>HIZLI BÖLGE:</span>
        {REGIONS.map(r => (
          <button key={r.name} type="button"
            onClick={() => setFlyTo({ lat: r.lat, lng: r.lng })}
            style={{
              padding: '3px 7px', border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--surface2)', color: 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
            }}>{r.name}</button>
        ))}
      </div>

      <div style={{ height, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPick={pick} />
          <FlyTo pos={flyTo} />
          {pos && <Marker position={[pos.lat, pos.lng]} />}
          {/* İş yeri referansı — her zaman görünür */}
          <Marker position={[WORK_SITE.lat, WORK_SITE.lng]} icon={workSiteIcon()}>
            <Tooltip direction="top" offset={[0, -16]}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700 }}>🏭 {WORK_SITE.name}</div>
            </Tooltip>
          </Marker>
        </MapContainer>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
        <span>{pos ? `📍 ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : 'Haritaya tıklayın'}</span>
        {pos && (
          <a href={`https://www.google.com/maps?q=${pos.lat},${pos.lng}`} target="_blank" rel="noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            ↗ Google Maps
          </a>
        )}
      </div>
    </div>
  )
}

// Numaralı durak ikonu (1, 2, 3…)
function stopIcon(num, color = '#3b82f6') {
  return L.divIcon({
    html: `<div style="
      background:${color};color:#fff;width:30px;height:30px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
      border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);font-family:monospace;font-weight:700;font-size:13px;
    "><span style="transform:rotate(45deg)">${num}</span></div>`,
    className: 'custom-stop-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 28],
  })
}

// İş yeri (Filyos) hedef ikonu — bayrak benzeri
function workSiteIcon() {
  return L.divIcon({
    html: `<div style="position:relative;width:36px;height:36px">
      <div style="
        background:#dc2626;color:#fff;width:34px;height:34px;border-radius:8px;
        display:flex;align-items:center;justify-content:center;
        border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.5);font-size:18px;
      ">🏭</div>
    </div>`,
    className: 'custom-work-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })
}

function FitBounds({ positions }) {
  const map = useMap()
  useEffect(() => {
    if (!positions || positions.length < 2) return
    const bounds = L.latLngBounds(positions.map(p => [p.lat, p.lng]))
    map.fitBounds(bounds, { padding: [30, 30] })
  }, [positions, map])
  return null
}

// OSRM'den gerçek yol rotası (driving) — başarısızsa düz çizgi fallback
function useRoadRoute(waypoints) {
  const [geometry, setGeometry] = useState(null)
  const [loading, setLoading] = useState(false)
  const key = waypoints.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')

  useEffect(() => {
    if (waypoints.length < 2) { setGeometry(null); return }
    setLoading(true)
    const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';')
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.routes?.[0]?.geometry?.coordinates) {
          // GeoJSON [lng,lat] → leaflet [lat,lng]
          setGeometry({
            coords: data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]),
            distance: data.routes[0].distance,
            duration: data.routes[0].duration,
          })
        } else setGeometry(null)
      })
      .catch(() => setGeometry(null))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { geometry, loading }
}

function RoadPolyline({ waypoints, color }) {
  const { geometry, loading } = useRoadRoute(waypoints)
  if (geometry) {
    return (
      <>
        <Polyline positions={geometry.coords} pathOptions={{ color: '#000', weight: 7, opacity: 0.25 }} />
        <Polyline positions={geometry.coords} pathOptions={{ color, weight: 4, opacity: 0.95 }} />
      </>
    )
  }
  // Fallback: düz çizgi (OSRM ulaşılmazsa)
  return (
    <Polyline positions={waypoints.map(p => [p.lat, p.lng])} pathOptions={{ color, weight: 3, opacity: 0.6, dashArray: '6 6' }} />
  )
}

// Navigasyon görünümlü rota haritası
export function RouteMap({ stops, routeColor = '#3b82f6', height = 360 }) {
  const positions = useMemo(
    () => stops.filter(s => s.lat != null && s.lng != null).map(s => ({
      id: s.id, lat: +s.lat, lng: +s.lng,
      name: s.point_name || s.name,
      district: s.district,
      time: s.scheduled_time,
    })),
    [stops],
  )
  // Tüm waypoints: stoplar + iş yeri sonda
  const waypoints = useMemo(() => [...positions, { id: 'work', lat: WORK_SITE.lat, lng: WORK_SITE.lng, name: WORK_SITE.name }], [positions])
  const { geometry } = useRoadRoute(positions.length > 0 ? waypoints : [])

  if (positions.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--surface2)', borderRadius: 10 }}>
        <div style={{ marginBottom: 8 }}>Bu rotada henüz haritalı durak yok</div>
        <div style={{ fontSize: 9, color: 'var(--text4)' }}>Duraklara koordinat eklendiğinde navigasyon çizilir</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ height, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <MapContainer center={[positions[0].lat, positions[0].lng]} zoom={10} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
          <FitBounds positions={waypoints} />

          {/* Rota çizgisi (OSRM yol rotası) */}
          <RoadPolyline waypoints={waypoints} color={routeColor} />

          {/* Numaralı duraklar */}
          {positions.map((p, idx) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={stopIcon(idx + 1, routeColor)}>
              <Tooltip permanent={false} direction="top" offset={[0, -28]}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                  <strong>{idx + 1}. {p.name}</strong>
                  {p.district && <div style={{ color: '#666' }}>{p.district}</div>}
                  {p.time && <div style={{ color: '#0066cc' }}>⏱ {p.time}</div>}
                </div>
              </Tooltip>
            </Marker>
          ))}

          {/* İş yeri — Filyos */}
          <Marker position={[WORK_SITE.lat, WORK_SITE.lng]} icon={workSiteIcon()}>
            <Tooltip permanent direction="top" offset={[0, -16]}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>
                🏭 {WORK_SITE.name}
              </div>
            </Tooltip>
          </Marker>
        </MapContainer>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
        <span>
          📍 {positions.length} durak → 🏭 Filyos
          {geometry && ` · 🛣 ${(geometry.distance / 1000).toFixed(1)} km · ⏱ ${Math.round(geometry.duration / 60)} dk`}
        </span>
        <a href={`https://www.google.com/maps/dir/${positions.map(p => `${p.lat},${p.lng}`).join('/')}/${WORK_SITE.lat},${WORK_SITE.lng}`}
          target="_blank" rel="noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          ↗ Google Maps'te Aç
        </a>
      </div>
    </div>
  )
}
