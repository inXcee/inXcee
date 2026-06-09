import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../shared/store/authStore.js'
import { postLoginRedirect, VALID_MODES } from '../../shared/auth/postLoginRedirect.js'
import api from '../../shared/api/client.js'
import { LoginModal } from './LoginModals.jsx'
import { LoginCard } from './components/LoginCard.jsx'
import { HeroScene } from './components/HeroScene.jsx'
import { MissionBand } from './components/sections/MissionBand.jsx'
import { ServicePillars } from './components/sections/ServicePillars.jsx'
import { ModuleCarousel } from './components/sections/ModuleCarousel.jsx'
import { StatsCounter } from './components/sections/StatsCounter.jsx'
import { BlockHeatmap } from './components/sections/BlockHeatmap.jsx'
import { FilyosEnv } from './components/sections/FilyosEnv.jsx'
import { SecurityBand } from './components/sections/SecurityBand.jsx'
import { LandingTicker } from './components/sections/LandingTicker.jsx'
import { LandingFooter } from './components/sections/LandingFooter.jsx'
import { useMotionPref } from './hooks/useMotionPref.js'
import { useTranslation } from '../../shared/i18n/index.js'
import { LAT, LON, DEMO_USERS, KIOSKS, MODE_ORDER, MODE_TITLES, MODULES } from './loginData.js'

const PASSKEY_KEY = 'yys_passkey_cred'
const webAuthnBrowser = () => import('@simplewebauthn/browser')
import './LoginPage.css'

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
  // Passkey (webauthn): credentialId bu cihazın localStorage'ında tutulur.
  const [passkeyCred, setPasskeyCred] = useState(() => localStorage.getItem(PASSKEY_KEY))
  const [passkeyOffer, setPasskeyOffer] = useState(null) // başarılı parola girişi sonrası bekleyen user

  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()
  const modulesRef = useRef(null)
  const { motion, setMotion, rain, setRain, reduced } = useMotionPref()
  const { t } = useTranslation()

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
      setError(`${t('login.card.role_prefix', 'Bu sekme yönetici hesapları içindir (sizin rolünüz: ')}${user.role}${t('login.card.role_suffix', '). Lütfen "Personel" sekmesinden giriş yapın.')}`)
      return
    }
    setFailCount(0)
    login(null, user)
    navigate(result.path || '/')
  }

  // ── Passkey: hızlı giriş (kayıtlı cihaz) ─────────────────────
  const handlePasskeyLogin = async () => {
    if (!passkeyCred || loading) return
    setLoading(true); setError(''); setLoadingText(t('login.card.loading_auth', 'Kimlik doğrulanıyor'))
    try {
      const { startAuthentication } = await webAuthnBrowser()
      const opt = await api.post('/auth/passkey/auth-options', { credentialId: passkeyCred })
      const authResp = await startAuthentication(opt.data)
      const res = await api.post('/auth/passkey/login', { credentialId: passkeyCred, response: authResp })
      await finishLogin(res.data.user)
    } catch (err) {
      if (err?.name === 'NotAllowedError') { /* kullanıcı iptal etti — sessiz */ }
      else if (err.response?.status === 404) {
        localStorage.removeItem(PASSKEY_KEY); setPasskeyCred(null)
        setError(t('login.card.passkey_fail', 'Passkey girişi başarısız'))
      } else setError(err.response?.data?.error || t('login.card.passkey_fail', 'Passkey girişi başarısız'))
    } finally { setLoading(false) }
  }

  // ── Passkey: parola girişi sonrası kayıt teklifi ─────────────
  const handlePasskeyRegister = async (accept) => {
    const user = passkeyOffer
    setPasskeyOffer(null)
    if (accept) {
      try {
        const { startRegistration } = await webAuthnBrowser()
        const opt = await api.post('/auth/passkey/register-options')
        const regResp = await startRegistration(opt.data)
        const ver = await api.post('/auth/passkey/register', regResp)
        localStorage.setItem(PASSKEY_KEY, ver.data.credentialId)
        setPasskeyCred(ver.data.credentialId)
      } catch { /* iptal/başarısız — parola girişi zaten geçerli, sessiz devam */ }
    } else {
      localStorage.setItem(PASSKEY_KEY + '_dismissed', '1') // bir daha sorma
    }
    await finishLogin(user)
  }

  // ── Login (gerçek auth + timeout + cooldown + a11y) ──────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isLocked) return
    setLoading(true); setError(''); setLoadingText(t('login.card.loading_auth', 'Kimlik doğrulanıyor'))
    const slow = setTimeout(() => setLoadingText(t('login.card.loading_wake', 'Sunucu uyandırılıyor…')), 4000)
    try {
      const res = await api.post('/auth/login', { username, password }, { timeout: 8000 })
      if (res.data.require_2fa) {
        setTwoFA({ challenge_token: res.data.challenge_token })
        setFailCount(0)
        return
      }
      // Passkey teklifi: destekleyen tarayıcıda, bu cihazda kayıt yoksa bir kez sor.
      if (!passkeyCred && !localStorage.getItem(PASSKEY_KEY + '_dismissed')) {
        try {
          const { browserSupportsWebAuthn } = await webAuthnBrowser()
          if (browserSupportsWebAuthn()) { setPasskeyOffer(res.data.user); return }
        } catch { /* destek yoksa normal akış */ }
      }
      await finishLogin(res.data.user)
    } catch (err) {
      if (err.response?.status === 401) {
        setError(t('login.card.err_credentials', 'Kullanıcı adı veya şifre hatalı'))
        const next = failCount + 1
        setFailCount(next)
        if (next >= 3) setCooldownUntil(Date.now() + 30_000)
      }
      else if (err.response?.status === 429) setError(err.response?.data?.error || t('login.card.err_ratelimit', 'Çok fazla giriş denemesi. Lütfen birkaç dakika sonra tekrar deneyin.'))
      else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) setError(t('login.card.err_timeout', 'Sunucu yanıtlamıyor — birkaç saniye bekleyip tekrar deneyin'))
      else if (!err.response) setError(t('login.card.err_network', 'Sunucuya ulaşılamıyor — bağlantınızı kontrol edin'))
      else setError(t('login.card.err_generic', 'Bir hata oluştu, tekrar deneyin'))
    } finally { clearTimeout(slow); setLoading(false) }
  }

  const handle2fa = async (e) => {
    e.preventDefault()
    setLoading(true); setError(''); setLoadingText(t('login.card.loading_2fa', 'Kod doğrulanıyor'))
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
          windDirIdx: Math.round(c.wind_direction_10m / 45) % 8,
          descCode: c.weather_code,
          wave: wave != null ? (+wave).toFixed(1) : null,
        })
      } catch { /* sessiz */ }
    }
    load(); const id = setInterval(load, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(id) }
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
  tickerItems.push(['t', t('login.ticker.system', 'Sistem'), t('login.ticker.system_val', 'çevrimiçi · TLS 1.3 · RBAC')])
  if (stats) {
    tickerItems.push([stats.open_faults > 0 ? 'w' : 'g', t('login.ticker.faults', 'Açık arıza'), `${stats.open_faults} ${t('login.ticker.faults_unit', 'kayıt')}`])
    tickerItems.push(['g', t('login.ticker.dept', 'Departman'), `${stats.departments} ${t('login.ticker.dept_unit', 'aktif')}`])
  }
  tickerItems.push(['b', t('login.ticker.backup', 'Gece yedeği'), t('login.ticker.backup_val', '03:00 · /var/data/backups')])
  tickerItems.push(['t', t('login.ticker.erp', 'KampüsERP'), t('login.ticker.erp_val', 'v5.0 · 814 yatak · 19 blok')])
  // LandingTicker içeride ikiye katlar — burada ham liste yeterli.

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
              <span className="nm-lbl">{t('login.nav.occupancy', 'Doluluk')}</span>
            </div>
            <div className="nm" title="Dolu / toplam yatak">
              <span className="nm-ico" aria-hidden="true">🛏️</span>
              <span className="nm-val">{stats ? `${stats.beds_occupied}/${stats.beds_total}` : '—'}</span>
              <span className="nm-lbl">{t('login.nav.beds', 'Yatak')}</span>
            </div>
            <div className={`nm ${stats?.open_faults > 0 ? 'warn' : ''}`} title="Açık arıza sayısı">
              <span className="nm-ico" aria-hidden="true">🔧</span>
              <span className="nm-val">{stats?.open_faults ?? '—'}</span>
              <span className="nm-lbl">{t('login.nav.faults', 'Arıza')}</span>
            </div>
            <div className="nm" title="Aktif personel">
              <span className="nm-ico" aria-hidden="true">👥</span>
              <span className="nm-val">{stats?.active_staff ?? '—'}</span>
              <span className="nm-lbl">{t('login.nav.staff', 'Personel')}</span>
            </div>

            <div className="nm-chip-wrap" ref={modulesRef}>
              <button
                type="button"
                className={`nm-chip ${modulesOpen ? 'on' : ''}`}
                onClick={() => setModulesOpen(v => !v)}
                aria-expanded={modulesOpen}
                aria-haspopup="menu"
              >
                <span>{t('login.nav.modules', '10 modül')}</span>
                <span className="nm-chev" aria-hidden="true">{modulesOpen ? '▴' : '▾'}</span>
              </button>
              {modulesOpen && (
                <div className="nm-pop" role="menu">
                  {MODULES.map((m) => (
                    <div className="nm-pop-item" key={m.k} role="menuitem">
                      <span className="nm-pop-ico" aria-hidden="true">{m.icon}</span>
                      <span>{t(`login.modules.${m.k}.name`, m.name)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <nav className="nav-sections" aria-label="Bölümler">
            <a href="#modules">{t('login.nav.sec_modules', 'Modüller')}</a>
            <a href="#stats">{t('login.nav.sec_stats', 'Sayılarla')}</a>
            <a href="#heat">{t('login.nav.sec_blocks', 'Bloklar')}</a>
            <a href="#env">{t('login.nav.sec_filyos', 'Filyos')}</a>
            <a href="#sec">{t('login.nav.sec_security', 'Güvenlik')}</a>
          </nav>

          <div className="nav-meta">
            <div className="meta"><div className="dot" /><span>{t('login.nav.online', 'ONLINE')}</span></div>
            <div className="meta">🕐 {clock}</div>
          </div>
        </nav>

        {/* HERO — video + yağmur canvas + hareket HUD, login kartını ve hero-copy'yi sarar */}
        <HeroScene
          posterSrc="/hero/D2-night-bright.png"
          videoSrc="/hero/hero-night.mp4"
          motion={motion}
          setMotion={setMotion}
          rain={rain}
          setRain={setRain}
          reduced={reduced}
        >
          <div className="lp-wrap hero-grid">
            <div className="hero-copy">
              <span className="eyebrow"><span className="fl" />{t('login.hero.eyebrow', 'AVS Kamp Alanı · Filyos · Zonguldak')}</span>
              <h1>{t('login.hero.title1', '814 yatak, 19 blok,')}<br /><span>{t('login.hero.title2', 'tek operasyon merkezi.')}</span></h1>
              <p>{t('login.hero.sub', 'Konaklama, bakım, çamaşırhane ve personel operasyonunu tek panelden yönetin. 7/24 canlı.')}</p>
              <div className="chips">
                <span className="chip">{t('login.hero.chip1', '10 entegre modül')}</span>
                <span className="chip">{t('login.hero.chip2', 'RBAC + 2FA')}</span>
                <span className="chip">{t('login.hero.chip3', 'Canlı Filyos hava/deniz')}</span>
              </div>
            </div>
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
              hasPasskey={!!passkeyCred}
              onPasskeyLogin={handlePasskeyLogin}
            />
            {/* Passkey kayıt teklifi — parola girişi başarılı, yönlendirme bekliyor */}
            {passkeyOffer && (
              <div role="dialog" aria-modal="true" style={{
                position: 'fixed', inset: 0, zIndex: 300,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.65)' }} />
                <div style={{
                  position: 'relative', width: 'min(380px, 90vw)', padding: '22px',
                  background: 'var(--surface, #0d1117)', border: '1px solid var(--border, #233)',
                  borderRadius: '14px', color: 'var(--text, #fff)',
                }}>
                  <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '8px' }}>
                    🔑 {t('login.card.passkey_offer_title', 'Daha hızlı giriş?')}
                  </div>
                  <p style={{ fontSize: '13px', opacity: 0.8, marginBottom: '16px', lineHeight: 1.5 }}>
                    {t('login.card.passkey_offer_body', 'Bu cihazda passkey (parmak izi / yüz / cihaz PIN) kurarsanız bir dahaki sefere parolasız girersiniz.')}
                  </p>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-ghost" onClick={() => handlePasskeyRegister(false)}>
                      {t('login.card.passkey_later', 'Şimdi değil')}
                    </button>
                    <button type="button" className="btn" autoFocus onClick={() => handlePasskeyRegister(true)} style={{ width: 'auto', padding: '8px 18px' }}>
                      {t('login.card.passkey_save', 'Kur')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </HeroScene>

        {/* LANDING BÖLÜMLERİ — hero'dan sonra kaydırmalı akış */}
        <MissionBand />
        <ServicePillars reduced={reduced} />
        <ModuleCarousel stats={stats} reduced={reduced} />
        <StatsCounter stats={stats} reduced={reduced} />
        <BlockHeatmap blocks={stats?.blocks || []} reduced={reduced} />
        <FilyosEnv weather={weather} reduced={reduced} />
        <SecurityBand reduced={reduced} />
        <LandingTicker items={tickerItems} />
        <LandingFooter onModal={setModal} />
      </div>

      <LoginModal which={modal} onClose={() => setModal(null)} />
    </div>
  )
}
