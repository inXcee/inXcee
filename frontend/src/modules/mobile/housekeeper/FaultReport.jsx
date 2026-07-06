import { useState, Suspense } from 'react'
import { lazyWithRetry as lazy } from '../../../shared/lazyWithRetry.js'
import { useMutation } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'
import { compressImage } from '../../../shared/utils/compressImage.js'
import { enqueue } from '../../../shared/utils/offlineDB.js'
import { parseQrLocation } from '../../../shared/utils/qrLocation.js'
import { useSpeechRecognition } from '../../../shared/hooks/useSpeechRecognition.js'

const QrScannerModal = lazy(() => import('../../../shared/components/QrScannerModal.jsx'))

const PRIORITIES = [
  { value: 'high', label: 'Yüksek', color: '#ef4444' },
  { value: 'medium', label: 'Orta', color: '#f59e0b' },
  { value: 'low', label: 'Düşük', color: '#10b981' },
]

export default function FaultReport() {
  const [form, setForm] = useState({ location: '', description: '', priority: 'medium' })
  const [photo, setPhoto] = useState(null)
  const [success, setSuccess] = useState(false)
  const [isQueued, setIsQueued] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qrError, setQrError] = useState('')
  const [gpsBusy, setGpsBusy] = useState(false)

  function handleQrScan(text) {
    const parsed = parseQrLocation(text)
    if (!parsed.valid) {
      setQrError(`Tanimlanamayan QR: ${text}`)
      return
    }
    setQrError('')
    navigator.vibrate?.([20])
    setForm(f => ({ ...f, location: parsed.label }))
  }

  const speech = useSpeechRecognition({
    onResult: (text) => setForm(f => ({ ...f, description: f.description ? `${f.description} ${text}` : text })),
    onError: (msg) => setQrError(`Mikrofon: ${msg}`),
  })

  function fillGps() {
    if (!navigator.geolocation) {
      setQrError('Cihaz GPS desteklemiyor')
      return
    }
    setGpsBusy(true)
    setQrError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        navigator.vibrate?.([20])
        const { latitude, longitude, accuracy } = pos.coords
        const tag = `📍 ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`
        setForm(f => ({ ...f, location: f.location ? `${f.location} ${tag}` : tag }))
        setGpsBusy(false)
      },
      err => {
        setQrError(`Konum alinamadi: ${err.message}`)
        setGpsBusy(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('location', form.location)
      fd.append('description', form.description)
      fd.append('priority', form.priority)
      if (photo) fd.append('photo', await compressImage(photo))
      return mobileApi.post('/housekeeping/fault-report', fd)
    },
    onSuccess: () => { navigator.vibrate?.([20, 60, 20]); setSuccess(true) },
    onError: async () => {
      if (!navigator.onLine) {
        const blobs = photo ? [await compressImage(photo)] : []
        await enqueue('fault_report', { location: form.location, description: form.description, priority: form.priority }, blobs)
        setIsQueued(true)
        setSuccess(true)
      }
    },
  })

  function reset() {
    setForm({ location: '', description: '', priority: 'medium' })
    setPhoto(null)
    setSuccess(false)
    setIsQueued(false)
  }

  if (success) return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center' }}>
      <div style={{ fontSize: '56px', marginBottom: '16px' }}>{isQueued ? '📴' : '✅'}</div>
      <h2 style={{ fontWeight: 700, margin: '0 0 8px' }}>
        {isQueued ? 'Çevrimdışı Kaydedildi' : 'Arıza Bildirildi'}
      </h2>
      <p style={{ color: '#6b7280', margin: '0 0 32px' }}>
        {isQueued ? 'İnternet gelince otomatik gönderilecek' : 'Teknik ekip bilgilendirildi'}
      </p>
      <button onClick={reset} style={submitBtn('#3b82f6', true)}>Yeni Bildirim Yap</button>
    </div>
  )

  const canSubmit = form.location.length >= 2 && form.description.length >= 5

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Arıza Bildir</h1>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 20px' }}>Tespit ettiğiniz arızayı bildirin</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Field label="KONUM">
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="ör: A Blok, Kat 2 — Banyo"
              style={{ ...inputStyle, flex: 1 }} />
            <button type="button" onClick={() => { setQrError(''); setShowQr(true) }}
              aria-label="QR ile konum doldur"
              style={{ padding: '0 14px', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: '20px', flexShrink: 0 }}>
              📷
            </button>
            <button type="button" onClick={fillGps} disabled={gpsBusy}
              aria-label="GPS ile konum al"
              style={{ padding: '0 14px', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#f9fafb', cursor: gpsBusy ? 'wait' : 'pointer', fontSize: '20px', flexShrink: 0, opacity: gpsBusy ? 0.5 : 1 }}>
              {gpsBusy ? '⏳' : '📍'}
            </button>
          </div>
          {qrError && <p style={{ fontSize: '12px', color: '#ef4444', margin: '4px 0 0' }}>{qrError}</p>}
        </Field>

        <Field label="AÇIKLAMA">
          <div style={{ position: 'relative' }}>
            <textarea value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4} placeholder="Arızayı detaylı açıklayın..."
              style={{ ...inputStyle, resize: 'none', paddingRight: speech.supported ? '48px' : '12px' }} />
            {speech.supported && (
              <button type="button" onClick={() => speech.listening ? speech.stop() : speech.start()}
                aria-label={speech.listening ? 'Dikteyi durdur' : 'Sesli not başlat'}
                style={{ position: 'absolute', top: '8px', right: '8px', width: '36px', height: '36px',
                  borderRadius: '50%', border: 'none',
                  background: speech.listening ? '#ef4444' : '#f3f4f6',
                  color: speech.listening ? '#fff' : '#6b7280',
                  fontSize: '18px', cursor: 'pointer',
                  animation: speech.listening ? 'yys-pulse 1.4s ease-in-out infinite' : 'none' }}>
                🎤
              </button>
            )}
          </div>
          {speech.listening && <p style={{ fontSize: '11px', color: '#ef4444', margin: '4px 0 0' }}>● Dinliyor — konuşun</p>}
        </Field>

        <Field label="ÖNCELİK">
          <div style={{ display: 'flex', gap: '8px' }}>
            {PRIORITIES.map(p => (
              <button key={p.value} onClick={() => setForm(f => ({ ...f, priority: p.value }))}
                style={{ flex: 1, padding: '11px', borderRadius: '10px', border: `2px solid ${form.priority === p.value ? p.color : '#e5e7eb'}`, background: form.priority === p.value ? p.color + '18' : '#fff', color: form.priority === p.value ? p.color : '#9ca3af', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="FOTOĞRAF (opsiyonel)">
          <input type="file" accept="image/*" capture="environment"
            onChange={e => setPhoto(e.target.files[0] || null)}
            style={{ ...inputStyle, padding: '10px', cursor: 'pointer' }} />
          {photo && (
            <p style={{ fontSize: '12px', color: '#10b981', margin: '4px 0 0' }}>✓ {photo.name}</p>
          )}
        </Field>

        {mutation.error && (
          <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>
            {mutation.error.response?.data?.error || 'Bir hata oluştu'}
          </p>
        )}

        <button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}
          style={submitBtn('#ef4444', canSubmit && !mutation.isPending)}>
          {mutation.isPending ? 'Gönderiliyor...' : '⚠️ Arıza Bildir'}
        </button>
      </div>

      {showQr && (
        <Suspense fallback={null}>
          <QrScannerModal open={showQr} onScan={handleQrScan} onClose={() => setShowQr(false)}
            title="Oda QR Kodunu Okutun" />
        </Suspense>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e5e7eb',
  fontSize: '14px', background: '#fff', boxSizing: 'border-box',
}

function submitBtn(bg, enabled) {
  return {
    width: '100%', padding: '14px', borderRadius: '12px', background: bg, color: '#fff',
    border: 'none', fontSize: '15px', fontWeight: 600, cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
  }
}
