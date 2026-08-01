import { useState } from 'react'
import { COLORS, PATTERNS } from './garmentPalette.js'
import { SIZE_OPTIONS } from './ironing.js'
import { garmentColors, tagPatch } from './garmentTag.js'

// Ütü/teslim sırasında parçanın künyesini görmek ve tamamlamak için.
// Operatör kıyafeti elinde tutarken etiketini okuyup marka/beden/renk giriyor;
// kaydedilen künye odanın dolabına da işleniyor (bir sonraki girişte hazır).
export default function GarmentTagEditor({ garment, brandSuggestions = [], onSave, onCancel }) {
  const [draft, setDraft] = useState(() => ({
    brand: garment.brand || '',
    model: garment.model || '',
    size: garment.size || '',
    pattern: garment.pattern || 'solid',
    condition_notes: garment.condition_notes || '',
    colors: garmentColors(garment),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const patch = (fields) => setDraft(current => ({ ...current, ...fields }))

  function toggleColor(color) {
    setDraft(current => {
      const exists = current.colors.some(item => item.key === color.key)
      if (exists) return { ...current, colors: current.colors.filter(item => item.key !== color.key) }
      // En fazla 3 renk — parça künyesi listeye değil özete sığmalı
      if (current.colors.length >= 3) return current
      return { ...current, colors: [...current.colors, { key: color.key, label: color.label }] }
    })
  }

  async function save() {
    const changes = tagPatch(draft, garment)
    if (Object.keys(changes).length === 0) {
      onCancel?.()
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(changes)
    } catch (requestError) {
      setError(requestError?.response?.data?.error || 'Künye kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={label}>Marka</label>
          <input
            list={`garment-brands-${garment.id}`}
            value={draft.brand}
            onChange={event => patch({ brand: event.target.value })}
            placeholder="ör. Lacoste"
            style={input}
          />
          {/* Daha önce girilmiş markalar — operatör baştan yazmasın */}
          <datalist id={`garment-brands-${garment.id}`}>
            {brandSuggestions.map(brand => <option key={brand} value={brand} />)}
          </datalist>
        </div>

        <div>
          <label style={label}>Model</label>
          <input value={draft.model} onChange={event => patch({ model: event.target.value })}
            placeholder="ör. Slim Fit" style={input} />
        </div>

        <div>
          <label style={label}>Beden</label>
          <div style={chipRow}>
            {SIZE_OPTIONS.map(size => (
              <button key={size} type="button"
                onClick={() => patch({ size: draft.size === size ? '' : size })}
                style={chip(draft.size === size)}>
                {size}
              </button>
            ))}
          </div>
          <input value={draft.size} onChange={event => patch({ size: event.target.value })}
            placeholder="veya sayısal beden — ör. 42" style={{ ...input, marginTop: 6 }} />
        </div>

        <div>
          <label style={label}>Renk {draft.colors.length > 0 && `(${draft.colors.length}/3)`}</label>
          <div style={chipRow}>
            {COLORS.map(color => {
              const selected = draft.colors.some(item => item.key === color.key)
              return (
                <button key={color.key} type="button" onClick={() => toggleColor(color)}
                  aria-pressed={selected} aria-label={`${color.label} rengi`}
                  style={{
                    ...chip(selected),
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    background: color.hex, border: '1px solid #475569',
                  }} />
                  {color.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label style={label}>Desen</label>
          <div style={chipRow}>
            {PATTERNS.map(pattern => (
              <button key={pattern.key} type="button"
                onClick={() => patch({ pattern: pattern.key })}
                style={chip(draft.pattern === pattern.key)}>
                {pattern.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={label}>Durum notu</label>
          <input value={draft.condition_notes}
            onChange={event => patch({ condition_notes: event.target.value })}
            placeholder="ör. yakasında leke var, düğmesi eksik" style={input} />
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancel} style={{ ...actionButton, background: '#1e293b', color: '#94a3b8' }}>
            Vazgeç
          </button>
          <button type="button" onClick={save} disabled={saving}
            style={{ ...actionButton, flex: 1, background: saving ? '#1e293b' : '#2563eb', color: saving ? '#475569' : '#fff' }}>
            {saving ? 'Kaydediliyor…' : '✓ Künyeyi Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

const box = {
  background: '#0b1220', border: '1px solid #3b82f6', borderRadius: 12,
  padding: 12, marginTop: 8,
}
const label = {
  display: 'block', fontSize: 10, color: '#64748b',
  letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase',
}
const input = {
  width: '100%', boxSizing: 'border-box', background: '#1e293b',
  border: '1px solid #334155', borderRadius: 9, padding: '9px 11px',
  color: '#f1f5f9', fontSize: 13, outline: 'none',
}
const chipRow = { display: 'flex', gap: 5, flexWrap: 'wrap' }
const chip = selected => ({
  minHeight: 38, padding: '0 11px', borderRadius: 9, cursor: 'pointer',
  border: `1px solid ${selected ? '#3b82f6' : '#334155'}`,
  background: selected ? 'rgba(29,78,216,0.22)' : '#1e293b',
  color: selected ? '#93c5fd' : '#94a3b8',
  fontSize: 12, fontWeight: 800,
})
const actionButton = {
  minHeight: 46, borderRadius: 11, border: 'none',
  fontSize: 14, fontWeight: 800, cursor: 'pointer',
}
