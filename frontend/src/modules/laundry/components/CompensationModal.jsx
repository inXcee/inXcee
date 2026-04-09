import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
}
const panel = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 14, width: '100%', maxWidth: 380,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
}
const hdr = {
  padding: '18px 20px 12px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 3,
  color: 'var(--text)', borderBottom: '1px solid var(--border)',
}
const lbl = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
  letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8,
}

export default function CompensationModal({ item, onClose }) {
  const qc = useQueryClient()
  const [value, setValue] = useState(item.compensation_value ?? '')
  const [note, setNote] = useState(item.compensation_note ?? '')

  const parsed = parseFloat(value)
  const isValid = value !== '' && !isNaN(parsed) && isFinite(parsed) && parsed >= 0

  const save = useMutation({
    mutationFn: () => laundryApi.setCompensation(item.id, {
      value: parsed,
      note: note.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-archive'] })
      onClose()
    },
  })

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        <div style={hdr}>
          <span>TAZMİNAT GİRİŞİ</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ padding: '8px 20px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
          {item.block} · {item.room_no} — {item.item_count} parça
        </div>

        <div style={{ padding: '16px 20px 0' }}>
          <div style={lbl}>Tahmini Değer (TL) *</div>
          <input
            autoFocus
            type="number"
            min="0"
            step="0.01"
            className="form-input"
            style={{ width: '100%', padding: '10px 14px', fontSize: 13, borderRadius: 8 }}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div style={{ padding: '12px 20px 0' }}>
          <div style={lbl}>Not (opsiyonel)</div>
          <textarea
            className="form-input"
            style={{ width: '100%', padding: '10px 14px', fontSize: 12, borderRadius: 8, resize: 'vertical', minHeight: 60 }}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Sakin beyanı, tahmini marka değeri..."
          />
        </div>

        <div style={{ padding: '16px 20px 20px', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11,
          }}>İptal</button>
          <button
            onClick={() => save.mutate()}
            disabled={!isValid || save.isPending}
            style={{
              flex: 1, padding: 10, borderRadius: 8, cursor: (!isValid || save.isPending) ? 'not-allowed' : 'pointer',
              background: isValid ? 'rgba(39,201,106,0.12)' : 'var(--surface2)',
              color: isValid ? 'var(--green)' : 'var(--text4)',
              border: `1px solid ${isValid ? 'rgba(39,201,106,0.3)' : 'var(--border)'}`,
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              opacity: save.isPending ? 0.6 : 1,
            }}
          >
            {save.isPending ? '...' : 'Kaydet →'}
          </button>
        </div>

        {save.isError && (
          <div style={{ padding: '0 20px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
            {save.error?.response?.data?.error || 'Hata oluştu'}
          </div>
        )}
      </div>
    </div>
  )
}
