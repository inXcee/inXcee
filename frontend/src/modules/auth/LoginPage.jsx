import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../shared/store/authStore.js'
import api from '../../shared/api/client.js'
import { LoginModal } from './LoginModals.jsx'
import './LoginPage.css'

const DEMO_USERS = [
  { username: 'mudur',    password: 'admin123', role: 'Kampüs Müdürü' },
  { username: 'vardiya',  password: 'admin123', role: 'Vardiya Amiri' },
  { username: 'teknik',   password: 'admin123', role: 'Teknik Servis' },
  { username: 'camasir',  password: 'admin123', role: 'Çamaşırhane' },
  { username: 'meydanci', password: 'admin123', role: 'Meydancı' },
]

const KIOSKS = [
  { path: '/avs-kiosk',     icon: '🧹', label: 'AVS Personel', desc: 'İsim + PIN ile giriş' },
  { path: '/laundry-kiosk', icon: '🧺', label: 'Çamaşırhane',  desc: 'Torba & teslim işlemleri' },
  { path: '/kiosk',         icon: '🛏️', label: 'Sakin Self-Servis', desc: 'Oda & talep işlemleri' },
]

const MODULES = [
  ['🛏️', 'Oda & Yatak'], ['📋', 'Check-in/out'], ['🔧', 'Arıza & Bakım'], ['📦', 'Zimmet'], ['⚖️', 'Disiplin'],
  ['📅', 'Vardiya'], ['🍽️', 'Yemekhane'], ['🧺', 'Çamaşırhane'], ['🚪', 'Ziyaretçi'], ['📈', 'Raporlama'],
]

const MODE_ORDER = [
  ['standard', '👤', 'Personel'],
  ['admin',    '🛡️', 'Yönetici'],
  ['security', '🚪', 'Güvenlik'],
  ['kiosk',    '📟', 'Kiosk'],
]

const MODE_TITLES = {
  standard: ['Personel Girişi', 'Yetkili hesabınızla oturum açın · <b>RBAC aktif</b>'],
  admin:    ['Yönetici Girişi', 'Tam yetkili sistem erişimi · <b>2FA destekli</b>'],
  security: ['Güvenlik Girişi', 'Kapı kontrol & ziyaretçi yönetimi · <b>Vardiya bazlı</b>'],
}

const LAT = 41.57, LON = 32.04
const COMPASS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB']
const WMO = {
  0: 'Açık', 1: 'Az Bulutlu', 2: 'Parçalı Bulutlu', 3: 'Bulutlu', 45: 'Sisli', 48: 'Sisli',
  51: 'Çiseleme', 53: 'Çiseleme', 55: 'Çiseleme', 61: 'Yağmurlu', 63: 'Yağmurlu', 65: 'Yağmurlu',
  71: 'Karlı', 73: 'Karlı', 75: 'Karlı', 80: 'Sağanak', 81: 'Sağanak', 82: 'Kuvvetli Sağanak', 95: 'Gök Gürültülü',
}

const FILYOS_VIDEO = ''
const STOCK_IDS = ['25163', '31746', '9294', '7271']

// 6 haneli TOTP girişi — auto-advance, paste, backspace ile geri, shake hata.
function TwoFactorInput({ value, onChange, shake, disabled }) {
  const refs = useRef([])

  const onCharChange = (i, raw) => {
    const c = (raw || '').replace(/\D/g, '').slice(-1)
    const arr = (value + '      ').split('').slice(0, 6)
    arr[i] = c
    const next = arr.join('').trimEnd().replace(/\s/g, '')
    onChange(next)
    if (c && i < 5) refs.current[i + 1]?.focus()
  }

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus() }
    else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }

  const onPaste = (e) => {
    const t = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6)
    if (!t) return
    e.preventDefault()
    onChange(t)
    refs.current[Math.min(t.length, 5)]?.focus()
  }

  return (
    <div className={`tfa-boxes ${shake ? 'shake' : ''}`} onPaste={onPaste} role="group" aria-label="6 haneli doğrulama kodu">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          className="tfa-box"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[i] || ''}
          onChange={e => onCharChange(i, e.target.value)}
          onKeyDown={e => onKeyDown(i, e)}
          onFocus={e => e.target.select()}
          disabled={disabled}
          autoFocus={i === 0}
          aria-label={`Hane ${i + 1}`}
        />
      ))}
    </div>
  )
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('Kimlik doğrulanıyor')
  const [demoOpen, setDemoOpen] = useState(false)
  const [modulesOpen, setModulesOpen] = useState(false)
  const [twoFA, setTwoFA] = useState(null)
  const [code, setCode] = useState('')
  const [mode, setMode] = useState('standard')
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
      setFailCount(0)
      login(null, res.data.user); navigate('/')
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Kullanıcı adı veya şifre hatalı')
        const next = failCount + 1
        setFailCount(next)
        if (next >= 3) setCooldownUntil(Date.now() + 30_000)
      }
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
      login(null, res.data.user); navigate('/')
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
  tickerItems.push(['g', '10 modül', 'aktif · KampüsERP v5.0'])
  tickerItems.push(['b', 'Gece yedeği', '03:00 · /var/data/backups'])
  const ticker = tickerItems.length ? [...tickerItems, ...tickerItems] : []

  const isForm = mode !== 'kiosk'
  const [mTitle, mSub] = MODE_TITLES[mode] || MODE_TITLES.standard

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
                  {MODULES.map(([ico, name]) => (
                    <div className="nm-pop-item" key={name} role="menuitem">
                      <span className="nm-pop-ico" aria-hidden="true">{ico}</span>
                      <span>{name}</span>
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
          <aside className="login">
            <div className="card">
              <div className="modes">
                {MODE_ORDER.map(([k, ic, lb]) => (
                  <button key={k} type="button" className={`mode ${mode === k ? 'on' : ''}`} onClick={() => { setMode(k); setError('') }}>
                    <span className="mode-ico">{ic}</span><span>{lb}</span>
                  </button>
                ))}
              </div>

              {isForm ? (
                twoFA ? (
                  <form className="body" onSubmit={handle2fa}>
                    <div className="head"><div className="title">İki Faktörlü Doğrulama</div><div className="sub">Authenticator uygulamasındaki <strong>6 haneli kodu</strong> girin.</div></div>
                    <div className="field">
                      <label className="label" id="lp-2fa-label"><span>Doğrulama Kodu</span><span className="hint">TOTP · Google / Authy</span></label>
                      <TwoFactorInput value={code} onChange={setCode} shake={shake} disabled={loading} />
                    </div>
                    {error && <div id="lp-2fa-err" className="alert" role="alert">⚠️ <span>{error}</span></div>}
                    <button className="btn" type="submit" disabled={loading || code.length !== 6} style={{ marginTop: 6 }}>{loading ? 'DOĞRULANIYOR…' : 'Doğrula →'}</button>
                    <button className="btn-ghost" type="button" onClick={() => { setTwoFA(null); setCode(''); setError('') }}>İptal</button>
                  </form>
                ) : (
                  <form className="body" onSubmit={handleSubmit}>
                    <div className="head">
                      <div className="title">{mTitle}</div>
                      <div className="sub" dangerouslySetInnerHTML={{ __html: mSub.replace('<b>', '<strong>').replace('</b>', '</strong>') }} />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="lp-username"><span>Kullanıcı Adı</span><span className="hint">SİCİL / TC / E-POSTA</span></label>
                      <div className="wrap"><span className="ico" aria-hidden="true">👤</span>
                        <input
                          id="lp-username"
                          className="input"
                          type="text"
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          autoFocus
                          autoComplete="username"
                          placeholder="örn. selam.aydin"
                          required
                          aria-invalid={!!error}
                          aria-describedby={error ? 'lp-login-err' : undefined}
                          disabled={isLocked}
                        /></div>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="lp-password">
                        <span>Şifre</span>
                        <span className={`hint ${capsLock ? 'warn' : ''}`} aria-live="polite">
                          {capsLock ? '⇪ CAPS-LOCK AÇIK' : 'CAPS-LOCK KAPALI'}
                        </span>
                      </label>
                      <div className="wrap"><span className="ico" aria-hidden="true">🔒</span>
                        <input
                          id="lp-password"
                          className="input"
                          type={showPw ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          onKeyDown={e => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                          onKeyUp={e => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          required
                          aria-invalid={!!error}
                          aria-describedby={error ? 'lp-login-err' : undefined}
                          disabled={isLocked}
                        />
                        <button className="eye" type="button" onClick={() => setShowPw(s => !s)} aria-pressed={showPw} aria-label={showPw ? 'Şifreyi gizle' : 'Şifreyi göster'}>
                          {showPw ? '🙈' : '👁️'}
                        </button></div>
                    </div>
                    <div className="row">
                      <span className="row-pad" />
                      <button type="button" className="forgot" onClick={() => setModal('forgot')}>Şifremi unuttum</button>
                    </div>
                    <button className="btn" type="submit" disabled={loading || isLocked}>
                      {loading ? 'GİRİŞ YAPILIYOR…' : isLocked ? `${cooldownLeft} sn bekleyin` : 'Sisteme Giriş Yap →'}
                    </button>
                    {error && (
                      <div id="lp-login-err" className="alert" role="alert">
                        ⚠️ <span>{error}</span>
                        {isLocked && <span className="alert-sub"> · Çok fazla başarısız deneme — {cooldownLeft} sn sonra tekrar deneyin.</span>}
                      </div>
                    )}

                    {import.meta.env.DEV && (
                      <div className="demo">
                        <button type="button" className="demo-toggle" onClick={() => setDemoOpen(o => !o)}>
                          <span>{demoOpen ? '▾' : '▸'} DEMO KULLANICILAR</span><span>geliştirme</span>
                        </button>
                        {demoOpen && (
                          <div className="demo-list">
                            {DEMO_USERS.map(u => (
                              <button key={u.username} type="button" className="demo-item" onClick={() => pickDemo(u)}>
                                <span><span className="u">{u.username}</span> <span className="r">{u.role}</span></span>
                                <span className="r">{u.password}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </form>
                )
              ) : (
                <div className="body">
                  <div className="kiosk-head">Login gerektirmez — doğrudan PIN/QR ekranı</div>
                  <div className="sec-grid">
                    {KIOSKS.map(k => (
                      <button key={k.path} type="button" className="sec" onClick={() => navigate(k.path)}>
                        <span style={{ fontSize: 20 }}>{k.icon}</span>
                        <span><span style={{ display: 'block', fontWeight: 600 }}>{k.label}</span><span style={{ fontSize: 11, color: 'var(--muted)' }}>{k.desc}</span></span>
                        <span className="arr">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
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
