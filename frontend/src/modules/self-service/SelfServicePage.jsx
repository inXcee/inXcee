import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const STATUS_LABELS = { clean:'Temiz', dirty:'Kirli', collected:'Toplandı', washing:'Yıkanıyor', ready:'Hazır', distributed:'Teslim Edildi' }
const STATUS_COLORS = { clean:'text-green-400', dirty:'text-red-400', collected:'text-yellow-400', washing:'text-blue-400', ready:'text-green-400', distributed:'text-slate-400' }
const MAINT_STATUS = { open:'Bekliyor', assigned:'Atandı', in_progress:'Devam Ediyor', review:'İncelemede', done:'Tamamlandı' }
const MAINT_STATUS_COLOR = { open:'text-yellow-400', assigned:'text-blue-400', in_progress:'text-blue-400', review:'text-purple-400', done:'text-green-400' }
const CARD_COLOR = { yellow:'text-yellow-400 border-yellow-400', red:'text-red-400 border-red-400' }

const TABS = [
  { key:'info',        label:'👤 Bilgilerim' },
  { key:'laundry',     label:'🧺 Çamaşır' },
  { key:'maintenance', label:'🔧 Arıza' },
  { key:'announcements', label:'📢 Duyurular' },
  { key:'discipline',  label:'⚠️ Disiplin' },
  { key:'feedback',    label:'💬 Şikayet' },
]

export default function SelfServicePage() {
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
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🏨</div>
            <h1 className="text-2xl font-bold text-slate-100">Personel Self-Servis</h1>
          </div>

          {/* Yöntem seçici — sadece 'both' modunda */}
          {loginMethod === 'both' && (
            <div className="flex gap-2 mb-4">
              <button onClick={() => setLoginTab('tc')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${activeLt==='tc' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                TC No ile
              </button>
              <button onClick={() => setLoginTab('name')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${activeLt==='name' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                İsimle Ara
              </button>
            </div>
          )}

          {/* TC No formu */}
          {showTc && activeLt === 'tc' && (
            <form onSubmit={handleLogin} className="bg-slate-900 rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">TC Kimlik No</label>
                <input type="text" value={tcNo} onChange={e => setTcNo(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-lg text-slate-100 text-center font-mono tracking-widest focus:outline-none focus:border-blue-500"
                  maxLength={11} autoFocus />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">PIN (4 hane)</label>
                <input type="password" inputMode="numeric" maxLength={4} value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-2xl tracking-widest focus:outline-none focus:border-amber-500"
                  placeholder="····" required />
              </div>
              {loginError && <div className="text-red-400 text-sm text-center">{loginError}</div>}
              <button type="submit" disabled={tcNo.length < 11 || pin.length !== 4}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-base font-medium transition-colors">
                Giriş Yap
              </button>
            </form>
          )}

          {/* İsimle arama formu */}
          {showName && activeLt === 'name' && (
            <form onSubmit={handleNameLogin} className="bg-slate-900 rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Ad Soyad ile Ara</label>
                <input type="text" value={nameQuery} onChange={e => handleNameSearch(e.target.value)}
                  placeholder="En az 2 karakter..."
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
                  <label className="block text-sm text-slate-400 mb-2">PIN (4 hane)</label>
                  <input type="password" inputMode="numeric" maxLength={4} value={namePin}
                    onChange={e => setNamePin(e.target.value.replace(/\D/g,'').slice(0,4))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-2xl tracking-widest focus:outline-none focus:border-amber-500"
                    placeholder="····" autoFocus />
                </div>
              )}

              {loginError && <div className="text-red-400 text-sm text-center">{loginError}</div>}
              <button type="submit" disabled={!selectedPerson || namePin.length !== 4}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-base font-medium transition-colors">
                Giriş Yap
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
        <button onClick={() => setKioskToken(null)} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1 bg-slate-800 rounded-lg">Çıkış</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TABS.map(t => {
          let badge = null
          if (t.key === 'announcements' && unreadCount > 0) badge = unreadCount
          if (t.key === 'maintenance' && openMaintCount > 0) badge = openMaintCount
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`relative flex-shrink-0 py-2 px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${activeTab === t.key ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {t.label}
              {badge ? (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* ── Tab: Bilgilerim ── */}
      {activeTab === 'info' && myInfo && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
            <h2 className="font-medium text-slate-300">Kişisel Bilgiler</h2>
            {[
              { label:'Şirket',       value: myInfo.company },
              { label:'Giriş Tarihi', value: myInfo.check_in_date ? new Date(myInfo.check_in_date).toLocaleDateString('tr-TR') : '-' },
              { label:'Disiplin Puanı', value: myInfo.discipline_points ?? 0 },
            ].map(item => (
              <div key={item.label} className="flex justify-between text-sm">
                <span className="text-slate-500">{item.label}</span>
                <span className={`font-medium ${item.label === 'Disiplin Puanı' && item.value >= 3 ? 'text-red-400' : 'text-slate-200'}`}>{item.value || '-'}</span>
              </div>
            ))}
          </div>
          {myInfo.room && (
            <div className="bg-slate-900 rounded-2xl p-5">
              <h2 className="font-medium text-slate-300 mb-3">Oda Bilgisi</h2>
              <div className="text-3xl font-bold text-blue-400">{myInfo.room.block} — {myInfo.room.room_no}</div>
              <div className="text-sm text-slate-500 mt-1">Kat {myInfo.room.floor} · Yatak {myInfo.room.bed_no}</div>
            </div>
          )}
          {myInfo.expected_departure && (() => {
            const days = daysLeft(myInfo.expected_departure)
            const urgent = days !== null && days <= 7
            return (
              <div className={`rounded-2xl p-5 border ${urgent ? 'bg-red-950 border-red-800' : 'bg-slate-900 border-slate-800'}`}>
                <h2 className="font-medium text-slate-300 mb-2">📅 Tahmini Çıkış</h2>
                <div className={`text-xl font-bold ${urgent ? 'text-red-400' : 'text-green-400'}`}>
                  {new Date(myInfo.expected_departure).toLocaleDateString('tr-TR')}
                </div>
                {days !== null && <div className="text-sm text-slate-500 mt-1">{days > 0 ? `${days} gün kaldı` : days === 0 ? 'Bugün' : 'Geçti'}</div>}
              </div>
            )
          })()}
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
              Bildir
            </button>
            <button onClick={() => setMaintMode('track')}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${maintMode === 'track' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              Takibim {openMaintCount > 0 ? `(${openMaintCount})` : ''}
            </button>
          </div>

          {maintMode === 'report' && (
            maintSuccess ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">✅</div>
                <div className="text-green-400 font-medium">Arıza kaydınız iletildi</div>
                <button onClick={() => setMaintSuccess(false)} className="mt-4 text-xs text-blue-400">Yeni Bildirim</button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Konum</label>
                  <input value={maintForm.location} onChange={e => setMaintForm(p => ({...p, location:e.target.value}))}
                    placeholder="Oda 101, Banyo vb."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Açıklama</label>
                  <textarea value={maintForm.description} onChange={e => setMaintForm(p => ({...p, description:e.target.value}))}
                    rows={4} placeholder="Arızayı açıklayın..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                </div>
                <button onClick={() => submitMaint.mutate()}
                  disabled={submitMaint.isPending || !maintForm.location || !maintForm.description}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                  {submitMaint.isPending ? 'Gönderiliyor...' : 'Gönder'}
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
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">Aktif duyuru yok</div>
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
          <h2 className="font-medium text-slate-300">Şikayet / Öneri</h2>
          {fbSuccess ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">📨</div>
              <div className="text-green-400 font-medium">Geri bildiriminiz alındı</div>
              <button onClick={() => setFbSuccess(false)} className="mt-4 text-xs text-blue-400">Yeni Gönder</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                {[['suggestion','💡 Öneri'],['complaint','⚠️ Şikayet'],['other','📝 Diğer']].map(([val,lbl]) => (
                  <button key={val} onClick={() => setFbForm(p=>({...p,type:val}))}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${fbForm.type===val ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Mesajınız</label>
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
                <span className="text-sm text-slate-400">Anonim gönder</span>
              </label>
              <button onClick={() => submitFb.mutate()}
                disabled={submitFb.isPending || fbForm.message.length < 20}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                {submitFb.isPending ? 'Gönderiliyor...' : 'Gönder'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
