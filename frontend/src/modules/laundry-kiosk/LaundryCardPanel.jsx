import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { emptyLaundryCard, readLaundryNfc } from './laundryCard.js'

const QrScannerModal = lazy(() => import('../../shared/components/QrScannerModal.jsx'))

const COLORS = {
  ok: { border: '#22c55e', background: 'rgba(22,163,74,.12)', color: '#86efac' },
  mismatch: { border: '#f59e0b', background: 'rgba(245,158,11,.12)', color: '#fcd34d' },
  error: { border: '#ef4444', background: 'rgba(239,68,68,.10)', color: '#fca5a5' },
  idle: { border: '#334155', background: '#111c2e', color: '#cbd5e1' },
}

function verificationTone(verification) {
  if (!verification) return 'idle'
  if (verification.offline) return 'mismatch'
  if (verification.code === 'ok') return 'ok'
  if (verification.code === 'mismatch') return 'mismatch'
  return verification.allowed ? 'ok' : 'error'
}

export default function LaundryCardPanel({
  action,
  required,
  room,
  kioskApi,
  value,
  onChange,
  online = true,
  resetKey,
}) {
  const [cameraOpen, setCameraOpen] = useState(false)
  const [nfcBusy, setNfcBusy] = useState(false)
  const sequence = useRef(0)
  const previousResetKey = useRef(resetKey)

  const update = useCallback(next => onChange?.({ ...emptyLaundryCard(), ...next }), [onChange])

  const verify = useCallback(async rawCode => {
    const code = String(rawCode || '').trim()
    if (!code) return
    const requestSequence = ++sequence.current
    if (!online) {
      update({
        card_code: code,
        verification: {
          allowed: true,
          offline: true,
          code: 'offline_pending',
          message: 'Kart bağlantı gelince sunucuda yeniden doğrulanacak',
        },
      })
      return
    }
    update({ card_code: code, verification: { checking: true, message: 'Kart doğrulanıyor…' } })
    try {
      const response = await kioskApi.post('/self-service/laundry-kiosk/card-verify', {
        action,
        ...room,
        card_code: code,
      })
      if (requestSequence !== sequence.current) return
      update({ card_code: code, verification: response.data })
      globalThis.navigator?.vibrate?.(response.data.code === 'mismatch' ? [80, 50, 80] : 40)
    } catch (error) {
      if (requestSequence !== sequence.current) return
      update({
        card_code: code,
        verification: {
          allowed: false,
          code: error.response?.data?.card_gate?.code || 'verify_error',
          message: error.response?.data?.error || 'Kart doğrulanamadı',
        },
      })
    }
  }, [action, kioskApi, online, room, update])

  useEffect(() => {
    if (previousResetKey.current === resetKey) return
    previousResetKey.current = resetKey
    sequence.current += 1
    update(emptyLaundryCard())
  }, [resetKey, update])

  useEffect(() => {
    if (!required) return undefined
    const listener = event => {
      event.preventDefault()
      verify(event.detail?.code)
    }
    window.addEventListener('laundry-card-scan', listener)
    return () => window.removeEventListener('laundry-card-scan', listener)
  }, [required, verify])

  if (!required) return null

  const verification = value?.verification
  const tone = COLORS[verificationTone(verification)]

  async function startNfc() {
    setNfcBusy(true)
    try {
      await readLaundryNfc(code => {
        setNfcBusy(false)
        verify(code)
      })
    }
    catch (error) {
      update({ verification: { allowed: false, code: 'nfc_error', message: error.message } })
      setNfcBusy(false)
    }
  }

  function changeReason(reason) {
    sequence.current += 1
    update({ card_override_reason: reason })
  }

  return (
    <section aria-label="Çamaşır kartı doğrulama" style={{
      border: `1px solid ${tone.border}`,
      background: tone.background,
      borderRadius: 14,
      padding: 14,
      display: 'grid',
      gap: 10,
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div>
          <strong style={{ display: 'block', color: '#f8fafc' }}>🪪 Çamaşır kartı zorunlu</strong>
          <small style={{ color: '#94a3b8' }}>QR, USB okuyucu veya NFC ile okutun</small>
        </div>
        <span style={{ color: tone.color, fontSize: 11, fontWeight: 900 }}>
          {verification?.checking ? 'KONTROL…' : verification?.code === 'ok' ? 'DOĞRULANDI' : verification?.code === 'mismatch' ? 'UYARI' : 'BEKLİYOR'}
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 7 }}>
        <input
          aria-label="Çamaşır kartı kodu"
          value={value?.card_code || ''}
          onChange={event => update({ card_code: event.target.value })}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              verify(event.currentTarget.value)
            }
          }}
          placeholder="AVS-C: kodu veya NFC UID"
          autoComplete="off"
          style={{ minHeight: 46, borderRadius: 10, border: '1px solid #475569', background: '#0f172a', color: '#f8fafc', padding: '0 11px', fontFamily: 'monospace' }}
        />
        <button type="button" onClick={() => verify(value?.card_code)} style={actionButton}>Doğrula</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 7 }}>
        <button type="button" onClick={() => setCameraOpen(true)} style={actionButton}>📷 Kamera ile QR</button>
        <button type="button" onClick={startNfc} disabled={nfcBusy || typeof globalThis.NDEFReader !== 'function'} style={actionButton}>
          {nfcBusy ? 'Kartı yaklaştırın…' : '📱 NFC okut'}
        </button>
      </div>

      {verification?.message && (
        <div role="status" style={{ color: tone.color, fontSize: 13, fontWeight: 800 }}>
          {verification.card?.holder_name ? `${verification.card.holder_name} · ` : ''}{verification.message}
        </div>
      )}

      <div style={{ display: 'grid', gap: 5 }}>
        <label htmlFor={`laundry-card-reason-${action}`} style={{ color: '#94a3b8', fontSize: 11 }}>
          Kart yoksa gerekçeli geçiş
        </label>
        <textarea
          id={`laundry-card-reason-${action}`}
          aria-label="Kart yoksa gerekçe"
          value={value?.card_override_reason || ''}
          onChange={event => changeReason(event.target.value)}
          rows={2}
          placeholder="En az 3 karakterlik gerekçe"
          style={{ borderRadius: 10, border: '1px solid #475569', background: '#0f172a', color: '#f8fafc', padding: 10, resize: 'vertical' }}
        />
      </div>

      <Suspense fallback={null}>
        <QrScannerModal
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onScan={verify}
          title="Sakin çamaşır kartını okutun"
        />
      </Suspense>
    </section>
  )
}

const actionButton = {
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid #475569',
  background: '#1e293b',
  color: '#e2e8f0',
  padding: '0 12px',
  fontWeight: 800,
}
