import { useRef, useState } from 'react'
import api from '../../shared/api/client.js'

const DEFAULT_ITEMS = [
  { item_name: 'Yatak Çarşafı', quantity: 2 },
  { item_name: 'Yastık Kılıfı', quantity: 2 },
  { item_name: 'Battaniye', quantity: 1 },
  { item_name: 'Havlu', quantity: 1 },
]

export default function ZimmetForm({ personnelId, onDone }) {
  const [items, setItems] = useState(DEFAULT_ITEMS.map(i => ({ ...i, checked: true })))
  const [signing, setSigning] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const lastPos = useRef(null)

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src = e.touches?.[0] || e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  const startDraw = (e) => {
    drawing.current = true
    lastPos.current = getPos(e, canvasRef.current)
  }

  const draw = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.strokeStyle = 'var(--accent)'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
  }

  const stopDraw = () => { drawing.current = false }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }

  const handleSubmit = async () => {
    setSaving(true)
    const canvas = canvasRef.current
    const signature = canvas.toDataURL()
    const selectedItems = items.filter(i => i.checked).map(({ item_name, quantity }) => ({ item_name, quantity }))
    try {
      await api.post('/checkin/zimmet', { personnel_id: personnelId, items: selectedItems })
      await api.post('/checkin/zimmet/sign', { personnel_id: personnelId, signature })
      setSubmitted(true)
      onDone?.()
    } catch (e) {
      alert('Zimmet kaydedilemedi: ' + (e.response?.data?.error || e.message))
    } finally { setSaving(false) }
  }

  if (submitted) {
    return (
      <div className="alert alert-success" style={{ margin: 0 }}>
        <span style={{ fontSize: '18px' }}>✓</span>
        <div>
          <div style={{ fontWeight: 600 }}>Zimmet kaydedildi ve imzalandı</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '2px', opacity: 0.8 }}>İşlem tamamlandı</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Items list */}
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '10px' }}>
          ZİMMET KALEMLERİ
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((item, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 12px', borderRadius: '7px', cursor: 'pointer',
              background: item.checked ? 'rgba(240,165,0,.06)' : 'var(--surface2)',
              border: `1px solid ${item.checked ? 'rgba(240,165,0,.2)' : 'var(--border)'}`,
              transition: 'all 0.15s',
            }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                border: `2px solid ${item.checked ? 'var(--accent)' : 'var(--border2)'}`,
                background: item.checked ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {item.checked && <span style={{ fontSize: '10px', color: '#000', fontWeight: 700 }}>✓</span>}
              </div>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={e => setItems(prev => prev.map((it, j) => j === i ? { ...it, checked: e.target.checked } : it))}
                style={{ display: 'none' }}
              />
              <span style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>{item.item_name}</span>
              <input
                type="number"
                value={item.quantity}
                min={1}
                onClick={e => e.preventDefault()}
                onChange={e => setItems(prev => prev.map((it, j) => j === i ? { ...it, quantity: +e.target.value } : it))}
                style={{
                  width: '48px', background: 'var(--surface3)', border: '1px solid var(--border)',
                  borderRadius: '5px', padding: '4px 8px', textAlign: 'center',
                  fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text)', outline: 'none',
                }}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Signature */}
      {!signing ? (
        <button onClick={() => setSigning(true)} className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
          ✍ İMZA AL
        </button>
      ) : (
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '8px' }}>
            İMZA ALANI
          </div>
          <canvas
            ref={canvasRef}
            width={500}
            height={150}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px',
              width: '100%', height: '150px', cursor: 'crosshair', touchAction: 'none', display: 'block',
            }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button onClick={clearCanvas} className="btn btn-ghost btn-sm">⌫ TEMİZLE</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn btn-primary btn-sm"
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'KAYDEDİLİYOR...' : '✓ ZİMMETİ KAYDET'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
