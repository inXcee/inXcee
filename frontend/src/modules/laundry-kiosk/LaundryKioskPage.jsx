import { useEffect, useRef, useState } from 'react'
import api from '../../shared/api/client.js'
import { readKioskSession, writeKioskSession, clearKioskSession } from '../../shared/kioskSession.js'
import DashboardView from './DashboardView.jsx'
import BurstBagCenterView from './BurstBagCenterView.jsx'
import DeliverWorkView from './DeliverWorkView.jsx'
import EntryForm from './EntryForm.jsx'
import IroningWorkView from './IroningWorkView.jsx'
import KioskHome from './KioskHome.jsx'
import LossCenterView from './LossCenterView.jsx'
import RoomsView from './RoomsView.jsx'
import './LaundryKioskPage.css'

const SESSION_KEY = 'laundry-kiosk-session'

const TABS = [
  { key: 'home', icon: '⌂', label: 'Ana Sayfa', description: 'Günün özeti' },
  { key: 'entry', icon: '＋', label: 'Hızlı Giriş', description: 'Yeni torba kaydı' },
  { key: 'ironing', icon: '♨', label: 'Ütü', description: 'Parça kontrolü' },
  { key: 'deliver', icon: '▣', label: 'Teslim', description: 'Hazır torbalar' },
]

const MORE_TABS = [
  { key: 'sorting', icon: '≋', label: 'Ayırma Merkezi', description: 'Patlayan fileler' },
  { key: 'loss', icon: '!', label: 'Kayıp Merkezi', description: 'Torba ve kıyafet' },
  { key: 'rooms', icon: '⌂', label: 'Odalar', description: 'Oda geçmişi' },
  { key: 'status', icon: '≡', label: 'Tüm Kayıtlar', description: 'Detaylı durum' },
]

const ALL_TABS = [...TABS, ...MORE_TABS]
const VALID_TABS = ALL_TABS.map(tab => tab.key)

function readStoredSession() {
  return readKioskSession(SESSION_KEY)
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('tr-TR') || 'ÇP'
}

export default function LaundryKioskPage() {
  const storedSession = readStoredSession()
  const [avsToken, setAvsToken] = useState(storedSession?.token || null)
  const [workerInfo, setWorkerInfo] = useState(storedSession?.worker || null)
  const [loginError, setLoginError] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [nameResults, setNameResults] = useState([])
  const [nameSearchBusy, setNameSearchBusy] = useState(false)
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [pinInput, setPinInput] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    return VALID_TABS.includes(fromUrl) ? fromUrl : 'home'
  })
  const [moreOpen, setMoreOpen] = useState(false)
  const [focusedBag, setFocusedBag] = useState(null)
  const [focusedRoom, setFocusedRoom] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [now, setNow] = useState(() => new Date())
  const searchTimer = useRef(null)
  const pinFieldRef = useRef(null)

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    const clock = window.setInterval(() => setNow(new Date()), 30_000)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
      window.clearInterval(clock)
      window.clearTimeout(searchTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!avsToken) return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', activeTab)
    window.history.replaceState(null, '', url)
  }, [activeTab, avsToken])

  useEffect(() => {
    if (!avsToken) return
    api.get('/self-service/laundry-kiosk/session', {
      headers: { Authorization: `Bearer ${avsToken}` },
    }).then(response => {
      if (!workerInfo && response.data?.operator) {
        const restoredWorker = {
          full_name: response.data.operator.name,
          role_label: 'Çamaşırhane Personeli',
        }
        setWorkerInfo(restoredWorker)
        writeKioskSession(SESSION_KEY, { token: avsToken, worker: restoredWorker })
      }
    }).catch(() => {
      clearKioskSession(SESSION_KEY)
      setAvsToken(null)
      setWorkerInfo(null)
    })
  }, [avsToken, workerInfo])

  const kioskApi = {
    get: url => api.get(url, { headers: { Authorization: `Bearer ${avsToken}` } }),
    post: (url, data) => api.post(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
    put: (url, data) => api.put(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
  }

  const navigate = (target, bag) => {
    if (bag) setFocusedBag(bag)
    setActiveTab(target)
    setMoreOpen(false)
  }

  const handleNameSearch = value => {
    setNameQuery(value)
    setSelectedWorker(null)
    setLoginError('')
    window.clearTimeout(searchTimer.current)
    if (value.trim().length < 2) {
      setNameResults([])
      setNameSearchBusy(false)
      return
    }
    setNameSearchBusy(true)
    searchTimer.current = window.setTimeout(async () => {
      try {
        const response = await api.get(`/auth/avs-search?q=${encodeURIComponent(value.trim())}`)
        setNameResults(response.data)
      } catch {
        setNameResults([])
        setLoginError('Personel listesi alınamadı. Bağlantıyı kontrol edin.')
      } finally {
        setNameSearchBusy(false)
      }
    }, 300)
  }

  const selectWorker = worker => {
    setSelectedWorker(worker)
    setNameQuery(worker.full_name)
    setNameResults([])
    setPinInput('')
    setLoginError('')
  }

  const changeWorker = () => {
    setSelectedWorker(null)
    setNameQuery('')
    setPinInput('')
    setLoginError('')
  }

  const handlePinKey = key => {
    setLoginError('')
    if (key === 'backspace') {
      setPinInput(value => value.slice(0, -1))
      return
    }
    setPinInput(value => `${value}${key}`.slice(0, 4))
  }

  const handleLogin = async event => {
    event.preventDefault()
    setLoginError('')
    if (!selectedWorker) {
      setLoginError('Devam etmek için listeden personel seçin.')
      return
    }
    setLoginBusy(true)
    try {
      const response = await api.post('/auth/avs-login', {
        worker_id: selectedWorker.id,
        pin: pinInput,
      })
      await api.get('/self-service/laundry-kiosk/session', {
        headers: { Authorization: `Bearer ${response.data.token}` },
      })
      writeKioskSession(SESSION_KEY, {
        token: response.data.token,
        worker: response.data.worker,
      })
      setAvsToken(response.data.token)
      setWorkerInfo(response.data.worker)
      setActiveTab('home')
    } catch (error) {
      // Yanlış PIN artık hesabı kilitlemiyor: alan temizlenip odak geri veriliyor
      // ki personel beklemeden yeniden yazabilsin.
      setPinInput('')
      setLoginError(error.response?.data?.error || 'PIN hatalı. Tekrar deneyin.')
      window.requestAnimationFrame(() => pinFieldRef.current?.focus())
    } finally {
      setLoginBusy(false)
    }
  }

  const logout = () => {
    clearKioskSession(SESSION_KEY)
    setAvsToken(null)
    setWorkerInfo(null)
    setSelectedWorker(null)
    setNameQuery('')
    setPinInput('')
    setActiveTab('home')
    setFocusedBag(null)
    setMoreOpen(false)
  }

  if (!avsToken) {
    return (
      <main className="kiosk-login-page">
        <section className="kiosk-login-intro" aria-label="Çamaşırhane kiosk tanıtımı">
          <div className="kiosk-login-brand">
            <span className="kiosk-brand-mark">🧺</span>
            <span>YYS · Çamaşırhane</span>
          </div>
          <div className="kiosk-login-copy">
            <span className="kiosk-eyebrow">PERSONEL OPERASYON EKRANI</span>
            <h1>Günün işlerini tek ekrandan, hızlıca tamamlayın.</h1>
            <p>Torba girişinden teslimata kadar bütün adımlar dokunmatik kullanıma göre düzenlendi.</p>
          </div>
          <div className="kiosk-login-features">
            <div><span>01</span><strong>Hızlı kayıt</strong><small>Oda ve parça girişi</small></div>
            <div><span>02</span><strong>Canlı takip</strong><small>Yıkama ve ütü sırası</small></div>
            <div><span>03</span><strong>Güvenli teslim</strong><small>Kişi ve imza kontrolü</small></div>
          </div>
        </section>

        <section className="kiosk-login-panel">
          <form className="kiosk-login-card" onSubmit={handleLogin}>
            <div className="kiosk-login-card-header">
              <span className="kiosk-login-icon">🧺</span>
              <div>
                <span className="kiosk-eyebrow">HOŞ GELDİNİZ</span>
                <h2>Personel girişi</h2>
                <p>Adınızı seçin ve 4 haneli PIN kodunuzu girin.</p>
              </div>
            </div>

            {!selectedWorker ? (
              <div className="kiosk-field-group">
                <label htmlFor="kiosk-worker-search">Personel ara</label>
                <div className="kiosk-search-field">
                  <span>⌕</span>
                  <input
                    id="kiosk-worker-search"
                    type="search"
                    value={nameQuery}
                    onChange={event => handleNameSearch(event.target.value)}
                    placeholder="Adınızı yazın…"
                    autoComplete="off"
                    autoFocus
                  />
                  {nameSearchBusy && <span className="kiosk-mini-spinner" aria-label="Aranıyor" />}
                </div>
                <small>Aramak için en az 2 karakter yazın.</small>
              </div>
            ) : (
              <div className="kiosk-selected-worker">
                <span className="kiosk-avatar">{initials(selectedWorker.full_name)}</span>
                <div>
                  <strong>{selectedWorker.full_name}</strong>
                  <small>{selectedWorker.role_label || 'Çamaşırhane Personeli'}</small>
                </div>
                <button type="button" onClick={changeWorker}>Değiştir</button>
              </div>
            )}

            {nameResults.length > 0 && !selectedWorker && (
              <div className="kiosk-worker-results" role="listbox" aria-label="Personel sonuçları">
                {nameResults.map(worker => (
                  <button
                    key={worker.id}
                    type="button"
                    className="kiosk-worker-result"
                    onClick={() => selectWorker(worker)}
                    disabled={!worker.has_pin}
                  >
                    <span className="kiosk-avatar kiosk-avatar--small">{initials(worker.full_name)}</span>
                    <span>
                      <strong>{worker.full_name}</strong>
                      <small>{worker.role_label || 'Görev bilgisi yok'}{!worker.has_pin ? ' · PIN tanımlı değil' : ''}</small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            )}

            {selectedWorker && (
              <div className="kiosk-pin-section">
                <label htmlFor="kiosk-pin">4 haneli PIN</label>
                <input
                  id="kiosk-pin"
                  ref={pinFieldRef}
                  className="kiosk-pin-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinInput}
                  onChange={event => setPinInput(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  autoComplete="off"
                  autoFocus
                />
                <div className="kiosk-pin-dots" aria-hidden="true">
                  {[0, 1, 2, 3].map(index => <span key={index} className={pinInput.length > index ? 'is-filled' : ''} />)}
                </div>
                <div className="kiosk-keypad" aria-label="PIN tuş takımı">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(number => (
                    <button key={number} type="button" onClick={() => handlePinKey(String(number))} aria-label={`PIN'e ${number} ekle`}>
                      {number}
                    </button>
                  ))}
                  <span />
                  <button type="button" onClick={() => handlePinKey('0')} aria-label="PIN'e 0 ekle">0</button>
                  <button type="button" onClick={() => handlePinKey('backspace')} aria-label="Son PIN hanesini sil">⌫</button>
                </div>
              </div>
            )}

            {loginError && <div className="kiosk-login-error" role="alert">⚠ {loginError}</div>}

            <button className="kiosk-login-submit" type="submit" disabled={!selectedWorker || pinInput.length !== 4 || loginBusy}>
              {loginBusy ? 'Giriş yapılıyor…' : 'Kiosku Aç'}
              {!loginBusy && <span>→</span>}
            </button>
            <div className="kiosk-login-status">
              <span className={isOnline ? 'is-online' : 'is-offline'} />
              {isOnline ? 'Sistem çevrimiçi' : 'Bağlantı yok · Kayıtlar sıraya alınacak'}
            </div>
          </form>
        </section>
      </main>
    )
  }

  const currentTab = ALL_TABS.find(tab => tab.key === activeTab) || TABS[0]

  return (
    <div className="laundry-kiosk-shell">
      <header className="kiosk-topbar">
        <div className="kiosk-topbar-brand">
          <span className="kiosk-brand-mark kiosk-brand-mark--small">🧺</span>
          <div>
            <strong>Çamaşırhane</strong>
            <small>Operasyon Kiosku</small>
          </div>
        </div>

        <div className="kiosk-current-page">
          <span>{currentTab.icon}</span>
          <div><strong>{currentTab.label}</strong><small>{currentTab.description}</small></div>
        </div>

        <div className="kiosk-topbar-actions">
          <div className="kiosk-clock">
            <strong>{now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</strong>
            <small>{now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</small>
          </div>
          <div className="kiosk-connection" title={isOnline ? 'Sistem çevrimiçi' : 'Bağlantı yok'}>
            <span className={isOnline ? 'is-online' : 'is-offline'} />
            <span>{isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}</span>
          </div>
          <div className="kiosk-workerinfo">
            <span className="kiosk-avatar kiosk-avatar--header">{initials(workerInfo?.full_name)}</span>
            <div><strong>{workerInfo?.full_name}</strong><small>{workerInfo?.role_label || 'Çamaşırhane Personeli'}</small></div>
          </div>
          <div className="kiosk-more-wrap">
            <button className="kiosk-icon-button kiosk-mobile-more" type="button" onClick={() => setMoreOpen(value => !value)} aria-expanded={moreOpen}>
              ⋯ <span>Diğer</span>
            </button>
            {moreOpen && (
              <div className="kiosk-more-menu">
                {MORE_TABS.map(tab => (
                  <button type="button" key={tab.key} className={activeTab === tab.key ? 'is-active' : ''} onClick={() => navigate(tab.key)}>
                    <span>{tab.icon}</span><span><strong>{tab.label}</strong><small>{tab.description}</small></span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="kiosk-logout" type="button" onClick={logout} title="Oturumu kapat">↪ <span>Çıkış</span></button>
        </div>
      </header>

      <div className="kiosk-layout">
        <aside className="kiosk-sidenav">
          <nav aria-label="Ana kiosk menüsü">
            <span className="kiosk-nav-label">OPERASYON</span>
            {TABS.map(tab => (
              <button key={tab.key} className={activeTab === tab.key ? 'is-active' : ''} onClick={() => navigate(tab.key)} aria-current={activeTab === tab.key ? 'page' : undefined}>
                <span className="kiosk-nav-icon">{tab.icon}</span>
                <span><strong>{tab.label}</strong><small>{tab.description}</small></span>
                <span className="kiosk-nav-arrow">›</span>
              </button>
            ))}
            <span className="kiosk-nav-label kiosk-nav-label--secondary">TAKİP</span>
            {MORE_TABS.map(tab => (
              <button key={tab.key} className={activeTab === tab.key ? 'is-active' : ''} onClick={() => navigate(tab.key)} aria-current={activeTab === tab.key ? 'page' : undefined}>
                <span className="kiosk-nav-icon">{tab.icon}</span>
                <span><strong>{tab.label}</strong><small>{tab.description}</small></span>
                <span className="kiosk-nav-arrow">›</span>
              </button>
            ))}
          </nav>
          <div className="kiosk-sidebar-help">
            <span>?</span>
            <div><strong>Hızlı ipucu</strong><small>Bir torbaya dokunarak işlem ekranını doğrudan açabilirsiniz.</small></div>
          </div>
        </aside>

        <main className={`kiosk-content kiosk-content--${activeTab}`}>
          {activeTab === 'home' && <KioskHome kioskApi={kioskApi} workerName={workerInfo?.full_name} onNavigate={navigate} />}
          {activeTab === 'entry' && <EntryForm kioskApi={kioskApi} focusedRoom={focusedRoom} onConsumeFocus={() => setFocusedRoom(null)} />}
          {activeTab === 'rooms' && <RoomsView kioskApi={kioskApi} onPickRoom={room => { setFocusedRoom(room); navigate('entry') }} />}
          {activeTab === 'loss' && <LossCenterView kioskApi={kioskApi} />}
          {activeTab === 'sorting' && <BurstBagCenterView kioskApi={kioskApi} />}
          {activeTab === 'ironing' && <IroningWorkView kioskApi={kioskApi} focusedBag={focusedBag} onConsumeFocus={() => setFocusedBag(null)} />}
          {activeTab === 'deliver' && <DeliverWorkView kioskApi={kioskApi} focusedBag={focusedBag} onConsumeFocus={() => setFocusedBag(null)} />}
          {activeTab === 'status' && (
            <DashboardView
              kioskApi={kioskApi}
              onAction={(action, bag) => {
                if (action === 'iron') navigate('ironing', bag)
                if (action === 'deliver') navigate('deliver', bag)
              }}
            />
          )}
        </main>
      </div>

      <nav className="kiosk-bottomnav" aria-label="Mobil kiosk menüsü">
        {TABS.map(tab => (
          <button key={tab.key} className={activeTab === tab.key ? 'is-active' : ''} onClick={() => navigate(tab.key)} aria-current={activeTab === tab.key ? 'page' : undefined}>
            <span>{tab.icon}</span><small>{tab.label}</small>
          </button>
        ))}
      </nav>
    </div>
  )
}
