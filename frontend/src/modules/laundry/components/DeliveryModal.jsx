import { useState, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function DeliveryModal({ item, onClose }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [signing, setSigning] = useState(false)
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)

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
    ctx.strokeStyle = 'var(--text, #dde4f0)'
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke()
    setHasSig(true)
  }, [getPos])

  const stopDraw = useCallback(() => { drawing.current = false }, [])

  const clearSig = () => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setHasSig(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="panel fade-up" style={{ width: 420, maxWidth: '92vw' }}>
        {/* Header */}
        <div className="panel-header" style={{
          background: 'linear-gradient(135deg, rgba(39,201,106,0.07), transparent)',
          borderBottom: '1px solid rgba(39,201,106,0.12)',
        }}>
          <div>
            <span className="panel-title" style={{ color: 'var(--green)' }}>TESLİM ET</span>
            <div className="panel-subtitle">
              {item.block} · {item.room_no} — {item.item_count} parça
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Telefon / WA bilgisi */}
          {item.phone_number && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(37,211,102,0.07)', border: '1px solid rgba(37,211,102,0.18)',
            }}>
              <div>
                {item.occupant_name && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>
                    {item.occupant_name}
                  </div>
                )}
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#25D366', letterSpacing: 0.5 }}>
                  {item.phone_number}
                </div>
              </div>
              <a
                href={`https://wa.me/${item.phone_number.replace(/\D/g,'').replace(/^0/,'90')}`}
                target="_blank" rel="noreferrer"
                style={{
                  padding: '6px 12px', borderRadius: 6, textDecoration: 'none',
                  background: '#25D366', color: '#000',
                  fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: 1,
                }}
              >
                WP →
              </a>
            </div>
          )}

          {/* İsim */}
          <div>
            <label className="form-label">TESLİM ALAN *</label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={item.occupant_name || 'Ad Soyad...'}
              autoFocus
              style={{ fontSize: 14 }}
            />
          </div>

          {/* İmza toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            padding: '10px 12px', borderRadius: 8,
            background: signing ? 'rgba(59,140,240,0.07)' : 'var(--surface2)',
            border: `1px solid ${signing ? 'rgba(59,140,240,0.2)' : 'var(--border)'}`,
            transition: 'all 0.2s',
          }}>
            <input type="checkbox" checked={signing}
              onChange={e => setSigning(e.target.checked)}
              style={{ accentColor: 'var(--blue)', width: 14, height: 14 }} />
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 11,
              color: signing ? 'var(--blue)' : 'var(--text2)',
              fontWeight: 600, letterSpacing: 0.5,
            }}>
              İMZA AL (OPSİYONEL)
            </span>
          </label>

          {/* İmza canvas */}
          {signing && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ margin: 0 }}>
                  {hasSig ? '✓ İmza alındı' : 'Buraya imza atın'}
                </label>
                {hasSig && (
                  <button className="btn btn-ghost btn-xs" onClick={clearSig}>Temizle</button>
                )}
              </div>
              <canvas
                ref={canvasRef} width={380} height={130}
                style={{
                  background: 'var(--surface2)',
                  border: `1px solid ${hasSig ? 'rgba(59,140,240,0.3)' : 'var(--border)'}`,
                  borderRadius: 8, display: 'block',
                  cursor: 'crosshair', touchAction: 'none', width: '100%',
                  transition: 'border-color 0.2s',
                }}
                onMouseDown={startDraw} onMouseMove={draw}
                onMouseUp={stopDraw} onMouseLeave={stopDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
              />
            </div>
          )}

          {deliver.isError && (
            <div className="alert alert-danger">
              {deliver.error?.response?.data?.error || 'Hata'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-sm"
              style={{
                flex: 1, background: 'var(--green)', color: '#000',
                padding: '10px', letterSpacing: 1,
              }}
              onClick={() => deliver.mutate()}
              disabled={!name.trim() || deliver.isPending}
            >
              {deliver.isPending ? 'Kaydediliyor...' : '✓ TESLİM ONAYLA'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
