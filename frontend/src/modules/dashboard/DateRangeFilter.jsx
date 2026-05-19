import { useState, useRef, useEffect } from 'react'
import { useDateRange } from './useDateRange.js'
import { MAX_DAYS } from './dateRange.js'

const PRESETS = ['7', '30', '90']

export default function DateRangeFilter() {
  const { range, isCustom, label, setRange, setCustom } = useDateRange()
  const [open, setOpen] = useState(false)
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const wrapperRef = useRef(null)

  useEffect(() => {
    function onDocClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const validation = (() => {
    if (!fromInput || !toInput) return { ok: false, msg: 'İki tarih de gerekli' }
    if (fromInput > toInput) return { ok: false, msg: 'Bitiş başlangıçtan önce olamaz' }
    const days = Math.ceil((new Date(toInput) - new Date(fromInput)) / 86400000) + 1
    if (days > MAX_DAYS) return { ok: false, msg: `Maksimum ${MAX_DAYS} gün` }
    return { ok: true, msg: '' }
  })()

  const apply = () => {
    if (!validation.ok) return
    setCustom(fromInput, toInput)
    setOpen(false)
  }

  const chipStyle = (active) => ({
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: active ? 'var(--text)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--text2)',
    fontFamily: 'var(--sans)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background .15s, color .15s',
  })

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' }}>
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setRange(p)}
          style={chipStyle(!isCustom && range === p)}
          aria-label={`Son ${p} gün`}
        >
          {p} gün
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={chipStyle(isCustom)}
        aria-label="Özel aralık"
      >
        {isCustom ? label : 'Özel ▾'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '12px', minWidth: '260px', zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,.3)',
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 500 }}>
            Özel aralık
          </div>
          <input
            type="date"
            className="form-input"
            value={fromInput}
            max={toInput || undefined}
            onChange={(e) => setFromInput(e.target.value)}
            style={{ fontSize: '12px' }}
          />
          <input
            type="date"
            className="form-input"
            value={toInput}
            min={fromInput || undefined}
            onChange={(e) => setToInput(e.target.value)}
            style={{ fontSize: '12px' }}
          />
          {!validation.ok && (fromInput || toInput) && (
            <div style={{ fontSize: '11px', color: 'var(--red)' }}>
              {validation.msg}
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(false)}>
              İPTAL
            </button>
            <button type="button" className="btn btn-primary btn-xs" onClick={apply} disabled={!validation.ok}>
              UYGULA
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
