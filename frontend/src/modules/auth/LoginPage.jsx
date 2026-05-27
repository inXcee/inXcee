import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../shared/store/authStore.js'
import api from '../../shared/api/client.js'

const DEMO_USERS = [
  { username: 'mudur',    password: 'admin123', role: 'Kampüs Müdürü' },
  { username: 'vardiya',  password: 'admin123', role: 'Vardiya Amiri' },
  { username: 'teknik',   password: 'admin123', role: 'Teknik Servis' },
  { username: 'camasir',  password: 'admin123', role: 'Çamaşırhane' },
  { username: 'meydanci', password: 'admin123', role: 'Meydancı' },
]

// Login gerektirmeyen kiosk girişleri — her biri kendi PIN ekranına yönlendirir
const KIOSKS = [
  { path: '/avs-kiosk',     icon: '🧹', label: 'AVS Personel' },
  { path: '/laundry-kiosk', icon: '🧺', label: 'Çamaşırhane' },
  { path: '/kiosk',         icon: '🛏', label: 'Sakin Self-Servis' },
]

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [slowHint, setSlowHint] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [twoFA, setTwoFA] = useState(null) // { challenge_token } | null
  const [code, setCode] = useState('')
  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(''); setSlowHint(false)
    const slowTimer = setTimeout(() => setSlowHint(true), 4000)
    try {
      const res = await api.post('/auth/login', { username, password })
      if (res.data.require_2fa) {
        setTwoFA({ challenge_token: res.data.challenge_token })
        clearTimeout(slowTimer); setLoading(false); setSlowHint(false)
        return
      }
      // Cookie backend tarafından set edildi; sadece user bilgisini store'a al
      login(null, res.data.user)
      navigate('/')
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Kullanici adi veya sifre hatali')
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Sunucu yanitlamiyor — birkaç saniye bekleyip tekrar deneyin')
      } else if (!err.response) {
        setError('Sunucuya ulasilamiyor — internet baglantinizi kontrol edin')
      } else {
        setError('Bir hata olustu, tekrar deneyin')
      }
    }
    finally { clearTimeout(slowTimer); setLoading(false); setSlowHint(false) }
  }

  const handle2fa = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await api.post('/auth/2fa/verify-login', {
        challenge_token: twoFA.challenge_token,
        code,
      })
      login(null, res.data.user)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Kod doğrulanamadı')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '16px',
      position: 'relative',
    }}>
      {/* Grid overlay already via body::before */}
      {/* Glow */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: '400px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: '360px', position: 'relative', zIndex: 1 }} className="fade-up">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '60px', height: '60px',
            background: 'linear-gradient(135deg, var(--accent), var(--accent3))',
            borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--display)', fontSize: '20px', color: '#000',
            letterSpacing: '1px',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(240,165,0,0.3)',
          }}>
            ŞKY
          </div>
          <h1 style={{ fontSize: '28px', letterSpacing: '6px', color: 'var(--text)' }}>YYS</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '6px', letterSpacing: '3px' }}>
            ŞANTİYE YÖNETİM SİSTEMİ
          </p>
        </div>

        {/* Form card */}
        <div style={{
          background: 'var(--surface)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow)',
        }}>
          {/* Top accent */}
          <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--accent), var(--accent3))' }} />

          {twoFA ? (
            <form onSubmit={handle2fa} style={{ padding: '28px' }}>
              <div style={{ marginBottom: '8px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)', letterSpacing: 2 }}>
                İKİ FAKTÖRLÜ DOĞRULAMA
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: 18 }}>
                Authenticator uygulamasındaki 6 haneli kodu girin.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="form-input"
                placeholder="123456"
                autoFocus
                style={{ textAlign: 'center', fontSize: 20, letterSpacing: 8, fontFamily: 'var(--mono)' }}
              />
              {error && (
                <div className="alert alert-danger" style={{ marginTop: 14 }}>
                  <span>⚠</span><span>{error}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: '12px', marginTop: 14 }}
              >
                {loading ? 'DOĞRULANIYOR...' : 'DOĞRULA'}
              </button>
              <button
                type="button"
                onClick={() => { setTwoFA(null); setCode(''); setError('') }}
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: 8 }}
              >
                İPTAL
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} style={{ padding: '28px' }}>
            <div style={{ marginBottom: '14px' }}>
              <label className="form-label">Kullanıcı Adı</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                className="form-input"
                placeholder="kullanici_adi"
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label className="form-label">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="form-input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
                <span>⚠</span><span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: '12px', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? (slowHint ? 'SUNUCU UYANDIRILYOR...' : 'GIRIS YAPILIYOR...') : 'GIRIS YAP'}
            </button>
          </form>
          )}
        </div>

        {/* Kiosk girişleri — login gerektirmez, doğrudan PIN ekranına gider */}
        {!twoFA && (
          <div style={{ marginTop: '20px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              margin: '0 0 12px', fontFamily: 'var(--mono)', fontSize: '9px',
              color: 'var(--text4)', letterSpacing: '2px',
            }}>
              <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              VEYA KİOSK GİRİŞİ
              <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {KIOSKS.map(k => (
                <button
                  key={k.path}
                  type="button"
                  onClick={() => navigate(k.path)}
                  style={{
                    width: '100%', padding: '12px 14px',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '10px', color: 'var(--text)',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    cursor: 'pointer', fontSize: '13px', textAlign: 'left',
                    transition: 'border-color .15s, background .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(240,165,0,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
                >
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>{k.icon}</span>
                  <span style={{ flex: 1 }}>{k.label}</span>
                  <span style={{ color: 'var(--text4)', fontSize: '14px' }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {import.meta.env.DEV && (
          <div style={{ marginTop: '14px' }}>
            <button
              type="button"
              onClick={() => setDemoOpen(o => !o)}
              style={{
                width: '100%', padding: '8px 12px',
                background: 'transparent', border: '1px dashed var(--border)',
                borderRadius: '8px', color: 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>{demoOpen ? '▾' : '▸'} DEMO KULLANICILAR</span>
              <span style={{ color: 'var(--text4)' }}>geliştirme</span>
            </button>
            {demoOpen && (
              <div style={{
                marginTop: '8px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                overflow: 'hidden',
              }}>
                {DEMO_USERS.map((u, i) => (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => { setUsername(u.username); setPassword(u.password); setError('') }}
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: 'transparent', border: 'none',
                      borderBottom: i < DEMO_USERS.length - 1 ? '1px solid var(--border)' : 'none',
                      color: 'var(--text)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      cursor: 'pointer', fontSize: '12px', textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,165,0,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{u.username}</span>
                      <span style={{ color: 'var(--text3)', fontSize: '10px', marginLeft: '8px' }}>{u.role}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)' }}>{u.password}</span>
                  </button>
                ))}
                <div style={{
                  padding: '8px 14px', background: 'rgba(0,0,0,0.2)',
                  fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)',
                  letterSpacing: '1px', textAlign: 'center',
                }}>
                  TIKLAYARAK FORMU DOLDURUN · PROD'DA GÖRÜNMEZ
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '1px' }}>
          ŞKY v3.0 · YYS SİSTEMİ
          <span style={{ margin: '0 8px', color: 'var(--text4)' }}>·</span>
          <a href="/kvkk" style={{ color: 'var(--text3)', textDecoration: 'none' }}>KVKK</a>
        </div>
      </div>
    </div>
  )
}
