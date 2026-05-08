import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMobileAuth } from './useMobileAuth.js'
import mobileApi from './mobileApi.js'

const ROLES = [
  { value: 'housekeeper', label: 'Temizlik' },
  { value: 'technical', label: 'Teknik' },
  { value: 'laundry', label: 'Çamaşırhane' },
  { value: 'shift_supervisor', label: 'Vardiya' },
  { value: 'campus_manager', label: 'Müdür' },
]

const ROLE_HOME = {
  housekeeper: '/mobile/housekeeper',
  technical: '/mobile/technician',
  laundry: '/mobile/laundry',
  shift_supervisor: '/mobile/supervisor',
  campus_manager: '/mobile/manager',
}

const bioKey = role => `yys-bio-${role}`

async function webAuthnBrowser() {
  return import('@simplewebauthn/browser')
}

export default function MobileLogin() {
  const [role, setRole] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [bioPrompt, setBioPrompt] = useState(false)
  const [pendingDest, setPendingDest] = useState(null)
  const { login } = useMobileAuth()
  const navigate = useNavigate()

  function hasBio(r) { return !!localStorage.getItem(bioKey(r)) }

  async function handleBioLogin(r) {
    const credentialId = localStorage.getItem(bioKey(r))
    if (!credentialId) return
    setLoading(true); setError('')
    try {
      const { startAuthentication } = await webAuthnBrowser()
      const optRes = await mobileApi.post('/mobile/auth/webauthn/auth-options', { credentialId })
      const authResp = await startAuthentication(optRes.data)
      const res = await mobileApi.post('/mobile/auth/webauthn/authenticate', { credentialId, response: authResp })
      login(res.data.token, res.data.user)
      navigate(ROLE_HOME[r] || '/mobile', { replace: true })
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Biyometrik doğrulama başarısız'
      setError(msg)
      if (e.response?.status === 404) localStorage.removeItem(bioKey(r))
    } finally { setLoading(false) }
  }

  async function handleSubmit() {
    if (pin.length !== 4) return
    setLoading(true); setError('')
    try {
      const res = await mobileApi.post('/mobile/auth/login', { pin, role })
      login(res.data.token, res.data.user)
      const dest = ROLE_HOME[role] || '/mobile'

      if (!hasBio(role)) {
        const { browserSupportsWebAuthn } = await webAuthnBrowser()
        if (browserSupportsWebAuthn()) {
          setPendingDest(dest)
          setBioPrompt(true)
          return
        }
      }
      navigate(dest, { replace: true })
    } catch (e) {
      setError(e.response?.data?.error || 'Giriş başarısız')
      setPin('')
    } finally { setLoading(false) }
  }

  async function handleBioRegister() {
    setLoading(true)
    try {
      const { startRegistration } = await webAuthnBrowser()
      const optRes = await mobileApi.post('/mobile/auth/webauthn/register-options')
      const regResp = await startRegistration(optRes.data)
      const verRes = await mobileApi.post('/mobile/auth/webauthn/register', regResp)
      localStorage.setItem(bioKey(role), verRes.data.credentialId)
    } catch {
      // Registration failed or cancelled — proceed anyway
    } finally {
      navigate(pendingDest, { replace: true })
    }
  }

  function pressDigit(d) {
    if (pin.length < 4) {
      navigator.vibrate?.(8)
      const next = pin + d
      setPin(next)
      if (next.length === 4) setTimeout(handleSubmit, 100)
    }
  }

  // ── Biyometrik kayıt teklifi ───────────────────────────────────────────────
  if (bioPrompt) return (
    <div style={styles.container}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>👆</div>
      <h2 style={styles.title}>Biyometrik Giriş</h2>
      <p style={{ ...styles.sub, maxWidth: '260px', textAlign: 'center' }}>
        Bir sonraki girişte parmak izi veya yüz tanıma kullanmak ister misiniz?
      </p>
      <button onClick={handleBioRegister} disabled={loading} style={styles.roleBtn}>
        {loading ? 'Kaydediliyor...' : 'Evet, Kaydet'}
      </button>
      <button onClick={() => navigate(pendingDest, { replace: true })}
        style={{ ...styles.roleBtn, background: '#9ca3af', marginTop: '8px' }}>
        Atla
      </button>
    </div>
  )

  // ── Rol seçimi ─────────────────────────────────────────────────────────────
  if (!role) return (
    <div style={styles.container}>
      <h1 style={styles.title}>YYS Mobil</h1>
      <p style={styles.sub}>Rolünüzü seçin</p>
      {error && <p style={styles.error}>{error}</p>}
      {ROLES.map(r => (
        <div key={r.value} style={{ width: '100%', maxWidth: '280px', display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button style={{ ...styles.roleBtn, flex: 1, marginBottom: 0 }} onClick={() => setRole(r.value)}>
            {r.label}
          </button>
          {hasBio(r.value) && (
            <button
              aria-label={`${r.label} — parmak izi ile giriş`}
              onClick={() => handleBioLogin(r.value)}
              disabled={loading}
              style={{ padding: '16px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '12px', fontSize: '22px', cursor: 'pointer', flexShrink: 0 }}>
              👆
            </button>
          )}
        </div>
      ))}
      <p style={{ fontSize: '11px', color: '#d1d5db', marginTop: '40px' }}>v{__APP_VERSION__}</p>
    </div>
  )

  // ── PIN girişi ─────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      <button style={styles.back} onClick={() => { setRole(null); setPin('') }}>← Geri</button>
      <h2 style={styles.title}>{ROLES.find(r => r.value === role)?.label}</h2>
      <p style={styles.sub}>PIN giriniz</p>
      <div style={styles.dots}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ ...styles.dot, background: i < pin.length ? '#3b82f6' : '#e5e7eb' }} />
        ))}
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.pad}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
          <button key={i} style={d ? styles.padBtn : styles.padBtnEmpty}
            onClick={() => d === '⌫' ? setPin(p => p.slice(0,-1)) : d && pressDigit(d)}
            disabled={loading}
          >{d}</button>
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'24px', background:'#f9fafb' },
  title: { fontSize:'24px', fontWeight:700, margin:'0 0 8px', color:'#111' },
  sub: { fontSize:'14px', color:'#6b7280', margin:'0 0 32px' },
  roleBtn: { width:'100%', maxWidth:'280px', padding:'16px', fontSize:'18px', fontWeight:600, background:'#3b82f6', color:'#fff', border:'none', borderRadius:'12px', marginBottom:'12px', cursor:'pointer' },
  back: { alignSelf:'flex-start', background:'none', border:'none', color:'#3b82f6', fontSize:'16px', cursor:'pointer', marginBottom:'24px' },
  dots: { display:'flex', gap:'16px', marginBottom:'24px' },
  dot: { width:'16px', height:'16px', borderRadius:'50%', transition:'background 0.15s' },
  error: { color:'#ef4444', fontSize:'14px', marginBottom:'12px' },
  pad: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'12px', width:'240px' },
  padBtn: { padding:'18px', fontSize:'22px', fontWeight:600, background:'#fff', border:'1px solid #e5e7eb', borderRadius:'12px', cursor:'pointer' },
  padBtnEmpty: { padding:'18px', background:'transparent', border:'none', cursor:'default' },
}
