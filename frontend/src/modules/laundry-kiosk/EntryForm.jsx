import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import RoomGridPicker from './RoomGridPicker.jsx'
import QuickGarmentInput from './QuickGarmentInput.jsx'
import { blockNeedsSignature } from './constants.js'
import { listQueued, enqueueBag, flushQueue, buildBagFormData } from './offlineQueue.js'
import { downscalePhoto } from '../../shared/photo.js'

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

export default function EntryForm({ kioskApi, focusedRoom, onConsumeFocus }) {
  const sigRef = useRef(null)
  const [selection, setSelection] = useState({ block: null, room_no: null, person: null })

  // focusedRoom ile gelirse otomatik seçili hale getir (Odalar tab'ından gelince)
  useEffect(() => {
    if (focusedRoom && focusedRoom.block && focusedRoom.room_no) {
      setSelection({ block: focusedRoom.block, room_no: String(focusedRoom.room_no), person: null })
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
  const [queuedCount, setQueuedCount] = useState(() => listQueued().length)
  const [flushMsg, setFlushMsg] = useState(null)
  const [lastBagGarments, setLastBagGarments] = useState(null) // { count, garments } | null

  // Çevrimdışı kuyruğu boşalt — açılışta + bağlantı gelince
  const tryFlush = useCallback(async () => {
    if (listQueued().length === 0) return
    const result = await flushQueue((fd) => kioskApi.post('/self-service/laundry-kiosk/bag', fd))
    setQueuedCount(result.remaining)
    if (result.sent > 0 || result.rejected.length > 0) {
      setFlushMsg(
        `✓ ${result.sent} bekleyen giriş gönderildi` +
        (result.rejected.length > 0 ? ` · ${result.rejected.length} reddedildi (${result.rejected[0].error})` : '')
      )
      setTimeout(() => setFlushMsg(null), 6000)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tryFlush()
    window.addEventListener('online', tryFlush)
    return () => window.removeEventListener('online', tryFlush)
  }, [tryFlush])
  const [activeByPerson, setActiveByPerson] = useState([]) // [{ name, count, statuses }]

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

  const needsSig = selection.block ? blockNeedsSignature(selection.block) : false

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

  // keepBlock: ardışık girişte aynı bloktan devam — operatör blok seçimini tekrarlamaz
  function resetAll(keepBlock = false) {
    setSelection({ block: keepBlock ? selection.block : null, room_no: null, person: null })
    setGarmentState({ garments: [], freeText: '', itemCount: 0 })
    setUrgent(false)
    setClientRequestId(newRequestId())
    setError('')
    setSuccess(null)
    setPhotoDataUrl(null)
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

    let sig = null
    if (needsSig) {
      if (sigRef.current?.isEmpty()) return setError('İmza gerekli')
      sig = sigRef.current?.toDataURL()
    }

    const isPremium = garmentState.garments.length > 0
    const freeText = (garmentState.freeText || '').trim()
    const payload = {
      block: selection.block,
      room_no: selection.room_no,
      personnel_id: selection.person?.id || null,
      item_count: derivedItemCount,
      is_premium: isPremium,
      garments: isPremium ? garmentState.garments : null,
      notes: freeText || null,
      urgent,
      intake_signature: sig,
      client_request_id: clientRequestId,
      tracking_mode: isPremium ? 'individual' : 'count_only',
    }

    setSubmitting(true)
    try {
      const res = await kioskApi.post('/self-service/laundry-kiosk/bag', buildBagFormData(payload, photoDataUrl))
      setSuccess({
        bag_no: res.data.bag_no,
        garments: res.data.garments || [],
        idempotent: res.data.idempotent,
      })
    } catch (e) {
      if (!e.response) {
        // Ağ yok — kuyruğa al, bağlantı gelince otomatik gönderilir.
        // Fotoğraf ve imza kuyruğa GİRMEZ (localStorage şifresiz, cihaz paylaşımlı);
        // kuyruk dolu/kota hatasında enqueueBag throw eder — form sıfırlanmaz, hata gösterilir.
        try {
          const n = enqueueBag({
            payload,
            label: `${selection.block}-${selection.room_no} · ${derivedItemCount} parça`,
          })
          setQueuedCount(n)
          setSuccess({ queued: true, droppedPhoto: !!photoDataUrl, droppedSignature: !!sig })
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
        {success.queued && (success.droppedPhoto || success.droppedSignature) && (
          <div style={{ color: '#fbbf24', fontSize: 12, marginTop: 6 }}>
            ⚠ {[success.droppedPhoto && 'Fotoğraf', success.droppedSignature && 'İmza'].filter(Boolean).join(' ve ')} çevrimdışı
            kuyruğa alınmadı — bağlantı gelince kayda ekleyin.
          </div>
        )}
        {success.queued && (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            Bağlantı gelince otomatik gönderilecek ({queuedCount} bekleyen)
          </div>
        )}
        {success.bag_no && (
          <div style={{ background: '#1e293b', borderRadius: 12, padding: '16px 24px', display: 'inline-block', alignSelf: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 2, marginBottom: 4 }}>TORBA NO</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', letterSpacing: 4 }}>{success.bag_no}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Torbayı görevliye teslim edin</div>
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

      <StepHeader number="1" title="Oda ve kişi" description="Son kullanılan oda ve sakinlerden seçin" />
      {/* 1. Room/Person */}
      <RoomGridPicker value={selection} onChange={setSelection} kioskApi={kioskApi} />

      {/* Kişi bazlı içeride-torba kırılımı — mükerrer girişi ve "torbam nerede"
          karışıklığını önler */}
      {activeByPerson.length > 0 && (
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

      {/* 2. Garments */}
      <div>
        <StepHeader number="2" title="Kıyafetleri ekle" description="Kartlara dokun veya “3 mavi gömlek” yaz" />
        {lastBagGarments && garmentState.garments.length === 0 && (
          <button type="button"
            onClick={() => setGarmentState(s => ({ ...s, garments: lastBagGarments.garments }))}
            style={{
              width: '100%', marginBottom: 10, padding: '10px 14px', borderRadius: 10,
              border: '1px dashed #3b82f6', background: 'rgba(29,78,216,0.08)',
              color: '#93c5fd', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
            }}>
            ↺ Son torbayı kopyala ({lastBagGarments.count} parça: {lastBagGarments.garments.slice(0, 4).map(g => `${g.count > 1 ? g.count + '× ' : ''}${g.type_name}`).join(', ')}{lastBagGarments.garments.length > 4 ? '…' : ''})
          </button>
        )}
        <QuickGarmentInput garmentTypes={garmentTypes} value={garmentState} onChange={setGarmentState} />
      </div>

      {/* 3. Fotoğraf — özellikle premium/pahalı parçalarda kayıp itirazına kanıt */}
      <StepHeader number="3" title="Kontrol ve kaydet" description={`${derivedItemCount} parça · ütü seçenekleri ve fotoğraf`} />
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

      {/* 4. Signature (conditional) */}
      {needsSig && (
        <div>
          <label style={lbl}>İmza</label>
          <SigPad sigRef={sigRef} />
        </div>
      )}

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      <button onClick={submit} disabled={!canSubmit || submitting}
        style={btnStyle('#2563eb', '#fff', !canSubmit || submitting)}>
        {submitting ? 'Kaydediliyor…' : '✓ Torba Kaydet'}
      </button>
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
