import { useRef, useEffect, useState } from 'react'
import api from '../../shared/api/client.js'

export default function QRScanner({ onCollected }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const intervalRef = useRef(null)

  const startCamera = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setScanning(true)
      startScanning()
    } catch {
      setError('Kamera açılamadı. HTTPS veya localhost gerekli.')
    }
  }

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
    }
    clearInterval(intervalRef.current)
    setScanning(false)
  }

  const startScanning = () => {
    intervalRef.current = setInterval(async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState !== 4) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const jsQR = (await import('jsqr')).default
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      if (code) {
        stopCamera()
        await collectBag(code.data)
      }
    }, 200)
  }

  const collectBag = async (qrCode) => {
    try {
      const res = await api.post('/laundry/bags/collect', { qr_code: qrCode })
      setResult(res.data)
      onCollected?.(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'QR kodu işlenemedi: ' + qrCode)
    }
  }

  useEffect(() => () => stopCamera(), [])

  return (
    <div className="space-y-3">
      {!scanning && !result && (
        <button onClick={startCamera} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">
          📷 Kamera Aç / QR Tara
        </button>
      )}
      {scanning && (
        <div className="relative">
          <video ref={videoRef} className="w-full max-w-sm rounded-lg" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 border-2 border-blue-400 rounded-lg pointer-events-none" />
          <button onClick={stopCamera} className="mt-2 px-3 py-1 bg-slate-700 text-slate-300 rounded text-sm">İptal</button>
        </div>
      )}
      {!scanning && <canvas ref={canvasRef} className="hidden" />}
      {error && <div className="text-red-400 text-sm">{error}</div>}
      {result && (
        <div className="bg-green-900/40 border border-green-700 rounded-lg p-3 text-sm">
          <div className="text-green-300 font-medium">✅ Torba Toplandı</div>
          <div className="text-slate-400 mt-1">{result.block} - Oda {result.room_no} · {result.floor}. Kat</div>
          <button onClick={() => { setResult(null); setError('') }} className="mt-2 text-xs text-blue-400 hover:text-blue-300">Yeni Tara</button>
        </div>
      )}
    </div>
  )
}
