import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../shared/store/authStore.js'
import { postLoginRedirect, VALID_MODES } from '../../shared/auth/postLoginRedirect.js'
import api from '../../shared/api/client.js'
import { LoginModal } from './LoginModals.jsx'
import { LoginCard } from './components/LoginCard.jsx'
import { LAT, LON, COMPASS, WMO, DEMO_USERS, KIOSKS, MODE_ORDER, MODE_TITLES, MODULES } from './loginData.js'
import './LoginPage.css'

const FILYOS_VIDEO = ''
const STOCK_IDS = ['25163', '31746', '9294', '7271']

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('Kimlik doğrulanıyor')
  const [modulesOpen, setModulesOpen] = useState(false)
  const [twoFA, setTwoFA] = useState(null)
  const [code, setCode] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const urlMode = searchParams.get('mode')
  const [mode, setMode] = useState(VALID_MODES.includes(urlMode) ? urlMode : 'standard')
  const [modal, setModal] = useState(null) // 'kvkk' | 'terms' | 'support' | 'forgot' | null
  const [capsLock, setCapsLock] = useState(false)
  const [failCount, setFailCount] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [nowTs, setNowTs] = useState(Date.now())
  const [shake, setShake] = useState(false)
  const [clock, setClock] = useState('--:--:--')
  const [stats, setStats] = useState(null)
  const [weather, setWeather] = useState(null)

  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()
  const sceneRef = useRef(null)
  const videoRef = useRef(null)
  const modulesRef = useRef(null)

  // ── Cooldown durumu (3 başarısız → 30sn kilit) ───────────────
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - nowTs) / 1000))
  const isLocked = cooldownLeft > 0

  // ── Mod-bağımlı login sonrası akış ───────────────────────────
  const finishLogin = async (user) => {
    const result = postLoginRedirect(user, mode)
    if (!result.ok && result.reason === 'role_mismatch') {
      // Yönetici sekmesinden personel hesabıyla giriş — backend zaten cookie
      // verdi, oturumu sonlandıralım ki sayfayı yenileyince /me bu hesabı
      // restore etmesin. Logout best-effort; başarısızsa zarar yok.
      try { await api.post('/auth/logout') } catch { /* sessiz */ }
      setError(`Bu sekme yönetici hesapları içindir (sizin rolünüz: ${user.role}). Lütfen "Personel" sekmesinden giriş yapın.`)
      return
    }
    setFailCount(0)
    login(null, user)
    navigate(result.path || '/')
  }

  // ── Login (gerçek auth + timeout + cooldown + a11y) ──────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isLocked) return
    setLoading(true); setError(''); setLoadingText('Kimlik doğrulanıyor')
    const slow = setTimeout(() => setLoadingText('Sunucu uyandırılıyor…'), 4000)
    try {
      const res = await api.post('/auth/login', { username, password }, { timeout: 8000 })
      if (res.data.require_2fa) {
        setTwoFA({ challenge_token: res.data.challenge_token })
        setFailCount(0)
        return
      }
      await finishLogin(res.data.user)
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Kullanıcı adı veya şifre hatalı')
        const next = failCount + 1
        setFailCount(next)
        if (next >= 3) setCooldownUntil(Date.now() + 30_000)
      }
      else if (err.response?.status === 429) setError(err.response?.data?.error || 'Çok fazla giriş denemesi. Lütfen birkaç dakika sonra tekrar deneyin.')
      else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) setError('Sunucu yanıtlamıyor — birkaç saniye bekleyip tekrar deneyin')
      else if (!err.response) setError('Sunucuya ulaşılamıyor — bağlantınızı kontrol edin')
      else setError('Bir hata oluştu, tekrar deneyin')
    } finally { clearTimeout(slow); setLoading(false) }
  }

  const handle2fa = async (e) => {
    e.preventDefault()
    setLoading(true); setError(''); setLoadingText('Kod doğrulanıyor')
    try {
      const res = await api.post('/auth/2fa/verify-login', { challenge_token: twoFA.challenge_token, code }, { timeout: 8000 })
      await finishLogin(res.data.user)
    } catch (err) {
      setError(err.response?.data?.error || 'Kod doğrulanamadı')
      setShake(true); setTimeout(() => setShake(false), 450)
      setCode('')
    }
    finally { setLoading(false) }
  }

  // ── Cooldown saati — sadece kilitli iken tick at ─────────────
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return
    const id = setInterval(() => {
      const t = Date.now()
      setNowTs(t)
      if (t >= cooldownUntil) { setFailCount(0); clearInterval(id) }
    }, 1000)
    return () => clearInterval(id)
  }, [cooldownUntil])

  // ── Canlı saat ───────────────────────────────────────────────
  useEffect(() => {
    const t = () => setClock(new Date().toTimeString().slice(0, 8))
    t(); const id = setInterval(t, 1000); return () => clearInterval(id)
  }, [])

  // ── Hero video (fallback: prosedürel sahne) ──────────────────
  useEffect(() => {
    const v = videoRef.current, scene = sceneRef.current
    if (!v || !scene) return
    const queue = (FILYOS_VIDEO ? [FILYOS_VIDEO] : [])
      .concat(STOCK_IDS.map(id => `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`))
    let i = 0
    const onData = () => { scene.classList.add('has-video'); v.play().catch(() => {}) }
    const next = () => { if (i < queue.length) { v.src = queue[i++]; v.load() } }
    v.addEventListener('loadeddata', onData)
    v.addEventListener('error', next)
    if (queue.length) next()
    return () => { v.removeEventListener('loadeddata', onData); v.removeEventListener('error', next) }
  }, [])

  // ── Gerçek toplu sayılar (auth'suz public endpoint) ──────────
  useEffect(() => {
    api.get('/public/stats').then(r => setStats(r.data)).catch(() => {})
  }, [])

  // ── Gerçek Filyos hava + deniz (open-meteo) ──────────────────
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code&wind_speed_unit=kn`).then(r => r.json())
        let wave = null
        try { const m = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&current=wave_height`).then(r => r.json()); wave = m?.current?.wave_height } catch { /* deniz verisi boş olabilir */ }
        if (!alive) return
        const c = w.current
        setWeather({
          temp: Math.round(c.temperature_2m),
          windKn: Math.round(c.wind_speed_10m),
          windDir: COMPASS[Math.round(c.wind_direction_10m / 45) % 8],
          desc: WMO[c.weather_code] || '—',
          wave: wave != null ? (+wave).toFixed(1) : null,
        })
      } catch { /* sessiz */ }
    }
    load(); const id = setInterval(load, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // ── Fare paralaks (azaltılmış v4) ────────────────────────────
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const layers = sceneRef.current?.querySelectorAll('[data-depth]') || []
    const onMove = (e) => {
      const x = e.clientX / window.innerWidth - 0.5, y = e.clientY / window.innerHeight - 0.5
      layers.forEach(l => { const d = +l.dataset.depth; l.style.transform = `translate(${-x * d}px, ${-y * d * 0.4}px)` })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  // ── Modül popover'ı dış tıklamayla kapat ─────────────────────
  useEffect(() => {
    if (!modulesOpen) return
    const onDoc = (e) => { if (!modulesRef.current?.contains(e.target)) setModulesOpen(false) }
    const onEsc = (e) => { if (e.key === 'Escape') setModulesOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [modulesOpen])

  const pickDemo = useCallback((u) => { setUsername(u.username); setPassword(u.password); setError('') }, [])

  // ── Ticker (hassas veri yok — sadece sistem / sayılar) ──────
  const tickerItems = []
  tickerItems.push(['t', 'Sistem', 'çevrimiçi · TLS 1.3 · RBAC'])
  if (stats) {
    tickerItems.push([stats.open_faults > 0 ? 'w' : 'g', 'Açık arıza', `${stats.open_faults} kayıt`])
    tickerItems.push(['g', 'Departman', `${stats.departments} aktif`])
  }
  tickerItems.push(['b', 'Gece yedeği', '03:00 · /var/data/backups'])
  tickerItems.push(['t', 'KampüsERP', 'v5.0 · 814 yatak · 19 blok'])
  const ticker = tickerItems.length ? [...tickerItems, ...tickerItems] : []

  const isForm = mode !== 'kiosk'

  const handleModeChange = (k) => {
    setMode(k)
    setError('')
    const next = new URLSearchParams(searchParams)
    if (k === 'standard') next.delete('mode'); else next.set('mode', k)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="lp-root v4">
      {/* SCENE — v4'te backdrop olarak dimleniyor */}
      <div className="scene" ref={sceneRef}>
        <div className="sky" />
        <video className="hero-video" ref={videoRef} muted loop playsInline preload="auto" aria-hidden="true" />
        <div className="video-grade" />
        <div className="stars" />
        <div className="cloud cl1" /><div className="cloud cl2" />
        <div className="haze" /><div className="horizon" />
        <div className="harbor" data-depth="14">
          <div className="crane k1" /><div className="crane k2" /><div className="crane k3" /><div className="crane k4" /><div className="crane k5" />
          <div className="flare-stack" /><div className="flame" />
          <div className="flare-smoke" /><div className="flare-smoke" style={{ animationDelay: '2s' }} />
          <div className="ship" />
          <div className="blink" style={{ left: '6.3%', bottom: '62%' }} />
          <div className="blink" style={{ left: '17.5%', bottom: '82%', animationDelay: '.6s' }} />
          <div className="blink" style={{ right: '22%', bottom: '88%', animationDelay: '1.2s' }} />
          <div className="blink" style={{ right: '9.3%', bottom: '58%', animationDelay: '1.8s' }} />
        </div>
        <div className="sea" data-depth="6">
          <div className="glitter" />
          <div className="wave w3" /><div className="wave w4" /><div className="wave w2" /><div className="wave w1" />
        </div>
      </div>
      <div className="grain" /><div className="vignette" />

      {loading && (
        <div className="loading on">
          <div className="spin" /><div className="ld-t">{loadingText}</div><div className="ld-s">KAMPUS-DC01 · TLS 1.3 · RBAC</div>
        </div>
      )}

      <div className="app">
        {/* NAV — brand · canlı metrik şeridi · 10-modül çipi · saat */}
        <nav className="nav">
          <div className="brand">
            <div className="brand-mark">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
            </div>
            <div>
              <div className="brand-name">Kampüs <span>YYS</span></div>
              <div className="brand-sub">AVS · Filyos</div>
            </div>
          </div>

          <div className="nav-metrics" role="group" aria-label="Canlı kampüs özet">
            <div className="nm" title="Doluluk oranı">
              <span className="nm-ico" aria-hidden="true">📊</span>
              <span className="nm-val">{stats ? `%${stats.occupancy_pct}` : '—'}</span>
              <span className="nm-lbl">Doluluk</span>
            </div>
            <div className="nm" title="Dolu / toplam yatak">
              <span className="nm-ico" aria-hidden="true">🛏️</span>
              <span className="nm-val">{stats ? `${stats.beds_occupied}/${stats.beds_total}` : '—'}</span>
              <span className="nm-lbl">Yatak</span>
            </div>
            <div className={`nm ${stats?.open_faults > 0 ? 'warn' : ''}`} title="Açık arıza sayısı">
              <span className="nm-ico" aria-hidden="true">🔧</span>
              <span className="nm-val">{stats?.open_faults ?? '—'}</span>
              <span className="nm-lbl">Arıza</span>
            </div>
            <div className="nm" title="Aktif personel">
              <span className="nm-ico" aria-hidden="true">👥</span>
              <span className="nm-val">{stats?.active_staff ?? '—'}</span>
              <span className="nm-lbl">Personel</span>
            </div>

            <div className="nm-chip-wrap" ref={modulesRef}>
              <button
                type="button"
                className={`nm-chip ${modulesOpen ? 'on' : ''}`}
                onClick={() => setModulesOpen(v => !v)}
                aria-expanded={modulesOpen}
                aria-haspopup="menu"
              >
                <span>10 modül</span>
                <span className="nm-chev" aria-hidden="true">{modulesOpen ? '▴' : '▾'}</span>
              </button>
              {modulesOpen && (
                <div className="nm-pop" role="menu">
                  {MODULES.map((m) => (
                    <div className="nm-pop-item" key={m.name} role="menuitem">
                      <span className="nm-pop-ico" aria-hidden="true">{m.icon}</span>
                      <span>{m.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="nav-meta">
            <div className="meta"><div className="dot" /><span>ONLINE</span></div>
            <div className="meta">🕐 {clock}</div>
          </div>
        </nav>

        {/* MAIN — sade: sadece login kartı, ortada, geniş negatif alanlı */}
        <main className="main">
          <LoginCard
            mode={mode}
            onModeChange={handleModeChange}
            modeOrder={MODE_ORDER}
            modeTitles={MODE_TITLES}
            isForm={isForm}
            username={username}
            setUsername={setUsername}
            password={password}
            setPassword={setPassword}
            showPw={showPw}
            setShowPw={setShowPw}
            capsLock={capsLock}
            setCapsLock={setCapsLock}
            error={error}
            loading={loading}
            isLocked={isLocked}
            cooldownLeft={cooldownLeft}
            onSubmit={handleSubmit}
            twoFA={twoFA}
            code={code}
            setCode={setCode}
            shake={shake}
            onVerify2fa={handle2fa}
            onCancel2fa={() => { setTwoFA(null); setCode(''); setError('') }}
            onForgot={() => setModal('forgot')}
            kiosks={KIOSKS}
            onKioskNav={navigate}
            demoUsers={DEMO_USERS}
            onPickDemo={pickDemo}
            isDev={import.meta.env.DEV}
          />
        </main>

        {/* SLIM BOTTOM STRIP — Filyos hava/deniz + canlı ticker */}
        <div className="strip" aria-label="Filyos ortam ve sistem akışı">
          <div className="strip-fil">
            <span className="sf-key">🌊 Filyos</span>
            <span className="sf-sep">·</span>
            <span>{weather ? `${weather.temp}°` : '—°'}</span>
            <span className="sf-sep">·</span>
            <span>{weather?.desc || '—'}</span>
            <span className="sf-sep">·</span>
            <span>rüzgâr {weather ? `${weather.windKn} kn ${weather.windDir}` : '—'}</span>
            <span className="sf-sep">·</span>
            <span>dalga {weather?.wave != null ? `${weather.wave} m` : '—'}</span>
          </div>
          <div className="strip-ticker">
            <div className="tk-track">
              {ticker.map(([c, s, t], i) => (
                <span className="tk-item" key={i}><span className={`tk-dot ${c}`} /><strong>{s}</strong> {t}</span>
              ))}
            </div>
          </div>
        </div>

        <footer className="footer">
          <div className="f-links">
            <button type="button" className="f-link" onClick={() => setModal('kvkk')}>KVKK &amp; Gizlilik</button>
            <button type="button" className="f-link" onClick={() => setModal('terms')}>Kullanım Koşulları</button>
            <button type="button" className="f-link" onClick={() => setModal('support')}>Destek</button>
          </div>
          <div className="f-copy">© 2026 AVS Kamp Alanı · Filyos · Zonguldak</div>
          <div className="f-version">
            <span>Powered by</span>
            <span className="f-tag">KampüsERP v5.0</span>
          </div>
        </footer>
      </div>

      <LoginModal which={modal} onClose={() => setModal(null)} />
    </div>
  )
}
