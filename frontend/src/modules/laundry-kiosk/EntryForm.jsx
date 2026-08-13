import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import RoomGridPicker from './RoomGridPicker.jsx'
import QuickGarmentInput from './QuickGarmentInput.jsx'
import { listQueued, enqueueBag, flushQueue, buildBagFormData, migrateLegacyLaundryQueue } from './offlineQueue.js'
import { listRecentRooms, rememberRoom } from './recentRooms.js'
import { downscalePhoto } from '../../shared/photo.js'
import { printLaundryLabel } from './hardwareAdapters.js'
import LaundryCardPanel from './LaundryCardPanel.jsx'
import {
  cacheCardSettings, cardGateMessage, cardGateReady, cardRequestFields,
  emptyLaundryCard, readCachedCardSettings,
} from './laundryCard.js'

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() ||
    `bag-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// ---- Signature pad (reused pattern) ----
function SigPad({ sigRef }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  useEffect(() => {
    if (sigRef) {
      sigRef.current = {
        isEmpty: () => !hasSig,
        toDataURL: () => canvasRef.current?.toDataURL(),
        clear: () => {
          canvasRef.current?.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
          setHasSig(false)
        },
      }
    }
  })

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
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke()
    setHasSig(true)
  }, [getPos])

  const stopDraw = useCallback(() => { drawing.current = false }, [])

  return (
    <div>
      <canvas ref={canvasRef} width={400} height={140}
        style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, display: 'block', cursor: 'crosshair', touchAction: 'none', width: '100%' }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      {hasSig && (
        <button type="button" onClick={() => sigRef.current?.clear()}
          style={{ marginTop: 4, fontSize: 11, color: '#64748b', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          Temizle
        </button>
      )}
    </div>
  )
}

// ---- Main component ----
const lbl = { display: 'block', fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }
const card = { background: '#0f172a', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }
const btnStyle = (bg, color = '#fff', disabled = false) => ({
  padding: '14px 20px', borderRadius: 12, border: 'none',
  background: disabled ? '#1e293b' : bg, color: disabled ? '#475569' : color,
  fontWeight: 700, fontSize: 15, cursor: disabled ? 'default' : 'pointer',
})

const STEPS = [
  { number: 1, title: 'Oda ve kişi', description: 'Son kullanılan odalardan seç ya da ızgaradan bul' },
  { number: 2, title: 'Kıyafetleri ekle', description: 'Kartlara dokun veya “3 mavi gömlek” yaz' },
  { number: 3, title: 'Kontrol ve kaydet', description: 'Fotoğraf, acil ve imza' },
]

export default function EntryForm({ kioskApi, focusedRoom, onConsumeFocus }) {
  const sigRef = useRef(null)
  const [selection, setSelection] = useState({ block: null, room_no: null, person: null })
  const [step, setStep] = useState(1)
  const [recentRooms, setRecentRooms] = useState(listRecentRooms)

  // focusedRoom ile gelirse otomatik seçili hale getir (Odalar tab'ından gelince)
  useEffect(() => {
    if (focusedRoom && focusedRoom.block && focusedRoom.room_no) {
      setSelection({ block: focusedRoom.block, room_no: String(focusedRoom.room_no), person: null })
      setStep(2) // oda zaten belli — operatörü doğrudan kıyafet adımına al
      onConsumeFocus?.()
    }
  }, [focusedRoom])  // eslint-disable-line react-hooks/exhaustive-deps
  const [garmentState, setGarmentState] = useState({ garments: [], freeText: '', itemCount: 0 })
  const [clientRequestId, setClientRequestId] = useState(newRequestId)
  const [urgent, setUrgent] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null) // { bag_no } | { queued: true }
  const [photoDataUrl, setPhotoDataUrl] = useState(null)
  const [queuedCount, setQueuedCount] = useState(0)
  const [flushMsg, setFlushMsg] = useState(null)
  const [lastBagGarments, setLastBagGarments] = useState(null) // { count, garments } | null
  const [laundryCard, setLaundryCard] = useState(emptyLaundryCard)

  // Çevrimdışı kuyruğu boşalt — açılışta + bağlantı gelince
  const tryFlush = useCallback(async () => {
    if ((await listQueued()).length === 0) return
    const result = await flushQueue((fd, idempotencyKey) => kioskApi.post('/self-service/laundry-kiosk/bag', fd, {
      headers: { 'X-Idempotency-Key': idempotencyKey },
    }))
    setQueuedCount(result.remaining)
    if (result.sent > 0 || result.rejected.length > 0 || result.conflicts.length > 0) {
      setFlushMsg(
        `✓ ${result.sent} bekleyen giriş gönderildi` +
        (result.rejected.length > 0 ? ` · ${result.rejected.length} inceleme bekliyor (${result.rejected[0].error})` : '') +
        (result.conflicts.length > 0 ? ` · ${result.conflicts.length} çakışma` : '')
      )
      setTimeout(() => setFlushMsg(null), 6000)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    migrateLegacyLaundryQueue()
      .then(() => listQueued())
      .then(queue => setQueuedCount(queue.length))
      .then(tryFlush)
      .catch(error => setFlushMsg(error.message))
    window.addEventListener('online', tryFlush)
    return () => window.removeEventListener('online', tryFlush)
  }, [tryFlush])

  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const [activeByPerson, setActiveByPerson] = useState([]) // [{ name, count, statuses }]

  const cardSettings = useQuery({
    queryKey: ['laundry-kiosk-card-settings'],
    queryFn: () => kioskApi.get('/self-service/laundry-kiosk/card-settings').then(response => cacheCardSettings(response.data)),
    initialData: readCachedCardSettings,
    staleTime: 30000,
    retry: false,
  }).data
  const cardRequired = Boolean(cardSettings?.intake_required)
  const cardReady = cardGateReady({ required: cardRequired, online: isOnline, value: laundryCard })

  // Oda seçilince son torbanın kıyafet listesini hazırla — "↺ kopyala" için.
  // Aynı kişi her hafta benzer torba verir; tek tuşla tekrar girişi hızlandırır.
  // Aynı yanıttan kişi bazlı aktif torba kırılımı da çıkar (aynı odada birden
  // çok kişi torba verir — kimin kaç torbası içeride görünür olsun).
  useEffect(() => {
    setLastBagGarments(null)
    setActiveByPerson([])
    if (!selection.block || !selection.room_no) return
    let cancelled = false
    kioskApi.get(`/self-service/laundry-kiosk/room-history?block=${encodeURIComponent(selection.block)}&room_no=${encodeURIComponent(selection.room_no)}`)
      .then(r => {
        if (cancelled) return
        const items = r.data.items || []
        // Kişi kırılımı: aktif (teslim/kayıp olmayan) torbalar veren kişiye göre
        const grouped = {}
        for (const it of items) {
          if (it.status === 'delivered' || it.status === 'lost') continue
          const name = it.intake_name || 'Kişisiz'
          if (!grouped[name]) grouped[name] = { name, count: 0, statuses: {} }
          grouped[name].count += 1
          grouped[name].statuses[it.status] = (grouped[name].statuses[it.status] || 0) + 1
        }
        setActiveByPerson(Object.values(grouped).sort((a, b) => b.count - a.count))

        const withGarments = items.find(it => {
          try { return JSON.parse(it.garments_json || '[]').length > 0 } catch { return false }
        })
        if (!withGarments) return
        const parsed = JSON.parse(withGarments.garments_json)
        // garments_json farklı kaynaklardan gelmiş olabilir — alanları savunmacı eşle
        const mapped = parsed.map(g => ({
          type_id: g.type_id ?? null,
          type_name: g.type_name || g.garment_type || g.type || 'Parça',
          emoji: g.emoji || '👕',
          count: Number(g.count) || 1,
          colors: Array.isArray(g.colors) ? g.colors : [],
          pattern: g.pattern || 'solid',
          pattern_label: g.pattern_label || 'Düz',
          requires_ironing: g.requires_ironing,
        }))
        setLastBagGarments({ count: mapped.reduce((s, g) => s + g.count, 0), garments: mapped })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selection.block, selection.room_no])  // eslint-disable-line react-hooks/exhaustive-deps

  const garmentTypes = useQuery({
    queryKey: ['garment-types', 'laundry-kiosk'],
    queryFn: () => kioskApi
      .get('/self-service/laundry-kiosk/garment-types')
      .then(response => response.data),
    staleTime: 300000,
  }).data ?? []

  const blockConfigResult = useQuery({
    queryKey: ['laundry-kiosk-block-config'],
    queryFn: () => kioskApi
      .get('/self-service/laundry-kiosk/block-config')
      .then(response => response.data),
    staleTime: 60000,
  }).data
  const blockConfig = Array.isArray(blockConfigResult) ? blockConfigResult : []
  const selectedBlockConfig = blockConfig.find(item => item.block === selection.block)
  const isPremiumBlock = selectedBlockConfig?.is_premium === 1

  // Arşivde geçen markalar — künye alanında öneri olarak çıkar.
  const brandSuggestions = useQuery({
    queryKey: ['kiosk-brands'],
    queryFn: () => kioskApi.get('/self-service/laundry-kiosk/brands').then(r => r.data),
    staleTime: 300000,
  }).data ?? []

  // Odanın dolabı — daha önce görülmüş kıyafetler. Tek dokunuşla geri eklenir,
  // marka/beden tekrar yazılmaz.
  const [wardrobe, setWardrobe] = useState([])
  useEffect(() => {
    setWardrobe([])
    if (!selection.block || !selection.room_no) return
    let cancelled = false
    const owner = selection.person?.full_name
    kioskApi.get(
      `/self-service/laundry-kiosk/room-wardrobe?block=${encodeURIComponent(selection.block)}` +
      `&room_no=${encodeURIComponent(selection.room_no)}` +
      (owner ? `&owner_name=${encodeURIComponent(owner)}` : '')
    )
      .then(r => { if (!cancelled) setWardrobe(r.data || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selection.block, selection.room_no, selection.person?.full_name])  // eslint-disable-line react-hooks/exhaustive-deps

  // Aynı künyeden bir tane daha varsa adedi artır, yoksa yeni satır aç.
  function addFromWardrobe(item) {
    setGarmentState(current => {
      const list = current.garments || []
      const index = list.findIndex(g =>
        g.type_name === item.type_name &&
        (g.brand || '') === (item.brand || '') &&
        (g.size || '') === (item.size || '')
      )
      if (index !== -1) {
        return {
          ...current,
          garments: list.map((g, i) => (i === index ? { ...g, count: (g.count || 1) + 1 } : g)),
        }
      }
      return {
        ...current,
        garments: [...list, {
          type_id: item.garment_type_id || null,
          type_name: item.type_name,
          emoji: item.emoji || '👕',
          count: 1,
          colors: Array.isArray(item.colors) ? item.colors : [],
          pattern: item.pattern || 'solid',
          pattern_label: 'Düz',
          requires_ironing: isPremiumBlock && item.requires_ironing === 1,
          brand: item.brand || null,
          size: item.size || null,
          condition_notes: item.notes || null,
        }],
      }
    })
  }

  // İmza hizmet tipine bağlıdır: standart blokta zorunlu, premium blokta isteğe bağlıdır.
  // Config henüz yüklenmediyse güvenli tarafta kalıp imzayı isteriz.
  const needsSig = Boolean(selection.block) && !isPremiumBlock

  // Derived: effective item_count — fotoğraflı eklendiyse onların toplamı,
  // yoksa kullanıcının seçtiği parça sayısı.
  const structuredCount = garmentState.garments.reduce((acc, g) => acc + (g.count || 1), 0)
  const derivedItemCount = structuredCount > 0 ? structuredCount : garmentState.itemCount

  // Validation
  const canSubmit = (
    selection.block &&
    selection.room_no &&
    derivedItemCount > 0
  )

  // Adım geçiş kuralları — her adımın kendi şartı var, "İleri" o şart
  // sağlanmadan açılmaz (eskiden hepsi tek sayfadaydı, hata ancak kaydette çıkıyordu).
  const stepReady = {
    1: Boolean(selection.block && selection.room_no),
    2: derivedItemCount > 0,
    3: true,
  }

  function goNext() {
    if (!stepReady[step]) {
      setError(step === 1 ? 'Blok ve oda seçin' : 'Kıyafet ekleyin veya parça sayısını işaretleyin')
      return
    }
    setError('')
    setStep(s => Math.min(3, s + 1))
  }

  // keepBlock: ardışık girişte aynı bloktan devam — operatör blok seçimini tekrarlamaz
  function resetAll(keepBlock = false) {
    setSelection({ block: keepBlock ? selection.block : null, room_no: null, person: null })
    setGarmentState({ garments: [], freeText: '', itemCount: 0 })
    setUrgent(false)
    setClientRequestId(newRequestId())
    setError('')
    setSuccess(null)
    setPhotoDataUrl(null)
    setLaundryCard(emptyLaundryCard())
    setStep(1)
    sigRef.current?.clear()
  }

  async function onPhotoPick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // aynı dosya tekrar seçilebilsin
    if (!file) return
    try { setPhotoDataUrl(await downscalePhoto(file)) }
    catch { setError('Fotoğraf okunamadı') }
  }

  async function submit() {
    setError('')
    if (!selection.block || !selection.room_no) return setError('Blok ve oda seçin')
    if (derivedItemCount === 0) return setError('Kıyafet ekleyin (fotoğraflı seçin veya parça sayısını işaretleyin)')
    if (!cardReady) return setError(cardGateMessage({ required: cardRequired, online: isOnline, value: laundryCard }))

    let sig = null
    if (needsSig) {
      if (sigRef.current?.isEmpty()) return setError('İmza gerekli')
      sig = sigRef.current?.toDataURL()
    }

    const normalizedGarments = garmentState.garments.map(garment => ({
      ...garment,
      requires_ironing: isPremiumBlock && Boolean(garment.requires_ironing),
    }))
    const freeText = (garmentState.freeText || '').trim()
    const payload = {
      block: selection.block,
      room_no: selection.room_no,
      personnel_id: selection.person?.id || null,
      item_count: derivedItemCount,
      is_premium: isPremiumBlock,
      garments: normalizedGarments.length > 0 ? normalizedGarments : null,
      notes: freeText || null,
      urgent,
      intake_signature: sig,
      client_request_id: clientRequestId,
      tracking_mode: normalizedGarments.length > 0 ? 'individual' : 'count_only',
      ...cardRequestFields(laundryCard),
    }

    setSubmitting(true)
    try {
      const res = await kioskApi.post('/self-service/laundry-kiosk/bag', buildBagFormData(payload, photoDataUrl))
      setRecentRooms(rememberRoom(selection))
      setSuccess({
        bag_no: res.data.bag_no,
        garments: res.data.garments || [],
        idempotent: res.data.idempotent,
        room: `${selection.block}-${selection.room_no}`,
        owner: selection.person?.full_name || null,
        item_count: derivedItemCount,
        card_warning: res.data.card_warning || null,
      })
    } catch (e) {
      if (!e.response) {
        // Ağ yok — veri, fotoğraf ve imza AES-GCM ile şifrelenip IndexedDB kuyruğunda korunur.
        try {
          const n = await enqueueBag({
            payload,
            photoDataUrl,
            label: `${selection.block}-${selection.room_no} · ${derivedItemCount} parça`,
          })
          setQueuedCount(n)
          setRecentRooms(rememberRoom(selection))
          setSuccess({ queued: true, encrypted: true })
        } catch (queueErr) {
          setError(queueErr.message)
        }
      } else {
        setError(e.response?.data?.error || 'Hata oluştu')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 56 }}>{success.queued ? '📡' : '✅'}</div>
        <div style={{ color: success.queued ? '#fbbf24' : '#4ade80', fontWeight: 700, fontSize: 18 }}>
          {success.queued ? 'İnternet yok — giriş kuyruğa alındı' : 'Torba kaydedildi!'}
        </div>
        {success.queued && (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            Veri, fotoğraf ve imza şifreli saklandı. Bağlantı gelince otomatik gönderilecek ({queuedCount} bekleyen).
          </div>
        )}
        {success.card_warning && (
          <div role="alert" style={{ color: '#fcd34d', background: 'rgba(245,158,11,.12)', border: '1px solid #f59e0b', borderRadius: 10, padding: 10 }}>
            ⚠ {success.card_warning}
          </div>
        )}
        {success.bag_no && (
          <div style={{ background: '#1e293b', borderRadius: 12, padding: '16px 24px', display: 'inline-block', alignSelf: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 2, marginBottom: 4 }}>TORBA NO</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', letterSpacing: 4 }}>{success.bag_no}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Torbayı görevliye teslim edin</div>
            <button type="button" onClick={() => printLaundryLabel({ code: success.bag_no, room: success.room, owner: success.owner, itemCount: success.item_count }).catch(printError => setError(printError.message))} style={{ ...btnStyle('#0e7490', '#fff'), marginTop: 12, width: '100%' }}>QR etiketi yazdır</button>
          </div>
        )}
        {success.garments?.length > 0 && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>
              OLUŞTURULAN KIYAFET KODLARI
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {success.garments.map(garment => (
                <span key={garment.id} style={{
                  borderRadius: 9,
                  padding: '6px 9px',
                  background: '#1e293b',
                  color: '#bae6fd',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  fontWeight: 800,
                }}>
                  {garment.garment_code}
                </span>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {selection.block && (
            <button onClick={() => resetAll(true)} style={btnStyle('#1d4ed8', '#fff')}>
              + Yeni Giriş ({selection.block})
            </button>
          )}
          <button onClick={() => resetAll(false)} style={btnStyle('#1e293b', '#60a5fa')}>+ Yeni Giriş</button>
        </div>
      </div>
    )
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#cbd5e1', margin: 0 }}>🧺 Giriş</h2>

      {/* Çevrimdışı kuyruk durumu */}
      {queuedCount > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ flex: 1, fontSize: 13, color: '#fbbf24', fontWeight: 600 }}>
            📡 {queuedCount} bekleyen çevrimdışı giriş
          </span>
          <button type="button" onClick={tryFlush}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#b45309', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            ↻ Şimdi Gönder
          </button>
        </div>
      )}
      {flushMsg && <div style={{ color: '#4ade80', fontSize: 13 }}>{flushMsg}</div>}

      <StepProgress steps={STEPS} current={step} />
      <StepHeader
        number={String(step)}
        title={STEPS[step - 1].title}
        description={step === 3 ? `${derivedItemCount} parça · fotoğraf, acil ve imza` : STEPS[step - 1].description}
      />

      {/* ── ADIM 1: Oda ve kişi ── */}
      {step === 1 && recentRooms.length > 0 && (
        <div>
          <label style={lbl}>Son kullanılan odalar</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {recentRooms.map(r => {
              const active = selection.block === r.block && selection.room_no === r.room_no
              return (
                <button key={`${r.block}-${r.room_no}`} type="button"
                  onClick={() => setSelection({ block: r.block, room_no: r.room_no, person: null })}
                  style={{
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${active ? '#3b82f6' : '#334155'}`,
                    background: active ? 'rgba(29,78,216,0.18)' : '#1e293b',
                    color: active ? '#93c5fd' : '#cbd5e1', fontSize: 13, fontWeight: 700,
                  }}>
                  {r.block}-{r.room_no}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {step === 1 && <RoomGridPicker value={selection} onChange={setSelection} kioskApi={kioskApi} />}

      {/* Kişi bazlı içeride-torba kırılımı — mükerrer girişi ve "torbam nerede"
          karışıklığını önler */}
      {step === 1 && activeByPerson.length > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 10, padding: '10px 14px',
        }}>
          <div style={{ fontSize: 10, color: '#fbbf24', letterSpacing: 1, marginBottom: 6 }}>
            📦 BU ODADAN İÇERİDE OLAN TORBALAR
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {activeByPerson.map(p => (
              <div key={p.name} style={{ fontSize: 12, color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600, color: selection.person?.full_name === p.name ? '#fbbf24' : '#e2e8f0' }}>
                  👤 {p.name}{selection.person?.full_name === p.name ? ' (seçili kişi!)' : ''}
                </span>
                <span style={{ color: '#94a3b8' }}>
                  {p.count} torba · {Object.entries(p.statuses).map(([s, n]) =>
                    `${n} ${s === 'dirty' ? 'kirli' : s === 'washing' ? 'makinede' : s === 'ironing' ? 'ütüde' : s === 'ready' ? 'hazır' : s}`
                  ).join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ADIM 2: Kıyafetler ── */}
      {step === 2 && (
      <div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
          📍 {selection.block}-{selection.room_no}{selection.person?.full_name ? ` · ${selection.person.full_name}` : ''}
        </div>
        <div style={{
          marginBottom: 10, padding: '9px 12px', borderRadius: 10,
          background: isPremiumBlock ? 'rgba(124,58,237,0.12)' : 'rgba(15,118,110,0.12)',
          border: `1px solid ${isPremiumBlock ? 'rgba(167,139,250,0.4)' : 'rgba(45,212,191,0.35)'}`,
          color: isPremiumBlock ? '#c4b5fd' : '#99f6e4', fontSize: 12, fontWeight: 800,
        }}>
          {isPremiumBlock ? '♨️ Premium blok · kıyafet bazında ütü seçilebilir' : '✓ Standart blok · ütü hizmeti uygulanmaz'}
        </div>
        {/* Odanın dolabı — arşivdeki kıyafetler. Marka/beden dahil geri gelir. */}
        {wardrobe.length > 0 && (
          <div style={{
            marginBottom: 10, padding: '10px 12px', borderRadius: 10,
            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 10, color: '#93c5fd', letterSpacing: 1 }}>
                🗄️ BU ODANIN DOLABI ({wardrobe.length})
              </span>
              <button type="button" onClick={() => wardrobe.forEach(addFromWardrobe)}
                style={{
                  minHeight: 32, padding: '0 10px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid #1d4ed8', background: 'rgba(29,78,216,0.2)',
                  color: '#93c5fd', fontSize: 11, fontWeight: 800,
                }}>
                Hepsini ekle
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {wardrobe.map(item => (
                <button key={item.id} type="button" onClick={() => addFromWardrobe(item)}
                  style={{
                    minHeight: 44, padding: '6px 10px', borderRadius: 10, cursor: 'pointer',
                    border: '1px solid #334155', background: '#1e293b',
                    color: '#e2e8f0', fontSize: 12, fontWeight: 700, textAlign: 'left',
                  }}>
                  {item.emoji || '👕'} {item.type_name}
                  {(item.brand || item.size) && (
                    <span style={{ color: '#93c5fd', fontWeight: 600 }}>
                      {' · '}{[item.brand, item.size].filter(Boolean).join(' ')}
                    </span>
                  )}
                  <span style={{ color: '#64748b', fontWeight: 600 }}> ×{item.times_seen}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {lastBagGarments && garmentState.garments.length === 0 && (
          <button type="button"
            onClick={() => setGarmentState(s => ({
              ...s,
              garments: lastBagGarments.garments.map(garment => ({
                ...garment,
                requires_ironing: isPremiumBlock && Boolean(garment.requires_ironing),
              })),
            }))}
            style={{
              width: '100%', marginBottom: 10, padding: '10px 14px', borderRadius: 10,
              border: '1px dashed #3b82f6', background: 'rgba(29,78,216,0.08)',
              color: '#93c5fd', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
            }}>
            ↺ Son torbayı kopyala ({lastBagGarments.count} parça: {lastBagGarments.garments.slice(0, 4).map(g => `${g.count > 1 ? g.count + '× ' : ''}${g.type_name}`).join(', ')}{lastBagGarments.garments.length > 4 ? '…' : ''})
          </button>
        )}
        <QuickGarmentInput
          garmentTypes={garmentTypes}
          value={garmentState}
          onChange={setGarmentState}
          brandSuggestions={brandSuggestions}
          allowIroning={isPremiumBlock}
        />
      </div>
      )}

      {/* ── ADIM 3: Fotoğraf (kayıp itirazına kanıt), acil, imza ── */}
      {step === 3 && (
      <>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>
        📍 {selection.block}-{selection.room_no} · 🧺 {derivedItemCount} parça
      </div>
      {!isOnline && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)',
          borderRadius: 10, padding: '10px 14px', color: '#fbbf24', fontSize: 12,
        }}>
          📡 Çevrimdışısınız — kayıt, fotoğraf ve imza bu cihazda AES-GCM ile şifrelenerek güvenli kuyruğa alınacak.
        </div>
      )}
      <LaundryCardPanel
        action="intake"
        required={cardRequired}
        room={{ block: selection.block, room_no: selection.room_no }}
        kioskApi={kioskApi}
        value={laundryCard}
        onChange={setLaundryCard}
        online={isOnline}
        resetKey={`${selection.block || ''}|${selection.room_no || ''}|${selection.person?.id || ''}`}
      />
      <div>
        <label style={lbl}>Fotoğraf (opsiyonel)</label>
        {photoDataUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={photoDataUrl} alt="torba" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 10, border: '1px solid #334155' }} />
            <button type="button" onClick={() => setPhotoDataUrl(null)}
              style={{ background: 'transparent', border: '1px dashed #475569', borderRadius: 8, color: '#94a3b8', fontSize: 12, padding: '8px 12px', cursor: 'pointer' }}>
              ✕ Kaldır
            </button>
          </div>
        ) : (
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: '#1e293b', border: '1px dashed #475569', borderRadius: 10,
            padding: '12px', color: '#94a3b8', fontSize: 13, cursor: 'pointer',
          }}>
            📷 Fotoğraf çek / seç
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPhotoPick} />
          </label>
        )}
      </div>

      {/* 4. Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 14, color: '#fbbf24', fontWeight: 600 }}>⚡ Acil</span>
        </label>
      </div>

      {/* İmza (blok kuralına göre) */}
      {needsSig && (
        <div>
          <label style={lbl}>Giriş imzası · zorunlu</label>
          <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 7 }}>
            Standart blok teslim zinciri için çamaşırı veren kişi imzalar.
          </div>
          <SigPad sigRef={sigRef} />
        </div>
      )}
      </>
      )}

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      {/* Adım gezinme — son adımda kaydet */}
      <div style={{ display: 'flex', gap: 8 }}>
        {step > 1 && (
          <button type="button" onClick={() => { setError(''); setStep(s => s - 1) }}
            style={{ ...btnStyle('#1e293b', '#94a3b8'), flex: '0 0 auto' }}>
            ← Geri
          </button>
        )}
        {step < 3 ? (
          <button type="button" onClick={goNext} disabled={!stepReady[step]}
            style={{ ...btnStyle('#2563eb', '#fff', !stepReady[step]), flex: 1 }}>
            İleri →
          </button>
        ) : (
          <button onClick={submit} disabled={!canSubmit || !cardReady || submitting}
            style={{ ...btnStyle('#2563eb', '#fff', !canSubmit || !cardReady || submitting), flex: 1 }}>
            {submitting ? 'Kaydediliyor…' : '✓ Torba Kaydet'}
          </button>
        )}
      </div>
    </div>
  )
}

// Adım göstergesi — operatör kaç adım kaldığını görsün, tamamlananlara dönebilsin.
function StepProgress({ steps, current }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {steps.map(s => (
        <div key={s.number} style={{
          flex: 1, height: 4, borderRadius: 2,
          background: s.number <= current ? '#3b82f6' : '#1e293b',
        }} />
      ))}
    </div>
  )
}

function StepHeader({ number, title, description }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
      <span style={{
        width: 30,
        height: 30,
        borderRadius: 10,
        display: 'grid',
        placeItems: 'center',
        background: '#1d4ed8',
        color: '#fff',
        fontWeight: 900,
        fontSize: 13,
        flexShrink: 0,
      }}>
        {number}
      </span>
      <span>
        <strong style={{ display: 'block', color: '#e2e8f0', fontSize: 13 }}>{title}</strong>
        <span style={{ color: '#64748b', fontSize: 11 }}>{description}</span>
      </span>
    </div>
  )
}
