import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const overlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }
const hdr    = { padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 3, color: 'var(--text)', borderBottom: '1px solid var(--border)' }
const lbl    = { fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }
const cancel = { padding: '10px 20px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11 }

export default function LostModal({ item, onClose }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')

  const markLost = useMutation({
    mutationFn: () => laundryApi.lostItem(item.id, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
      onClose()
    },
  })

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        <div style={hdr}>
          <span>KAYIP İŞARETLE</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '4px 20px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
          {item.block} · {item.room_no} — {item.item_count} parça · {item.status}
        </div>
        <div style={{ padding: '16px 20px 0' }}>
          <div style={lbl}>Açıklama (opsiyonel)</div>
          <textarea
            autoFocus
            className="form-input"
            style={{ width: '100%', padding: '10px 14px', fontSize: 12, borderRadius: 8, resize: 'vertical', minHeight: 80 }}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Kayıp nedeni veya ek bilgi..."
          />
        </div>
        <div style={{ padding: '16px 20px 20px', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={cancel}>İptal</button>
          <button
            onClick={() => markLost.mutate()}
            disabled={markLost.isPending}
            style={{
              flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer',
              background: 'rgba(231,76,60,0.12)', color: 'var(--red)',
              border: '1px solid rgba(231,76,60,0.3)',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              opacity: markLost.isPending ? 0.6 : 1,
            }}
          >
            {markLost.isPending ? '...' : 'Kayıp İşaretle →'}
          </button>
        </div>
        {markLost.isError && (
          <div style={{ padding: '0 20px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
            {markLost.error?.response?.data?.error || 'Hata oluştu'}
          </div>
        )}
      </div>
    </div>
  )
}
