import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

export default function SetupPage() {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== password2) {
      setError('Şifreler eşleşmiyor')
      return
    }
    setLoading(true)
    try {
      await api.post('/setup/init', {
        username: username.trim(),
        password,
        full_name: fullName.trim(),
        email: email.trim() || undefined,
      })
      setDone(true)
      setTimeout(() => navigate('/login'), 1500)
    } catch (err) {
      setError(err.response?.data?.error || 'Kurulum sırasında hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>✓</div>
          <h2 style={{ textAlign: 'center', fontFamily: 'var(--display)', letterSpacing: 3, color: 'var(--text)' }}>KURULUM TAMAM</h2>
          <p style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', marginTop: 12 }}>
            Giriş ekranına yönlendiriliyorsunuz...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 60, height: 60,
            background: 'linear-gradient(135deg, var(--accent), var(--accent3))',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--display)', fontSize: 20, color: '#000',
            margin: '0 auto 16px',
          }}>ŞKY</div>
          <h1 style={{ fontSize: 22, letterSpacing: 4, color: 'var(--text)' }}>İLK KURULUM</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6, letterSpacing: 1 }}>
            Yönetici hesabını oluşturun
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Kullanıcı adı" value={username} onChange={setUsername} placeholder="ör. mudur" required />
          <Field label="Ad Soyad" value={fullName} onChange={setFullName} placeholder="Kampüs Müdürü" required />
          <Field label="E-posta (opsiyonel)" value={email} onChange={setEmail} type="email" placeholder="admin@example.com" />
          <Field label="Şifre (min 8 karakter)" value={password} onChange={setPassword} type="password" required />
          <Field label="Şifre (tekrar)" value={password2} onChange={setPassword2} type="password" required />

          {error && (
            <div style={{
              padding: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)',
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 16px', marginTop: 8,
              background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
              fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >{loading ? 'KURULUYOR...' : 'KURULUMU TAMAMLA'}</button>

          <p style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 8, textAlign: 'center' }}>
            Bu hesap kampüs müdürü (campus_manager) yetkisine sahip olacak.<br />
            Diğer kullanıcılar daha sonra Kullanıcılar sayfasından eklenir.
          </p>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, required }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none',
        }}
      />
    </label>
  )
}

const shellStyle = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg)', padding: 16,
}
const cardStyle = {
  width: '100%', maxWidth: 420,
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 28,
}
