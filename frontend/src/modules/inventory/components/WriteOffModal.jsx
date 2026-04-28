import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from './Modal.jsx'

export default function WriteOffModal({ item, onClose }) {
  const qc = useQueryClient()
  const [type, setType] = useState('damage')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')

  const mut = useMutation({
    mutationFn: () => api.post(`/inventory/${item.id}/writeoff`, { type, quantity: +qty, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['inventory-stats'] })
      qc.invalidateQueries({ queryKey: ['inv-recent-moves'] })
      onClose()
    },
  })

  const isDamage = type === 'damage'

  return (
    <Modal onClose={onClose} title="HASARLI / KAYIP" sub={`${item.item_name} — Mevcut: ${item.quantity} ${item.unit}`} color="var(--red),var(--amber)">
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        <button onClick={() => setType('damage')} className={`btn btn-xs ${type === 'damage' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: type === 'damage' ? 'var(--amber)' : '', borderColor: type === 'damage' ? 'var(--amber)' : '' }}>HASARLI</button>
        <button onClick={() => setType('loss')} className={`btn btn-xs ${type === 'loss' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: type === 'loss' ? 'var(--red)' : '', borderColor: type === 'loss' ? 'var(--red)' : '' }}>KAYIP</button>
      </div>

      <input className="form-input" type="number" min="1" max={item.quantity} value={qty} onChange={e => setQty(e.target.value)}
        placeholder="Miktar" autoFocus
        style={{ fontSize: '24px', fontFamily: 'var(--display)', textAlign: 'center', letterSpacing: '3px', marginBottom: '12px', borderRadius: '10px' }} />

      <input className="form-input" value={reason} onChange={e => setReason(e.target.value)}
        placeholder={isDamage ? 'Hasar nedeni (zorunlu)' : 'Kayip aciklamasi (zorunlu)'}
        style={{ marginBottom: '14px', borderRadius: '10px' }} />

      {mut.isError && <div className="alert alert-danger" style={{ marginBottom: '10px', borderRadius: '10px' }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" disabled={!+qty || +qty > item.quantity || !reason || mut.isPending}
          onClick={() => mut.mutate()} style={{ flex: 1, borderRadius: '10px', padding: '12px', background: isDamage ? 'var(--amber)' : 'var(--red)', borderColor: isDamage ? 'var(--amber)' : 'var(--red)' }}>
          {mut.isPending ? '...' : `${qty || 0} ${item.unit} ${isDamage ? 'HASARLI' : 'KAYIP'} KAYDET`}
        </button>
      </div>
    </Modal>
  )
}
