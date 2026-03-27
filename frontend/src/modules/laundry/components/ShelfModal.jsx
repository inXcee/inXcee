import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const overlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 360, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }
const hdr    = { padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 3, color: 'var(--text)', borderBottom: '1px solid var(--border)' }
const lbl    = { fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }
const cancel = { padding: '10px 20px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11 }

export default function ShelfModal({ item, onClose }) {
  const qc = useQueryClient()
  const [location, setLocation] = useState('')

  const advance = useMutation({
    mutationFn: () => laundryApi.advanceItem(item.id, { shelf_location: location }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
      onClose()
    },
  })

  const handleKey = e => {
    if (e.key === 'Enter') advance.mutate()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        <div style={hdr}>
          <span>RAFA KOY</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '4px 20px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
          {item.block} · {item.room_no} — {item.machine_name || 'makine'}
        </div>
        <div style={{ padding: '16px 20px 0' }}>
          <div style={lbl}>Raf Konumu</div>
          <input
            autoFocus
            className="form-input"
            style={{ width: '100%', padding: '10px 14px', fontSize: 13, borderRadius: 8 }}
            value={location}
            onChange={e => setLocation(e.target.value)}
            onKeyDown={handleKey}
            placeholder="örn: 2. Kat A-3"
          />
        </div>
        <div style={{ padding: '16px 20px 20px', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={cancel}>İptal</button>
          <button
            onClick={() => advance.mutate()}
            disabled={advance.isPending}
            style={{
              flex: 1, padding: 10, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#000',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              opacity: advance.isPending ? 0.6 : 1,
            }}
          >
            {advance.isPending ? '...' : 'Rafa Koy →'}
          </button>
        </div>
        {advance.isError && (
          <div style={{ padding: '0 20px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
            {advance.error?.response?.data?.error || 'Hata oluştu'}
          </div>
        )}
      </div>
    </div>
  )
}
