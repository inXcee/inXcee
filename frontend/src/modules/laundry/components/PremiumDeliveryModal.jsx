import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import LaundryCardPanel from '../../laundry-kiosk/LaundryCardPanel.jsx'
import {
  cardGateReady, cardRequestFields, emptyLaundryCard, useLaundryCardRequirement,
} from '../laundryCard.js'

const MODAL_STYLE = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
}
const PANEL_STYLE = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh',
  overflowY: 'auto', padding: 24,
}

function SignaturePad({ onSign }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return [src.clientX - rect.left, src.clientY - rect.top]
  }

  const start = (e) => {
    drawing.current = true
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const [x, y] = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const draw = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const [x, y] = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.strokeStyle = 'var(--text)'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.stroke()
  }
  const end = () => {
    drawing.current = false
    onSign(canvasRef.current.toDataURL())
  }
  const clear = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    onSign(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>İMZA</span>
        <button onClick={clear} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', padding: '2px 6px',
        }}>Temizle</button>
      </div>
      <canvas
        ref={canvasRef}
        width={500} height={120}
        onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={draw} onTouchEnd={end}
        style={{
          width: '100%', height: 120, borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface2)',
          cursor: 'crosshair', touchAction: 'none',
        }}
      />
    </div>
  )
}

function ReceiptView({ receipt, onClose }) {
  const { item, garments } = receipt
  const delivered = garments.filter(g => g.status === 'delivered')
  return (
    <div style={MODAL_STYLE} onClick={onClose}>
      <div style={{ ...PANEL_STYLE, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2 }}>TESLİM BELGESİ</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 4 }}>
            {item.block} · {item.room_no} · {new Date().toLocaleDateString('tr-TR')}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {delivered.map(g => (
            <div key={g.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              background: 'var(--surface2)', borderRadius: 6,
              border: '1px solid var(--border)',
            }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9,
                padding: '1px 6px', borderRadius: 4,
                background: 'rgba(39,201,106,0.1)', border: '1px solid rgba(39,201,106,0.25)',
                color: 'var(--green)', flexShrink: 0,
              }}>{g.garment_code}</span>
              <span style={{ fontSize: 9, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                {g.garment_type}
                {g.brand ? ` · ${g.brand}` : ''}
                {g.size ? ` · ${g.size}` : ''}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>✓</span>
            </div>
          ))}
        </div>
        {delivered[0]?.delivered_to && (
          <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)', marginBottom: 12 }}>
            Teslim Alan: <strong>{delivered[0].delivered_to}</strong>
          </div>
        )}
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '10px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#000',
            fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Kapat
        </button>
      </div>
    </div>
  )
}

export default function PremiumDeliveryModal({ item, onClose }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(new Set())
  const [deliveredTo, setDeliveredTo] = useState('')
  const [signatureData, setSignatureData] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [laundryCard, setLaundryCard] = useState(emptyLaundryCard)
  const [cardWarning, setCardWarning] = useState('')
  const { required: cardRequired } = useLaundryCardRequirement('delivery')
  const cardReady = cardGateReady({ required: cardRequired, online: true, value: laundryCard })

  const { data: garments = [] } = useQuery({
    queryKey: ['premium-garments', item.id],
    queryFn: () => laundryApi.getPremiumGarments(item.id),
  })

  const readyGarments = garments.filter(g => g.status === 'ready')

  useEffect(() => {
    setSelected(new Set(readyGarments.map(g => g.id)))
  }, [garments.length])

  const deliverMut = useMutation({
    mutationFn: () => laundryApi.bulkDeliverPremiumGarments(
      item.id,
      [...selected],
      deliveredTo.trim(),
      signatureData,
      cardRequestFields(laundryCard)
    ),
    onSuccess: async (result) => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      if (result.card_warning) {
        setCardWarning(result.card_warning)
        return
      }
      const rec = await laundryApi.getPremiumDeliveryReceipt(item.id)
      setReceipt(rec)
    },
  })

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  if (receipt) return <ReceiptView receipt={receipt} onClose={onClose} />

  return (
    <div style={MODAL_STYLE} onClick={onClose}>
      <div style={PANEL_STYLE} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2 }}>Premium Teslim</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
              {item.block} · {item.room_no}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* Garment checkboxes */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: 1, marginBottom: 6 }}>
            TESLİM EDİLECEK PARÇALAR ({readyGarments.length} hazır)
          </div>
          {readyGarments.length === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Hazır parça yok.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {readyGarments.map(g => (
                <label key={g.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 6, cursor: 'pointer',
                  background: selected.has(g.id) ? 'rgba(39,201,106,0.07)' : 'var(--surface2)',
                  border: `1px solid ${selected.has(g.id) ? 'rgba(39,201,106,0.25)' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}>
                  <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggle(g.id)}
                    style={{ accentColor: 'var(--green)', width: 13, height: 13 }} />
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9,
                    padding: '1px 6px', borderRadius: 4,
                    background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.25)',
                    color: 'var(--accent)', flexShrink: 0,
                  }}>{g.garment_code}</span>
                  <span style={{ fontSize: 9, color: 'var(--text)', fontFamily: 'var(--mono)', flex: 1 }}>
                    {g.garment_type}
                    {g.brand ? ` · ${g.brand}` : ''}
                    {g.size ? ` · ${g.size}` : ''}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Delivered to */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: 1, display: 'block', marginBottom: 5 }}>
            TESLİM ALAN *
          </label>
          <input
            value={deliveredTo}
            onChange={e => setDeliveredTo(e.target.value)}
            placeholder="Ad Soyad"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none',
            }}
          />
        </div>

        {/* Signature pad */}
        <div style={{ marginBottom: 20 }}>
          <SignaturePad onSign={setSignatureData} />
        </div>

        <LaundryCardPanel
          action="delivery"
          required={cardRequired}
          room={{ item_id: item.id }}
          verifyCard={laundryApi.verifyCard}
          value={laundryCard}
          onChange={setLaundryCard}
          resetKey={item.id}
          captureHid
        />

        {cardWarning && <div className="alert alert-warning" style={{ marginTop: 12 }}>{cardWarning}</div>}

        {/* Submit */}
        <button
          onClick={() => cardWarning ? onClose() : deliverMut.mutate()}
          disabled={!cardWarning && (selected.size === 0 || !deliveredTo.trim() || !cardReady || deliverMut.isPending)}
          style={{
            width: '100%', padding: '11px', borderRadius: 8, border: 'none',
            background: selected.size > 0 && deliveredTo.trim() ? 'var(--green)' : 'var(--surface2)',
            color: selected.size > 0 && deliveredTo.trim() ? '#000' : 'var(--text3)',
            fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {cardWarning ? 'Kapat' : deliverMut.isPending ? 'Kaydediliyor...' : `${selected.size} Parça Teslim Et`}
        </button>
      </div>
    </div>
  )
}
