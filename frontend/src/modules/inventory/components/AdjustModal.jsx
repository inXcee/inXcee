import { useState } from 'react'
import Modal from './Modal.jsx'

export default function AdjustModal({ item, onClose, onSave, isPending }) {
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const n = +delta
  return (
    <Modal onClose={onClose} title="STOK HAREKETI" sub={`${item.item_name} — Mevcut: ${item.quantity} ${item.unit}`} color="var(--green),var(--blue)">
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
      <input className="form-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Aciklama..." style={{ marginBottom: '16px', borderRadius: '10px' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" style={{ flex: 1, borderRadius: '10px', padding: '12px' }} disabled={!n || (item.quantity + n < 0) || isPending}
          onClick={() => onSave({ id: item.id, delta: n, reason })}>
          {isPending ? '...' : n > 0 ? `+${n} GIRIS` : `${n} CIKIS`}
        </button>
      </div>
    </Modal>
  )
}
