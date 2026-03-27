import { useState, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function DeliveryModal({ item, onClose }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [signing, setSigning] = useState(false)
  const canvasRef = useRef(null)
  const drawing = useRef(false)

  const deliver = useMutation({
    mutationFn: () => {
      const sig = signing && canvasRef.current ? canvasRef.current.toDataURL() : undefined
      return laundryApi.deliverItem(item.id, { delivered_to: name, signature_data: sig })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); onClose() },
  })

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const touch = e.touches ? e.touches[0] : e
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  }, [])

  const startDraw = useCallback((e) => {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }, [getPos])

  const draw = useCallback((e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = 'var(--text, #dde4f0)'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.stroke()
  }, [getPos])

  const stopDraw = useCallback(() => { drawing.current = false }, [])

  const clearSig = () => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel fade-up" style={{ width: 400, maxWidth: '90vw' }}>
        <div className="panel-header">
          <div>
            <span className="panel-title">TESLİM ET</span>
            <span className="panel-subtitle">
              {item.block} · {item.room_no} — {item.item_count} parça
            </span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">TESLİM ALAN İSİM *</label>
            <input className="form-input" value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ad Soyad..." autoFocus />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={signing}
              onChange={e => setSigning(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
              İMZA AL (OPSİYONEL)
            </span>
          </label>

          {signing && (
            <div>
              <canvas ref={canvasRef} width={360} height={120}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 7, display: 'block', cursor: 'crosshair', touchAction: 'none', width: '100%',
                }}
                onMouseDown={startDraw} onMouseMove={draw}
                onMouseUp={stopDraw} onMouseLeave={stopDraw}
                onTouchStart={startDraw} onTouchMove={draw}
                onTouchEnd={stopDraw} />
              <button className="btn btn-ghost btn-xs" style={{ marginTop: 4 }}
                onClick={clearSig}>Temizle</button>
            </div>
          )}

          {deliver.isError && (
            <div className="alert alert-danger">
              {deliver.error?.response?.data?.error || 'Hata'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ flex: 1, background: 'var(--green)', color: '#000' }}
              onClick={() => deliver.mutate()}
              disabled={!name.trim() || deliver.isPending}>
              {deliver.isPending ? 'Kaydediliyor...' : 'TESLİM ONAYLA'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
