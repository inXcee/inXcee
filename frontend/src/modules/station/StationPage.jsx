import { useEffect, useRef, useState, useCallback } from 'react'

// Sabit NFC okutma istasyonu — public route (/station), JWT yok.
// Kimlik: localStorage'daki istasyon anahtarı, her istekte X-Station-Key header'ı.
// HID okuyucu USB klavye gibi davranır: UID karakterlerini yazar + Enter gönderir.

const KEY_STORAGE = 'yys_station_key'

const TYPE_LABEL = {
  entry: 'GİRİŞ', exit: 'ÇIKIŞ', cafeteria: 'YEMEKHANE', transport: 'SERVİS', generic: 'OKUTMA',
}
const RESULT_VIEW = {
  ok:           { bg: '#16a34a', title: 'GEÇİŞ ONAYLANDI', ok: true },
  denied:       { bg: '#dc2626', title: 'REDDEDİLDİ',      ok: false },
  not_eligible: { bg: '#b45309', title: 'GEÇERSİZ KART',   ok: false },
  duplicate:    { bg: '#b45309', title: 'ZATEN OKUTULDU',  ok: false },
  unknown_card: { bg: '#475569', title: 'TANIMSIZ KART',   ok: false },
  error:        { bg: '#475569', title: 'BAĞLANTI HATASI', ok: false },
}

function mealByHour() {
  const h = new Date().getHours()
  if (h < 10) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 22) return 'dinner'
  return 'snack'
}

// WebAudio beep — başarı (yüksek) / hata (alçak), kütüphane gerektirmez
function beep(ok) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = ok ? 880 : 220
    osc.type = ok ? 'sine' : 'square'
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.18 : 0.4))
    osc.start(); osc.stop(ctx.currentTime + (ok ? 0.2 : 0.45))
    osc.onended = () => ctx.close()
  } catch { /* ses opsiyonel */ }
}

export default function StationPage() {
  const [stationKey, setStationKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '')
  const [station, setStation] = useState(null)       // /me config
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState('')
  const [result, setResult] = useState(null)         // { result, holder, ... }
  const [mealType, setMealType] = useState(mealByHour())
  const [camReady, setCamReady] = useState(false)

  const inputRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const resultTimer = useRef(null)
  const scanningRef = useRef(false)

  // Açılışta anahtarı doğrula → istasyon kimliğini al
  useEffect(() => {
    if (!stationKey) return
    let cancelled = false
    fetch('/api/stations/me', { headers: { 'X-Station-Key': stationKey } })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(cfg => { if (!cancelled) setStation(cfg) })
      .catch(() => { if (!cancelled) { localStorage.removeItem(KEY_STORAGE); setStationKey(''); setKeyError('Anahtar geçersiz, tekrar girin') } })
    return () => { cancelled = true }
  }, [stationKey])

  // Webcam (yalnız capture_photo açıksa)
  useEffect(() => {
    if (!station?.capture_photo) return
    let active = true
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; setCamReady(true) }
      })
      .catch(() => setCamReady(false))
    return () => { active = false; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [station?.capture_photo])

  // Hidden input'u sürekli odakta tut (HID okuyucu buraya yazar)
  const focusInput = useCallback(() => inputRef.current?.focus(), [])
  useEffect(() => {
    if (!station) return
    focusInput()
    const iv = setInterval(focusInput, 800)
    return () => clearInterval(iv)
  }, [station, focusInput])

  function captureFrame() {
    return new Promise(resolve => {
      const v = videoRef.current
      if (!camReady || !v || !v.videoWidth) return resolve(null)
      const c = document.createElement('canvas')
      c.width = v.videoWidth; c.height = v.videoHeight
      c.getContext('2d').drawImage(v, 0, 0)
      c.toBlob(b => resolve(b), 'image/jpeg', 0.7)
    })
  }

  async function doScan(rawUid) {
    if (!rawUid || scanningRef.current) return
    scanningRef.current = true
    try {
      const fd = new FormData()
      fd.append('raw_uid', rawUid)
      if (station.station_type === 'cafeteria') fd.append('meal_type', mealType)
      if (station.capture_photo) {
        const blob = await captureFrame()
        if (blob) fd.append('photo', blob, 'scan.jpg')
      }
      const res = await fetch('/api/stations/scan', { method: 'POST', headers: { 'X-Station-Key': stationKey }, body: fd })
      const data = res.ok ? await res.json() : { result: 'error' }
      const view = RESULT_VIEW[data.result] || RESULT_VIEW.error
      setResult(data)
      beep(view.ok)
    } catch {
      setResult({ result: 'error' })
      beep(false)
    } finally {
      scanningRef.current = false
      clearTimeout(resultTimer.current)
      resultTimer.current = setTimeout(() => setResult(null), 4000)
      focusInput()
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const uid = e.currentTarget.value.trim()
      e.currentTarget.value = ''
      doScan(uid)
    }
  }

  // ── Kurulum: anahtar girişi ──
  if (!station) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ width: 360, padding: 32, background: '#1e293b', borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⌖</div>
          <h1 style={{ fontSize: 20, letterSpacing: 2, marginBottom: 6 }}>İSTASYON KURULUMU</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Yönetici panelinden alınan istasyon anahtarını girin.</p>
          <input
            autoFocus
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && keyInput.trim() && (localStorage.setItem(KEY_STORAGE, keyInput.trim()), setKeyError(''), setStationKey(keyInput.trim()))}
            placeholder="ST-..."
            style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 14, marginBottom: 12 }}
          />
          {keyError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{keyError}</div>}
          <button
            onClick={() => { if (keyInput.trim()) { localStorage.setItem(KEY_STORAGE, keyInput.trim()); setKeyError(''); setStationKey(keyInput.trim()) } }}
            style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: '#f0a500', color: '#0f172a', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            BAĞLAN
          </button>
        </div>
      </div>
    )
  }

  const view = result ? (RESULT_VIEW[result.result] || RESULT_VIEW.error) : null

  // ── Kiosk ekranı ──
  return (
    <div onClick={focusInput} style={{ position: 'fixed', inset: 0, background: view ? view.bg : '#0f172a', transition: 'background 0.25s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>
      {/* Üst bar: istasyon kimliği */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: 13, opacity: 0.85 }}>
        <span>⌖ {station.name} · {TYPE_LABEL[station.station_type] || 'OKUTMA'}</span>
        <span>{station.capture_photo ? (camReady ? '📷 hazır' : '📷 yok') : ''}</span>
      </div>

      {/* Yemekhane öğün seçimi */}
      {station.station_type === 'cafeteria' && !result && (
        <div style={{ position: 'absolute', top: 56, display: 'flex', gap: 8 }}>
          {[['breakfast', 'Kahvaltı'], ['lunch', 'Öğle'], ['dinner', 'Akşam'], ['snack', 'Ara']].map(([v, l]) => (
            <button key={v} onClick={() => setMealType(v)}
              style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: mealType === v ? '#fff' : 'rgba(255,255,255,0.18)', color: mealType === v ? '#0f172a' : '#fff' }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* Gizli HID input */}
      <input ref={inputRef} onKeyDown={onKeyDown} autoFocus inputMode="none"
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} />

      {/* Webcam önizleme (küçük) */}
      {station.capture_photo && (
        <video ref={videoRef} autoPlay muted playsInline
          style={{ position: 'absolute', bottom: 16, right: 16, width: 140, height: 105, borderRadius: 10, objectFit: 'cover', opacity: result ? 0 : 0.9, transition: 'opacity 0.2s', transform: 'scaleX(-1)' }} />
      )}

      {/* Sonuç veya bekleme */}
      {result ? (
        <div style={{ textAlign: 'center', animation: 'fadeUp 0.25s ease' }}>
          {result.holder?.photo_url && (
            <img src={result.holder.photo_url} alt="" style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '4px solid rgba(255,255,255,0.6)', marginBottom: 16 }} />
          )}
          <div style={{ fontSize: 88, lineHeight: 1, marginBottom: 12 }}>{view.ok ? '✓' : '✕'}</div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 2, marginBottom: 8 }}>{view.title}</div>
          {result.holder?.full_name && result.result !== 'unknown_card' && (
            <div style={{ fontSize: 24, fontWeight: 600 }}>{result.holder.full_name}</div>
          )}
          {result.holder?.department_name && <div style={{ fontSize: 16, opacity: 0.85, marginTop: 2 }}>{result.holder.department_name}</div>}
          {result.reason && <div style={{ fontSize: 16, opacity: 0.9, marginTop: 10 }}>{result.reason}</div>}
          {result.result === 'ok' && result.meal_type && (
            <div style={{ fontSize: 15, opacity: 0.85, marginTop: 8 }}>{({ breakfast: 'Kahvaltı', lunch: 'Öğle', dinner: 'Akşam', snack: 'Ara öğün' })[result.meal_type]}</div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', opacity: 0.9 }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>⌁</div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>KARTINIZI OKUTUN</div>
          <div style={{ fontSize: 15, opacity: 0.7, marginTop: 8 }}>NFC etiketini okuyucuya yaklaştırın</div>
        </div>
      )}

      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  )
}
