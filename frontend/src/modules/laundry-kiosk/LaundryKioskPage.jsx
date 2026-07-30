import { useState, useEffect, useRef } from 'react'
import api from '../../shared/api/client.js'
import EntryForm from './EntryForm.jsx'
import DashboardView from './DashboardView.jsx'
import RoomsView from './RoomsView.jsx'
import MachineView from './MachineView.jsx'
import KioskHome from './KioskHome.jsx'
import IroningWorkView from './IroningWorkView.jsx'
import DeliverWorkView from './DeliverWorkView.jsx'

const TABS = [
  { key: 'home',    icon: '⌂', label: 'Ana Sayfa' },
  { key: 'entry',   icon: '＋', label: 'Hızlı Giriş' },
  { key: 'machine', icon: '⚙️', label: 'Makine' },
  { key: 'ironing', icon: '✓', label: 'Ütü' },
  { key: 'deliver', icon: '📦', label: 'Teslim' },
]
const MORE_TABS = [
  { key: 'rooms', icon: '🏠', label: 'Odalar' },
  { key: 'status',  icon: '📋', label: 'Durum' },
]
const VALID_TABS = [...TABS, ...MORE_TABS].map(t => t.key)


// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function LaundryKioskPage() {
  const [avsToken, setAvsToken] = useState(null)
  const [workerInfo, setWorkerInfo] = useState(null)
  const [loginError, setLoginError] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [nameResults, setNameResults] = useState([])
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [pinInput, setPinInput] = useState('')
  const [activeTab, setActiveTab] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    return VALID_TABS.includes(fromUrl) ? fromUrl : 'home'
  })
  const [moreOpen, setMoreOpen] = useState(false)
  const [focusedBag, setFocusedBag] = useState(null)
  const [focusedRoom, setFocusedRoom] = useState(null) // { block, room_no } | null
  const searchTimer = useRef(null)

  useEffect(() => {
    if (!avsToken) return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', activeTab)
    window.history.replaceState(null, '', url)
  }, [activeTab, avsToken])

  const kioskApi = {
    get: url => api.get(url, { headers: { Authorization: `Bearer ${avsToken}` } }),
    post: (url, data) => api.post(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
    put: (url, data) => api.put(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
  }

  const handleNameSearch = val => {
    setNameQuery(val)
    setSelectedWorker(null)
    clearTimeout(searchTimer.current)
    if (val.length < 2) { setNameResults([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/avs-search?q=${encodeURIComponent(val)}`)
        setNameResults(res.data)
      } catch { setNameResults([]) }
    }, 300)
  }

  const handleLogin = async e => {
    e.preventDefault(); setLoginError('')
    if (!selectedWorker) return setLoginError('Listeden bir kişi seçin')
    try {
      const res = await api.post('/auth/avs-login', { worker_id: selectedWorker.id, pin: pinInput })
      await api.get('/self-service/laundry-kiosk/session', {
        headers: { Authorization: `Bearer ${res.data.token}` },
      })
      setAvsToken(res.data.token)
      setWorkerInfo(res.data.worker)
      setActiveTab('home')
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Giriş başarısız')
    }
  }

  // ── Login ekranı ────────────────────────────────────────────────────────────
  if (!avsToken) {
    return (
      <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🧺</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Çamaşırhane</h1>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>AVS Personel Girişi</p>
          </div>
          <form onSubmit={handleLogin} style={{ background: '#0f172a', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>İsimle Ara</label>
              <input type="text" value={nameQuery} onChange={e => handleNameSearch(e.target.value)}
                placeholder="En az 2 karakter..."
                autoFocus
                style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '12px 16px', color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            {nameResults.length > 0 && !selectedWorker && (
              <div style={{ background: '#1e293b', borderRadius: 12, overflow: 'hidden' }}>
                {nameResults.map(w => (
                  <button key={w.id} type="button"
                    onClick={() => { setSelectedWorker(w); setNameResults([]) }}
                    disabled={!w.has_pin}
                    style={{
                      width: '100%', textAlign: 'left', padding: '12px 16px',
                      background: 'transparent', border: 'none', borderBottom: '1px solid #334155',
                      color: w.has_pin ? '#e2e8f0' : '#475569', cursor: w.has_pin ? 'pointer' : 'not-allowed',
                    }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{w.full_name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {w.role_label || '—'}{!w.has_pin ? ' · PIN tanımlı değil' : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedWorker && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', borderRadius: 12, padding: '12px 16px' }}>
                <div>
                  <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{selectedWorker.full_name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{selectedWorker.role_label || '—'}</div>
                </div>
                <button type="button" onClick={() => { setSelectedWorker(null); setNameQuery(''); setPinInput('') }}
                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>
                  Değiştir
                </button>
              </div>
            )}

            {selectedWorker && (
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>PIN (4 hane)</label>
                <input type="password" inputMode="numeric" maxLength={4} value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="····"
                  autoFocus
                  style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '12px 16px', color: '#f1f5f9', fontSize: 24, textAlign: 'center', letterSpacing: 8, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            )}

            {loginError && <div style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>{loginError}</div>}

            <button type="submit" disabled={!selectedWorker || pinInput.length !== 4}
              style={{
                padding: '14px', borderRadius: 12, border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
                background: (!selectedWorker || pinInput.length !== 4) ? '#1e293b' : '#2563eb',
                color: (!selectedWorker || pinInput.length !== 4) ? '#475569' : '#fff',
              }}>
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Ana ekran ───────────────────────────────────────────────────────────────
  return (
    <div className="laundry-kiosk-shell" style={{ minHeight: '100vh', background: '#020617', display: 'flex', flexDirection: 'column' }}>
      {/* Üst bar */}
      <div style={{
        height: 56, background: '#0f172a', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>🧺</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Çamaşırhane</span>
        </div>
        <div className="kiosk-workerinfo" style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{workerInfo?.full_name}</div>
          {workerInfo?.role_label && <div style={{ fontSize: 11, color: '#64748b' }}>{workerInfo.role_label}</div>}
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7 }}>
          <button type="button" onClick={() => setMoreOpen(value => !value)}
            style={{
              minHeight: 48,
              fontSize: 12,
              color: MORE_TABS.some(tab => tab.key === activeTab) ? '#bfdbfe' : '#94a3b8',
              padding: '6px 10px',
              background: MORE_TABS.some(tab => tab.key === activeTab) ? '#1d4ed8' : '#1e293b',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 800,
            }}>
            Daha Fazla
          </button>
          {moreOpen && (
            <div style={{
              position: 'absolute',
              zIndex: 40,
              right: 0,
              top: 46,
              width: 190,
              border: '1px solid #334155',
              borderRadius: 12,
              background: '#0f172a',
              padding: 7,
              boxShadow: '0 18px 40px rgba(0,0,0,.45)',
            }}>
              {MORE_TABS.map(tab => (
                <button type="button" key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setMoreOpen(false) }}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    border: 0,
                    borderRadius: 9,
                    background: activeTab === tab.key ? '#1d4ed8' : 'transparent',
                    color: activeTab === tab.key ? '#fff' : '#cbd5e1',
                    textAlign: 'left',
                    padding: '0 12px',
                    fontWeight: 800,
                  }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          )}
        <button onClick={() => { setAvsToken(null); setWorkerInfo(null); setActiveTab('home'); setFocusedBag(null); setMoreOpen(false) }}
          style={{ fontSize: 12, color: '#94a3b8', padding: '6px 12px', background: '#1e293b', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Çıkış
        </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <nav className="kiosk-sidenav" style={{
          width: 160, background: '#0b1220', borderRight: '1px solid #1e293b',
          padding: 8, display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
        }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                background: activeTab === t.key ? '#1d4ed8' : 'transparent',
                color: activeTab === t.key ? '#fff' : '#94a3b8',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontSize: 14, fontWeight: 600, textAlign: 'left',
              }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
          <div style={{ height: 1, background: '#1e293b', margin: '5px 8px' }} />
          {MORE_TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '10px 14px',
                background: activeTab === t.key ? '#1e3a5f' : 'transparent',
                color: activeTab === t.key ? '#bfdbfe' : '#64748b',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontSize: 13, fontWeight: 700, textAlign: 'left',
              }}>
              <span style={{ fontSize: 17 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="kiosk-content" style={{
          flex: 1, padding: 16, overflowY: 'auto', maxWidth: 720,
          margin: '0 auto', width: '100%',
        }}>
          {activeTab === 'home'    && <KioskHome kioskApi={kioskApi}
                                          onNavigate={(target, bag) => {
                                            if (bag) setFocusedBag(bag)
                                            setActiveTab(target)
                                          }} />}
          {activeTab === 'entry'   && <EntryForm   kioskApi={kioskApi} focusedRoom={focusedRoom} onConsumeFocus={() => setFocusedRoom(null)} />}
          {activeTab === 'rooms'   && <RoomsView   kioskApi={kioskApi}
                                          onPickRoom={(room) => { setFocusedRoom(room); setActiveTab('entry') }} />}
          {activeTab === 'machine' && <MachineView kioskApi={kioskApi} focusedBag={focusedBag} onConsumeFocus={() => setFocusedBag(null)} />}
          {activeTab === 'ironing' && <IroningWorkView kioskApi={kioskApi} focusedBag={focusedBag} onConsumeFocus={() => setFocusedBag(null)} />}
          {activeTab === 'deliver' && <DeliverWorkView kioskApi={kioskApi} focusedBag={focusedBag} onConsumeFocus={() => setFocusedBag(null)} />}
          {activeTab === 'status'  && <DashboardView kioskApi={kioskApi}
                                          onAction={(action, bag) => {
                                            if (action === 'machine') { setFocusedBag(bag); setActiveTab('machine') }
                                            if (action === 'iron')    { setFocusedBag(bag); setActiveTab('ironing') }
                                            if (action === 'deliver') { setFocusedBag(bag); setActiveTab('deliver') }
                                          }} />}
        </div>
      </div>

      {/* Bottom-nav — mobile only */}
      <nav className="kiosk-bottomnav" style={{
        height: 64, background: '#0b1220', borderTop: '1px solid #1e293b',
        display: 'none',
        alignItems: 'stretch', justifyContent: 'space-around',
        flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2, padding: '6px 0',
              borderTop: activeTab === t.key ? '3px solid #3b82f6' : '3px solid transparent',
            }}>
            <span style={{ fontSize: 22, opacity: activeTab === t.key ? 1 : 0.55 }}>{t.icon}</span>
            <span style={{ fontSize: 10, color: activeTab === t.key ? '#93c5fd' : '#64748b', fontWeight: 600 }}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

