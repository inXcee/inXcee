import { useState } from 'react'
import { COLORS, PATTERNS } from './garmentPalette.js'
import { brandOptions, sizeGroupsWith } from './garmentOptions.js'
import { ironingDefaultFor, needsIroningReview } from './ironing.js'

const MAX_COLORS = 3

// Kıyafet kartına dokununca açılan ayrıntı paneli. Eskiden dokunuş sessizce
// adedi artırıyor, renk/desen ayrı bir "ayrıntılı giriş" katlanmışının içinde
// duruyordu — operatör oraya inmediği için parçalar renksiz kaydediliyordu.
// Artık varsayılan akış bu: renk, desen, marka ve beden tek ekranda,
// hepsi dokunmatik palet.
export default function GarmentDetailSheet({
  type, brandSuggestions = [], onAdd, onCancel, allowIroning = true,
}) {
  const [count, setCount] = useState(1)
  const [colors, setColors] = useState([])
  const [pattern, setPattern] = useState('solid')
  const [brand, setBrand] = useState('')
  const [size, setSize] = useState('')
  const [notes, setNotes] = useState('')
  const [requiresIroning, setRequiresIroning] = useState(() => allowIroning && ironingDefaultFor(type))

  const brands = brandOptions(brandSuggestions)
  const sizeGroups = sizeGroupsWith(size)
  const unsetPolicy = needsIroningReview(type)

  function toggleColor(color) {
    setColors(current => {
      if (current.some(item => item.key === color.key)) {
        return current.filter(item => item.key !== color.key)
      }
      if (current.length >= MAX_COLORS) return current
      return [...current, { key: color.key, label: color.label }]
    })
  }

  function submit() {
    const patternMeta = PATTERNS.find(item => item.key === pattern)
    onAdd({
      type_id: type.id ?? null,
      type_name: type.name,
      emoji: type.emoji || '👕',
      count,
      colors,
      pattern,
      pattern_label: patternMeta?.label || 'Düz',
      requires_ironing: allowIroning && requiresIroning,
      brand: brand.trim() || null,
      size: size.trim() || null,
      condition_notes: notes.trim() || null,
    })
  }

  return (
    <div style={sheet}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 28 }}>{type.emoji || '👕'}</span>
        <strong style={{ flex: 1, color: '#f1f5f9', fontSize: 16 }}>{type.name}</strong>
        <button type="button" onClick={onCancel} style={closeButton} aria-label="Kapat">✕</button>
      </div>

      <div>
        <div style={label}>Adet</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => setCount(value => Math.max(1, value - 1))} style={stepper}>−</button>
          <strong style={{ color: '#fff', fontSize: 26, minWidth: 44, textAlign: 'center' }}>{count}</strong>
          <button type="button" onClick={() => setCount(value => Math.min(99, value + 1))} style={stepper}>+</button>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[2, 3, 5, 10].map(quick => (
              <button key={quick} type="button" onClick={() => setCount(quick)}
                aria-label={`${quick} adet`} style={chip(count === quick)}>
                {quick}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div style={label}>Renk {colors.length > 0 && `(${colors.length}/${MAX_COLORS})`}</div>
        <div style={grid}>
          {COLORS.map(color => {
            const selected = colors.some(item => item.key === color.key)
            return (
              <button key={color.key} type="button" onClick={() => toggleColor(color)}
                aria-pressed={selected} aria-label={`${color.label} rengi`}
                style={{
                  ...swatchButton,
                  border: `2px solid ${selected ? '#3b82f6' : '#334155'}`,
                  background: selected ? 'rgba(29,78,216,0.22)' : '#1e293b',
                }}>
                <span style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: color.hex, border: '1px solid #475569',
                }} />
                <span style={{ fontSize: 10, color: selected ? '#93c5fd' : '#94a3b8', fontWeight: 700 }}>
                  {color.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div style={label}>Desen</div>
        <div style={grid}>
          {PATTERNS.map(item => {
            const selected = pattern === item.key
            return (
              <button key={item.key} type="button" onClick={() => setPattern(item.key)}
                aria-pressed={selected} aria-label={`${item.label} deseni`}
                style={{
                  ...swatchButton,
                  border: `2px solid ${selected ? '#3b82f6' : '#334155'}`,
                  background: selected ? 'rgba(29,78,216,0.22)' : '#1e293b',
                }}>
                <span style={{ width: 30, height: 22, borderRadius: 5, overflow: 'hidden', ...item.css }} />
                <span style={{ fontSize: 10, color: selected ? '#93c5fd' : '#94a3b8', fontWeight: 700 }}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div style={label}>Marka</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
          {brands.map(item => (
            <button key={item} type="button"
              onClick={() => setBrand(current => (current === item ? '' : item))}
              style={chip(brand === item)}>
              {item}
            </button>
          ))}
        </div>
        <input value={brand} onChange={event => setBrand(event.target.value)}
          placeholder="listede yoksa yazın" style={input} />
      </div>

      <div>
        <div style={label}>Beden</div>
        {sizeGroups.map(group => (
          <div key={group.key} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: '#475569', marginBottom: 4 }}>{group.label}</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {group.options.map(option => (
                <button key={option} type="button"
                  onClick={() => setSize(current => (current === option ? '' : option))}
                  style={chip(size === option)}>
                  {option}
                </button>
              ))}
            </div>
          </div>
        ))}
        <input value={size} onChange={event => setSize(event.target.value)}
          placeholder="veya serbest yazın — ör. 104 cm" style={input} />
      </div>

      <div>
        <div style={label}>Durum notu</div>
        <input value={notes} onChange={event => setNotes(event.target.value)}
          placeholder="ör. yakasında leke var" style={input} />
      </div>

      {allowIroning && <button type="button" onClick={() => setRequiresIroning(value => !value)}
        style={{
          ...chip(requiresIroning), minHeight: 44, justifyContent: 'center',
          color: requiresIroning ? '#c4b5fd' : '#94a3b8',
          borderColor: requiresIroning ? '#7c3aed' : '#334155',
        }}>
        {requiresIroning ? '♨️ Ütülenecek' : '↪️ Ütülenmeyecek'}
        {unsetPolicy && requiresIroning && ' · kontrol et'}
      </button>}

      <button type="button" onClick={submit} style={addButton}>
        ✓ {count} {type.name} Ekle
      </button>
    </div>
  )
}

const sheet = {
  display: 'flex', flexDirection: 'column', gap: 14,
  background: '#0b1220', border: '1px solid #3b82f6',
  borderRadius: 14, padding: 14, marginTop: 10,
}
const label = {
  fontSize: 10, color: '#64748b', letterSpacing: 1,
  marginBottom: 6, textTransform: 'uppercase', fontWeight: 800,
}
const grid = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 6,
}
const swatchButton = {
  minHeight: 66, borderRadius: 11, cursor: 'pointer',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: 5, padding: 4,
}
const chip = selected => ({
  display: 'inline-flex', alignItems: 'center',
  minHeight: 38, padding: '0 11px', borderRadius: 9, cursor: 'pointer',
  border: `1px solid ${selected ? '#3b82f6' : '#334155'}`,
  background: selected ? 'rgba(29,78,216,0.22)' : '#1e293b',
  color: selected ? '#93c5fd' : '#94a3b8',
  fontSize: 12, fontWeight: 800,
})
const stepper = {
  width: 48, height: 48, flexShrink: 0, borderRadius: 12,
  border: '1px solid #334155', background: '#1e293b',
  color: '#f8fafc', fontSize: 22, fontWeight: 900, cursor: 'pointer',
}
const input = {
  width: '100%', boxSizing: 'border-box', background: '#1e293b',
  border: '1px solid #334155', borderRadius: 9, padding: '10px 12px',
  color: '#f1f5f9', fontSize: 13, outline: 'none',
}
const closeButton = {
  width: 40, height: 40, borderRadius: 10, cursor: 'pointer',
  border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', fontSize: 15,
}
const addButton = {
  minHeight: 54, borderRadius: 12, border: 'none', cursor: 'pointer',
  background: '#2563eb', color: '#fff', fontSize: 15, fontWeight: 900,
}
