import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const overlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }
const hdr    = { padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 3, color: 'var(--text)', borderBottom: '1px solid var(--border)' }
const sec    = { padding: '14px 20px 0' }
const lbl    = { fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }
const ftr    = { padding: '14px 20px 20px', display: 'flex', gap: 8 }
const cancel = { padding: '10px 20px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11 }

const PRESETS = [30, 45, 60, 90]

export default function AssignModal({ item, machines, onClose }) {
  const qc = useQueryClient()
  const [machineId, setMachineId] = useState(null)
  const [preset, setPreset]       = useState(45)
  const [custom, setCustom]       = useState('')
  const [useCustom, setUseCustom] = useState(false)

  const timerMinutes = useCustom ? parseInt(custom) || 0 : preset

  const advance = useMutation({
    mutationFn: () => laundryApi.advanceItem(item.id, { machine_id: machineId, timer_minutes: timerMinutes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
      onClose()
    },
  })

  const canSubmit = machineId && timerMinutes > 0 && !advance.isPending

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>

        {/* Header */}
        <div style={hdr}>
          <span>MAKİNEYE AT</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '4px 20px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
          {item.block} · {item.room_no} — {item.item_count} parça
        </div>

        {/* Makine seçimi */}
        <div style={sec}>
          <div style={lbl}>Makine Seç</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {machines.length === 0 && (
              <div style={{ padding: 12, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
                Boş makine yok
              </div>
            )}
            {machines.map(m => {
              const idle = m.status === 'idle'
              const selected = machineId === m.id
              return (
                <button key={m.id}
                  onClick={() => idle && setMachineId(m.id)}
                  disabled={!idle}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 8, cursor: idle ? 'pointer' : 'not-allowed',
                    background: selected ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                    border: `1px solid ${selected ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                    opacity: idle ? 1 : 0.45, transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{m.name}</span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9,
                    color: idle ? 'var(--green)' : 'var(--red)',
                    background: idle ? 'rgba(16,185,129,0.1)' : 'rgba(231,76,60,0.1)',
                    padding: '2px 8px', borderRadius: 4,
                  }}>
                    {idle ? `boş · ${m.capacity_kg}kg` : m.status}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Süre seçimi */}
        <div style={sec}>
          <div style={lbl}>Süre</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(min => {
              const active = !useCustom && preset === min
              return (
                <button key={min}
                  onClick={() => { setPreset(min); setUseCustom(false) }}
                  style={{
                    padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                    background: active ? 'var(--accent)' : 'var(--surface2)',
                    color: active ? '#000' : 'var(--text2)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  {min}dk
                </button>
              )
            })}
            <input
              type="number" min="1" max="300" placeholder="Özel"
              value={custom}
              onClick={() => setUseCustom(true)}
              onChange={e => { setCustom(e.target.value); setUseCustom(true) }}
              style={{
                width: 72, padding: '7px 10px', borderRadius: 8,
                background: useCustom ? 'rgba(99,102,241,0.08)' : 'var(--surface2)',
                border: `1px solid ${useCustom ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={ftr}>
          <button onClick={onClose} style={cancel}>İptal</button>
          <button
            onClick={() => advance.mutate()}
            disabled={!canSubmit}
            style={{
              flex: 1, padding: 10, borderRadius: 8, border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit ? 'var(--accent)' : 'var(--surface2)',
              color: canSubmit ? '#000' : 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              transition: 'all 0.15s', opacity: advance.isPending ? 0.6 : 1,
            }}
          >
            {advance.isPending ? '...' : 'Makineye At →'}
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
