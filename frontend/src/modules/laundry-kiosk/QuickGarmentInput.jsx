import { useState, useRef, useMemo } from 'react'
import GarmentPicker from './GarmentPicker.jsx'
import { parseGarmentLine } from './quickParse.js'

const EMPTY_VALUE = { garments: [], freeText: '', itemCount: 0 }

// Hybrid input — fotoğraflı grid + serbest yazı + hızlı-ekle aynı yerde.
// Hepsi bir arada kaydedilir; duruma göre en pratik olanı kullanılır.
//
// Props:
//   garmentTypes: [{id, name, emoji, image_url}]
//   value: { garments: [...], freeText: '', itemCount: 0 }
//   onChange: (next) => void
export default function QuickGarmentInput({ garmentTypes = [], value = EMPTY_VALUE, onChange }) {
  const garments = value.garments || []
  const freeText = value.freeText || ''
  const itemCount = value.itemCount || 0

  const [quickText, setQuickText] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const quickRef = useRef(null)

  // Çok-segmentli akıllı ayrıştırma: "3 gömlek mavi, 2 pantolon, çorap"
  const parsed = useMemo(() => parseGarmentLine(quickText, garmentTypes), [quickText, garmentTypes])
  // Zengin giriş mi? (adet/renk/desen/çoklu segment varsa parser devreye girer;
  // tek çıplak kelimede eski öneri-dropdown davranışı korunur)
  const isRich = parsed.length > 1 || (parsed.length === 1 && (
    parsed[0].count > 1 || parsed[0].colors.length > 0 || parsed[0].pattern !== 'solid'
  ))

  // Quick-add suggestions (parser devrede değilken)
  const suggestions = !isRich && quickText.trim().length > 0
    ? garmentTypes.filter(t => t.name.toLowerCase().includes(quickText.toLowerCase())).slice(0, 6)
    : []

  function addParsed() {
    if (parsed.length === 0) return
    onChange({ ...value, garments: [...garments, ...parsed] })
    setQuickText('')
    setFocusIdx(0)
    quickRef.current?.focus()
  }

  function addStructured(type) {
    const entry = {
      type_id: type.id,
      type_name: type.name,
      emoji: type.emoji || '👕',
      count: 1,
      colors: [],
      pattern: 'solid',
      pattern_label: 'Düz',
    }
    onChange({ ...value, garments: [...garments, entry] })
    setQuickText('')
    setFocusIdx(0)
    quickRef.current?.focus()
  }

  function addCustom() {
    const name = quickText.trim()
    if (!name) return
    addStructured({ id: null, name, emoji: '👕' })
  }

  function handleQuickKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (isRich) addParsed()
      else if (suggestions.length > 0) addStructured(suggestions[focusIdx] || suggestions[0])
      else if (parsed.length > 0) addParsed()
      else if (quickText.trim()) addCustom()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx(i => Math.max(i - 1, 0))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Fotoğraflı seçici — büyük grid + renk + desen + adet */}
      <GarmentPicker
        garmentTypes={garmentTypes}
        value={garments}
        onChange={(next) => onChange({ ...value, garments: next })}
      />

      {/* Yazıyla bölümü — hem hızlı ekleme hem not, aynı blokta */}
      <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>
          📝 YAZIYLA EKLE / NOT
        </div>

        {/* Hızlı satır: yaz + Enter → parça olarak ekle */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              ref={quickRef}
              type="text"
              value={quickText}
              onChange={e => setQuickText(e.target.value)}
              onKeyDown={handleQuickKey}
              placeholder="⚡ 3 gömlek mavi, 2 pantolon, çorap → Enter ile hepsi"
              style={{
                flex: 1, boxSizing: 'border-box',
                background: '#1e293b', border: `1px solid ${quickText.trim() ? '#3b82f6' : '#334155'}`,
                borderRadius: 10, padding: '10px 12px',
                color: '#f1f5f9', fontSize: 14, outline: 'none',
              }}
            />
            <button type="button"
              onClick={() => {
                if (isRich) addParsed()
                else if (suggestions[0]) addStructured(suggestions[0])
                else if (parsed.length > 0) addParsed()
                else addCustom()
              }}
              disabled={!quickText.trim()}
              style={{
                padding: '10px 14px', borderRadius: 10, border: 'none',
                background: quickText.trim() ? '#1d4ed8' : '#1e293b',
                color: quickText.trim() ? '#fff' : '#475569',
                fontWeight: 700, fontSize: 14, cursor: quickText.trim() ? 'pointer' : 'default',
              }}>
              + Ekle{isRich && parsed.length > 1 ? ` (${parsed.length})` : ''}
            </button>
          </div>

          {/* Canlı önizleme — ne ekleneceğini Enter'dan önce gösterir */}
          {isRich && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
              {parsed.map((g, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: g.type_id ? 'rgba(29,78,216,0.18)' : 'rgba(148,163,184,0.12)',
                  border: `1px solid ${g.type_id ? '#1d4ed8' : '#475569'}`,
                  borderRadius: 14, padding: '3px 9px', fontSize: 11,
                  color: g.type_id ? '#93c5fd' : '#cbd5e1',
                }}>
                  {g.count > 1 ? `${g.count}× ` : ''}{g.emoji} {g.type_name}
                  {g.colors.map(c => c.label).join('/') ? ` · ${g.colors.map(c => c.label).join('/')}` : ''}
                  {g.pattern !== 'solid' ? ` · ${g.pattern_label}` : ''}
                </span>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 5,
              background: '#0b1220', border: '1px solid #334155', borderRadius: 10,
              maxHeight: 220, overflowY: 'auto',
            }}>
              {suggestions.map((s, i) => (
                <button key={s.id || s.name} type="button" onClick={() => addStructured(s)}
                  onMouseEnter={() => setFocusIdx(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px 12px', background: i === focusIdx ? '#1e293b' : 'transparent',
                    border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                  }}>
                  <span style={{ fontSize: 18 }}>{s.emoji || '👕'}</span>
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Serbest not — her zaman görünür, her zaman kaydedilir */}
        <textarea
          value={freeText}
          onChange={e => onChange({ ...value, freeText: e.target.value })}
          placeholder="Serbest yaz — kelime hatası olsa da kaydedilir, sonra düzeltebilirsin…"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 10, padding: '10px 12px',
            color: '#f1f5f9', fontSize: 14, outline: 'none', resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />

        {/* Parça sayısı — sadece hiç parça eklenmemişse */}
        {garments.length === 0 && (
          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>
              TOPLAM PARÇA <span style={{ color: '#475569', textTransform: 'none', letterSpacing: 0 }}>(parça eklenmediyse)</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                <button key={n} type="button" onClick={() => onChange({ ...value, itemCount: n })}
                  style={{
                    width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: itemCount === n ? '#1d4ed8' : '#1e293b',
                    color: itemCount === n ? '#fff' : '#94a3b8',
                    fontWeight: 700, fontSize: 15,
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
