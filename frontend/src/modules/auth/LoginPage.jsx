import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../shared/store/authStore.js'
import api from '../../shared/api/client.js'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [slowHint, setSlowHint] = useState(false)
  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(''); setSlowHint(false)
    const slowTimer = setTimeout(() => setSlowHint(true), 4000)
    try {
      const res = await api.post('/auth/login', { username, password })
      login(res.data.token, res.data.user)
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
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '1px' }}>
          ŞKY v3.0 · YYS SİSTEMİ
        </div>
      </div>
    </div>
  )
}
