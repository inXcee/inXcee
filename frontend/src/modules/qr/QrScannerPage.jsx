import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

export default function QrScannerPage() {
  const [manual, setManual] = useState('')
  const [history, setHistory] = useState([])
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const videoRef = useRef(null)
  const qc = useQueryClient()

  const scanMut = useMutation({
    mutationFn: (qr_token) => api.post('/qr/scan/transport', { qr_token }),
    onSuccess: (r, qr_token) => {
      toast(`✓ ${r.data.staff_name} bindi`)
      setHistory(h => [{ ts: new Date(), ok: true, name: r.data.staff_name, ...r.data }, ...h.slice(0, 19)])
      setManual('')
      qc.invalidateQueries({ queryKey: ['transport-daily'] })
    },
    onError: (e, qr_token) => {
      toastErr(e)
      setHistory(h => [{ ts: new Date(), ok: false, error: e?.response?.data?.error || 'Hata', qr_token }, ...h.slice(0, 19)])
    },
  })

  function submitManual(e) {
    e?.preventDefault()
    if (!manual.trim()) return
    scanMut.mutate(manual.trim())
  }

  // BarcodeDetector (Chrome/Edge — Firefox/Safari'de yok)
  useEffect(() => {
    if (!cameraEnabled) return
    let stream
    let active = true
    let interval

    async function start() {
      try {
        if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
          toast('Bu tarayıcı kamera QR okuma desteklemiyor — manuel kod gir', 'error')
          setCameraEnabled(false)
          return
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        // eslint-disable-next-line no-undef
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        interval = setInterval(async () => {
          if (!videoRef.current || !active) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes?.length) {
              const code = codes[0].rawValue
              if (code && code !== manual) {
                setManual(code)
                scanMut.mutate(code)
              }
            }
          } catch { /* ignore */ }
        }, 800)
      } catch (e) {
        toast('Kamera erişimi reddedildi', 'error')
        setCameraEnabled(false)
      }
    }
    start()
    return () => {
      active = false
      if (interval) clearInterval(interval)
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [cameraEnabled])

  return (
    <div style={{ maxWidth: 720 }} className="fade-up">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>QR OKUTMA</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          SERVİS BİNİŞ TAKİBİ — PERSONEL KARTINI OKUT
        </p>
      </div>

      <div style={{ marginBottom: 14, padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setCameraEnabled(c => !c)} className={`btn ${cameraEnabled ? 'btn-primary' : 'btn-ghost'} btn-sm`} style={{ borderRadius: 10, flex: 1 }}>
            {cameraEnabled ? '⏹ KAMERA DURDUR' : '📷 KAMERA BAŞLAT'}
          </button>
        </div>

        {cameraEnabled && (
          <div style={{ position: 'relative', marginBottom: 12, background: '#000', borderRadius: 10, overflow: 'hidden' }}>
            <video ref={videoRef} style={{ width: '100%', maxHeight: 360, display: 'block' }} playsInline muted />
            <div style={{ position: 'absolute', inset: 30, border: '2px solid var(--accent)', borderRadius: 12, pointerEvents: 'none' }} />
          </div>
        )}

        <form onSubmit={submitManual} style={{ display: 'flex', gap: 6 }}>
          <input className="form-input" placeholder="Manuel QR kod gir veya yapıştır" value={manual}
            onChange={e => setManual(e.target.value)} style={{ flex: 1, fontFamily: 'var(--mono)' }} autoFocus />
          <button type="submit" disabled={!manual.trim() || scanMut.isPending} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>
            OKUT
          </button>
        </form>
      </div>

      {history.length > 0 && (
        <div style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 10 }}>
            OKUTMA GEÇMİŞİ (oturum)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.map((h, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8,
                background: h.ok ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
                borderLeft: `3px solid ${h.ok ? 'var(--green)' : 'var(--red)'}`,
              }}>
                <span style={{ fontSize: 18 }}>{h.ok ? '✓' : '✗'}</span>
                <div style={{ flex: 1, fontSize: 13 }}>
                  {h.ok ? <strong>{h.name}</strong> : <span style={{ color: 'var(--red)' }}>{h.error}</span>}
                  {h.qr_token && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>{h.qr_token.slice(0, 24)}...</div>}
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{h.ts.toLocaleTimeString('tr-TR')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(59,130,246,.06)', borderRadius: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
        💡 Personelin kartını/telefonunu kameraya tut. Tarayıcı QR'ı tanıyınca otomatik okutur. Bugünkü servis ataması varsa "bindi" olarak işaretlenir.
      </div>
    </div>
  )
}
