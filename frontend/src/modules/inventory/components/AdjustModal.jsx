import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from './Modal.jsx'

export default function AdjustModal({ item, onClose, onSave, isPending }) {
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [locationId, setLocationId] = useState('')
  const n = +delta

  const { data: locationStock = [] } = useQuery({
    queryKey: ['stock-by-location', item.id],
    queryFn: () => api.get(`/inventory/${item.id}/stock-by-location`).then(r => r.data),
    enabled: !!item.track_locations,
  })
  const { data: locations = [] } = useQuery({
    queryKey: ['inv-locations', false],
    queryFn: () => api.get('/inventory/locations?active=1').then(r => r.data),
    enabled: !!item.track_locations,
  })

  const fromQty = locationId ? (locationStock.find(s => s.location_id === +locationId)?.quantity || 0) : null
  const blocked = item.track_locations && !locationId
  const overdraw = item.track_locations && n < 0 && fromQty !== null && Math.abs(n) > fromQty

  return (
    <Modal onClose={onClose} title="STOK HAREKETI" sub={`${item.item_name} — Mevcut: ${item.quantity} ${item.unit}`} color="var(--green),var(--blue)">
      {item.track_locations && (
        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(52,152,219,.04)', borderRadius: 10, border: '1px solid rgba(52,152,219,.25)' }}>
          <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--blue)', letterSpacing: 1.5, display: 'block', marginBottom: 5 }}>📍 LOKASYON *</label>
          <select className="form-select" value={locationId} onChange={e => setLocationId(e.target.value)} style={{ borderRadius: 8, fontSize: 12 }}>
            <option value="">Seç...</option>
            {locations.map(l => {
              const stock = locationStock.find(s => s.location_id === l.id)?.quantity || 0
              return <option key={l.id} value={l.id}>{l.block ? `[${l.block}] ` : ''}{l.name} — {stock} {item.unit}</option>
            })}
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginBottom: '12px' }}>
        {[1, 5, 10, 25, 50, 100].map(v => (
          <button key={`p${v}`} onClick={() => setDelta(String(v))} style={{
            padding: '8px 4px', border: '1px solid var(--border)', borderRadius: '8px',
            background: delta === String(v) ? 'rgba(39,201,106,.1)' : 'var(--surface)',
            color: 'var(--green)', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)',
            cursor: 'pointer', transition: 'all .15s',
          }}>+{v}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '16px' }}>
        {[1, 5, 10, 25, 50].map(v => (
          <button key={`m${v}`} onClick={() => setDelta(String(-v))} style={{
            padding: '8px 4px', border: '1px solid var(--border)', borderRadius: '8px',
            background: delta === String(-v) ? 'rgba(231,76,60,.1)' : 'var(--surface)',
            color: 'var(--red)', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)',
            cursor: 'pointer', transition: 'all .15s',
          }}>-{v}</button>
        ))}
      </div>
      <input className="form-input" type="number" value={delta} onChange={e => setDelta(e.target.value)} placeholder="miktar" autoFocus
        style={{ fontSize: '24px', fontFamily: 'var(--display)', textAlign: 'center', letterSpacing: '3px', marginBottom: '6px', borderRadius: '10px' }} />
      {n !== 0 && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '12px', color: n > 0 ? 'var(--green)' : 'var(--red)', marginBottom: '12px', padding: '8px', background: n > 0 ? 'rgba(39,201,106,.05)' : 'rgba(231,76,60,.05)', borderRadius: '8px' }}>
          {item.quantity} {n > 0 ? '+' : ''}{n} = <strong>{item.quantity + n}</strong> {item.unit}
        </div>
      )}
      {overdraw && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)', marginBottom: 10 }}>
          ⚠ Bu lokasyonda yalnız {fromQty} {item.unit} var
        </div>
      )}
      <input className="form-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Aciklama..." style={{ marginBottom: '16px', borderRadius: '10px' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" style={{ flex: 1, borderRadius: '10px', padding: '12px' }}
          disabled={!n || (item.quantity + n < 0) || blocked || overdraw || isPending}
          onClick={() => onSave({ id: item.id, delta: n, reason, location_id: locationId || undefined })}>
          {isPending ? '...' : n > 0 ? `+${n} GIRIS` : `${n} CIKIS`}
        </button>
      </div>
    </Modal>
  )
}
