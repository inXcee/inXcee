// Orkestratör — state + mutation burada; görsel parçalar newItem/ altında.
// CLOTHING_ICONS re-export'u korunur (AllRecordsTab/FullRecordsView/KanbanBoard/QuickAdd/roomsNewRecord buradan import eder).
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { BLOCK_BY_NAME } from '../../../shared/blocks.js'
import { DEFAULT_CLOTHING_TYPES } from './newItem/constants.js'
import { parseClothingText, parseClothingLine, parsePremiumLine, findRoom } from './newItem/parse.js'
import SignatureCanvas from './newItem/SignatureCanvas.jsx'
import PremiumSection from './newItem/PremiumSection.jsx'
import RegularSection from './newItem/RegularSection.jsx'

export { CLOTHING_ICONS } from './newItem/constants.js'

export default function NewItemModal({ onClose, roomPrefill = null }) {
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

  // Hızlı metin girişi (regular kıyafet)
  const [quickCloth, setQuickCloth] = useState('')
  // Başarılı kayıt sonrası banner
  const [savedMsg, setSavedMsg] = useState(false)
  const [signatureKey, setSignatureKey] = useState(0)

  // Premium parça girişi (local buffer — API'ye tek seferde gönderilir)
  const [premiumRows, setPremiumRows] = useState([])
  const [gType, setGType] = useState('')
  const [gForm, setGForm] = useState({ colors: [], pattern: '', brand: '', model: '', size: '', condition_notes: '' })
  const [gQty, setGQty] = useState(1)
  const [quickPremium, setQuickPremium] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms-list'],
    queryFn: () => laundryApi.getRooms(),
  })

  const filtered = rooms.filter(r =>
    !roomSearch || `${r.block} ${r.room_no}`.toLowerCase().includes(roomSearch.toLowerCase())
  )

  // roomPrefill ile gelirse modal açıldığında o oda seçili
  useEffect(() => {
    if (!roomPrefill || rooms.length === 0) return
    const match = rooms.find(r => r.block === roomPrefill.block && String(r.room_no) === String(roomPrefill.room_no))
    if (match) {
      setForm(f => ({ ...f, room_id: String(match.id) }))
      setRoomSearch(`${roomPrefill.block} ${roomPrefill.room_no}`)
    }
  }, [roomPrefill, rooms])

  useEffect(() => {
    if (!form.room_id) return
    setPhoneLoading(true)
    laundryApi.getRoomOccupant(form.room_id)
      .then(data => { if (data?.phone_number) set('phone_override', data.phone_number) })
      .finally(() => setPhoneLoading(false))
  }, [form.room_id])

  const selectedRoom = rooms.find(r => r.id === +form.room_id)
  // Y tipi bloklar premium (özel banyolu). M/S tipi standart akış.
  const isPremium = selectedRoom && BLOCK_BY_NAME[selectedRoom.block]?.type === 'Y'

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

  // Çok-segment: "3 gömlek mavi, 2 pantolon, çorap" → tek Enter'da hepsi
  const parsedClothList = useMemo(() => parseClothingLine(quickCloth, CLOTHING_TYPES), [quickCloth, CLOTHING_TYPES])

  const addQuickClothing = () => {
    if (parsedClothList.length === 0) return
    setClothing(prev => {
      const next = [...prev, ...parsedClothList.map(p => ({ type: p.type, color: p.color, qty: p.qty }))]
      saveDraft(next)
      return next
    })
    setQuickCloth('')
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

  const parsedPremiumList = useMemo(() => parsePremiumLine(quickPremium, CLOTHING_TYPES), [quickPremium, CLOTHING_TYPES])

  // Premium parça local ekleme
  const canAddPremium = !!gType
  const addPremiumRow = () => {
    if (!canAddPremium) return
    const row = {
      garment_type: gType,
      color: gForm.colors.length > 0 ? gForm.colors.join(', ') : undefined,
      pattern: gForm.pattern || undefined,
      brand: gForm.brand || undefined,
      model: gForm.model || undefined,
      size: gForm.size || undefined,
      condition_notes: gForm.condition_notes || undefined,
    }
    setPremiumRows(prev => [...prev, ...Array.from({ length: gQty }, () => ({ ...row }))])
    setGType('')
    setGForm({ colors: [], pattern: '', brand: '', model: '', size: '', condition_notes: '' })
    setGQty(1)
  }

  const addQuickPremiumRow = () => {
    if (parsedPremiumList.length === 0) return
    const rows = parsedPremiumList.flatMap(p => {
      const row = {
        garment_type: p.type,
        color: p.color || undefined,
        pattern: p.pattern || undefined,
        brand: p.brand || undefined,
        size: p.size || undefined,
      }
      return Array.from({ length: p.qty }, () => ({ ...row }))
    })
    setPremiumRows(prev => [...prev, ...rows])
    setQuickPremium('')
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
      // Oda seçimini koru, geri kalanı sıfırla
      setForm(f => ({ room_id: f.room_id, notes: '', urgent: false, phone_override: f.phone_override, intake_name: '', intake_signature: '' }))
      setClothing([])
      setPremiumRows([])
      setGType('')
      setGForm({ colors: [], pattern: '', brand: '', model: '', size: '', condition_notes: '' })
      setGQty(1)
      setNeedsIroning(!!isPremium)
      setQuickCloth('')
      setQuickPremium('')
      setItemCount(1)
      setSignatureKey(k => k + 1)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 3000)
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

          {/* ── Kayıt Başarı Banner ── */}
          {savedMsg && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)',
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', fontWeight: 700,
            }}>
              ✓ Kaydedildi — oda seçili, yeni giriş yapabilirsiniz
              <button className="btn btn-ghost btn-xs" onClick={onClose} style={{ marginLeft: 'auto' }}>Kapat</button>
            </div>
          )}

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
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                // "M1 205" tam eşleşme; yoksa filtre tek odaya inmişse onu seç
                const exact = findRoom(roomSearch, rooms) || (filtered.length === 1 ? filtered[0] : null)
                if (exact) { set('room_id', exact.id); setRoomSearch('') }
              }}
              placeholder="⚡ M1 205 yaz + Enter — veya ara..."
              style={{ marginBottom: 6 }} />
            {roomSearch.trim() && !selectedRoom && (() => {
              const exact = findRoom(roomSearch, rooms)
              return exact ? (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', marginBottom: 6 }}>
                  ↵ Enter → {exact.block} - {exact.room_no}
                </div>
              ) : null
            })()}
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
              key={signatureKey}
              onSign={sig => set('intake_signature', sig)}
              onClear={() => set('intake_signature', '')}
            />
          </div>

          {/* ── Premium Parça Girişi (sadece premium blok seçiliyse) ── */}
          {isPremium && (
            <PremiumSection
              clothingTypes={CLOTHING_TYPES}
              premiumRows={premiumRows}
              removePremiumRow={removePremiumRow}
              quickPremium={quickPremium}
              setQuickPremium={setQuickPremium}
              parsedPremiumList={parsedPremiumList}
              addQuickPremiumRow={addQuickPremiumRow}
              gType={gType}
              setGType={setGType}
              gForm={gForm}
              setGForm={setGForm}
              gQty={gQty}
              setGQty={setGQty}
              canAddPremium={canAddPremium}
              addPremiumRow={addPremiumRow}
            />
          )}

          {/* ── Kıyafet Girişi (regular) ── */}
          {!isPremium && (
            <RegularSection
              clothingTypes={CLOTHING_TYPES}
              clothing={clothing}
              totalCount={totalCount}
              quickCloth={quickCloth}
              setQuickCloth={setQuickCloth}
              parsedClothList={parsedClothList}
              addQuickClothing={addQuickClothing}
              addClothing={addClothing}
              removeClothing={removeClothing}
              updateClothing={updateClothing}
              itemCount={itemCount}
              setItemCount={setItemCount}
            />
          )}

          {/* ── Notlar (hem not olarak kaydedilir hem parça olarak eklenebilir) ── */}
          <div>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>NOTLAR / YAZIYLA EKLE</span>
              {form.notes.trim() && !isPremium && (
                <button type="button"
                  onClick={() => {
                    const parsed = parseClothingText(form.notes, CLOTHING_TYPES)
                    if (parsed.type) {
                      setClothing(prev => {
                        const next = [...prev, { type: parsed.type, color: parsed.color, qty: parsed.qty }]
                        saveDraft(next)
                        return next
                      })
                    }
                  }}
                  className="btn btn-ghost btn-xs"
                  style={{ fontSize: 9 }}
                  title="Nottaki ifadeyi parçaya çevirip listeye ekler — not da silinmez">
                  + Parça olarak da ekle
                </button>
              )}
            </label>
            <textarea className="form-input" value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Açıklama veya hızlı yaz (kelime hatası olsa da kaydedilir, sonra düzeltebilirsin)…"
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }} />
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
