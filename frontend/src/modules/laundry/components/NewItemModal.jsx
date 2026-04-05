import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import ColorPatternPicker from './ColorPatternPicker.jsx'

const DEFAULT_CLOTHING_TYPES = [
  'Pantolon','Gömlek','T-Shirt','Kazak','Sweat','Polar','Mont','Hırka',
  'Body','İçlik','Alt Eşofman','Üst Eşofman','Boxer','Külot','Çorap',
  'Havlu Tkm','El Havlusu','Ayak Havlusu','Büyük Havlu','Ceket',
  'Yastık K.','İş Mont','İş Pantalonu','Şort','Atlet','Diğer',
]

export const CLOTHING_ICONS = {
  'Pantolon':      '👖',
  'Gömlek':        '👔',
  'T-Shirt':       '👕',
  'Kazak':         '🧥',
  'Sweat':         '👕',
  'Polar':         '🧥',
  'Mont':          '🧥',
  'Hırka':         '🧶',
  'Body':          '🩲',
  'İçlik':         '🩳',
  'Alt Eşofman':   '🩲',
  'Üst Eşofman':   '👕',
  'Boxer':         '🩲',
  'Külot':         '🩲',
  'Çorap':         '🧦',
  'Havlu Tkm':     '🏖️',
  'El Havlusu':    '🧻',
  'Ayak Havlusu':  '🧻',
  'Büyük Havlu':   '🛁',
  'Ceket':         '🥼',
  'Yastık K.':     '🛏️',
  'İş Mont':       '🦺',
  'İş Pantalonu':  '👖',
  'Şort':          '🩳',
  'Atlet':         '👕',
  'Diğer':         '📦',
}

const SIZES = ['XS','S','M','L','XL','XXL','3XL','4XL','36','38','40','42','44','46','48']

const COLOR_PALETTE = [
  { name: 'Beyaz',    hex: '#f0f0f0' },
  { name: 'Siyah',    hex: '#222222' },
  { name: 'Gri',      hex: '#888888' },
  { name: 'Füme',     hex: '#4a4a4a' },
  { name: 'Lacivert', hex: '#1a2e5e' },
  { name: 'Mavi',     hex: '#2563eb' },
  { name: 'Açık Mavi',hex: '#7ec8e3' },
  { name: 'Kırmızı',  hex: '#dc2626' },
  { name: 'Yeşil',    hex: '#16a34a' },
  { name: 'Sarı',     hex: '#eab308' },
  { name: 'Turuncu',  hex: '#ea580c' },
  { name: 'Kahve',    hex: '#92400e' },
  { name: 'Bej',      hex: '#d4b896' },
  { name: 'Mor',      hex: '#7c3aed' },
  { name: 'Pembe',    hex: '#ec4899' },
]

const PATTERN_LIST = [
  { name: 'Çizgili', bg: 'repeating-linear-gradient(90deg,#f0f0f0 0 4px,#1a2e5e 4px 8px)' },
  { name: 'Benekli', bg: 'radial-gradient(circle,#1a2e5e 2px,transparent 2px) 0 0/8px 8px,#f0f0f0' },
  { name: 'Kareli',  bg: 'repeating-conic-gradient(#888 0% 25%,#f0f0f0 0% 50%) 0 0/8px 8px' },
  { name: 'Renkli',  bg: 'repeating-linear-gradient(90deg,#e74c3c 0 6px,#f0a500 6px 12px,#2563eb 12px 18px,#16a34a 18px 24px)' },
]

function SignatureCanvas({ onSign, onClear }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const touch = e.touches ? e.touches[0] : e
    const scaleX = canvasRef.current.width / rect.width
    const scaleY = canvasRef.current.height / rect.height
    return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
  }, [])

  const startDraw = useCallback((e) => {
    e.preventDefault(); drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
  }, [getPos])

  const draw = useCallback((e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#dde4f0'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke()
    setHasSig(true)
    onSign(canvasRef.current.toDataURL())
  }, [getPos, onSign])

  const stopDraw = useCallback(() => { drawing.current = false }, [])

  const clear = () => {
    canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setHasSig(false); onClear()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label className="form-label" style={{ margin: 0 }}>
          {hasSig ? '✓ İmza alındı' : 'Buraya imza atın'}
        </label>
        {hasSig && <button className="btn btn-ghost btn-xs" onClick={clear}>Temizle</button>}
      </div>
      <canvas ref={canvasRef} width={380} height={120}
        style={{
          background: 'var(--surface2)',
          border: `1px solid ${hasSig ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
          borderRadius: 8, display: 'block', cursor: 'crosshair', touchAction: 'none', width: '100%',
          transition: 'border-color 0.2s',
        }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
    </div>
  )
}

export default function NewItemModal({ onClose }) {
  const qc = useQueryClient()

  const { data: ctSettings = {} } = useQuery({
    queryKey: ['laundry-settings'],
    queryFn: laundryApi.getLaundrySettings,
    staleTime: 60_000,
  })
  const CLOTHING_TYPES = useMemo(() => {
    if (ctSettings.clothing_types) {
      try { return JSON.parse(ctSettings.clothing_types) } catch {}
    }
    return DEFAULT_CLOTHING_TYPES
  }, [ctSettings.clothing_types])

  const [form, setForm] = useState({
    room_id: '', notes: '', urgent: false, phone_override: '',
    intake_name: '', intake_signature: '',
  })
  const [clothing, setClothing] = useState([])
  const [itemCount, setItemCount] = useState(1)
  const [needsIroning, setNeedsIroning] = useState(false)
  const [roomSearch, setRoomSearch] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [draftBanner, setDraftBanner] = useState(() => {
    try {
      const d = localStorage.getItem('laundry-draft-items')
      if (d) { const p = JSON.parse(d); return p.length > 0 ? p : null }
    } catch {}
    return null
  })
  const draftTimerRef = useRef(null)

  // Premium parça girişi (local buffer — API'ye tek seferde gönderilir)
  const [premiumRows, setPremiumRows] = useState([])
  const [gType, setGType] = useState('')
  const [gForm, setGForm] = useState({ colors: [], pattern: '', brand: '', model: '', size: '', condition_notes: '' })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms-list'],
    queryFn: () => laundryApi.getRooms(),
  })

  const filtered = rooms.filter(r =>
    !roomSearch || `${r.block} ${r.room_no}`.toLowerCase().includes(roomSearch.toLowerCase())
  )

  useEffect(() => {
    if (!form.room_id) return
    setPhoneLoading(true)
    laundryApi.getRoomOccupant(form.room_id)
      .then(data => { if (data?.phone_number) set('phone_override', data.phone_number) })
      .finally(() => setPhoneLoading(false))
  }, [form.room_id])

  const selectedRoom = rooms.find(r => r.id === +form.room_id)
  const isPremium = selectedRoom && !['M','S','S1','S2'].includes(selectedRoom.block)

  // Premium blok seçilince ütü otomatik aktif
  useEffect(() => {
    if (isPremium) setNeedsIroning(true)
  }, [isPremium])
  const totalCount = clothing.reduce((s, c) => s + c.qty, 0) || 1

  const saveDraft = useCallback((list) => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      try { localStorage.setItem('laundry-draft-items', JSON.stringify(list)) } catch {}
    }, 300)
  }, [])

  const clearDraft = () => {
    try { localStorage.removeItem('laundry-draft-items') } catch {}
  }

  const addClothing = (type) => {
    setClothing(prev => {
      const next = [...prev, { type, color: '', qty: 1 }]
      saveDraft(next)
      return next
    })
  }

  const removeClothing = (idx) => setClothing(prev => {
    const next = prev.filter((_, i) => i !== idx)
    saveDraft(next)
    return next
  })

  const updateClothing = (idx, field, val) =>
    setClothing(prev => {
      const next = prev.map((c, i) => i === idx ? { ...c, [field]: field === 'qty' ? Math.max(1, +val || 1) : val } : c)
      saveDraft(next)
      return next
    })

  // Premium parça local ekleme
  const canAddPremium = !!gType
  const addPremiumRow = () => {
    if (!canAddPremium) return
    setPremiumRows(prev => [...prev, {
      garment_type: gType,
      color: gForm.colors.length > 0 ? gForm.colors.join(', ') : undefined,
      pattern: gForm.pattern || undefined,
      brand: gForm.brand || undefined,
      model: gForm.model || undefined,
      size: gForm.size || undefined,
      condition_notes: gForm.condition_notes || undefined,
    }])
    setGType('')
    setGForm({ colors: [], pattern: '', brand: '', model: '', size: '', condition_notes: '' })
  }
  const removePremiumRow = (idx) => setPremiumRows(prev => prev.filter((_, i) => i !== idx))

  const create = useMutation({
    mutationFn: async () => {
      const item = await laundryApi.createItem({
        ...form,
        room_id: +form.room_id,
        urgent: form.urgent ? 1 : 0,
        needs_ironing: needsIroning ? 1 : 0,
        item_count: isPremium && premiumRows.length > 0 ? premiumRows.length : (clothing.length > 0 ? totalCount : itemCount),
        clothing_items: clothing.length > 0 ? clothing : undefined,
        phone_override: form.phone_override || undefined,
        intake_signature: form.intake_signature || undefined,
      })
      if (isPremium && premiumRows.length > 0) {
        await laundryApi.addPremiumGarments(item.id, premiumRows)
      }
      return item
    },
    onSuccess: () => {
      clearDraft()
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      onClose()
    },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel fade-up" style={{ width: 500, maxWidth: '96vw', maxHeight: '94vh', overflow: 'auto' }}>
        <div className="panel-header" style={{
          background: 'linear-gradient(135deg, rgba(240,165,0,0.08), transparent)',
          borderBottom: '1px solid rgba(240,165,0,0.12)',
        }}>
          <div>
            <span className="panel-title">YENİ ÇAMAŞIR KAYDI</span>
            <div className="panel-subtitle">
              {isPremium ? '★ Premium Blok · Parça Detayı Girilebilir' : 'Oda · Teslim Eden · Kıyafet · Kaydet'}
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Draft Banner ── */}
          {draftBanner && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>
                📋 Kaydedilmemiş taslak bulundu ({draftBanner.length} parça)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#000' }}
                  onClick={() => { setClothing(draftBanner); setDraftBanner(null) }}>
                  Taslağı Yükle
                </button>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { clearDraft(); setDraftBanner(null) }}>
                  Yeni Başla
                </button>
              </div>
            </div>
          )}

          {/* ── Oda Seçimi ── */}
          <div>
            <label className="form-label">ODA SEÇİMİ</label>
            <input className="form-input" value={roomSearch}
              onChange={e => setRoomSearch(e.target.value)}
              placeholder="Blok veya oda numarası ara..."
              style={{ marginBottom: 6 }} />
            {selectedRoom && (
              <div style={{
                padding: '6px 10px', borderRadius: 6, marginBottom: 6,
                background: isPremium ? 'rgba(240,165,0,0.1)' : 'rgba(240,165,0,0.08)',
                border: `1px solid ${isPremium ? 'rgba(240,165,0,0.35)' : 'rgba(240,165,0,0.2)'}`,
                fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{isPremium ? '★ ' : '✓ '}{selectedRoom.block} - {selectedRoom.room_no}{isPremium ? ' · Premium' : ''}</span>
                <button className="btn btn-ghost btn-xs"
                  onClick={() => { set('room_id', ''); setRoomSearch(''); setPremiumRows([]); setGType('') }}
                  style={{ padding: '2px 6px' }}>✕</button>
              </div>
            )}
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface2)' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Oda bulunamadı</div>
              ) : filtered.slice(0, 50).map(r => {
                const id = r.id
                const isSelected = +form.room_id === id
                return (
                  <div key={id} onClick={() => { set('room_id', id); setRoomSearch('') }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: '1px solid rgba(35,45,63,0.4)',
                      background: isSelected ? 'rgba(240,165,0,0.08)' : 'transparent',
                      color: isSelected ? 'var(--accent)' : 'var(--text)',
                      fontFamily: 'var(--mono)', fontSize: 11, transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    {r.block} - {r.room_no}
                    {isSelected && <span style={{ float: 'right', fontSize: 9 }}>✓</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Teslim Eden ── */}
          <div>
            <label className="form-label">TESLİM EDEN</label>
            <input className="form-input" value={form.intake_name}
              onChange={e => set('intake_name', e.target.value)}
              placeholder="Ad Soyad..." style={{ marginBottom: 10 }} />
            <SignatureCanvas
              onSign={sig => set('intake_signature', sig)}
              onClear={() => set('intake_signature', '')}
            />
          </div>

          {/* ── Premium Parça Girişi (sadece premium blok seçiliyse) ── */}
          {isPremium && (
            <div style={{
              borderRadius: 10,
              border: '1px solid rgba(240,165,0,0.2)',
              background: 'rgba(240,165,0,0.03)',
              overflow: 'hidden',
            }}>
              {/* Başlık */}
              <div style={{
                padding: '8px 14px',
                background: 'rgba(240,165,0,0.08)',
                borderBottom: '1px solid rgba(240,165,0,0.15)',
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                ★ PREMIUM PARÇALAR
                {premiumRows.length > 0 && (
                  <span style={{
                    background: 'var(--accent)', color: '#000',
                    borderRadius: 10, padding: '1px 8px', fontSize: 9, fontWeight: 700,
                  }}>{premiumRows.length}</span>
                )}
              </div>

              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Eklenen parçalar listesi */}
                {premiumRows.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
                    {premiumRows.map((g, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 8px', borderRadius: 6,
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                      }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', minWidth: 18 }}>#{i + 1}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', flex: 1 }}>
                          {CLOTHING_ICONS[g.garment_type] || ''} {g.garment_type}
                        </span>
                        {g.color && g.color.split(', ').filter(Boolean).map(c => (
                          <span key={c} style={{
                            width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                            background: COLOR_PALETTE.find(cp => cp.name === c)?.hex || '#888',
                            border: '1px solid rgba(255,255,255,0.15)',
                          }} title={c} />
                        ))}
                        {g.color && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.color}</span>}
                        {g.pattern && (
                          <span style={{
                            fontFamily: 'var(--mono)', fontSize: 9, color: '#818cf8',
                            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                            borderRadius: 3, padding: '1px 5px',
                          }}>{g.pattern}</span>
                        )}
                        {g.brand && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.brand}</span>}
                        {g.size && (
                          <span style={{
                            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                            background: 'var(--surface)', border: '1px solid var(--border)',
                            borderRadius: 3, padding: '1px 5px',
                          }}>{g.size}</span>
                        )}
                        <button onClick={() => removePremiumRow(i)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12, padding: '0 2px', flexShrink: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tip seçimi */}
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 5 }}>TİP SEÇ</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {CLOTHING_TYPES.map(type => (
                      <button
                        key={type}
                        onClick={() => {
                          setGType(t => t === type ? '' : type)
                          setGForm(f => ({ ...f, colors: [], pattern: '' }))
                        }}
                        style={{
                          padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
                          background: gType === type ? 'rgba(240,165,0,0.15)' : 'var(--surface)',
                          border: `1px solid ${gType === type ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
                          color: gType === type ? 'var(--accent)' : 'var(--text2)',
                          fontFamily: 'var(--mono)', fontSize: 9, transition: 'all 0.12s',
                        }}
                      >
                        {gType === type && '★ '}{CLOTHING_ICONS[type] || ''} {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Detay formu — sadece tip seçiliyse */}
                {gType && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 7,
                    background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.12)',
                  }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>
                      {CLOTHING_ICONS[gType] || ''} {gType}
                      <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 9, marginLeft: 6 }}>#{premiumRows.length + 1}</span>
                    </div>

                    {/* Renk & Desen */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>
                        RENK & DESEN
                      </div>
                      <ColorPatternPicker
                        colors={gForm.colors}
                        pattern={gForm.pattern}
                        onChange={({ colors, pattern }) => setGForm(f => ({ ...f, colors, pattern }))}
                      />
                    </div>

                    {/* Marka / Model / Beden */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 6, marginBottom: 6 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 3 }}>MARKA</div>
                        <input className="form-input" value={gForm.brand}
                          onChange={e => setGForm(f => ({ ...f, brand: e.target.value }))}
                          placeholder="Opsiyonel" style={{ fontSize: 10 }} />
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 3 }}>MODEL</div>
                        <input className="form-input" value={gForm.model}
                          onChange={e => setGForm(f => ({ ...f, model: e.target.value }))}
                          placeholder="Opsiyonel" style={{ fontSize: 10 }} />
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 3 }}>BEDEN</div>
                        <select value={gForm.size} onChange={e => setGForm(f => ({ ...f, size: e.target.value }))}
                          style={{
                            width: '100%', fontFamily: 'var(--mono)', fontSize: 10,
                            background: 'var(--surface)', border: '1px solid var(--border)',
                            borderRadius: 4, padding: '5px 4px', color: 'var(--text)',
                          }}>
                          <option value="">-</option>
                          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Not + Ekle */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 3 }}>NOT</div>
                        <input className="form-input" value={gForm.condition_notes}
                          onChange={e => setGForm(f => ({ ...f, condition_notes: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter' && canAddPremium) addPremiumRow() }}
                          placeholder="Opsiyonel" style={{ fontSize: 10 }} />
                      </div>
                      <button
                        onClick={addPremiumRow}
                        disabled={!canAddPremium}
                        style={{
                          padding: '7px 16px', borderRadius: 6, cursor: canAddPremium ? 'pointer' : 'not-allowed',
                          background: canAddPremium ? 'var(--accent)' : 'var(--surface)',
                          border: `1px solid ${canAddPremium ? 'var(--accent)' : 'var(--border)'}`,
                          color: canAddPremium ? '#000' : 'var(--text3)',
                          fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                          transition: 'all 0.15s',
                        }}
                      >
                        + Ekle
                      </button>
                    </div>
                  </div>
                )}

                {premiumRows.length === 0 && !gType && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textAlign: 'center', padding: '4px 0' }}>
                    Yukarıdan tip seç → detay gir → Ekle
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Kıyafet Girişi (regular) ── */}
          {!isPremium && (
            <div>
              <label className="form-label">
                KIYAFETler
                {totalCount > 0 && (
                  <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 700 }}>{totalCount} parça</span>
                )}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {CLOTHING_TYPES.map(type => {
                  const active = clothing.some(c => c.type === type)
                  return (
                    <button key={type} onClick={() => addClothing(type)} style={{
                      padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                      background: active ? 'rgba(240,165,0,0.15)' : 'var(--surface2)',
                      border: `1px solid ${active ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
                      color: active ? 'var(--accent)' : 'var(--text2)',
                      fontFamily: 'var(--mono)', fontSize: 10, transition: 'all 0.15s',
                    }}>
                      {active && '✓ '}{CLOTHING_ICONS[type] || ''} {type}
                    </button>
                  )
                })}
              </div>
              {clothing.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {clothing.map((c, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', background: 'var(--surface2)',
                      border: '1px solid var(--border)', borderRadius: 7,
                    }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', flex: '0 0 90px' }}>
                        {CLOTHING_ICONS[c.type] || ''} {c.type}
                      </span>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          {COLOR_PALETTE.map(col => (
                            <button
                              key={col.name}
                              title={col.name}
                              onClick={() => updateClothing(idx, 'color', c.color === col.name ? '' : col.name)}
                              style={{
                                width: 18, height: 18, borderRadius: '50%', border: `2px solid ${c.color === col.name ? 'var(--accent)' : 'transparent'}`,
                                background: col.hex, cursor: 'pointer', padding: 0, flexShrink: 0,
                                boxShadow: c.color === col.name ? '0 0 0 1px var(--accent)' : 'none',
                                transition: 'border 0.1s',
                              }}
                            />
                          ))}
                          <input
                            className="form-input"
                            value={COLOR_PALETTE.some(cp => cp.name === c.color) || PATTERN_LIST.some(p => p.name === c.color) ? '' : c.color}
                            onChange={e => updateClothing(idx, 'color', e.target.value)}
                            placeholder="Diğer..."
                            style={{ width: 60, padding: '3px 6px', fontSize: 9, flexShrink: 0 }}
                          />
                          {c.color && (
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', flexShrink: 0 }}>{c.color}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', flexShrink: 0 }}>DESEN:</span>
                          {PATTERN_LIST.map(pat => (
                            <button
                              key={pat.name}
                              title={pat.name}
                              onClick={() => updateClothing(idx, 'color', c.color === pat.name ? '' : pat.name)}
                              style={{
                                width: 24, height: 24, borderRadius: 4,
                                border: `2px solid ${c.color === pat.name ? 'var(--accent)' : 'transparent'}`,
                                background: pat.bg, cursor: 'pointer', padding: 0, flexShrink: 0,
                                boxShadow: c.color === pat.name ? '0 0 0 1px var(--accent)' : 'none',
                                transition: 'border 0.1s', outline: 'none',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => updateClothing(idx, 'qty', c.qty - 1)}
                          style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--accent)', minWidth: 20, textAlign: 'center', lineHeight: 1 }}>{c.qty}</span>
                        <button onClick={() => updateClothing(idx, 'qty', c.qty + 1)}
                          style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                      <button onClick={() => removeClothing(idx)}
                        style={{ color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {clothing.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6, border: '1px dashed var(--border)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', flex: 1 }}>
                    Kıyafet seçilmedi — toplam adet:
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => setItemCount(c => Math.max(1, c - 1))}
                      style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--accent)', minWidth: 24, textAlign: 'center', lineHeight: 1 }}>{itemCount}</span>
                    <button onClick={() => setItemCount(c => Math.min(99, c + 1))}
                      style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Notlar ── */}
          <div>
            <label className="form-label">NOTLAR</label>
            <input className="form-input" value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Açıklama..." />
          </div>

          {/* ── Telefon ── */}
          <div>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>WHATSAPP TELEFON</span>
              {phoneLoading && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>yükleniyor...</span>}
              {form.phone_override && !phoneLoading && (
                <a href={`https://wa.me/${form.phone_override.replace(/\D/g,'').replace(/^0/,'90')}`}
                  target="_blank" rel="noreferrer"
                  style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#25D366', textDecoration: 'none' }}>
                  WA →
                </a>
              )}
            </label>
            <input className="form-input" value={form.phone_override}
              onChange={e => set('phone_override', e.target.value)}
              placeholder="Oda sakininden otomatik · veya gir..."
              style={{ fontFamily: 'var(--mono)' }} />
          </div>

          {/* ── Acil ── */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            padding: '10px 12px', borderRadius: 8,
            background: form.urgent ? 'rgba(231,76,60,0.08)' : 'var(--surface2)',
            border: `1px solid ${form.urgent ? 'rgba(231,76,60,0.25)' : 'var(--border)'}`,
            transition: 'all 0.2s',
          }}>
            <input type="checkbox" checked={form.urgent}
              onChange={e => set('urgent', e.target.checked)}
              style={{ accentColor: 'var(--red)', width: 14, height: 14 }} />
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, letterSpacing: 1,
              color: form.urgent ? 'var(--red)' : 'var(--text2)',
            }}>ACİL İŞARETLE</span>
            {form.urgent && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)', opacity: 0.7, marginLeft: 'auto' }}>Öncelikli yıkama</span>
            )}
          </label>

          {/* ── Ütü (premium blokta otomatik, gösterilmez) ── */}
          {!isPremium && <label style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            padding: '10px 12px', borderRadius: 8,
            background: needsIroning ? 'rgba(99,102,241,0.08)' : 'var(--surface2)',
            border: `1px solid ${needsIroning ? 'rgba(99,102,241,0.25)' : 'var(--border)'}`,
            transition: 'all 0.2s',
          }}>
            <input type="checkbox" checked={needsIroning}
              onChange={e => setNeedsIroning(e.target.checked)}
              style={{ accentColor: '#6366f1', width: 14, height: 14 }} />
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, letterSpacing: 1,
              color: needsIroning ? '#6366f1' : 'var(--text2)',
            }}>ÜTÜ GEREKİYOR</span>
            {needsIroning && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#6366f1', opacity: 0.7, marginLeft: 'auto' }}>Yıkama sonrası ütülenecek</span>
            )}
          </label>}

          {create.isError && (
            <div className="alert alert-danger">{create.error?.response?.data?.error || 'Hata oluştu'}</div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: '10px', letterSpacing: 1 }}
              onClick={() => create.mutate()}
              disabled={!form.room_id || create.isPending}>
              {create.isPending
                ? 'Kaydediliyor...'
                : isPremium && premiumRows.length > 0
                  ? `+ KAYDET (${premiumRows.length} premium parça)`
                  : clothing.length > 0
                    ? `+ KAYDET (${totalCount} parça)`
                    : `+ KAYDET (${itemCount} parça)`}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>İptal</button>
          </div>

        </div>
      </div>
    </div>
  )
}
