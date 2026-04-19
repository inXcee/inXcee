import { useState } from 'react'

const COLORS = ['Beyaz', 'Mavi', 'Siyah', 'Gri', 'Kırmızı', 'Yeşil', 'Sarı', 'Mor', 'Bej', 'Kahve']
const PATTERNS = ['Çizgili', 'Kareli', 'Desenli', 'Renkli']

const COLOR_BG = {
  'Beyaz': '#e2e8f0', 'Mavi': '#1d4ed8', 'Siyah': '#0f172a', 'Gri': '#475569',
  'Kırmızı': '#dc2626', 'Yeşil': '#15803d', 'Sarı': '#ca8a04', 'Mor': '#7c3aed',
  'Bej': '#d6b88a', 'Kahve': '#78350f',
}
const COLOR_TEXT = { 'Beyaz': '#1e293b', 'Bej': '#1e293b' }

// garmentTypes: [{id, name, emoji, image_url}]
// value: [{type_id, type_name, emoji, image_url, colors: [], count}]
// onChange: (newValue) => void
export default function GarmentPicker({ garmentTypes = [], value = [], onChange }) {
  const [selectedType, setSelectedType] = useState(null)
  const [selectedColors, setSelectedColors] = useState([])
  const [count, setCount] = useState(1)
  const [editIndex, setEditIndex] = useState(null)

  function selectType(type) {
    setSelectedType(type)
    setSelectedColors([])
    setCount(1)
    setEditIndex(null)
  }

  function toggleColor(c) {
    setSelectedColors(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  function addGarment() {
    if (!selectedType) return
    const entry = {
      type_id: selectedType.id,
      type_name: selectedType.name,
      emoji: selectedType.emoji,
      image_url: selectedType.image_url,
      colors: selectedColors,
      count,
    }
    if (editIndex !== null) {
      onChange(value.map((g, i) => i === editIndex ? entry : g))
      setEditIndex(null)
    } else {
      onChange([...value, entry])
    }
    setSelectedType(null)
    setSelectedColors([])
    setCount(1)
  }

  function removeGarment(i) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  function editGarment(i) {
    const g = value[i]
    const type = garmentTypes.find(t => t.id === g.type_id) || {
      id: g.type_id, name: g.type_name, emoji: g.emoji, image_url: g.image_url,
    }
    setSelectedType(type)
    setSelectedColors(g.colors || [])
    setCount(g.count)
    setEditIndex(i)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Emoji Grid */}
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

      {/* Renk + Adet paneli */}
      {selectedType && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', letterSpacing: 1 }}>RENK / DESEN</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => toggleColor(c)}
                style={{
                  padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: selectedColors.includes(c) ? (COLOR_BG[c] || c) : '#1e293b',
                  color: selectedColors.includes(c) ? (COLOR_TEXT[c] || '#fff') : '#64748b',
                  outline: selectedColors.includes(c) ? '2px solid #3b82f6' : 'none',
                }}>
                {c}
              </button>
            ))}
            {PATTERNS.map(p => (
              <button key={p} type="button" onClick={() => toggleColor(p)}
                style={{
                  padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: selectedColors.includes(p) ? '#4c1d95' : '#1e293b',
                  color: selectedColors.includes(p) ? '#c4b5fd' : '#64748b',
                  outline: selectedColors.includes(p) ? '2px solid #7c3aed' : 'none',
                }}>
                {p}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, color: '#94a3b8', letterSpacing: 1, marginTop: 2 }}>ADET</div>
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

          <button type="button" onClick={addGarment}
            style={{ padding: '10px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
            {editIndex !== null ? '✓ Güncelle' : '+ Ekle'}
          </button>
        </div>
      )}

      {/* Eklenen kıyafet listesi */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>EKLENEN KIYAFETler ({value.length})</div>
          {value.map((g, i) => (
            <div key={i} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {g.image_url
                ? <img src={g.image_url} alt={g.type_name} style={{ width: 24, height: 24, objectFit: 'contain' }} />
                : <span style={{ fontSize: 20 }}>{g.emoji || '👔'}</span>
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{g.type_name} × {g.count}</div>
                {g.colors?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {g.colors.map(c => (
                      <span key={c} style={{ fontSize: 10, background: '#0f172a', color: '#94a3b8', padding: '1px 6px', borderRadius: 4 }}>{c}</span>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => editGarment(i)}
                style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✏</button>
              <button type="button" onClick={() => removeGarment(i)}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
