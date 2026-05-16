import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from './Modal.jsx'

export default function TransferModal({ item, onClose }) {
  const qc = useQueryClient()
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')

  const { data: locations = [] } = useQuery({
    queryKey: ['inv-locations', false],
    queryFn: () => api.get('/inventory/locations?active=1').then(r => r.data),
  })
  const { data: stock = [] } = useQuery({
    queryKey: ['stock-by-location', item.id],
    queryFn: () => api.get(`/inventory/${item.id}/stock-by-location`).then(r => r.data),
  })

  const stockMap = Object.fromEntries(stock.map(s => [s.location_id, s.quantity]))
  const fromStock = fromId ? (stockMap[+fromId] || 0) : 0

  const mut = useMutation({
    mutationFn: () => api.post('/inventory/locations/transfer', {
      item_id: item.id,
      from_location_id: +fromId,
      to_location_id: +toId,
      quantity: +qty,
      reason: reason || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['stock-by-location'] })
      qc.invalidateQueries({ queryKey: ['inv-recent-moves'] })
      onClose()
    },
  })

  return (
    <Modal onClose={onClose} title="LOKASYON TRANSFER" sub={item.item_name} color="var(--blue),var(--purple)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label className="form-label">Kaynak Lokasyon *</label>
          <select className="form-select" value={fromId} onChange={e => setFromId(e.target.value)} style={{ borderRadius: 10 }}>
            <option value="">Seç...</option>
            {stock.filter(s => s.quantity > 0 && s.is_active).map(s => (
              <option key={s.location_id} value={s.location_id}>
                {s.block ? `[${s.block}] ` : ''}{s.name} — {s.quantity} {item.unit}
              </option>
            ))}
          </select>
          {stock.filter(s => s.quantity > 0).length === 0 && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', marginTop: 4 }}>
              Hiçbir lokasyonda stok yok
            </div>
          )}
        </div>

        <div>
          <label className="form-label">Hedef Lokasyon *</label>
          <select className="form-select" value={toId} onChange={e => setToId(e.target.value)} style={{ borderRadius: 10 }}>
            <option value="">Seç...</option>
            {locations.filter(l => String(l.id) !== fromId).map(l => (
              <option key={l.id} value={l.id}>
                {l.block ? `[${l.block}] ` : ''}{l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label">Miktar * {fromId && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>· max {fromStock} {item.unit}</span>}</label>
          <input className="form-input" type="number" min="0" max={fromStock} step="any" value={qty}
            onChange={e => setQty(e.target.value)}
            style={{ borderRadius: 10, fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', textAlign: 'center' }} />
        </div>

        <div>
          <label className="form-label">Sebep / Not</label>
          <input className="form-input" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Opsiyonel" style={{ borderRadius: 10 }} />
        </div>
      </div>

      {mut.isError && <div className="alert alert-danger" style={{ marginTop: 10, borderRadius: 10 }}>
        <span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span>
      </div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: 10 }}>İPTAL</button>
        <button className="btn btn-primary"
          disabled={!fromId || !toId || !qty || +qty <= 0 || +qty > fromStock || mut.isPending}
          onClick={() => mut.mutate()} style={{ borderRadius: 10 }}>
          {mut.isPending ? '...' : 'TRANSFER'}
        </button>
      </div>
    </Modal>
  )
}
