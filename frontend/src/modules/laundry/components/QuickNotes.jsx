import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

// ── QuickNotes (Inline Panel — KPI altı) ─────────────────────────────────
export default function QuickNotes() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const timerRef = useRef(null)
  const flashRef = useRef(null)

  const { data: settings = {} } = useQuery({
    queryKey: ['laundry-settings'],
    queryFn: laundryApi.getLaundrySettings,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (settings.shared_notes !== undefined) setNotes(settings.shared_notes)
  }, [settings.shared_notes])

  const updateSetting = useMutation({
    mutationFn: ({ key, value }) => laundryApi.updateLaundrySetting(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-settings'] })
      setSavedFlash(true)
      if (flashRef.current) clearTimeout(flashRef.current)
      flashRef.current = setTimeout(() => setSavedFlash(false), 1500)
    },
  })

  const handleChange = (val) => {
    setNotes(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      updateSetting.mutate({ key: 'shared_notes', value: val })
    }, 500)
  }

  const lineCount = notes.split('\n').filter(l => l.trim()).length

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          height: 40, padding: '0 14px',
          background: 'linear-gradient(90deg,rgba(245,230,66,0.10),rgba(240,192,48,0.06))',
          border: '1px solid rgba(245,230,66,0.22)',
          borderLeft: '3px solid #c8a020',
          borderRadius: open ? '8px 8px 0 0' : 8,
          cursor: 'pointer', transition: 'border-radius 0.15s',
        }}
      >
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: '#c8a020', letterSpacing: 2 }}>
          📋 NOTLAR
        </span>
        {lineCount > 0 && (
          <span style={{
            background: 'rgba(200,160,32,0.18)', color: '#c8a020',
            fontFamily: 'var(--mono)', fontSize: 8, padding: '1px 7px',
            borderRadius: 4, letterSpacing: 1,
          }}>● {lineCount} satır</span>
        )}
        <span style={{
          marginLeft: 'auto', color: 'var(--text3)', fontSize: 10,
          transition: 'transform 0.2s', display: 'inline-block',
          transform: open ? 'rotate(180deg)' : '',
        }}>▼</span>
      </button>
      <div style={{
        background: 'linear-gradient(135deg,rgba(245,230,66,0.07),rgba(240,192,48,0.04))',
        border: open ? '1px solid rgba(245,230,66,0.18)' : 'none',
        borderTop: 'none', borderLeft: open ? '3px solid #c8a020' : 'none',
        borderRadius: '0 0 8px 8px', padding: open ? '8px 14px 10px' : '0 14px',
        maxHeight: open ? 200 : 0, overflow: 'hidden',
        transition: 'max-height 0.22s ease, padding 0.15s ease',
      }}>
        <textarea
          value={notes}
          onChange={e => handleChange(e.target.value)}
          placeholder="Kayıplar, özel talepler, acil notlar..."
          style={{
            width: '100%', height: 130, padding: 0,
            background: 'transparent', border: 'none', resize: 'none',
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
            lineHeight: 1.7, outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {notes.trim() ? (
            <button onClick={() => handleChange('')} style={{
              background: 'rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)',
              padding: '2px 8px', borderRadius: 4,
            }}>Temizle</button>
          ) : <span />}
          {savedFlash && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--green)' }}>✓ Kaydedildi</span>
          )}
        </div>
      </div>
    </div>
  )
}
