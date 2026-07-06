import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { BLOCK_BY_NAME } from '../../../shared/blocks.js'
import { SIGN_BLOCKS } from '../../laundry-kiosk/constants.js'
import { CLOTHING_ICONS } from './NewItemModal.jsx'
import ColorPatternPicker, { ColorPatternDisplay, parseColors } from './ColorPatternPicker.jsx'

const SIZES = ['XS','S','M','L','XL','XXL','3XL','4XL','36','38','40','42','44','46','48']
const QUICK_TYPES = ['Pantolon', 'Gömlek', 'T-Shirt', 'İç Çamaşırı', 'Çorap', 'Havlu', 'Eşofman', 'Mont']

// Compact signature pad (panel-friendly height)
function CompactSigPad({ sigRef }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  useEffect(() => {
    if (sigRef) sigRef.current = {
      isEmpty: () => !hasSig,
      toDataURL: () => canvasRef.current?.toDataURL(),
      clear: () => {
        canvasRef.current?.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        setHasSig(false)
      },
    }
  })

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const touch = e.touches ? e.touches[0] : e
    return {
      x: (touch.clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (touch.clientY - rect.top) * (canvasRef.current.height / rect.height),
    }
  }, [])

  const startDraw = useCallback((e) => {
    e.preventDefault(); drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
  }, [getPos])

  const draw = useCallback((e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke()
    setHasSig(true)
  }, [getPos])

  const stopDraw = useCallback(() => { drawing.current = false }, [])

  return (
    <div>
      <canvas ref={canvasRef} width={520} height={110}
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, display: 'block', cursor: 'crosshair', touchAction: 'none', width: '100%' }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
      {hasSig && (
        <button type="button" onClick={() => sigRef.current?.clear()}
          style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          Temizle
        </button>
      )}
    </div>
  )
}

export function InlineNewRecord({ roomId, block, room_no, occupants, lastBag, onSaved }) {
  const needsSig  = SIGN_BLOCKS.has(block)
  const isPremium = BLOCK_BY_NAME[block]?.type === 'Y'

  const [intakeName, setIntakeName] = useState('')
  const [phoneOverride, setPhoneOverride] = useState('')
  const [clothing, setClothing] = useState([])         // [{type, qty, colors:[], pattern:''}]
  const [premiumRows, setPremiumRows] = useState([])    // [{garment_type, brand, model, size, color, pattern, condition_notes}]
  const [itemCount, setItemCount] = useState(1)
  const [notes, setNotes] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [needsIroning, setNeedsIroning] = useState(isPremium)  // premium → varsayılan açık
  const [expandedIdx, setExpandedIdx] = useState(null)  // hangi clothing item açık
  const [error, setError] = useState('')
  const sigRef = useRef(null)

  // Premium parça inline form state
  const [premType, setPremType] = useState('')
  const [premBrand, setPremBrand] = useState('')
  const [premModel, setPremModel] = useState('')
  const [premSize, setPremSize] = useState('')
  const [premColors, setPremColors] = useState([])
  const [premPattern, setPremPattern] = useState('')
  const [premNotes, setPremNotes] = useState('')
  const [premQty, setPremQty] = useState(1)

  // Otomatik telefon fetch
  useEffect(() => {
    if (!roomId) return
    laundryApi.getRoomOccupant(roomId)
      .then(data => { if (data?.phone_number) setPhoneOverride(data.phone_number) })
      .catch(() => {})
  }, [roomId])

  const totalCount = isPremium && premiumRows.length > 0
    ? premiumRows.length
    : (clothing.length > 0 ? clothing.reduce((s, c) => s + (c.qty || 1), 0) : itemCount)

  const create = useMutation({
    mutationFn: async () => {
      let intake_signature = null
      if (needsSig) {
        if (sigRef.current?.isEmpty()) throw new Error('İmza gerekli')
        intake_signature = sigRef.current?.toDataURL() || null
      }
      // Renk/desen → SQL'in beklediği "color" string + "pattern"
      const clothing_items = clothing.length > 0
        ? clothing.map(c => ({
            type: c.type,
            color: (c.colors || []).join(', '),
            pattern: c.pattern || '',
            qty: c.qty,
          }))
        : undefined

      const item = await laundryApi.createItem({
        room_id: roomId,
        item_count: totalCount,
        urgent: urgent ? 1 : 0,
        needs_ironing: needsIroning ? 1 : 0,
        notes: notes.trim() || undefined,
        intake_name: intakeName.trim() || undefined,
        phone_override: phoneOverride.trim() || undefined,
        intake_signature: intake_signature || undefined,
        clothing_items,
      })
      if (isPremium && premiumRows.length > 0) {
        await laundryApi.addPremiumGarments(item.id, premiumRows)
      }
      return item
    },
    onSuccess: () => onSaved?.(),
    onError: (e) => setError(e.response?.data?.error || e.message || 'Kayıt eklenemedi'),
  })

  const addType = (type) => {
    setClothing(prev => {
      const existing = prev.find(c => c.type === type)
      if (existing) return prev.map(c => c.type === type ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { type, qty: 1, colors: [], pattern: '' }]
    })
  }
  const updateQty = (i, delta) => setClothing(prev =>
    prev.map((c, idx) => idx === i ? { ...c, qty: Math.max(1, c.qty + delta) } : c)
  )
  const removeItem = (i) => setClothing(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i, patch) => setClothing(prev =>
    prev.map((c, idx) => idx === i ? { ...c, ...patch } : c)
  )

  const addPremiumRow = () => {
    if (!premType.trim()) return
    const row = {
      garment_type: premType.trim(),
      brand: premBrand.trim() || undefined,
      model: premModel.trim() || undefined,
      size: premSize || undefined,
      color: premColors.length > 0 ? premColors.join(', ') : undefined,
      pattern: premPattern || undefined,
      condition_notes: premNotes.trim() || undefined,
    }
    setPremiumRows(prev => [...prev, ...Array.from({ length: premQty }, () => ({ ...row }))])
    setPremType(''); setPremBrand(''); setPremModel(''); setPremSize('')
    setPremColors([]); setPremPattern(''); setPremNotes(''); setPremQty(1)
  }
  const removePremiumRow = (i) => setPremiumRows(prev => prev.filter((_, idx) => idx !== i))

  const isValid = totalCount >= 1 && (!needsSig || sigRef.current?.isEmpty() === false)

  return (
    <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>
          YENİ KAYIT — {block} · {room_no}
        </div>
        {isPremium && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--accent3)',
            background: 'rgba(240,165,0,0.12)', padding: '2px 8px', borderRadius: 4,
            letterSpacing: 1, fontWeight: 700,
          }}>★ PREMIUM</span>
        )}
      </div>

      {/* Faz 6 — Geçen seferki gibi otomatik doldur */}
      {lastBag && (
        <button type="button"
          onClick={() => {
            setIntakeName(lastBag.intake_name || '')
            setUrgent(lastBag.urgent === 1)
            setNeedsIroning(lastBag.needs_ironing === 1)
            try {
              if (lastBag.clothing_items) {
                const arr = typeof lastBag.clothing_items === 'string' ? JSON.parse(lastBag.clothing_items) : lastBag.clothing_items
                if (Array.isArray(arr)) {
                  setClothing(arr.map(c => ({
                    type: c.type,
                    qty: c.qty || 1,
                    colors: c.color ? parseColors(c.color) : [],
                    pattern: c.pattern || '',
                  })))
                }
              }
              if (lastBag.garments_json && isPremium) {
                const g = JSON.parse(lastBag.garments_json)
                // garments_json structure varies; just hint user
                if (Array.isArray(g)) setPremiumRows(g.map(x => ({
                  garment_type: x.type_name || x.garment_type || 'Premium',
                  color: Array.isArray(x.colors) ? x.colors.map(c => c.label || c).join(', ') : x.color,
                  pattern: x.pattern_label || x.pattern,
                })))
              }
              if (lastBag.notes) setNotes(lastBag.notes)
            } catch {}
          }}
          style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)',
            background: 'rgba(240,165,0,0.06)', border: '1px dashed rgba(240,165,0,0.3)',
            borderRadius: 6, padding: '6px 10px', cursor: 'pointer', textAlign: 'left',
          }}>
          ↻ Geçen seferki gibi doldur ({new Date(lastBag.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} · {lastBag.item_count} parça{lastBag.intake_name ? ` · ${lastBag.intake_name}` : ''})
        </button>
      )}

      {/* Teslim eden */}
      <div>
        <label className="form-label" style={{ fontSize: 9 }}>TESLİM EDEN</label>
        {occupants.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {occupants.map(p => (
              <button key={p.id} type="button" onClick={() => setIntakeName(p.full_name)}
                style={{
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.5,
                  background: intakeName === p.full_name ? 'rgba(240,165,0,0.18)' : 'var(--surface2)',
                  border: `1px solid ${intakeName === p.full_name ? 'rgba(240,165,0,0.5)' : 'var(--border)'}`,
                  color: intakeName === p.full_name ? 'var(--accent)' : 'var(--text2)',
                }}>
                🛏 {p.bed_no} · {p.full_name}
              </button>
            ))}
          </div>
        )}
        <input className="form-input" value={intakeName}
          onChange={e => setIntakeName(e.target.value)}
          placeholder="Veya isim yaz…" style={{ fontSize: 12 }} />
      </div>

      {/* Telefon (otomatik dolu, düzeltilebilir) */}
      <div>
        <label className="form-label" style={{ fontSize: 9, display: 'flex', justifyContent: 'space-between' }}>
          <span>TELEFON (WHATSAPP)</span>
          {phoneOverride && (
            <a href={`https://wa.me/${phoneOverride.replace(/\D/g,'').replace(/^0/,'90')}`}
              target="_blank" rel="noreferrer"
              style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#25D366', textDecoration: 'none' }}>
              WA →
            </a>
          )}
        </label>
        <input className="form-input" value={phoneOverride}
          onChange={e => setPhoneOverride(e.target.value)}
          placeholder="Otomatik yüklenir…" style={{ fontSize: 12 }} />
      </div>

      {/* Standart parça akışı — premium DEĞİLSE veya premium ama henüz hiç satır yoksa */}
      {!isPremium && <>
        <div>
          <label className="form-label" style={{ fontSize: 9 }}>HIZLI PARÇA EKLE</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {QUICK_TYPES.map(t => (
              <button key={t} type="button" onClick={() => addType(t)}
                style={{
                  padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.5,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--text2)',
                }}>
                <span style={{ marginRight: 4 }}>{CLOTHING_ICONS[t] || '👕'}</span>{t} +
              </button>
            ))}
          </div>
        </div>

        {clothing.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {clothing.map((c, i) => {
              const isOpen = expandedIdx === i
              return (
                <div key={i} style={{
                  background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)',
                  padding: '6px 10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setExpandedIdx(isOpen ? null : i)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 10, padding: 0 }}>
                      {isOpen ? '▾' : '▸'}
                    </button>
                    <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>
                      {CLOTHING_ICONS[c.type] || '👕'} {c.type}
                    </span>
                    {(c.colors?.length > 0 || c.pattern) && (
                      <ColorPatternDisplay color={(c.colors || []).join(', ')} pattern={c.pattern || ''} />
                    )}
                    <button type="button" onClick={() => updateQty(i, -1)}
                      style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>−</button>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--accent)', minWidth: 18, textAlign: 'center' }}>{c.qty}</span>
                    <button type="button" onClick={() => updateQty(i, 1)}
                      style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>+</button>
                    <button type="button" onClick={() => removeItem(i)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                      <ColorPatternPicker
                        colors={c.colors || []}
                        pattern={c.pattern || ''}
                        onChange={({ colors, pattern }) => updateItem(i, { colors, pattern })}
                        compact
                      />
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textAlign: 'right' }}>
              toplam {totalCount} parça
            </div>
          </div>
        )}

        {clothing.length === 0 && (
          <div>
            <label className="form-label" style={{ fontSize: 9 }}>TOPLAM PARÇA</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={() => setItemCount(c => Math.max(1, c - 1))}
                style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14 }}>−</button>
              <span style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--accent)', minWidth: 28, textAlign: 'center' }}>{itemCount}</span>
              <button type="button" onClick={() => setItemCount(c => Math.min(99, c + 1))}
                style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14 }}>+</button>
            </div>
          </div>
        )}
      </>}

      {/* Premium parça akışı */}
      {isPremium && <>
        <div className="panel" style={{ padding: 10, background: 'rgba(240,165,0,0.04)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent3)', letterSpacing: 1.5, marginBottom: 8 }}>
            PREMIUM PARÇA DETAYI
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
            <input className="form-input" value={premType}
              onChange={e => setPremType(e.target.value)}
              placeholder="Tip (Pantolon, Gömlek…)" style={{ fontSize: 11 }} />
            <input className="form-input" value={premBrand}
              onChange={e => setPremBrand(e.target.value)}
              placeholder="Marka" style={{ fontSize: 11 }} />
            <input className="form-input" value={premModel}
              onChange={e => setPremModel(e.target.value)}
              placeholder="Model" style={{ fontSize: 11 }} />
            <select className="form-input" value={premSize}
              onChange={e => setPremSize(e.target.value)}
              style={{ fontSize: 11 }}>
              <option value="">Beden seç</option>
              {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <ColorPatternPicker
            colors={premColors}
            pattern={premPattern}
            onChange={({ colors, pattern }) => { setPremColors(colors); setPremPattern(pattern) }}
            compact
          />
          <input className="form-input" value={premNotes}
            onChange={e => setPremNotes(e.target.value)}
            placeholder="Durum notu (örn. yıpranmış, lekeli…)"
            style={{ fontSize: 11, marginTop: 6 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Adet:</span>
            <button type="button" onClick={() => setPremQty(q => Math.max(1, q - 1))}
              style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>−</button>
            <span style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--accent)', minWidth: 18, textAlign: 'center' }}>{premQty}</span>
            <button type="button" onClick={() => setPremQty(q => q + 1)}
              style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>+</button>
            <button type="button" onClick={addPremiumRow} disabled={!premType.trim()}
              className="btn btn-primary btn-xs"
              style={{ marginLeft: 'auto', opacity: premType.trim() ? 1 : 0.4 }}>
              + Ekle
            </button>
          </div>
        </div>

        {premiumRows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {premiumRows.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)',
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)',
              }}>
                <span style={{ flex: 1 }}>
                  <strong style={{ color: 'var(--text)' }}>{p.garment_type}</strong>
                  {p.brand && ` · ${p.brand}`}
                  {p.size && ` · ${p.size}`}
                  {p.color && ` · ${p.color}`}
                  {p.pattern && ` · ${p.pattern}`}
                  {p.condition_notes && <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}> · {p.condition_notes}</span>}
                </span>
                <button type="button" onClick={() => removePremiumRow(i)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✕</button>
              </div>
            ))}
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textAlign: 'right' }}>
              toplam {premiumRows.length} premium parça
            </div>
          </div>
        )}
      </>}

      {/* Notlar */}
      <div>
        <label className="form-label" style={{ fontSize: 9 }}>NOT / YAZIYLA</label>
        <textarea className="form-input" value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Kelime hatası olsa da kaydedilir, sonra düzeltebilirsin…"
          rows={2}
          style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }} />
      </div>

      {/* Toggle'lar */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} style={{ width: 14, height: 14 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: urgent ? 'var(--red)' : 'var(--text2)', fontWeight: urgent ? 700 : 400 }}>⚡ Acil</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={needsIroning} onChange={e => setNeedsIroning(e.target.checked)} style={{ width: 14, height: 14 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: needsIroning ? '#a78bfa' : 'var(--text2)' }}>🫧 Ütü</span>
        </label>
      </div>

      {/* İmza */}
      {needsSig && (
        <div>
          <label className="form-label" style={{ fontSize: 9 }}>İMZA <span style={{ color: 'var(--red)' }}>(gerekli)</span></label>
          <CompactSigPad sigRef={sigRef} />
        </div>
      )}

      {error && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>{error}</div>
      )}

      <button className="btn btn-primary" onClick={() => create.mutate()}
        disabled={create.isPending || totalCount < 1}
        style={{ letterSpacing: 1, opacity: create.isPending ? 0.6 : 1 }}>
        {create.isPending ? 'Kaydediliyor…' : '✓ KAYDET'}
      </button>
    </div>
  )
}
