import { useState, useRef, useCallback } from 'react'

export default function SignatureCanvas({ onSign, onClear }) {
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
