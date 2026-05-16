import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { REGIONS, REGION_CENTER } from './zonguldakBartin.js'

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

// Çoklu durağı haritada gösteren read-only view
export function RouteMap({ stops, routeColor = '#3b82f6', height = 360 }) {
  const positions = stops.filter(s => s.lat != null && s.lng != null).map(s => ({ id: s.id, lat: s.lat, lng: s.lng, name: s.point_name || s.name }))
  if (positions.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--surface2)', borderRadius: 10 }}>
        Bu rotada henüz harita koordinatlı durak yok
      </div>
    )
  }
  const center = [positions[0].lat, positions[0].lng]
  return (
    <div style={{ height, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
        {positions.map((p, idx) => (
          <Marker key={p.id} position={[p.lat, p.lng]}>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
