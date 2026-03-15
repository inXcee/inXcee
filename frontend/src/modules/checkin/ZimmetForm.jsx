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
    ctx.strokeStyle = '#60a5fa'
    ctx.lineWidth = 2
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
    }
  }

  if (submitted) return <div className="text-green-400 text-center py-4">✅ Zimmet kaydedildi ve imzalandı</div>

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-slate-200">Zimmet Listesi</h3>
      <div className="space-y-2">
        {items.map((item, i) => (
          <label key={i} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={e => setItems(prev => prev.map((it, j) => j === i ? { ...it, checked: e.target.checked } : it))}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-300">{item.item_name}</span>
            <input
              type="number"
              value={item.quantity}
              min={1}
              onChange={e => setItems(prev => prev.map((it, j) => j === i ? { ...it, quantity: +e.target.value } : it))}
              className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100"
            />
          </label>
        ))}
      </div>

      {!signing ? (
        <button onClick={() => setSigning(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">
          İmza Al
        </button>
      ) : (
        <div>
          <p className="text-xs text-slate-400 mb-2">Lütfen aşağıya imzanızı atın:</p>
          <canvas
            ref={canvasRef}
            width={400}
            height={150}
            className="bg-slate-800 border border-slate-600 rounded-lg touch-none cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
          <div className="flex gap-2 mt-2">
            <button onClick={clearCanvas} className="px-3 py-1 bg-slate-700 text-slate-300 rounded text-xs">Temizle</button>
            <button onClick={handleSubmit} className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs">Kaydet</button>
          </div>
        </div>
      )}
    </div>
  )
}
