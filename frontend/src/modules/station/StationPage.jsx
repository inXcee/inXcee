import { useEffect, useRef, useState, useCallback } from 'react'
import { enqueueScan, queueLength, flushQueue, migrateLegacyStationQueue } from './scanQueue.js'

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
  alarm:        { bg: '#991b1b', title: '⚠ ALARM — KARA LİSTE', ok: false },
  error:        { bg: '#7c2d12', title: 'İŞLEM BAŞARISIZ', ok: false },
  offline:      { bg: '#475569', title: 'SUNUCUYA ULAŞILAMADI', ok: false },
  queued:       { bg: '#b45309', title: '⏳ SIRAYA ALINDI', ok: true },
}

function mealByHour() {
  const h = new Date().getHours()
  if (h < 10) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 22) return 'dinner'
  return 'snack'
}

// access_events.scanned_at UTC saklanır — gösterimde yerele çevir
function fmtEventTime(s) {
  if (!s) return ''
  const d = new Date(s.replace(' ', 'T') + 'Z')
  return isNaN(d) ? '' : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
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
  const [meRetrying, setMeRetrying] = useState(false) // ağ hatası — anahtar silinmez, denenir
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState('')
  const [result, setResult] = useState(null)         // { result, holder, ... }
  const [mealType, setMealType] = useState(mealByHour())
  const [camReady, setCamReady] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [now, setNow] = useState(new Date())
  const [recent, setRecent] = useState([])            // istasyonun son okutmaları
  const [manualOpen, setManualOpen] = useState(false)  // kartsız manuel giriş modu
  const [personQuery, setPersonQuery] = useState('')
  const [personResults, setPersonResults] = useState([])
  const [personSearching, setPersonSearching] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false) // ⚙ istasyon değiştir/kes
  const [newKeyInput, setNewKeyInput] = useState('')
  const [newKeyError, setNewKeyError] = useState('')
  const [switching, setSwitching] = useState(false)
  const [queued, setQueued] = useState(0) // çevrimdışı kuyruk sayacı

  const inputRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const resultTimer = useRef(null)
  const scanningRef = useRef(false)

  // Çevrimiçi/çevrimdışı takibi — sahada en sık "bağlantı hatası" nedeni
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Canlı saat (boşta ekran)
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  // Açılışta anahtarı doğrula → istasyon kimliğini al.
  // ⚠ Anahtar YALNIZCA 401/403'te silinir — ağ hatasında silmek sahada
  // her kopuşta kurulum ekranına düşürüyordu; artık 4sn'de bir denenir.
  useEffect(() => {
    if (!stationKey) return
    let cancelled = false
    let retryTimer
    const load = () => {
      fetch('/api/stations/me', { headers: { 'X-Station-Key': stationKey } })
        .then(r => {
          if (cancelled) return
          if (r.ok) return r.json().then(cfg => { if (!cancelled) { setStation(cfg); setMeRetrying(false) } })
          if (r.status === 401 || r.status === 403) {
            localStorage.removeItem(KEY_STORAGE)
            setStation(null); setStationKey(''); setMeRetrying(false)
            setKeyError('Anahtar geçersiz, tekrar girin')
            return
          }
          throw new Error('server') // 5xx — geçici say, tekrar dene
        })
        .catch(() => {
          if (!cancelled) { setMeRetrying(true); retryTimer = setTimeout(load, 4000) }
        })
    }
    load()
    return () => { cancelled = true; clearTimeout(retryTimer) }
  }, [stationKey])

  // İstasyonun son okutmaları — boşta ekranda göster, her işlemden sonra tazele
  const loadRecent = useCallback(() => {
    if (!stationKey) return
    fetch('/api/stations/my-events?limit=5', { headers: { 'X-Station-Key': stationKey } })
      .then(r => r.ok ? r.json() : [])
      .then(rows => setRecent(Array.isArray(rows) ? rows : []))
      .catch(() => { /* liste opsiyonel */ })
  }, [stationKey])

  useEffect(() => {
    if (!station) return
    loadRecent()
    const iv = setInterval(loadRecent, 60000)
    return () => clearInterval(iv)
  }, [station, loadRecent])

  // Çevrimdışı kuyruğu boşalt: açılışta, online olunca ve 45sn'de bir dene
  const tryFlush = useCallback(async () => {
    if (!stationKey || await queueLength() === 0 || !navigator.onLine) return
    const r = await flushQueue(stationKey)
    setQueued(r.remaining)
    if (r.sent > 0) loadRecent()
  }, [stationKey, loadRecent])

  useEffect(() => {
    if (!station) return
    migrateLegacyStationQueue()
      .then(() => queueLength())
      .then(setQueued)
      .then(tryFlush)
      .catch(() => {})
    const iv = setInterval(tryFlush, 45000)
    window.addEventListener('online', tryFlush)
    return () => { clearInterval(iv); window.removeEventListener('online', tryFlush) }
  }, [station, tryFlush])

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
    if (!station || manualOpen) return   // manuel modda input odağını çalma
    focusInput()
    const iv = setInterval(focusInput, 800)
    return () => clearInterval(iv)
  }, [station, focusInput, manualOpen])

  // Kişi arama (manuel giriş) — 250ms debounce
  useEffect(() => {
    if (!manualOpen) { setPersonResults([]); return }
    const q = personQuery.trim()
    if (q.length < 2) { setPersonResults([]); setPersonSearching(false); return }
    setPersonSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/stations/search-holders?q=${encodeURIComponent(q)}`, { headers: { 'X-Station-Key': stationKey } })
        .then(r => r.ok ? r.json() : [])
        .then(rows => { setPersonResults(Array.isArray(rows) ? rows : []); setPersonSearching(false) })
        .catch(() => { setPersonResults([]); setPersonSearching(false) })
    }, 250)
    return () => clearTimeout(t)
  }, [personQuery, manualOpen, stationKey])

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

  function showResult(data) {
    setResult(data)
    beep((RESULT_VIEW[data.result] || RESULT_VIEW.error).ok)
    clearTimeout(resultTimer.current)
    resultTimer.current = setTimeout(() => setResult(null), 4000)
  }

  // Backend yanıtını çöz: ok değilse gerçek hata mesajını göster
  // (eskiden her 4xx/5xx "BAĞLANTI HATASI"ya dönüşüyordu)
  async function parseResponse(res) {
    let data = null
    try { data = await res.json() } catch { /* gövde yok */ }
    if (res.ok && data) return data
    return { result: 'error', reason: data?.error || `Sunucu hatası (HTTP ${res.status})` }
  }

  async function doScan(rawUid) {
    if (!rawUid || scanningRef.current) return
    scanningRef.current = true
    let scanPhoto = null
    try {
      const fd = new FormData()
      fd.append('raw_uid', rawUid)
      if (station.station_type === 'cafeteria') fd.append('meal_type', mealType)
      if (station.capture_photo) {
        scanPhoto = await captureFrame()
        if (scanPhoto) fd.append('photo', scanPhoto, 'scan.jpg')
      }
      const res = await fetch('/api/stations/scan', { method: 'POST', headers: { 'X-Station-Key': stationKey }, body: fd })
      showResult(await parseResponse(res))
    } catch {
      // Ağ yok → okutma KAYBOLMAZ: kuyruğa al, bağlantı gelince orijinal zamanıyla gönderilir
      const n = await enqueueScan({
        raw_uid: rawUid,
        meal_type: station.station_type === 'cafeteria' ? mealType : null,
        photo: scanPhoto,
        station,
      })
      setQueued(n)
      showResult({ result: 'queued', reason: `Ağ yok — kayıt sıraya alındı (${n} bekliyor), bağlantı gelince otomatik gönderilir` })
    } finally {
      scanningRef.current = false
      loadRecent()
      focusInput()
    }
  }

  // Kartsız manuel giriş/çıkış — operatör isimle arayıp kişiyi seçer
  async function doManual(person) {
    if (!person || scanningRef.current) return
    scanningRef.current = true
    try {
      const fd = new FormData()
      fd.append('holder_type', person.holder_type)
      fd.append('holder_id', String(person.id))
      if (station.capture_photo) {
        const blob = await captureFrame()
        if (blob) fd.append('photo', blob, 'manual.jpg')
      }
      const res = await fetch('/api/stations/manual', { method: 'POST', headers: { 'X-Station-Key': stationKey }, body: fd })
      showResult(await parseResponse(res))
    } catch {
      showResult({ result: 'offline', reason: 'İnternet bağlantısını ve ağ kablosunu kontrol edin' })
    } finally {
      scanningRef.current = false
      setManualOpen(false); setPersonQuery(''); setPersonResults([])
      loadRecent()
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

  // İstasyon değiştir: yeni anahtarı ÖNCE doğrula, geçerliyse uygula —
  // geçersiz anahtarla mevcut istasyonu düşürmeyiz
  async function switchStation() {
    const key = newKeyInput.trim()
    if (!key || switching) return
    setSwitching(true); setNewKeyError('')
    try {
      const res = await fetch('/api/stations/me', { headers: { 'X-Station-Key': key } })
      if (!res.ok) {
        setNewKeyError(res.status === 401 ? 'Anahtar geçersiz' : `Sunucu hatası (${res.status})`)
        return
      }
      const cfg = await res.json()
      localStorage.setItem(KEY_STORAGE, key)
      setStationKey(key); setStation(cfg)
      setSettingsOpen(false); setNewKeyInput(''); setRecent([])
    } catch {
      setNewKeyError('Sunucuya ulaşılamadı — bağlantıyı kontrol edin')
    } finally {
      setSwitching(false)
    }
  }

  function disconnectStation() {
    localStorage.removeItem(KEY_STORAGE)
    setStation(null); setStationKey(''); setSettingsOpen(false)
    setKeyError(''); setKeyInput(''); setRecent([])
  }

  // ── Kurulum: anahtar girişi ──
  if (!station) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ width: 360, padding: 32, background: '#1e293b', borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⌖</div>
          <h1 style={{ fontSize: 20, letterSpacing: 2, marginBottom: 6 }}>İSTASYON KURULUMU</h1>
          {stationKey && meRetrying ? (
            <>
              <p style={{ fontSize: 13, color: '#fbbf24', marginBottom: 8 }}>⚠ Sunucuya ulaşılamıyor — bağlantı bekleniyor…</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>Anahtar kayıtlı. Ağ gelince otomatik bağlanılır, bir şey yapmanıza gerek yok.</p>
              <div style={{ fontSize: 26, animation: 'pulse 1.2s ease infinite' }}>⌁</div>
              <style>{`@keyframes pulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }`}</style>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    )
  }

  const view = result ? (RESULT_VIEW[result.result] || RESULT_VIEW.error) : null

  // ── Kiosk ekranı ──
  return (
    <div onClick={() => { if (result) { clearTimeout(resultTimer.current); setResult(null) } focusInput() }}
      style={{ position: 'fixed', inset: 0, background: view ? view.bg : '#0f172a', transition: 'background 0.25s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>
      {/* Üst bar: istasyon kimliği + saat */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: 13, opacity: 0.85 }}>
        <span>⌖ {station.name} · {TYPE_LABEL[station.station_type] || 'OKUTMA'}</span>
        <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {station.capture_photo ? <span>{camReady ? '📷 hazır' : '📷 yok'}</span> : null}
          <span>{now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })} {now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <button onClick={e => { e.stopPropagation(); setSettingsOpen(true) }}
            aria-label="İstasyon ayarları"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, color: '#fff', padding: '4px 10px', cursor: 'pointer', fontSize: 14 }}>
            ⚙
          </button>
        </span>
      </div>

      {/* Çevrimdışı / kuyruk bandı */}
      {!online ? (
        <div style={{ position: 'absolute', top: 48, left: 0, right: 0, textAlign: 'center', padding: '8px', background: '#b91c1c', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>
          ⚠ İNTERNET YOK — okutmalar sıraya alınır, bağlantı gelince gönderilir{queued > 0 ? ` (${queued} bekliyor)` : ''}
        </div>
      ) : queued > 0 ? (
        <div style={{ position: 'absolute', top: 48, left: 0, right: 0, textAlign: 'center', padding: '8px', background: '#b45309', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ⏳ {queued} okutma sırada — gönderiliyor…
        </div>
      ) : null}

      {/* Yemekhane öğün seçimi */}
      {station.station_type === 'cafeteria' && !result && (
        <div style={{ position: 'absolute', top: (!online || queued > 0) ? 92 : 56, display: 'flex', gap: 8 }}>
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
          {result.meal_type && result.holder?.diet_flags && (
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12, padding: '8px 16px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', display: 'inline-block' }}>
              ⚠ Diyet/Alerji: {result.holder.diet_flags}
            </div>
          )}
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 16 }}>Ekrana dokunarak kapatabilirsiniz</div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', opacity: 0.9 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 56, fontWeight: 700, letterSpacing: 3, marginBottom: 6 }}>
            {now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 72, marginBottom: 16 }}>⌁</div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>KARTINIZI OKUTUN</div>
          <div style={{ fontSize: 15, opacity: 0.7, marginTop: 8 }}>NFC etiketini okuyucuya yaklaştırın</div>

          {/* Son okutmalar — operatör admin paneline gitmeden görür */}
          {recent.length > 0 && (
            <div style={{ marginTop: 28, display: 'inline-block', textAlign: 'left', background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 18px', minWidth: 280 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, opacity: 0.6, marginBottom: 8 }}>SON OKUTMALAR</div>
              {recent.map(ev => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '3px 0' }}>
                  <span style={{ fontFamily: 'monospace', opacity: 0.65 }}>{fmtEventTime(ev.scanned_at)}</span>
                  <span style={{ flex: 1, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                    {ev.holder_name || 'Tanımsız kart'}
                  </span>
                  <span style={{ color: ev.result === 'ok' ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                    {ev.result === 'ok' ? '✓' : '✕'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kartsız manuel giriş butonu */}
      {!result && !manualOpen && (
        <button onClick={e => { e.stopPropagation(); setManualOpen(true) }}
          style={{ position: 'absolute', bottom: 16, left: 16, padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          ⌨ Kartsız Giriş
        </button>
      )}

      {/* Manuel giriş modalı — isimle ara, listeden seç */}
      {manualOpen && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <div style={{ width: 380, maxHeight: '80vh', overflowY: 'auto', background: '#1e293b', borderRadius: 16, padding: 28, textAlign: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Kartsız {TYPE_LABEL[station.station_type] || 'OKUTMA'}</h2>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>İsim yazın, listeden kişiyi seçin{station.capture_photo ? ' — foto otomatik çekilir' : ''}</p>
            <input autoFocus value={personQuery} onChange={e => setPersonQuery(e.target.value)}
              placeholder="🔍 İsim ara (en az 2 harf)"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#fff', fontSize: 15, marginBottom: 12 }} />

            {personSearching && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>Aranıyor…</div>}
            {!personSearching && personQuery.trim().length >= 2 && personResults.length === 0 && (
              <div style={{ fontSize: 13, color: '#fbbf24', marginBottom: 10 }}>Eşleşen kişi bulunamadı</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {personResults.map(p => (
                <button key={`${p.holder_type}-${p.id}`} onClick={() => doManual(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>
                    {p.full_name}
                    {p.sub && <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{p.sub}</span>}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 6, background: p.holder_type === 'staff' ? 'rgba(240,165,0,0.25)' : 'rgba(96,165,250,0.25)', color: p.holder_type === 'staff' ? '#fbbf24' : '#93c5fd' }}>
                    {p.holder_type === 'staff' ? 'PERSONEL' : 'İŞÇİ'}
                  </span>
                </button>
              ))}
            </div>

            <button onClick={() => { setManualOpen(false); setPersonQuery(''); setPersonResults([]) }}
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#cbd5e1', fontWeight: 600, cursor: 'pointer' }}>Vazgeç</button>
          </div>
        </div>
      )}

      {/* ⚙ İstasyon ayarları — değiştir / bağlantıyı kes */}
      {settingsOpen && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <div style={{ width: 380, background: '#1e293b', borderRadius: 16, padding: 28, textAlign: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>⚙ İstasyon Ayarları</h2>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
              Bağlı: <strong style={{ color: '#e2e8f0' }}>{station.name}</strong> · {TYPE_LABEL[station.station_type] || 'OKUTMA'}
            </p>

            <div style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: '#94a3b8', marginBottom: 8 }}>İSTASYON DEĞİŞTİR</div>
            <input value={newKeyInput} onChange={e => { setNewKeyInput(e.target.value); setNewKeyError('') }}
              onKeyDown={e => e.key === 'Enter' && switchStation()}
              placeholder="Yeni istasyon anahtarı (ST-...)"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#fff', fontFamily: 'monospace', fontSize: 13, marginBottom: 8 }} />
            {newKeyError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{newKeyError}</div>}
            <button onClick={switchStation} disabled={!newKeyInput.trim() || switching}
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: '#f0a500', color: '#0f172a', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: newKeyInput.trim() && !switching ? 1 : 0.5, marginBottom: 16 }}>
              {switching ? 'Doğrulanıyor…' : '↔ Bu İstasyona Geç'}
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setSettingsOpen(false); setNewKeyInput(''); setNewKeyError('') }}
                style={{ flex: 2, padding: '12px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#cbd5e1', fontWeight: 600, cursor: 'pointer' }}>Kapat</button>
              <button onClick={disconnectStation}
                style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #ef444455', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontWeight: 600, cursor: 'pointer' }}>
                Bağlantıyı Kes
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  )
}
