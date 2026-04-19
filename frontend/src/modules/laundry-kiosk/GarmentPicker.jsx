import { useState } from 'react'

const COLORS = [
  { key: 'white',   label: 'Beyaz',    hex: '#f8fafc', chipBg: '#f1f5f9', chipText: '#1e293b' },
  { key: 'black',   label: 'Siyah',    hex: '#0f172a', chipBg: '#1e293b', chipText: '#e2e8f0' },
  { key: 'gray',    label: 'Gri',      hex: '#94a3b8', chipBg: '#334155', chipText: '#e2e8f0' },
  { key: 'navy',    label: 'Lacivert', hex: '#1d4ed8', chipBg: '#1e3a5f', chipText: '#93c5fd' },
  { key: 'blue',    label: 'Mavi',     hex: '#3b82f6', chipBg: '#1e3a5f', chipText: '#93c5fd' },
  { key: 'red',     label: 'Kırmızı',  hex: '#dc2626', chipBg: '#7f1d1d', chipText: '#fca5a5' },
  { key: 'green',   label: 'Yeşil',    hex: '#16a34a', chipBg: '#14532d', chipText: '#86efac' },
  { key: 'yellow',  label: 'Sarı',     hex: '#ca8a04', chipBg: '#422006', chipText: '#fde68a' },
  { key: 'orange',  label: 'Turuncu',  hex: '#ea580c', chipBg: '#431407', chipText: '#fed7aa' },
  { key: 'purple',  label: 'Mor',      hex: '#7c3aed', chipBg: '#3b0764', chipText: '#ddd6fe' },
  { key: 'pink',    label: 'Pembe',    hex: '#db2777', chipBg: '#500724', chipText: '#fbcfe8' },
  { key: 'brown',   label: 'Kahve',    hex: '#92400e', chipBg: '#451a03', chipText: '#fed7aa' },
  { key: 'charcoal',label: 'Füme',     hex: '#4b5563', chipBg: '#1f2937', chipText: '#d1d5db' },
]

const PATTERNS = [
  { key: 'solid',     label: 'Düz',          css: { background: '#475569' } },
  { key: 'striped-h', label: 'Çizgili',       css: { backgroundImage: 'repeating-linear-gradient(0deg,#dc2626 0px,#dc2626 4px,#f8fafc 4px,#f8fafc 10px)' } },
  { key: 'striped-v', label: 'Dikey Çizgi',   css: { backgroundImage: 'repeating-linear-gradient(90deg,#1d4ed8 0px,#1d4ed8 4px,#f8fafc 4px,#f8fafc 10px)' } },
  { key: 'checked',   label: 'Kareli',        css: { backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 7px,rgba(148,163,184,0.4) 7px,rgba(148,163,184,0.4) 8px),repeating-linear-gradient(90deg,transparent,transparent 7px,rgba(148,163,184,0.4) 7px,rgba(148,163,184,0.4) 8px)', backgroundColor: '#1e3a5f' } },
  { key: 'plaid',     label: 'Ekose',         css: { backgroundImage: 'repeating-linear-gradient(0deg,rgba(220,38,38,.7),rgba(220,38,38,.7) 3px,transparent 3px,transparent 12px),repeating-linear-gradient(90deg,rgba(29,78,216,.7),rgba(29,78,216,.7) 3px,transparent 3px,transparent 12px),repeating-linear-gradient(0deg,rgba(22,163,74,.4),rgba(22,163,74,.4) 12px,transparent 12px,transparent 24px)', backgroundColor: '#f8fafc' } },
  { key: 'colorful',  label: 'Renkli/Baskı',  css: { background: 'conic-gradient(#7c3aed 0deg 60deg,#ec4899 60deg 120deg,#f59e0b 120deg 180deg,#10b981 180deg 240deg,#3b82f6 240deg 300deg,#ef4444 300deg 360deg)' } },
]

function PatternBox({ pattern, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
      ...pattern.css,
    }} />
  )
}

function ColorChip({ colorKey }) {
  const c = COLORS.find(x => x.key === colorKey)
  if (!c) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.chipBg, borderRadius: 20, padding: '3px 8px' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.hex, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ color: c.chipText, fontSize: 10 }}>{c.label}</span>
    </span>
  )
}

function PatternChip({ patternKey }) {
  const p = PATTERNS.find(x => x.key === patternKey)
  if (!p) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: '3px 8px' }}>
      <span style={{ width: 14, height: 10, borderRadius: 2, overflow: 'hidden', display: 'inline-block', flexShrink: 0, ...p.css }} />
      <span style={{ color: '#94a3b8', fontSize: 10 }}>{p.label}</span>
    </span>
  )
}

// garmentTypes: [{id, name, emoji, image_url}]
// value: [{type_id, type_name, emoji, count, color, color_label, pattern, pattern_label}]
// onChange: (newValue) => void
export default function GarmentPicker({ garmentTypes = [], value = [], onChange }) {
  const [selectedType, setSelectedType] = useState(null)
  const [selectedColor, setSelectedColor] = useState(null)
  const [selectedPattern, setSelectedPattern] = useState('solid')
  const [count, setCount] = useState(1)
  const [editIndex, setEditIndex] = useState(null)

  function selectType(type) {
    setSelectedType(type)
    setSelectedColor(null)
    setSelectedPattern('solid')
    setCount(1)
    setEditIndex(null)
  }

  function addGarment() {
    if (!selectedType) return
    const colorObj = COLORS.find(c => c.key === selectedColor)
    const patternObj = PATTERNS.find(p => p.key === selectedPattern)
    const entry = {
      type_id: selectedType.id,
      type_name: selectedType.name,
      emoji: selectedType.emoji,
      count,
      color: selectedColor || null,
      color_label: colorObj?.label || null,
      pattern: selectedPattern || null,
      pattern_label: patternObj?.label || null,
    }
    if (editIndex !== null) {
      onChange(value.map((g, i) => i === editIndex ? entry : g))
      setEditIndex(null)
    } else {
      onChange([...value, entry])
    }
    setSelectedType(null)
    setSelectedColor(null)
    setSelectedPattern('solid')
    setCount(1)
  }

  function removeGarment(i) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  function editGarment(i) {
    const g = value[i]
    const type = garmentTypes.find(t => t.id === g.type_id) || { id: g.type_id, name: g.type_name, emoji: g.emoji }
    setSelectedType(type)
    setSelectedColor(g.color || null)
    setSelectedPattern(g.pattern || 'solid')
    setCount(g.count)
    setEditIndex(i)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Kıyafet tipi grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {garmentTypes.map(type => (
          <button key={type.id} type="button" onClick={() => selectType(type)}
            style={{
              background: selectedType?.id === type.id ? '#1e3a5f' : '#1e293b',
              border: `2px solid ${selectedType?.id === type.id ? '#3b82f6' : 'transparent'}`,
              borderRadius: 12, padding: '12px 4px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minHeight: 72,
            }}>
            {type.image_url
              ? <img src={type.image_url} alt={type.name} style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4 }} />
              : <span style={{ fontSize: 28 }}>{type.emoji || '👔'}</span>
            }
            <span style={{ fontSize: 10, color: selectedType?.id === type.id ? '#93c5fd' : '#94a3b8', textAlign: 'center', lineHeight: 1.2 }}>
              {type.name}
            </span>
          </button>
        ))}
      </div>

      {/* Renk + Desen + Adet paneli */}
      {selectedType && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Renk paleti */}
          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>RENK</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {COLORS.map(c => (
                <button key={c.key} type="button" onClick={() => setSelectedColor(prev => prev === c.key ? null : c.key)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: c.hex,
                    border: `2px solid ${selectedColor === c.key ? '#38bdf8' : '#334155'}`,
                    outline: selectedColor === c.key ? '2px solid #38bdf8' : 'none',
                    outlineOffset: 2,
                  }} />
                  <span style={{ fontSize: 9, color: selectedColor === c.key ? '#38bdf8' : '#475569', textAlign: 'center', lineHeight: 1.2 }}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Desen seçici */}
          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>DESEN</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {PATTERNS.map(p => (
                <button key={p.key} type="button" onClick={() => setSelectedPattern(p.key)}
                  style={{
                    background: '#1e293b', borderRadius: 10, padding: '10px 6px', textAlign: 'center',
                    border: `2px solid ${selectedPattern === p.key ? '#3b82f6' : '#334155'}`,
                    cursor: 'pointer', outline: selectedPattern === p.key ? '2px solid #60a5fa' : 'none',
                    outlineOffset: 2,
                  }}>
                  <PatternBox pattern={p} size={40} />
                  <div style={{ fontSize: 10, color: selectedPattern === p.key ? '#60a5fa' : '#64748b', marginTop: 6, fontWeight: selectedPattern === p.key ? 700 : 400 }}>
                    {p.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Adet */}
          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>ADET</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" onClick={() => setCount(c => Math.max(1, c - 1))}
                style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#1e293b', color: '#e2e8f0', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>
                −
              </button>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', minWidth: 32, textAlign: 'center' }}>{count}</span>
              <button type="button" onClick={() => setCount(c => c + 1)}
                style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#1e293b', color: '#e2e8f0', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>
                +
              </button>
            </div>
          </div>

          <button type="button" onClick={addGarment}
            style={{ padding: '10px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {editIndex !== null ? '✓ Güncelle' : '+ Ekle'}
          </button>
        </div>
      )}

      {/* Eklenen kıyafet listesi */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>EKLENEN KIYAFETler ({value.length})</div>
          {value.map((g, i) => {
            const patternObj = PATTERNS.find(p => p.key === g.pattern) || PATTERNS[0]
            return (
              <div key={i} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <PatternBox pattern={patternObj} size={48} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                    {g.emoji || '👔'} {g.type_name} × {g.count}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {g.color && <ColorChip colorKey={g.color} />}
                    {g.pattern && g.pattern !== 'solid' && <PatternChip patternKey={g.pattern} />}
                  </div>
                </div>
                <button type="button" onClick={() => editGarment(i)}
                  style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✏</button>
                <button type="button" onClick={() => removeGarment(i)}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
