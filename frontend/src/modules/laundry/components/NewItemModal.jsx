import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import api from '../../../shared/api/client.js'

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

const COLOR_PALETTE = [
  { name: 'Beyaz',    hex: '#f0f0f0' },
  { name: 'Siyah',    hex: '#222222' },
  { name: 'Gri',      hex: '#888888' },
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
  { name: 'B/L Çizgili',     bg: 'repeating-linear-gradient(90deg,#f0f0f0 0 4px,#1a2e5e 4px 8px)' },
  { name: 'B/K Çizgili',     bg: 'repeating-linear-gradient(90deg,#f0f0f0 0 4px,#dc2626 4px 8px)' },
  { name: 'B/Y Çizgili',     bg: 'repeating-linear-gradient(90deg,#f0f0f0 0 4px,#eab308 4px 8px)' },
  { name: 'S/B Çizgili',     bg: 'repeating-linear-gradient(90deg,#888 0 4px,#f0f0f0 4px 8px)' },
  { name: 'Çapraz Çizgili',  bg: 'repeating-linear-gradient(45deg,#f0f0f0 0 4px,#1a2e5e 4px 8px)' },
  { name: 'Gri Kareli',      bg: 'repeating-conic-gradient(#888 0% 25%,#f0f0f0 0% 50%) 0 0/8px 8px' },
  { name: 'L/B Kareli',      bg: 'repeating-conic-gradient(#1a2e5e 0% 25%,#f0f0f0 0% 50%) 0 0/8px 8px' },
  { name: 'Renkli Karnaval', bg: 'repeating-linear-gradient(90deg,#e74c3c 0 6px,#f0a500 6px 12px,#2563eb 12px 18px,#16a34a 18px 24px)' },
  { name: 'L/B İki Renk',    bg: 'linear-gradient(135deg,#1a2e5e 50%,#f0f0f0 50%)' },
  { name: 'K/B İki Renk',    bg: 'linear-gradient(135deg,#dc2626 50%,#f0f0f0 50%)' },
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
  const [CLOTHING_TYPES] = useState(() => {
    try {
      const saved = localStorage.getItem('custom-clothing-types')
      return saved ? JSON.parse(saved) : DEFAULT_CLOTHING_TYPES
    } catch { return DEFAULT_CLOTHING_TYPES }
  })

  const qc = useQueryClient()
  const [form, setForm] = useState({
    room_id: '', notes: '', urgent: false, phone_override: '',
    intake_name: '', intake_signature: '',
  })
  const [clothing, setClothing] = useState([])
  const [roomSearch, setRoomSearch] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms-list'],
    queryFn: () => api.get('/checkin/available-rooms').then(r => r.data).catch(() => []),
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

  const selectedRoom = rooms.find(r => (r.room_id || r.id) === +form.room_id)
  const totalCount = clothing.reduce((s, c) => s + c.qty, 0) || 1

  const addClothing = (type) => {
    setClothing(prev => [...prev, { type, color: '', qty: 1 }])
  }

  const removeClothing = (idx) => setClothing(prev => prev.filter((_, i) => i !== idx))
  const updateClothing = (idx, field, val) =>
    setClothing(prev => prev.map((c, i) => i === idx ? { ...c, [field]: field === 'qty' ? Math.max(1, +val || 1) : val } : c))

  const create = useMutation({
    mutationFn: () => laundryApi.createItem({
      ...form,
      room_id: +form.room_id,
      urgent: form.urgent ? 1 : 0,
      item_count: totalCount,
      clothing_items: clothing.length > 0 ? clothing : undefined,
      phone_override: form.phone_override || undefined,
      intake_signature: form.intake_signature || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); onClose() },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel fade-up" style={{ width: 460, maxWidth: '94vw', maxHeight: '92vh', overflow: 'auto' }}>
        <div className="panel-header" style={{
          background: 'linear-gradient(135deg, rgba(240,165,0,0.08), transparent)',
          borderBottom: '1px solid rgba(240,165,0,0.12)',
        }}>
          <div>
            <span className="panel-title">YENİ ÇAMAŞIR KAYDI</span>
            <div className="panel-subtitle">Oda · Teslim Eden · Kıyafet · Kaydet</div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
                background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)',
                fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>✓ {selectedRoom.block} - {selectedRoom.room_no}</span>
                <button className="btn btn-ghost btn-xs"
                  onClick={() => { set('room_id', ''); setRoomSearch('') }}
                  style={{ padding: '2px 6px' }}>✕</button>
              </div>
            )}
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface2)' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Oda bulunamadı</div>
              ) : filtered.slice(0, 20).map(r => {
                const id = r.room_id || r.id
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
            <label className="form-label">TESLİM EDEN *</label>
            <input className="form-input" value={form.intake_name}
              onChange={e => set('intake_name', e.target.value)}
              placeholder="Ad Soyad..." style={{ marginBottom: 10 }} />
            <SignatureCanvas
              onSign={sig => set('intake_signature', sig)}
              onClear={() => set('intake_signature', '')}
            />
          </div>

          {/* ── Kıyafet Girişi ── */}
          <div>
            <label className="form-label">
              KIYAFETler
              {totalCount > 0 && (
                <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 700 }}>{totalCount} parça</span>
              )}
            </label>
            {/* Chip'ler */}
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
            {/* Satır Listesi */}
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
                    {/* Color palette */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* Renk paleti */}
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
                      {/* Desen satırı */}
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
                              transition: 'border 0.1s',
                              outline: 'none',
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
              <div style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 6, border: '1px dashed var(--border)' }}>
                Yukarıdan kıyafet tipi seç veya boş bırak
              </div>
            )}
          </div>

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

          {create.isError && (
            <div className="alert alert-danger">{create.error?.response?.data?.error || 'Hata oluştu'}</div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: '10px', letterSpacing: 1 }}
              onClick={() => create.mutate()}
              disabled={!form.room_id || !form.intake_name.trim() || create.isPending}>
              {create.isPending ? 'Kaydediliyor...' : `+ KAYDET (${totalCount} parça)`}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
