import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../laundry/api.js'
import RoomGridPicker from './RoomGridPicker.jsx'
import QuickGarmentInput from './QuickGarmentInput.jsx'
import { blockNeedsSignature } from './constants.js'

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
  const [urgent, setUrgent] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null) // { bag_no }

  const garmentTypes = useQuery({
    queryKey: ['garment-types'],
    queryFn: laundryApi.getGarmentTypes,
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

  function resetAll() {
    setSelection({ block: null, room_no: null, person: null })
    setGarmentState({ garments: [], freeText: '', itemCount: 0 })
    setUrgent(false)
    setError('')
    setSuccess(null)
    sigRef.current?.clear()
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
    }

    setSubmitting(true)
    try {
      const res = await kioskApi.post('/self-service/laundry-kiosk/bag', payload)
      setSuccess({ bag_no: res.data.bag_no })
    } catch (e) {
      setError(e.response?.data?.error || 'Hata oluştu')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 18 }}>Torba kaydedildi!</div>
        {success.bag_no && (
          <div style={{ background: '#1e293b', borderRadius: 12, padding: '16px 24px', display: 'inline-block', alignSelf: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 2, marginBottom: 4 }}>TORBA NO</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', letterSpacing: 4 }}>{success.bag_no}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Torbayı görevliye teslim edin</div>
          </div>
        )}
        <button onClick={resetAll} style={btnStyle('#1e293b', '#60a5fa')}>+ Yeni Giriş</button>
      </div>
    )
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#cbd5e1', margin: 0 }}>🧺 Giriş</h2>

      {/* 1. Room/Person */}
      <RoomGridPicker value={selection} onChange={setSelection} kioskApi={kioskApi} />

      {/* 2. Garments */}
      <div>
        <label style={lbl}>Kıyafetler</label>
        <QuickGarmentInput garmentTypes={garmentTypes} value={garmentState} onChange={setGarmentState} />
      </div>

      {/* 3. Options */}
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
