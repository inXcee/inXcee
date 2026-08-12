import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client.js'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart']

export default function KioskSessionGate({ token, session, mustChange = false, onSessionChange, onLogout }) {
  const [state, setState] = useState(() => ({
    locked: Boolean(session?.locked),
    mustChange: Boolean(mustChange || session?.must_change_pin),
    reason: session?.lock_reason || null,
  }))
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const timerRef = useRef(null)
  const lockingRef = useRef(false)

  useEffect(() => {
    if (!token) return
    api.get('/auth/kiosk-session', { headers: { Authorization: `Bearer ${token}` } })
      .then(response => {
        const next = response.data.session
        setState({ locked: Boolean(next.locked), mustChange: Boolean(next.must_change_pin), reason: next.lock_reason })
        onSessionChange?.(next)
      })
      .catch(errorResponse => {
        if (errorResponse.response?.status === 401) onLogout?.()
      })
  }, [token])

  useEffect(() => {
    const handler = event => {
      const code = event.detail?.code
      if (code === 'SESSION_LOCKED') setState(previous => ({ ...previous, locked: true }))
      if (code === 'PIN_CHANGE_REQUIRED') setState(previous => ({ ...previous, mustChange: true }))
      if (code === 'SESSION_EXPIRED' || code === 'SESSION_REVOKED') onLogout?.()
    }
    window.addEventListener('kiosk-session-state', handler)
    return () => window.removeEventListener('kiosk-session-state', handler)
  }, [onLogout])

  const lock = useCallback(async reason => {
    if (!token || lockingRef.current || state.locked || state.mustChange) return
    lockingRef.current = true
    try {
      await api.post('/auth/kiosk-lock', { reason }, { headers: { Authorization: `Bearer ${token}` } })
    } finally {
      setState(previous => ({ ...previous, locked: true, reason }))
      lockingRef.current = false
    }
  }, [token, state.locked, state.mustChange])

  useEffect(() => {
    if (!token || state.locked || state.mustChange || !session?.idle_minutes) return
    const reset = () => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => lock('idle'), session.idle_minutes * 60_000)
    }
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, reset, { passive: true }))
    reset()
    return () => {
      window.clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, reset))
    }
  }, [token, state.locked, state.mustChange, session?.idle_minutes, lock])

  useEffect(() => {
    if (!session?.absolute_expires_at) return
    const remaining = new Date(session.absolute_expires_at).getTime() - Date.now()
    if (remaining <= 0) return onLogout?.()
    const timer = window.setTimeout(() => onLogout?.(), Math.min(remaining, 2_147_000_000))
    return () => window.clearTimeout(timer)
  }, [session?.absolute_expires_at, onLogout])

  const submit = async event => {
    event.preventDefault()
    setError('')
    if (!/^\d{4}$/.test(pin)) return setError('PIN 4 haneli olmalı.')
    if (state.mustChange && pin !== confirmation) return setError('PIN doğrulaması eşleşmiyor.')
    setBusy(true)
    try {
      const path = state.mustChange ? '/auth/kiosk-first-pin-change' : '/auth/kiosk-unlock'
      const body = state.mustChange ? { new_pin: pin } : { pin }
      const response = await api.post(path, body, { headers: { Authorization: `Bearer ${token}` } })
      setPin('')
      setConfirmation('')
      setState({ locked: false, mustChange: false, reason: null })
      onSessionChange?.(response.data.session)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'İşlem tamamlanamadı.')
    } finally { setBusy(false) }
  }

  if (!token || (!state.locked && !state.mustChange)) return null

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="kiosk-session-title" style={styles.backdrop}>
      <form onSubmit={submit} style={styles.card}>
        <div style={styles.icon}>{state.mustChange ? '●' : '⌁'}</div>
        <div style={styles.eyebrow}>{state.mustChange ? 'İLK GİRİŞ GÜVENLİĞİ' : 'OTURUM KİLİTLİ'}</div>
        <h1 id="kiosk-session-title" style={styles.title}>
          {state.mustChange ? 'Kendinize ait kalıcı PIN’i belirleyin' : 'Devam etmek için PIN’inizi girin'}
        </h1>
        <p style={styles.copy}>
          {state.mustChange
            ? 'Geçici 6 haneli PIN tek kullanımlıktır. Bundan sonra kullanacağınız 4 haneli PIN’i yalnız siz bilin.'
            : 'Cihaz kaydı korunuyor; yalnız personel oturumu güvenlik amacıyla kilitlendi.'}
        </p>
        <label style={styles.label} htmlFor="kiosk-gate-pin">4 haneli yeni PIN</label>
        <input
          id="kiosk-gate-pin" autoFocus type="password" inputMode="numeric" autoComplete="off"
          value={pin} maxLength={4} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          style={styles.input}
        />
        {state.mustChange && <>
          <label style={styles.label} htmlFor="kiosk-gate-confirm">PIN’i tekrar girin</label>
          <input
            id="kiosk-gate-confirm" type="password" inputMode="numeric" autoComplete="off"
            value={confirmation} maxLength={4}
            onChange={event => setConfirmation(event.target.value.replace(/\D/g, '').slice(0, 4))}
            style={styles.input}
          />
        </>}
        {error && <div role="alert" style={styles.error}>{error}</div>}
        <button type="submit" disabled={busy || pin.length !== 4 || (state.mustChange && confirmation.length !== 4)} style={styles.primary}>
          {busy ? 'Doğrulanıyor…' : state.mustChange ? 'PIN’i kaydet ve devam et' : 'Kilidi aç'}
        </button>
        <button type="button" onClick={onLogout} style={styles.secondary}>Başka kullanıcıyla giriş yap</button>
      </form>
    </div>
  )
}

const styles = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(2,6,14,.92)', display: 'grid', placeItems: 'center', padding: 20, backdropFilter: 'blur(14px)' },
  card: { width: 'min(460px,100%)', border: '1px solid rgba(71,116,166,.45)', borderRadius: 22, padding: '30px', background: '#0b111b', boxShadow: '0 30px 90px rgba(0,0,0,.55)', display: 'grid', gap: 12, color: '#eaf2ff' },
  icon: { width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 14, background: 'rgba(38,139,230,.13)', color: '#4ba3ff', fontSize: 24 },
  eyebrow: { font: '700 10px var(--mono,monospace)', letterSpacing: 2, color: '#4ba3ff', marginTop: 6 },
  title: { fontSize: 25, lineHeight: 1.2, margin: 0 },
  copy: { fontSize: 14, lineHeight: 1.6, color: '#91a0b5', margin: '0 0 8px' },
  label: { font: '600 11px var(--mono,monospace)', color: '#aab6c8', marginTop: 4 },
  input: { width: '100%', boxSizing: 'border-box', background: '#070b12', color: '#fff', border: '1px solid #26364b', borderRadius: 12, padding: '14px 16px', fontSize: 24, letterSpacing: 10, textAlign: 'center', outline: 'none' },
  error: { color: '#ff7777', background: 'rgba(255,70,70,.08)', border: '1px solid rgba(255,70,70,.2)', borderRadius: 10, padding: 10, fontSize: 13 },
  primary: { border: 0, borderRadius: 12, padding: 14, marginTop: 8, background: '#1976d2', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  secondary: { border: '1px solid #26364b', borderRadius: 12, padding: 12, background: 'transparent', color: '#91a0b5', cursor: 'pointer' },
}
