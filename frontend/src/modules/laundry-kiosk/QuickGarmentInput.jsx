import { useState, useRef, useMemo } from 'react'
import GarmentDetailSheet from './GarmentDetailSheet.jsx'
import { parseGarmentLine } from './quickParse.js'
import { ironingDefaultFor, needsIroningReview } from './ironing.js'
import { brandOptions, sizeGroupsWith } from './garmentOptions.js'
import { COLORS } from './garmentPalette.js'

const EMPTY_VALUE = { garments: [], freeText: '', itemCount: 0 }

// Hybrid input — fotoğraflı grid + serbest yazı + hızlı-ekle aynı yerde.
// Hepsi bir arada kaydedilir; duruma göre en pratik olanı kullanılır.
//
// Props:
//   garmentTypes: [{id, name, emoji, image_url}]
//   value: { garments: [...], freeText: '', itemCount: 0 }
//   onChange: (next) => void
export default function QuickGarmentInput({
  garmentTypes = [], value = EMPTY_VALUE, onChange, brandSuggestions = [], allowIroning = true,
}) {
  const garments = value.garments || []
  const freeText = value.freeText || ''
  const itemCount = value.itemCount || 0

  const [quickText, setQuickText] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const [openTag, setOpenTag] = useState(null) // künye açık olan satır indeksi
  const [sheetType, setSheetType] = useState(null) // ayrıntı paneli açık olan tür
  const quickRef = useRef(null)

  const typeById = useMemo(
    () => new Map(garmentTypes.map(type => [type.id, type])),
    [garmentTypes]
  )

  function patchGarment(index, patch) {
    onChange({
      ...value,
      garments: garments.map((garment, i) => (i === index ? { ...garment, ...patch } : garment)),
    })
  }

  function setAllIroning(next) {
    if (!allowIroning) return
    onChange({
      ...value,
      garments: garments.map(garment => ({ ...garment, requires_ironing: next })),
    })
  }

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

  function withIroningDefault(entry) {
    const type = garmentTypes.find(candidate => candidate.id === entry.type_id)
    return {
      ...entry,
      requires_ironing: allowIroning && (entry.requires_ironing ?? ironingDefaultFor(type)),
    }
  }

  function addParsed() {
    if (parsed.length === 0) return
    onChange({ ...value, garments: [...garments, ...parsed.map(withIroningDefault)] })
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
      requires_ironing: allowIroning && ironingDefaultFor(type),
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

  // Karta dokunmak ayrıntı panelini açar: renk/desen/marka/beden varsayılan akış.
  function openType(type) {
    setSheetType(current => (current?.id === type.id && current?.name === type.name ? null : type))
  }

  function addFromSheet(entry) {
    onChange({
      ...value,
      garments: [...garments, { ...entry, requires_ironing: allowIroning && entry.requires_ironing }],
    })
    setSheetType(null)
  }

  function decrementGarment(index) {
    const garment = garments[index]
    if ((garment.count || 1) <= 1) {
      onChange({ ...value, garments: garments.filter((_, garmentIndex) => garmentIndex !== index) })
      return
    }
    onChange({
      ...value,
      garments: garments.map((item, garmentIndex) => garmentIndex === index
        ? { ...item, count: item.count - 1 }
        : item),
    })
  }

  function toggleIroning(index) {
    if (!allowIroning) return
    onChange({
      ...value,
      garments: garments.map((garment, garmentIndex) => garmentIndex === index
        ? { ...garment, requires_ironing: !garment.requires_ironing }
        : garment),
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>
          ⚡ KIYAFETE DOKUN → RENK, DESEN, MARKA, BEDEN
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7 }}>
          {garmentTypes.map(type => {
            const selectedCount = garments
              .filter(garment => garment.type_id === type.id)
              .reduce((total, garment) => total + (garment.count || 1), 0)
            return (
              <button type="button" key={type.id} onClick={() => openType(type)}
                style={{
                  position: 'relative',
                  minHeight: 72,
                  borderRadius: 12,
                  border: `1px solid ${selectedCount ? '#3b82f6' : '#334155'}`,
                  background: selectedCount ? '#172554' : '#1e293b',
                  color: '#e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}>
                <span style={{ fontSize: 25 }}>{type.emoji || '👕'}</span>
                <span style={{ fontSize: 10, lineHeight: 1.1 }}>{type.name}</span>
                {selectedCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    right: 5,
                    top: 5,
                    minWidth: 22,
                    height: 22,
                    borderRadius: 12,
                    background: '#2563eb',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                  }}>
                    {selectedCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {sheetType && (
          <GarmentDetailSheet
            key={`${sheetType.id ?? sheetType.name}`}
            type={sheetType}
            brandSuggestions={brandSuggestions}
            allowIroning={allowIroning}
            onAdd={addFromSheet}
            onCancel={() => setSheetType(null)}
          />
        )}
      </div>

      {garments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {/* Toplu ütü — 10 parçalı torbada tek tek dokunmak zaman kaybı */}
          {allowIroning && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#64748b', letterSpacing: 1, flex: 1 }}>
              ♨️ ÜTÜ · {garments.filter(g => g.requires_ironing).length}/{garments.length} parça
            </span>
            <button type="button" onClick={() => setAllIroning(true)} style={bulkButton}>Tümüne aç</button>
            <button type="button" onClick={() => setAllIroning(false)} style={bulkButton}>Tümünü kapat</button>
          </div>}

          {garments.map((garment, index) => {
            const type = typeById.get(garment.type_id)
            const unsetPolicy = needsIroningReview(type)
            const tagOpen = openTag === index
            const tagSummary = [garment.brand, garment.size].filter(Boolean).join(' · ')
            return (
              <div key={`${garment.type_id || garment.type_name}-${index}`} style={{
                borderRadius: 11,
                padding: 8,
                background: '#111827',
                border: `1px solid ${tagOpen ? '#3b82f6' : '#273449'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button type="button" onClick={() => decrementGarment(index)} style={countButton}>−</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#e2e8f0', fontWeight: 900, fontSize: 13 }}>
                      {garment.emoji || '👕'} {garment.type_name} × {garment.count || 1}
                    </div>
                    {tagSummary && (
                      <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 700 }}>🏷️ {tagSummary}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {allowIroning && <button type="button" onClick={() => toggleIroning(index)}
                        style={{
                          minHeight: 32,
                          border: 0,
                          padding: 0,
                          background: 'transparent',
                          color: garment.requires_ironing ? '#c4b5fd' : '#94a3b8',
                          fontSize: 11,
                          fontWeight: 800,
                        }}>
                        {garment.requires_ironing ? '♨️ Ütülenecek' : '↪️ Ütülenmeyecek'}
                      </button>}
                      {/* Tür ayarı yapılmamışsa operatör görsün — sessiz varsayılan bırakmıyoruz */}
                      {allowIroning && unsetPolicy && (
                        <span style={{ fontSize: 9, color: '#fbbf24', fontWeight: 800, letterSpacing: 0.5 }}>
                          KONTROL ET
                        </span>
                      )}
                      <button type="button" onClick={() => setOpenTag(tagOpen ? null : index)}
                        style={{
                          minHeight: 32, border: 0, padding: 0, background: 'transparent',
                          color: tagOpen ? '#93c5fd' : '#64748b', fontSize: 11, fontWeight: 800,
                        }}>
                        🏷️ Marka / beden {tagOpen ? '▲' : '▾'}
                      </button>
                    </div>
                  </div>
                  <button type="button"
                    onClick={() => patchGarment(index, { count: (garment.count || 1) + 1 })}
                    style={countButton}>
                    +
                  </button>
                </div>

                {tagOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
                    <div>
                      <label style={tagLabel}>Marka</label>
                      {/* Ayrıntı panelindeki paletle aynı: dokunarak seç, gerekirse yaz */}
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                        {brandOptions(brandSuggestions, { limit: 10 }).map(option => (
                          <button key={option} type="button"
                            onClick={() => patchGarment(index, { brand: garment.brand === option ? '' : option })}
                            style={tagChip(garment.brand === option)}>
                            {option}
                          </button>
                        ))}
                      </div>
                      <input
                        value={garment.brand || ''}
                        onChange={e => patchGarment(index, { brand: e.target.value })}
                        placeholder="listede yoksa yazın"
                        style={tagInput}
                      />
                    </div>
                    <div>
                      <label style={tagLabel}>Beden</label>
                      {sizeGroupsWith(garment.size).map(group => (
                        <div key={group.key} style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 9, color: '#475569', marginBottom: 4 }}>{group.label}</div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {group.options.map(option => (
                              <button key={option} type="button"
                                onClick={() => patchGarment(index, { size: garment.size === option ? '' : option })}
                                style={tagChip(garment.size === option)}>
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <input
                        value={garment.size || ''}
                        onChange={e => patchGarment(index, { size: e.target.value })}
                        placeholder="veya serbest yazın — ör. 104 cm"
                        style={tagInput}
                      />
                    </div>
                    <div>
                      <label style={tagLabel}>Renk</label>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {COLORS.map(color => {
                          const selected = (garment.colors || []).some(item => item.key === color.key)
                          return (
                            <button key={color.key} type="button" aria-pressed={selected} aria-label={`${color.label} rengi`}
                              onClick={() => {
                                const current = garment.colors || []
                                if (selected) {
                                  patchGarment(index, { colors: current.filter(item => item.key !== color.key) })
                                } else if (current.length < 3) {
                                  patchGarment(index, { colors: [...current, { key: color.key, label: color.label }] })
                                }
                              }}
                              style={{ ...tagChip(selected), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
                      <label style={tagLabel}>Durum notu</label>
                      <input
                        value={garment.condition_notes || ''}
                        onChange={e => patchGarment(index, { condition_notes: e.target.value })}
                        placeholder="ör. yakasında leke var"
                        style={tagInput}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

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

const bulkButton = {
  minHeight: 34, padding: '0 10px', borderRadius: 9, cursor: 'pointer',
  border: '1px solid #334155', background: '#1e293b', color: '#94a3b8',
  fontSize: 11, fontWeight: 800,
}

const tagLabel = {
  display: 'block', fontSize: 10, color: '#64748b',
  letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase',
}

const tagChip = selected => ({
  minHeight: 38, padding: '0 10px', borderRadius: 9, cursor: 'pointer',
  border: `1px solid ${selected ? '#3b82f6' : '#334155'}`,
  background: selected ? 'rgba(29,78,216,0.22)' : '#1e293b',
  color: selected ? '#93c5fd' : '#94a3b8',
  fontSize: 12, fontWeight: 800,
})

const tagInput = {
  width: '100%', boxSizing: 'border-box', background: '#1e293b',
  border: '1px solid #334155', borderRadius: 9, padding: '9px 11px',
  color: '#f1f5f9', fontSize: 13, outline: 'none',
}

const countButton = {
  width: 44,
  height: 44,
  flexShrink: 0,
  borderRadius: 10,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  fontSize: 21,
  fontWeight: 900,
}
