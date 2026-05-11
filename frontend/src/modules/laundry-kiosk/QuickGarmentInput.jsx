import { useState, useRef, useEffect } from 'react'
import GarmentPicker from './GarmentPicker.jsx'

const DEFAULT_GARMENT = {
  count: 1,
  colors: [{ key: 'white', label: 'Beyaz' }],
  pattern: 'solid',
  pattern_label: 'Düz',
}

// Props:
//   garmentTypes: [{id, name, emoji, image_url}]
//   value: { mode: 'structured' | 'freetext', garments: [...], freeText: '', itemCount: 0 }
//   onChange: (next) => void  // partial update
export default function QuickGarmentInput({ garmentTypes = [], value, onChange }) {
  const mode = value?.mode || 'structured'
  const garments = value?.garments || []
  const freeText = value?.freeText || ''
  const itemCount = value?.itemCount || 0

  const [query, setQuery] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const [editIdx, setEditIdx] = useState(null)
  const inputRef = useRef(null)

  // Filter suggestions by query
  const suggestions = query.trim().length > 0
    ? garmentTypes.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
    : []
  const exactMatch = suggestions.find(s => s.name.toLowerCase() === query.toLowerCase().trim())

  useEffect(() => {
    setFocusIdx(0)
  }, [query])

  function addGarment(type) {
    const entry = {
      type_id: type.id,
      type_name: type.name,
      emoji: type.emoji || '👔',
      ...DEFAULT_GARMENT,
    }
    onChange({ ...value, mode: 'structured', garments: [...garments, entry] })
    setQuery('')
    inputRef.current?.focus()
  }

  function addCustom() {
    const name = query.trim()
    if (!name) return
    addGarment({ id: null, name, emoji: '👕' })
  }

  function handleKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions.length > 0) {
        addGarment(suggestions[focusIdx] || suggestions[0])
      } else if (query.trim().length > 0) {
        addCustom()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      setQuery('')
    }
  }

  function removeGarment(i) {
    onChange({ ...value, garments: garments.filter((_, idx) => idx !== i) })
    if (editIdx === i) setEditIdx(null)
  }

  function toggleMode() {
    const targetMode = mode === 'structured' ? 'freetext' : 'structured'
    // Confirmation if data exists
    if (mode === 'structured' && garments.length > 0) {
      if (!window.confirm(`Eklenmiş ${garments.length} kıyafet kaybolacak. Devam?`)) return
    }
    if (mode === 'freetext' && freeText.trim().length > 0) {
      if (!window.confirm('Yazılan metin kaybolacak. Devam?')) return
    }
    onChange({ ...value, mode: targetMode, garments: [], freeText: '', itemCount: 0 })
    setQuery('')
    setEditIdx(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Mode toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={mode === 'freetext'} onChange={toggleMode} style={{ width: 16, height: 16 }} />
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Hepsini metin olarak yaz</span>
      </label>

      {mode === 'structured' && (
        <>
          {/* Search input */}
          <div style={{ position: 'relative' }}>
            <input ref={inputRef} type="text" autoFocus value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Kıyafet tipi yaz veya öneriden seç…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#1e293b', border: '1px solid #334155',
                borderRadius: 10, padding: '12px 14px',
                color: '#f1f5f9', fontSize: 14, outline: 'none',
              }} />

            {/* Suggestion dropdown */}
            {query.trim().length > 0 && (
              <div style={{
                marginTop: 4, background: '#0f172a', borderRadius: 10,
                border: '1px solid #334155', maxHeight: 240, overflowY: 'auto',
              }}>
                {suggestions.map((s, i) => (
                  <button key={s.id} type="button" onClick={() => addGarment(s)}
                    onMouseEnter={() => setFocusIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 14px', background: i === focusIdx ? '#1e293b' : 'transparent',
                      border: 'none', borderBottom: '1px solid #1e293b', color: '#e2e8f0',
                      cursor: 'pointer', fontSize: 14, textAlign: 'left',
                    }}>
                    <span style={{ fontSize: 18 }}>{s.emoji || '👔'}</span>
                    <span>{s.name}</span>
                  </button>
                ))}
                {!exactMatch && query.trim().length > 0 && (
                  <button type="button" onClick={addCustom}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 14px', background: 'transparent',
                      border: 'none', color: '#60a5fa',
                      cursor: 'pointer', fontSize: 13, fontStyle: 'italic', textAlign: 'left',
                    }}>
                    <span>+</span><span>"{query.trim()}" olarak ekle</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Added garments list */}
          {garments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>
                EKLENEN KIYAFETLER ({garments.length})
              </div>
              {garments.map((g, i) => (
                <div key={i} style={{
                  background: '#1e293b', borderRadius: 10, padding: '10px 12px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                      {g.emoji || '👔'} {g.type_name} × {g.count}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {(g.colors || []).map(c => c.label).join(', ') || '—'}
                      {g.pattern && g.pattern !== 'solid' && g.pattern_label ? ` · ${g.pattern_label}` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => setEditIdx(editIdx === i ? null : i)}
                    style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }}>
                    ✏
                  </button>
                  <button type="button" onClick={() => removeGarment(i)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Inline editor */}
          {editIdx !== null && garments[editIdx] && (
            <div style={{ background: '#0b1220', borderRadius: 10, padding: 12, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>DÜZENLE</div>
              <GarmentPicker
                garmentTypes={garmentTypes}
                value={[garments[editIdx]]}
                onChange={(next) => {
                  // Replace at editIdx with updated entry (next is array of 1)
                  if (next.length > 0) {
                    const updated = [...garments]
                    updated[editIdx] = next[0]
                    onChange({ ...value, garments: updated })
                  }
                  setEditIdx(null)
                }}
              />
            </div>
          )}
        </>
      )}

      {mode === 'freetext' && (
        <>
          <textarea value={freeText}
            onChange={e => onChange({ ...value, freeText: e.target.value })}
            placeholder="ör. 3 gömlek, 2 pantolon, 1 ceket…"
            rows={4}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 10, padding: '12px 14px',
              color: '#f1f5f9', fontSize: 14, outline: 'none', resize: 'vertical',
              fontFamily: 'inherit',
            }} />

          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>TOPLAM PARÇA</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1,2,3,4,5,6,7,8].map(n => (
                <button key={n} type="button" onClick={() => onChange({ ...value, itemCount: n })}
                  style={{
                    width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: itemCount === n ? '#1d4ed8' : '#1e293b',
                    color: itemCount === n ? '#fff' : '#64748b',
                    fontWeight: 700, fontSize: 15,
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
