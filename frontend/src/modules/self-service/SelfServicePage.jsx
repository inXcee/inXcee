import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useTranslation } from '../../shared/i18n/index.js'
import LanguageSwitcher from '../../shared/components/LanguageSwitcher.jsx'

const STATUS_LABELS = { clean:'Temiz', dirty:'Kirli', collected:'Toplandı', washing:'Yıkanıyor', ready:'Hazır', distributed:'Teslim Edildi' }
const STATUS_COLORS = { clean:'text-green-400', dirty:'text-red-400', collected:'text-yellow-400', washing:'text-blue-400', ready:'text-green-400', distributed:'text-slate-400' }
const MAINT_STATUS = { open:'Bekliyor', assigned:'Atandı', in_progress:'Devam Ediyor', review:'İncelemede', done:'Tamamlandı' }
const MAINT_STATUS_COLOR = { open:'text-yellow-400', assigned:'text-blue-400', in_progress:'text-blue-400', review:'text-purple-400', done:'text-green-400' }
const CARD_COLOR = { yellow:'text-yellow-400 border-yellow-400', red:'text-red-400 border-red-400' }

// Tab listesi — label dictionary key'i, t() ile render edilir.
const TAB_KEYS = [
  { key:'info',          i18n:'kiosk.tabs.info' },
  { key:'qr',            i18n:'kiosk.tabs.qr' },
  { key:'shifts',        i18n:'kiosk.tabs.shifts' },
  { key:'transport',     i18n:'kiosk.tabs.transport' },
  { key:'laundry',       i18n:'kiosk.tabs.laundry' },
  { key:'maintenance',   i18n:'kiosk.tabs.maintenance' },
  { key:'announcements', i18n:'kiosk.tabs.announcements' },
  { key:'discipline',    i18n:'kiosk.tabs.discipline' },
  { key:'feedback',      i18n:'kiosk.tabs.feedback' },
]

export default function SelfServicePage() {
  const { t } = useTranslation()
  const [tcNo, setTcNo]   = useState('')
  const [pin, setPin]     = useState('')
  const [kioskToken, setKioskToken] = useState(null)
  const [loginError, setLoginError] = useState('')
  const [activeTab, setActiveTab]   = useState('info')

  // İsimle giriş
  const [nameQuery, setNameQuery] = useState('')
  const [nameResults, setNameResults] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [namePin, setNamePin] = useState('')
  const [loginTab, setLoginTab] = useState('tc') // 'tc' | 'name'
  const searchTimeout = useRef(null)

  // Arıza alt mod: 'report' | 'track'
  const [maintMode, setMaintMode] = useState('report')
  const [maintForm, setMaintForm] = useState({ location:'', description:'' })
  const [maintSuccess, setMaintSuccess] = useState(false)

  // Şikayet formu
  const [fbForm, setFbForm] = useState({ type:'suggestion', message:'', anonymous:false })
  const [fbSuccess, setFbSuccess] = useState(false)

  // Okunmamış duyuru takibi
  const [readIds, setReadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kiosk_read_ann') || '[]') } catch { return [] }
  })

  const { data: kioskConfig } = useQuery({
    queryKey: ['kiosk-config'],
    queryFn: () => api.get('/auth/kiosk-config').then(r => r.data),
    staleTime: 60000,
  })
  const loginMethod = kioskConfig?.login_method ?? 'both'

  const kioskApi = {
    get: (url) => api.get(url, { headers: { Authorization: `Bearer ${kioskToken}` } }),
    post: (url, data) => api.post(url, data, { headers: { Authorization: `Bearer ${kioskToken}` } }),
  }

  const handleLogin = async (e) => {
    e.preventDefault(); setLoginError('')
    try {
      const res = await api.post('/auth/kiosk-login', { tc_no: tcNo, pin })
      setKioskToken(res.data.token)
    } catch (err) { setLoginError(err.response?.data?.error || 'Giriş başarısız') }
  }

  const handleNameSearch = (val) => {
    setNameQuery(val)
    setSelectedPerson(null)
    clearTimeout(searchTimeout.current)
    if (val.length < 2) { setNameResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/kiosk-search?q=${encodeURIComponent(val)}`)
        setNameResults(res.data)
      } catch { setNameResults([]) }
    }, 300)
  }

  const handleNameLogin = async (e) => {
    e.preventDefault(); setLoginError('')
    if (!selectedPerson) return setLoginError('Listeden bir kişi seçin')
    try {
      const res = await api.post('/auth/kiosk-login', { personnel_id: selectedPerson.id, pin: namePin })
      setKioskToken(res.data.token)
    } catch (err) { setLoginError(err.response?.data?.error || 'Giriş başarısız') }
  }

  const { data: myInfo } = useQuery({
    queryKey: ['kiosk-info', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-info').then(r => r.data),
    enabled: !!kioskToken,
  })
  const { data: myProfile } = useQuery({
    queryKey: ['kiosk-profile', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-profile').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'info',
  })
  const { data: myShifts } = useQuery({
    queryKey: ['kiosk-shifts', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-shifts').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'shifts',
  })
  const { data: myTransport } = useQuery({
    queryKey: ['kiosk-transport', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-transport').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'transport',
  })
  const { data: myQr } = useQuery({
    queryKey: ['kiosk-qr', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-qr').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'qr',
  })
  const { data: laundryStatus = [] } = useQuery({
    queryKey: ['kiosk-laundry', kioskToken],
    queryFn: () => kioskApi.get('/self-service/laundry-status').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'laundry',
  })
  const { data: myMaint = [] } = useQuery({
    queryKey: ['kiosk-maint', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-maintenance').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'maintenance' && maintMode === 'track',
  })
  const { data: announcements = [] } = useQuery({
    queryKey: ['kiosk-ann', kioskToken],
    queryFn: () => kioskApi.get('/self-service/announcements').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'announcements',
  })
  const { data: discipline = [] } = useQuery({
    queryKey: ['kiosk-disc', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-discipline').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'discipline',
  })

  const submitMaint = useMutation({
    mutationFn: () => kioskApi.post('/self-service/maintenance', maintForm),
    onSuccess: () => { setMaintSuccess(true); setMaintForm({ location:'', description:'' }) },
  })
  const submitFb = useMutation({
    mutationFn: () => kioskApi.post('/self-service/feedback', fbForm),
    onSuccess: () => { setFbSuccess(true); setFbForm({ type:'suggestion', message:'', anonymous:false }) },
  })

  // Okundu işaretleme
  useEffect(() => {
    if (activeTab === 'announcements' && announcements.length > 0) {
      const ids = [...new Set([...readIds, ...announcements.map(a => a.id)])]
      setReadIds(ids)
      localStorage.setItem('kiosk_read_ann', JSON.stringify(ids))
    }
  }, [activeTab, announcements])

  const unreadCount = announcements.filter(a => !readIds.includes(a.id)).length
  const openMaintCount = myMaint.filter(m => m.status !== 'done').length

  function daysLeft(dateStr) {
    if (!dateStr) return null
    const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
    return diff
  }

  // ─── Login ─────────────────────────────────────────────────
  if (!kioskToken) {
    const showTc   = loginMethod === 'tc_no' || loginMethod === 'both'
    const showName = loginMethod === 'name'  || loginMethod === 'both'
    const activeLt = loginMethod === 'tc_no' ? 'tc' : loginMethod === 'name' ? 'name' : loginTab

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-4">
            <LanguageSwitcher />
          </div>
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🏨</div>
            <h1 className="text-2xl font-bold text-slate-100">{t('kiosk.title')}</h1>
          </div>

          {/* Yöntem seçici — sadece 'both' modunda */}
          {loginMethod === 'both' && (
            <div className="flex gap-2 mb-4">
              <button onClick={() => setLoginTab('tc')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${activeLt==='tc' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {t('kiosk.login_tc')}
              </button>
              <button onClick={() => setLoginTab('name')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${activeLt==='name' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {t('kiosk.login_name')}
              </button>
            </div>
          )}

          {/* TC No formu */}
          {showTc && activeLt === 'tc' && (
            <form onSubmit={handleLogin} className="bg-slate-900 rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('kiosk.tc_no')}</label>
                <input type="text" value={tcNo} onChange={e => setTcNo(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-lg text-slate-100 text-center font-mono tracking-widest focus:outline-none focus:border-blue-500"
                  maxLength={11} autoFocus />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('kiosk.pin')}</label>
                <input type="password" inputMode="numeric" maxLength={4} value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-2xl tracking-widest focus:outline-none focus:border-amber-500"
                  placeholder="····" required />
              </div>
              {loginError && <div className="text-red-400 text-sm text-center">{loginError}</div>}
              <button type="submit" disabled={tcNo.length < 11 || pin.length !== 4}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-base font-medium transition-colors">
                {t('kiosk.login_button')}
              </button>
            </form>
          )}

          {/* İsimle arama formu */}
          {showName && activeLt === 'name' && (
            <form onSubmit={handleNameLogin} className="bg-slate-900 rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('kiosk.name_search')}</label>
                <input type="text" value={nameQuery} onChange={e => handleNameSearch(e.target.value)}
                  placeholder={t('kiosk.name_search')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500"
                  autoFocus />
              </div>

              {/* Arama sonuçları */}
              {nameResults.length > 0 && !selectedPerson && (
                <div className="bg-slate-800 rounded-xl overflow-hidden">
                  {nameResults.map(p => (
                    <button key={p.id} type="button" onClick={() => { setSelectedPerson(p); setNameResults([]) }}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700 last:border-0 ${!p.has_pin ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!p.has_pin}>
                      <div className="text-sm text-slate-200 font-medium">{p.full_name}</div>
                      <div className="text-xs text-slate-500">{p.company || '—'} {!p.has_pin ? '· PIN tanımlı değil' : ''}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Seçilen kişi */}
              {selectedPerson && (
                <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                  <div>
                    <div className="text-sm text-slate-200 font-medium">{selectedPerson.full_name}</div>
                    <div className="text-xs text-slate-500">{selectedPerson.company || '—'}</div>
                  </div>
                  <button type="button" onClick={() => { setSelectedPerson(null); setNamePin(''); setNameQuery('') }}
                    className="text-xs text-slate-500 hover:text-slate-300">Değiştir</button>
                </div>
              )}

              {selectedPerson && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">{t('kiosk.pin')}</label>
                  <input type="password" inputMode="numeric" maxLength={4} value={namePin}
                    onChange={e => setNamePin(e.target.value.replace(/\D/g,'').slice(0,4))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-2xl tracking-widest focus:outline-none focus:border-amber-500"
                    placeholder="····" autoFocus />
                </div>
              )}

              {loginError && <div className="text-red-400 text-sm text-center">{loginError}</div>}
              <button type="submit" disabled={!selectedPerson || namePin.length !== 4}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-base font-medium transition-colors">
                {t('kiosk.login_button')}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  // ─── Ana Ekran ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col max-w-lg mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-4">
        <div>
          <div className="font-semibold text-slate-100">{myInfo?.full_name}</div>
          {myInfo?.room && (
            <div className="text-xs text-slate-500">{myInfo.room.block} Blok - Oda {myInfo.room.room_no} · Yatak {myInfo.room.bed_no}</div>
          )}
        </div>
        <button onClick={() => setKioskToken(null)} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1 bg-slate-800 rounded-lg">{t('kiosk.logout')}</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TAB_KEYS.map(tab => {
          let badge = null
          if (tab.key === 'announcements' && unreadCount > 0) badge = unreadCount
          if (tab.key === 'maintenance' && openMaintCount > 0) badge = openMaintCount
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`relative flex-shrink-0 py-2 px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {t(tab.i18n)}
              {badge ? (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>
              ) : null}
            </button>
          )
        })}
      </div>
      {/* Dil seçici — login sonrası header'da compact */}
      <div className="mb-2 flex justify-end">
        <LanguageSwitcher compact />
      </div>

      {/* ── Tab: Bilgilerim ── */}
      {activeTab === 'info' && myInfo && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
            <h2 className="font-medium text-slate-300">{t('kiosk.info.personal')}</h2>
            {[
              { key: 'company',   label: t('kiosk.info.company'),       value: myInfo.company },
              { key: 'checkin',   label: t('kiosk.info.check_in'),      value: myInfo.check_in_date ? new Date(myInfo.check_in_date).toLocaleDateString('tr-TR') : '-' },
              { key: 'discipline',label: t('kiosk.info.discipline_pts'),value: myInfo.discipline_points ?? 0 },
            ].map(item => (
              <div key={item.key} className="flex justify-between text-sm">
                <span className="text-slate-500">{item.label}</span>
                <span className={`font-medium ${item.key === 'discipline' && item.value >= 3 ? 'text-red-400' : 'text-slate-200'}`}>{item.value || '-'}</span>
              </div>
            ))}
          </div>
          {myInfo.room && (
            <div className="bg-slate-900 rounded-2xl p-5">
              <h2 className="font-medium text-slate-300 mb-3">{t('kiosk.info.room_info')}</h2>
              <div className="text-3xl font-bold text-blue-400">{myInfo.room.block} — {myInfo.room.room_no}</div>
              <div className="text-sm text-slate-500 mt-1">{t('kiosk.info.floor')} {myInfo.room.floor} · {t('kiosk.info.bed')} {myInfo.room.bed_no}</div>
            </div>
          )}
          {myInfo.expected_departure && (() => {
            const days = daysLeft(myInfo.expected_departure)
            const urgent = days !== null && days <= 7
            return (
              <div className={`rounded-2xl p-5 border ${urgent ? 'bg-red-950 border-red-800' : 'bg-slate-900 border-slate-800'}`}>
                <h2 className="font-medium text-slate-300 mb-2">{t('kiosk.info.expected_dep')}</h2>
                <div className={`text-xl font-bold ${urgent ? 'text-red-400' : 'text-green-400'}`}>
                  {new Date(myInfo.expected_departure).toLocaleDateString('tr-TR')}
                </div>
                {days !== null && <div className="text-sm text-slate-500 mt-1">{days > 0 ? t('kiosk.info.days_left').replace('{n}', days) : days === 0 ? t('kiosk.info.today') : t('kiosk.info.passed')}</div>}
              </div>
            )
          })()}

          {/* H2 M1: Zengin profil */}
          {myProfile?.staff && (
            <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
              <h2 className="font-medium text-slate-300">{t('kiosk.info.work_info')}</h2>
              {myProfile.staff.dept_name && (
                <div className="flex justify-between text-sm"><span className="text-slate-500">{t('kiosk.info.department')}</span><span className="font-medium text-slate-200">{myProfile.staff.dept_name}</span></div>
              )}
              {myProfile.staff.position && (
                <div className="flex justify-between text-sm"><span className="text-slate-500">{t('kiosk.info.position')}</span><span className="font-medium text-slate-200">{myProfile.staff.position}</span></div>
              )}
              {myProfile.staff.hire_date && (
                <div className="flex justify-between text-sm"><span className="text-slate-500">{t('kiosk.info.hire_date')}</span><span className="font-medium text-slate-200">{myProfile.staff.hire_date}</span></div>
              )}
              {myProfile.staff.contract_end && (
                <div className="flex justify-between text-sm"><span className="text-slate-500">{t('kiosk.info.contract_end')}</span><span className={`font-medium ${new Date(myProfile.staff.contract_end) < new Date(Date.now() + 30 * 86400000) ? 'text-amber-400' : 'text-slate-200'}`}>{myProfile.staff.contract_end}</span></div>
              )}
              {myProfile.staff.blood_type && (
                <div className="flex justify-between text-sm"><span className="text-slate-500">{t('kiosk.info.blood_type')}</span><span className="font-medium text-slate-200">{myProfile.staff.blood_type}</span></div>
              )}
              {myProfile.staff.pickup_name && (
                <div className="flex justify-between text-sm"><span className="text-slate-500">{t('kiosk.info.pickup')}</span><span className="font-medium text-slate-200">{myProfile.staff.pickup_name}{myProfile.staff.pickup_district ? ` (${myProfile.staff.pickup_district})` : ''}</span></div>
              )}
            </div>
          )}

          {myProfile?.emergency_contacts?.length > 0 && (
            <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
              <h2 className="font-medium text-slate-300">{t('kiosk.info.emergency')}</h2>
              {myProfile.emergency_contacts.map((c, i) => (
                <div key={i} className="bg-slate-800 rounded-xl p-3">
                  <div className="text-sm text-slate-200 font-medium">{c.name}</div>
                  {c.relationship && <div className="text-xs text-slate-500">{c.relationship}</div>}
                  {c.phone && <a href={`tel:${c.phone}`} className="text-sm text-blue-400 mt-1 inline-block">📞 {c.phone}</a>}
                </div>
              ))}
            </div>
          )}

          {(myProfile?.discipline_total?.total > 0 || myProfile?.maintenance_open > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {myProfile.discipline_total?.total > 0 && (
                <div className="bg-slate-900 rounded-2xl p-4 text-center">
                  <div className="text-xs text-slate-500 mb-1">DİSİPLİN</div>
                  <div className="text-lg font-bold">
                    {myProfile.discipline_total.yellow > 0 && <span className="text-amber-400">🟡 {myProfile.discipline_total.yellow}</span>}
                    {myProfile.discipline_total.red > 0 && <span className="text-red-400 ml-2">🔴 {myProfile.discipline_total.red}</span>}
                  </div>
                </div>
              )}
              {myProfile.maintenance_open > 0 && (
                <div className="bg-slate-900 rounded-2xl p-4 text-center">
                  <div className="text-xs text-slate-500 mb-1">AÇIK ARIZA</div>
                  <div className="text-lg font-bold text-amber-400">🔧 {myProfile.maintenance_open}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Kartım / QR (H5 Q6) ── */}
      {activeTab === 'qr' && (
        <div className="space-y-4">
          {!myQr ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">Yükleniyor…</div>
          ) : !myQr.qr_token ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm text-center">
              <div className="text-4xl opacity-30 mb-3">📱</div>
              <div>{myQr.message || t('kiosk.info.qr_not_ready')}</div>
              <div className="text-xs text-slate-500 mt-2">Yöneticinizle iletişime geçin</div>
            </div>
          ) : (
            <div className="bg-slate-900 rounded-2xl p-6 text-center">
              <h2 className="font-medium text-slate-300 mb-4">📱 Dijital Kartım</h2>
              <div className="bg-white rounded-2xl p-6 inline-block">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent('AVS:' + myQr.qr_token)}&margin=10`}
                  alt="QR" style={{ width: 240, height: 240, display: 'block' }}
                />
              </div>
              <div className="text-base font-bold text-slate-100 mt-4">{myQr.full_name}</div>
              <div className="font-mono text-xs text-slate-500 mt-2">#{myQr.qr_token.slice(0, 8).toUpperCase()}</div>
              <div className="text-xs text-slate-400 mt-4">
                Servise binerken bu kodu okutun · Yemekhanede/Kapıda gösterin
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Vardiyam (H2 M2) ── */}
      {activeTab === 'shifts' && (
        <div className="space-y-4">
          {!myShifts ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">Yükleniyor…</div>
          ) : myShifts.message ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{myShifts.message}</div>
          ) : (
            <>
              <div className="bg-slate-900 rounded-2xl p-5">
                <h2 className="font-medium text-slate-300 mb-3">Son 30 Gün Özet</h2>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-800 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-green-400">{myShifts.summary?.worked || 0}</div>
                    <div className="text-xs text-slate-500 mt-1">Çalıştı</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-amber-400">{myShifts.summary?.on_leave || 0}</div>
                    <div className="text-xs text-slate-500 mt-1">İzin</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-red-400">{myShifts.summary?.absent || 0}</div>
                    <div className="text-xs text-slate-500 mt-1">Yok</div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 rounded-2xl p-5">
                <h2 className="font-medium text-slate-300 mb-3">Vardiya Programı (geçmiş 7g + sonraki 14g)</h2>
                {(!myShifts.shifts || myShifts.shifts.length === 0) ? (
                  <div className="text-slate-500 text-sm">Vardiya kaydı yok</div>
                ) : (
                  <div className="space-y-1">
                    {myShifts.shifts.map(s => {
                      const today = new Date().toISOString().slice(0, 10)
                      const isToday = s.work_date === today
                      const isFuture = s.work_date > today
                      const statusColor = s.status === 'worked' ? 'text-green-400' : s.status === 'absent' ? 'text-red-400' : s.status === 'on_leave' ? 'text-amber-400' : 'text-slate-400'
                      const statusLabel = s.status === 'worked' ? '✓ Çalıştı' : s.status === 'absent' ? '✗ Yok' : s.status === 'on_leave' ? '🛌 İzin' : isFuture ? '📅 Planlandı' : s.status
                      return (
                        <div key={s.work_date} className={`flex justify-between items-center px-3 py-2 rounded-lg ${isToday ? 'bg-blue-900 border border-blue-700' : 'bg-slate-800'}`}>
                          <div>
                            <div className="text-sm text-slate-200">{new Date(s.work_date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                            {s.shift_name && <div className="text-xs text-slate-500">{s.shift_name} {s.start_hour != null && `· ${String(s.start_hour).padStart(2, '0')}:00-${String(s.end_hour).padStart(2, '0')}:00`}</div>}
                          </div>
                          <div className={`text-xs font-medium ${statusColor}`}>{statusLabel}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Servisim (H2 M3) ── */}
      {activeTab === 'transport' && (
        <div className="space-y-4">
          {!myTransport ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">Yükleniyor…</div>
          ) : myTransport.message ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{myTransport.message}</div>
          ) : !myTransport.today && !myTransport.pickup ? (
            <div className="bg-slate-900 rounded-2xl p-5">
              <div className="text-slate-500 text-sm text-center py-6">Bugün için servis ataması yok</div>
            </div>
          ) : (
            <>
              {myTransport.pickup && (
                <div className="bg-slate-900 rounded-2xl p-5">
                  <h2 className="font-medium text-slate-300 mb-3">📍 Durağım</h2>
                  <div className="text-xl font-bold text-blue-400">{myTransport.pickup.name}</div>
                  {myTransport.pickup.district && (
                    <div className="text-sm text-slate-500 mt-1">{myTransport.pickup.district}{myTransport.pickup.neighborhood ? ` · ${myTransport.pickup.neighborhood}` : ''}</div>
                  )}
                  {myTransport.pickup.photo_url && (
                    <img src={myTransport.pickup.photo_url} alt="Durak" className="mt-3 w-full rounded-lg" style={{ maxHeight: 200, objectFit: 'cover' }} />
                  )}
                </div>
              )}

              {myTransport.today ? (
                <div className="bg-slate-900 rounded-2xl p-5" style={{ borderLeft: `4px solid ${myTransport.today.color || '#3b82f6'}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-medium text-slate-300">🚌 Bugün ({myTransport.date})</h2>
                    {myTransport.today.boarded === 1 ? (
                      <span className="text-xs font-bold text-green-400 bg-green-950 px-2 py-1 rounded">✓ BİNDİ</span>
                    ) : myTransport.today.boarded === 0 ? (
                      <span className="text-xs font-bold text-red-400 bg-red-950 px-2 py-1 rounded">✗ BİNMEDİ</span>
                    ) : myTransport.today.is_waitlist ? (
                      <span className="text-xs font-bold text-amber-400 bg-amber-950 px-2 py-1 rounded">⏳ YEDEK</span>
                    ) : null}
                  </div>
                  <div className="text-2xl font-bold text-slate-100">{myTransport.today.route_name}</div>
                  <div className="text-sm text-slate-400 mt-1">🚐 {myTransport.today.vehicle_plate || '— plakasız —'}</div>
                  {myTransport.today.scheduled_time && (
                    <div className="text-base font-medium text-blue-300 mt-2">⏰ {myTransport.today.scheduled_time}</div>
                  )}
                  {myTransport.today.stop_name && (
                    <div className="text-sm text-slate-400 mt-1">📍 {myTransport.today.stop_name}</div>
                  )}
                  {myTransport.today.driver_name && (
                    <div className="bg-slate-800 rounded-xl p-3 mt-3">
                      <div className="text-xs text-slate-500 mb-1">🧑‍✈️ Şoför</div>
                      <div className="text-sm text-slate-200">{myTransport.today.driver_name}</div>
                      {myTransport.today.driver_phone && (
                        <a href={`tel:${myTransport.today.driver_phone}`} className="text-sm text-blue-400 mt-1 inline-block">
                          📞 {myTransport.today.driver_phone}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm text-center">
                  Bugün için servis ataman yok
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Çamaşır ── */}
      {activeTab === 'laundry' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
          <h2 className="font-medium text-slate-300 mb-2">Çamaşır Torbası Durumu</h2>
          {laundryStatus.length === 0 ? (
            <div className="text-slate-500 text-sm">Çamaşır kaydı yok</div>
          ) : laundryStatus.map(bag => (
            <div key={bag.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
              <div className="text-xs text-slate-500">{bag.collected_at ? new Date(bag.collected_at).toLocaleDateString('tr-TR') : 'Son Torba'}</div>
              <span className={`text-sm font-medium ${STATUS_COLORS[bag.status]}`}>{STATUS_LABELS[bag.status]}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Arıza ── */}
      {activeTab === 'maintenance' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMaintMode('report')}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${maintMode === 'report' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {t('kiosk.maint.report')}
            </button>
            <button onClick={() => setMaintMode('track')}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${maintMode === 'track' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {t('kiosk.maint.track')} {openMaintCount > 0 ? `(${openMaintCount})` : ''}
            </button>
          </div>

          {maintMode === 'report' && (
            maintSuccess ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">✅</div>
                <div className="text-green-400 font-medium">{t('kiosk.maint.success')}</div>
                <button onClick={() => setMaintSuccess(false)} className="mt-4 text-xs text-blue-400">{t('kiosk.maint.report')}</button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">{t('kiosk.maint.location')}</label>
                  <input value={maintForm.location} onChange={e => setMaintForm(p => ({...p, location:e.target.value}))}
                    placeholder={t('kiosk.maint.location')}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">{t('kiosk.maint.description')}</label>
                  <textarea value={maintForm.description} onChange={e => setMaintForm(p => ({...p, description:e.target.value}))}
                    rows={4} placeholder={t('kiosk.maint.description')}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                </div>
                <button onClick={() => submitMaint.mutate()}
                  disabled={submitMaint.isPending || !maintForm.location || !maintForm.description}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                  {submitMaint.isPending ? t('common.loading') : t('kiosk.maint.submit')}
                </button>
              </>
            )
          )}

          {maintMode === 'track' && (
            <div className="space-y-3">
              {myMaint.length === 0 ? (
                <div className="text-slate-500 text-sm">Henüz arıza bildirimi yok</div>
              ) : myMaint.map(m => (
                <div key={m.id} className="bg-slate-800 rounded-xl p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm text-slate-200 font-medium">{m.location}</span>
                    <span className={`text-xs font-medium ${MAINT_STATUS_COLOR[m.status] || 'text-slate-400'}`}>{MAINT_STATUS[m.status] || m.status}</span>
                  </div>
                  <div className="text-xs text-slate-500 truncate">{m.description}</div>
                  <div className="text-xs text-slate-600 mt-1">{new Date(m.opened_at).toLocaleDateString('tr-TR')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Duyurular ── */}
      {activeTab === 'announcements' && (
        <div className="space-y-3">
          {announcements.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">{t('kiosk.info.no_announcements')}</div>
          ) : announcements.map(a => (
            <div key={a.id} className="bg-slate-900 rounded-2xl p-5">
              <div className="font-medium text-slate-200 mb-2">{a.title}</div>
              <div className="text-sm text-slate-400 whitespace-pre-line">{a.body}</div>
              <div className="text-xs text-slate-600 mt-3">{new Date(a.created_at).toLocaleDateString('tr-TR')}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Disiplin ── */}
      {activeTab === 'discipline' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-medium text-slate-300">Disiplin Geçmişi</h2>
            <span className={`text-sm font-bold ${(myInfo?.discipline_points ?? 0) >= 3 ? 'text-red-400' : 'text-slate-400'}`}>
              Toplam: {myInfo?.discipline_points ?? 0} puan
            </span>
          </div>
          {discipline.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-green-400 text-sm font-medium">Temiz sicil</div>
            </div>
          ) : discipline.map(d => (
            <div key={d.id} className={`border rounded-xl p-3 ${CARD_COLOR[d.card_type] || 'border-slate-700'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className={`text-xs font-bold uppercase ${d.card_type === 'red' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {d.card_type === 'red' ? '🟥 Kırmızı Kart' : '🟨 Sarı Kart'}
                </span>
                <span className="text-xs text-slate-500">{new Date(d.created_at).toLocaleDateString('tr-TR')}</span>
              </div>
              <div className="text-sm text-slate-300">{d.reason}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Şikayet/Öneri ── */}
      {activeTab === 'feedback' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
          <h2 className="font-medium text-slate-300">{t('kiosk.tabs.feedback')}</h2>
          {fbSuccess ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">📨</div>
              <div className="text-green-400 font-medium">{t('kiosk.feedback.success')}</div>
              <button onClick={() => setFbSuccess(false)} className="mt-4 text-xs text-blue-400">{t('kiosk.feedback.submit')}</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                {[
                  ['suggestion', `💡 ${t('kiosk.feedback.suggestion')}`],
                  ['complaint',  `⚠️ ${t('kiosk.feedback.complaint')}`],
                  ['other',      `📝 ${t('kiosk.feedback.other')}`],
                ].map(([val,lbl]) => (
                  <button key={val} onClick={() => setFbForm(p=>({...p,type:val}))}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${fbForm.type===val ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('kiosk.feedback.message')}</label>
                <textarea value={fbForm.message} onChange={e => setFbForm(p=>({...p,message:e.target.value}))}
                  rows={5} placeholder="En az 20 karakter..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                <div className={`text-xs mt-1 ${fbForm.message.length < 20 ? 'text-red-400' : 'text-slate-500'}`}>
                  {fbForm.message.length}/20 min
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={fbForm.anonymous} onChange={e => setFbForm(p=>({...p,anonymous:e.target.checked}))}
                  className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-sm text-slate-400">{t('kiosk.feedback.anonymous')}</span>
              </label>
              <button onClick={() => submitFb.mutate()}
                disabled={submitFb.isPending || fbForm.message.length < 20}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                {submitFb.isPending ? t('common.loading') : t('kiosk.feedback.submit')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
