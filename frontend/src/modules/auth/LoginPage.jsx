import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../shared/store/authStore.js'
import api from '../../shared/api/client.js'
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

const MODE_TITLES = {
  standard: ['Personel Girişi', 'Yetkili hesabınızla oturum açın · <b>RBAC aktif</b>'],
  admin:    ['Yönetici Girişi', 'Tam yetkili sistem erişimi · <b>2FA destekli</b>'],
  security: ['Güvenlik Girişi', 'Kapı kontrol & ziyaretçi yönetimi · <b>Vardiya bazlı</b>'],
}

// Filyos koordinatları (open-meteo, anahtarsız + CORS açık)
const LAT = 41.57, LON = 32.04
const COMPASS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB']
const WMO = {
  0: 'Açık', 1: 'Az Bulutlu', 2: 'Parçalı Bulutlu', 3: 'Bulutlu', 45: 'Sisli', 48: 'Sisli',
  51: 'Çiseleme', 53: 'Çiseleme', 55: 'Çiseleme', 61: 'Yağmurlu', 63: 'Yağmurlu', 65: 'Yağmurlu',
  71: 'Karlı', 73: 'Karlı', 75: 'Karlı', 80: 'Sağanak', 81: 'Sağanak', 82: 'Kuvvetli Sağanak', 95: 'Gök Gürültülü',
}

// Telifsiz okyanus videosu (Mixkit). Kendi Filyos videon: FILYOS_VIDEO='/filyos.mp4'
const FILYOS_VIDEO = ''
const STOCK_IDS = ['25163', '31746', '9294', '7271']

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('Kimlik doğrulanıyor')
  const [demoOpen, setDemoOpen] = useState(false)
  const [twoFA, setTwoFA] = useState(null)
  const [code, setCode] = useState('')
  const [mode, setMode] = useState('standard')
  const [clock, setClock] = useState('--:--:--')
  const [stats, setStats] = useState(null)
  const [weather, setWeather] = useState(null)

  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()
  const sceneRef = useRef(null)
  const videoRef = useRef(null)

  // ── Login (gerçek auth — değişmedi) ──────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(''); setLoadingText('Kimlik doğrulanıyor')
    const slow = setTimeout(() => setLoadingText('Sunucu uyandırılıyor…'), 4000)
    try {
      const res = await api.post('/auth/login', { username, password })
      if (res.data.require_2fa) { setTwoFA({ challenge_token: res.data.challenge_token }); return }
      login(null, res.data.user); navigate('/')
    } catch (err) {
      if (err.response?.status === 401) setError('Kullanıcı adı veya şifre hatalı')
      else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) setError('Sunucu yanıtlamıyor — birkaç saniye bekleyip tekrar deneyin')
      else if (!err.response) setError('Sunucuya ulaşılamıyor — bağlantınızı kontrol edin')
      else setError('Bir hata oluştu, tekrar deneyin')
    } finally { clearTimeout(slow); setLoading(false) }
  }

  const handle2fa = async (e) => {
    e.preventDefault()
    setLoading(true); setError(''); setLoadingText('Kod doğrulanıyor')
    try {
      const res = await api.post('/auth/2fa/verify-login', { challenge_token: twoFA.challenge_token, code })
      login(null, res.data.user); navigate('/')
    } catch (err) { setError(err.response?.data?.error || 'Kod doğrulanamadı') }
    finally { setLoading(false) }
  }

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

  // ── İstatistik count-up ──────────────────────────────────────
  const [shown, setShown] = useState({ beds: 0, occ: 0, faults: 0, staff: 0 })
  useEffect(() => {
    if (!stats) return
    const targets = { beds: stats.beds_occupied, occ: stats.occupancy_pct, faults: stats.open_faults, staff: stats.active_staff }
    const start = performance.now(), dur = 1300
    let raf
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3)
      setShown({
        beds: Math.round(targets.beds * e), occ: Math.round(targets.occ * e),
        faults: Math.round(targets.faults * e), staff: Math.round(targets.staff * e),
      })
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [stats])

  // ── Fare paralaks ────────────────────────────────────────────
  useEffect(() => {
    const layers = sceneRef.current?.querySelectorAll('[data-depth]') || []
    const onMove = (e) => {
      const x = e.clientX / window.innerWidth - 0.5, y = e.clientY / window.innerHeight - 0.5
      layers.forEach(l => { const d = +l.dataset.depth; l.style.transform = `translate(${-x * d}px, ${-y * d * 0.4}px)` })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  const pickDemo = useCallback((u) => { setUsername(u.username); setPassword(u.password); setError('') }, [])

  // ── Güvenli ticker (hassas olay YOK — sadece sistem/sayı/hava) ──
  const tickerItems = []
  tickerItems.push(['t', 'Sistem', 'çevrimiçi · TLS 1.3 · RBAC'])
  if (stats) {
    tickerItems.push(['b', 'Doluluk', `%${stats.occupancy_pct} · ${stats.beds_occupied}/${stats.beds_total} yatak`])
    tickerItems.push([stats.open_faults > 0 ? 'w' : 'g', 'Açık arıza', `${stats.open_faults} kayıt`])
    tickerItems.push(['g', 'Aktif personel', `${stats.active_staff} · ${stats.departments} departman`])
  }
  if (weather) {
    tickerItems.push(['t', 'Filyos', `${weather.temp}° · ${weather.desc} · rüzgâr ${weather.windKn}kn ${weather.windDir}`])
    if (weather.wave != null) tickerItems.push(['b', 'Karadeniz', `dalga ${weather.wave} m`])
  }
  tickerItems.push(['g', '10 modül', 'aktif · KampüsERP v5.0'])
  tickerItems.push(['b', 'Gece yedeği', '03:00 · /var/data/backups'])
  const ticker = tickerItems.length ? [...tickerItems, ...tickerItems] : []

  const isForm = mode !== 'kiosk'
  const [mTitle, mSub] = MODE_TITLES[mode] || MODE_TITLES.standard

  return (
    <div className="lp-root">
      {/* SCENE */}
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

      {/* TR flag */}
      <div className="flag-pole" />
      <div className="flag-mount">
        <svg viewBox="0 0 110 75" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="lpfg" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#b50612" /><stop offset="35%" stopColor="#e30a17" />
              <stop offset="75%" stopColor="#e30a17" /><stop offset="100%" stopColor="#a30510" />
            </linearGradient>
            <filter id="lpfw"><feTurbulence type="turbulence" baseFrequency="0.015 0.06" numOctaves="3" seed="3">
              <animate attributeName="baseFrequency" dur="5s" values="0.015 0.045;0.035 0.085;0.015 0.045" repeatCount="indefinite" />
            </feTurbulence><feDisplacementMap in="SourceGraphic" scale="11" /></filter>
          </defs>
          <g filter="url(#lpfw)">
            <rect width="110" height="75" fill="url(#lpfg)" />
            <circle cx="40" cy="37.5" r="14" fill="#fff" /><circle cx="44" cy="37.5" r="11.5" fill="#e30a17" />
            <polygon points="64,37.5 67.5,32.5 73.5,32.5 68.5,29 70.5,23 64,27 57.5,23 59.5,29 54.5,32.5 60.5,32.5" fill="#fff" transform="rotate(-5 64 30)" />
          </g>
        </svg>
      </div>

      {loading && (
        <div className="loading on">
          <div className="spin" /><div className="ld-t">{loadingText}</div><div className="ld-s">KAMPUS-DC01 · TLS 1.3 · RBAC</div>
        </div>
      )}

      <div className="app">
        {/* NAV */}
        <nav className="nav">
          <div className="brand">
            <div className="brand-mark">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
            </div>
            <div>
              <div className="brand-name">Kampüs <span>YYS</span></div>
              <div className="brand-sub">Yurt &amp; Yaşam Alanı Yönetimi · v5.0</div>
            </div>
          </div>
          <div className="nav-meta">
            <div className="meta"><div className="dot" /><span>SİSTEM ONLINE</span></div>
            <div className="meta hide-sm">📍 AVS KAMP ALANI · FİLYOS</div>
            <div className="meta">🕐 {clock}</div>
          </div>
        </nav>

        {/* MAIN */}
        <main className="main">
          <section className="hero">
            <div className="badge">Filyos · Kurumsal Yönetim Platformu</div>
            <h1>Tüm kampüs,<br /><em>gerçek zamanlı tek ekranda.</em></h1>
            <p>
              {stats ? `${stats.beds_total.toLocaleString('tr-TR')} yatak, ${stats.active_staff} personel, ${stats.departments} departman. ` : ''}
              Oda ve zimmet yönetiminden vardiya planlamasına, bakım taleplerinden yemekhaneye — bütün operasyon Filyos sahilinde tek platformda, anlık kontrol altında.
            </p>

            <div className="stats">
              <div className="stat"><div className="stat-ico">🛏️</div><div className="stat-val b">{shown.beds.toLocaleString('tr-TR')}</div><div className="stat-label">Dolu Yatak</div></div>
              <div className="stat"><div className="stat-ico">📊</div><div className="stat-val t">%{shown.occ}</div><div className="stat-label">Doluluk</div></div>
              <div className="stat"><div className="stat-ico">🔧</div><div className="stat-val w">{shown.faults}</div><div className="stat-label">Bekleyen Arıza</div></div>
              <div className="stat"><div className="stat-ico">👥</div><div className="stat-val g">{shown.staff}</div><div className="stat-label">Aktif Personel</div></div>
            </div>

            <div className="mod-title">Sistem Modülleri · 10</div>
            <div className="mods">
              {MODULES.map(([ico, name]) => (
                <div className="mod" key={name}><div className="mod-ico">{ico}</div><div className="mod-name">{name}</div></div>
              ))}
            </div>
          </section>

          {/* LOGIN CARD */}
          <aside className="login">
            <div className="card">
              <div className="modes">
                {[['standard', '👤', 'Personel'], ['admin', '🛡️', 'Yönetici'], ['kiosk', '📟', 'Kiosk'], ['security', '🚪', 'Güvenlik']].map(([k, ic, lb]) => (
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
                      <label className="label"><span>Doğrulama Kodu</span><span className="hint">TOTP</span></label>
                      <div className="wrap"><input className="input code" inputMode="numeric" maxLength={6} value={code} autoFocus
                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="------" /></div>
                    </div>
                    {error && <div className="alert">⚠️ <span>{error}</span></div>}
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
                      <label className="label"><span>Kullanıcı Adı</span><span className="hint">SİCİL / TC / E-POSTA</span></label>
                      <div className="wrap"><span className="ico">👤</span>
                        <input className="input" type="text" value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username" placeholder="örn. selam.aydin" /></div>
                    </div>
                    <div className="field">
                      <label className="label"><span>Şifre</span><span className="hint">CAPS-LOCK KAPALI</span></label>
                      <div className="wrap"><span className="ico">🔒</span>
                        <input className="input" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
                        <button className="eye" type="button" onClick={() => setShowPw(s => !s)}>{showPw ? '🙈' : '👁️'}</button></div>
                    </div>
                    <div className="row">
                      <label className="check"><input type="checkbox" /><div className="box" /><span>Bu cihazda kalıcı oturum</span></label>
                      <button type="button" className="forgot" onClick={() => setError('Şifre sıfırlama için sistem yöneticinize başvurun.')}>Şifremi unuttum</button>
                    </div>
                    <button className="btn" type="submit" disabled={loading}>{loading ? 'GİRİŞ YAPILIYOR…' : 'Sisteme Giriş Yap →'}</button>
                    {error && <div className="alert">⚠️ <span>{error}</span></div>}

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

            {/* Canlı Filyos verisi (gerçek) */}
            <div className="live">
              <div className="live-cell"><div className="li">🌊</div><div className="lv">{weather?.wave != null ? `${weather.wave} m` : '— m'}</div><div className="lk">Dalga · Karadeniz</div></div>
              <div className="live-cell"><div className="li">💨</div><div className="lv">{weather ? `${weather.windKn} kn` : '— kn'}</div><div className="lk">Rüzgâr · {weather?.windDir || '—'}</div></div>
              <div className="live-cell"><div className="li">🌡️</div><div className="lv">{weather ? `${weather.temp}°` : '—°'}</div><div className="lk">Filyos · {weather?.desc || '—'}</div></div>
            </div>
          </aside>
        </main>

        {/* TICKER */}
        <div className="ticker">
          <div className="tk-label"><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 8px currentColor' }} />Canlı Akış</div>
          <div className="tk-content"><div className="tk-track">
            {ticker.map(([c, s, t], i) => (
              <span className="tk-item" key={i}><span className={`tk-dot ${c}`} /><strong>{s}</strong> {t}</span>
            ))}
          </div></div>
        </div>

        <footer className="footer">
          <div className="f-links"><a href="/kvkk">KVKK &amp; Gizlilik</a><a href="#">Kullanım Koşulları</a><a href="#">Destek</a></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="f-flag" title="Türkiye" /><span>© 2026 AVS Kamp Alanı · Filyos · Zonguldak</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span>Powered by</span><span className="f-tag">KampüsERP v5.0</span></div>
        </footer>
      </div>
    </div>
  )
}
