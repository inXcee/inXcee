import { useEffect, useState } from 'react'
import api from '../../shared/api/client.js'
import {
  detectDeviceCapabilities,
  readDeviceIdentity,
  saveDeviceIdentity,
} from '../../shared/kiosk/deviceIdentity.js'

const TARGETS = {
  laundry_terminal: '/laundry-kiosk', avs_shared: '/avs-kiosk', avs_personal: '/avs-kiosk',
  resident_shared: '/kiosk', scan_station: '/station', display_general: '/display', display_kitchen: '/display/kitchen',
}

export default function KioskEnrollmentPage() {
  const [code, setCode] = useState('')
  const [identity, setIdentity] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { readDeviceIdentity().then(setIdentity).catch(() => {}) }, [])

  async function enroll(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await api.post('/kiosk-device/enroll', {
        code: code.trim(),
        app_version: 'web-1.0.0',
        capabilities: detectDeviceCapabilities(),
      })
      await saveDeviceIdentity(response.data)
      setIdentity(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Cihaz kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  const target = identity?.device ? TARGETS[identity.device.device_type] || '/' : null
  return (
    <main style={{ minHeight: '100vh', background: '#07101d', color: '#f8fafc', display: 'grid', placeItems: 'center', padding: 20 }}>
      <section style={{ width: 'min(560px,100%)', padding: 24, border: '1px solid #24334a', borderRadius: 16, background: '#0c1728' }}>
        <div style={{ fontFamily: 'monospace', color: '#f0a500', fontSize: 11, letterSpacing: 2 }}>YYS CİHAZ KURULUMU</div>
        <h1 style={{ marginTop: 8, fontSize: 28 }}>Kiosk cihazını kaydet</h1>
        {identity?.device ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ padding: 16, borderRadius: 12, background: 'rgba(22,163,74,.12)', border: '1px solid rgba(22,163,74,.4)' }}>
              <strong>✓ Cihaz kayıtlı</strong>
              <div style={{ marginTop: 8 }}>{identity.device.name}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 3 }}>{identity.device.device_type} · {identity.device.id}</div>
            </div>
            <a href={target} style={{ display: 'block', marginTop: 16, padding: 13, borderRadius: 9, background: '#f0a500', color: '#07101d', textAlign: 'center', textDecoration: 'none', fontWeight: 700 }}>KİOSKU AÇ</a>
          </div>
        ) : (
          <form onSubmit={enroll} style={{ marginTop: 20 }}>
            <label htmlFor="enrollment-code" style={{ display: 'block', fontSize: 13, color: '#cbd5e1', marginBottom: 7 }}>Yönetici tarafından verilen tek kullanımlık kod</label>
            <input id="enrollment-code" autoComplete="off" autoCapitalize="characters" value={code} onChange={event => setCode(event.target.value.toLocaleUpperCase('tr-TR'))} placeholder="KE-..." style={{ width: '100%', padding: 14, borderRadius: 9, border: '1px solid #334155', background: '#07101d', color: '#f8fafc', fontFamily: 'monospace', fontSize: 17, letterSpacing: 1 }} />
            {error && <div role="alert" style={{ marginTop: 10, color: '#f87171', fontSize: 13 }}>{error}</div>}
            <button type="submit" disabled={busy || code.trim().length < 8} style={{ width: '100%', marginTop: 14, padding: 13, border: 0, borderRadius: 9, background: '#f0a500', color: '#07101d', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? .65 : 1 }}>{busy ? 'KAYDEDİLİYOR…' : 'CİHAZI KAYDET'}</button>
          </form>
        )}
        <p style={{ marginTop: 18, color: '#64748b', fontSize: 11, lineHeight: 1.5 }}>Cihaz anahtarı bu tarayıcıdaki IndexedDB alanında saklanır. Tarayıcı verileri temizlenirse yönetici yeni kayıt kodu üretmelidir.</p>
      </section>
    </main>
  )
}
