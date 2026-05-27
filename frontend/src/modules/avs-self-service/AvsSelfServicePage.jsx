import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useTranslation } from '../../shared/i18n/index.js'
import { useIdleTimeout } from '../../shared/hooks/useIdleTimeout.js'
import LanguageSwitcher from '../../shared/components/LanguageSwitcher.jsx'
import PinPad from './components/PinPad.jsx'
import BottomNav from './components/BottomNav.jsx'
import KioskHeader from './components/KioskHeader.jsx'
import TabState from './components/TabState.jsx'
import NotificationFeed from './components/NotificationFeed.jsx'
import { leaveDays } from './leaveDays.js'

const TAB_KEYS = [
  { key: 'shifts',        icon: '⏱', i18n: 'avs_kiosk.nav.shifts' },
  { key: 'transport',     icon: '🚌', i18n: 'avs_kiosk.nav.transport' },
  { key: 'tasks',         icon: '✅', i18n: 'avs_kiosk.nav.tasks' },
  { key: 'announcements', icon: '📢', i18n: 'avs_kiosk.nav.announcements' },
  { key: 'quick_fault',   icon: '🔧', i18n: 'avs_kiosk.nav.quick_fault' },
  { key: 'profile',       icon: '👤', i18n: 'avs_kiosk.nav.profile' },
  { key: 'qr',            icon: '🪪', i18n: 'avs_kiosk.nav.qr' },
  { key: 'leave',         icon: '🌴', i18n: 'avs_kiosk.nav.leave' },
  { key: 'meals',         icon: '🍽', i18n: 'avs_kiosk.nav.meals' },
  { key: 'inventory',     icon: '📦', i18n: 'avs_kiosk.nav.inventory' },
]

export default function AvsSelfServicePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [avsToken, setAvsToken] = useState(null)
  const [activeTab, setActiveTab] = useState('shifts')

  // İsimle giriş
  const [nameQuery, setNameQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [loginError, setLoginError] = useState('')
  const searchTimeout = useRef(null)

  // Bildirim akışı paneli (header zili)
  const [feedOpen, setFeedOpen] = useState(false)

  // Task 16 — Hızlı Arıza
  const [faultForm, setFaultForm] = useState({ location: '', description: '', priority: 'medium' })
  const [faultPhoto, setFaultPhoto] = useState(null)
  const [faultSuccess, setFaultSuccess] = useState(false)
  const [faultError, setFaultError] = useState('')

  // Task 17 — Profil PIN değiştir
  const [pinForm, setPinForm] = useState({ current_pin: '', new_pin: '', new_pin2: '' })
  const [pinMsg, setPinMsg] = useState({ type: '', text: '' })

  // Envanter
  const [invSearch, setInvSearch] = useState('')
  const [invSelected, setInvSelected] = useState(null)
  const [invQty, setInvQty] = useState(1)
  const [invNote, setInvNote] = useState('')
  const [invLocation, setInvLocation] = useState('')
  const [invMsg, setInvMsg] = useState({ type: '', text: '' })

  const handleLogout = useCallback(() => {
    setAvsToken(null)
    setSelected(null)
    setPin('')
    setNameQuery('')
    setResults([])
    setActiveTab('shifts')
    setLoginError('')
    setFaultSuccess(false)
    setFaultError('')
    setFaultForm({ location: '', description: '', priority: 'medium' })
    setPinMsg({ type: '', text: '' })
    setPinForm({ current_pin: '', new_pin: '', new_pin2: '' })
    setInvSearch(''); setInvSelected(null); setInvQty(1); setInvNote(''); setInvLocation('')
    setInvMsg({ type: '', text: '' })
    setFeedOpen(false)
  }, [])

  // 5dk inaktivite → logout (son 30sn'de toast uyarısı)
  useIdleTimeout({
    timeoutMs: 5 * 60 * 1000,
    warnBeforeMs: 30 * 1000,
    token: avsToken,
    onLogout: handleLogout,
  })

  const avsApi = {
    get: (url) => api.get(url, { headers: { Authorization: `Bearer ${avsToken}` } }),
    post: (url, data) => api.post(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
  }

  // Task 12 — Vardiyam
  const shiftsQuery = useQuery({
    queryKey: ['avs-shifts', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-shifts').then(r => r.data),
    enabled: !!avsToken && activeTab === 'shifts',
  })
  const shiftsData = shiftsQuery.data

  // Task 13 — Servisim
  const transportQuery = useQuery({
    queryKey: ['avs-transport', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-transport').then(r => r.data),
    enabled: !!avsToken && activeTab === 'transport',
  })
  const transportData = transportQuery.data

  // Task 14 — Görevlerim
  const tasksQuery = useQuery({
    queryKey: ['avs-tasks', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-tasks').then(r => r.data),
    enabled: !!avsToken && activeTab === 'tasks',
  })
  const tasksData = tasksQuery.data

  // Task 15 — Duyurular
  const annQuery = useQuery({
    queryKey: ['avs-ann', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/announcements').then(r => r.data),
    enabled: !!avsToken && activeTab === 'announcements',
  })
  const announcements = annQuery.data ?? []

  // Bildirim akışı — sunucudan türetilmiş feed + okunmamış sayısı.
  // Kısa kiosk oturumu için 60sn'de bir tazelenir (rozet canlı kalsın).
  const notifQuery = useQuery({
    queryKey: ['avs-notifications', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/notifications').then(r => r.data),
    enabled: !!avsToken,
    refetchInterval: 60000,
  })
  const notifications = notifQuery.data?.items ?? []
  const unread = notifQuery.data?.unread ?? 0

  const markSeen = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/notifications/seen'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avs-notifications', avsToken] }),
  })
  const openFeed = () => { setFeedOpen(true); if (unread > 0) markSeen.mutate() }

  // P2 — Görev tamamlama
  const completeTask = useMutation({
    mutationFn: (taskId) => avsApi.post(`/avs-self-service/tasks/${taskId}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avs-tasks', avsToken] }),
  })

  // Task 16 — Hızlı Arıza mutation (P2: foto → FormData)
  const submitFault = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('location', faultForm.location)
      fd.append('description', faultForm.description)
      fd.append('priority', faultForm.priority)
      if (faultPhoto) fd.append('photo', faultPhoto)
      return avsApi.post('/avs-self-service/maintenance', fd)
    },
    onSuccess: () => { setFaultSuccess(true); setFaultError(''); setFaultForm({ location: '', description: '', priority: 'medium' }); setFaultPhoto(null); queryClient.invalidateQueries({ queryKey: ['avs-my-maint', avsToken] }) },
    onError: (err) => setFaultError(err.response?.data?.error || t('avs_kiosk.fault.error')),
  })

  // Task 17 — Profil: info query + PIN mutation
  // myInfo eager yüklenir (sadece profil sekmesinde değil): inventory_category
  // alanı "Malzeme" sekmesinin nav'da görünürlüğünü (hasInventory) belirler;
  // profil sekmesine girene kadar bekletilirse sekme hiç çıkmaz.
  const { data: myInfo } = useQuery({
    queryKey: ['avs-info', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-info').then(r => r.data),
    enabled: !!avsToken,
  })

  // Envanter sekmesi tüm personele açık — herkes her ürünü görebilir (departman gating yok)
  const hasInventory = true
  const invQuery = useQuery({
    queryKey: ['avs-inventory-items', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/inventory/items').then(r => r.data),
    enabled: !!avsToken && activeTab === 'inventory' && hasInventory,
  })
  const invData = invQuery.data
  const { data: myCheckouts = [] } = useQuery({
    queryKey: ['avs-my-checkouts', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/inventory/my-checkouts').then(r => r.data),
    enabled: !!avsToken && activeTab === 'inventory' && hasInventory,
  })
  const { data: invLocations = [] } = useQuery({
    queryKey: ['avs-item-locations', invSelected?.id],
    queryFn: () => avsApi.get(`/avs-self-service/inventory/items/${invSelected.id}/locations`).then(r => r.data),
    enabled: !!avsToken && !!invSelected?.track_locations,
  })
  const submitCheckout = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/inventory/checkout', {
      item_id: invSelected.id,
      quantity: invQty,
      note: invNote || undefined,
      from_location_id: invSelected?.track_locations ? Number(invLocation) : undefined,
    }),
    onSuccess: () => {
      setInvMsg({ type: 'ok', text: t('avs_kiosk.inventory.success') })
      setInvSelected(null); setInvQty(1); setInvNote(''); setInvLocation('')
      queryClient.invalidateQueries({ queryKey: ['avs-inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['avs-my-checkouts'] })
    },
    onError: (err) => setInvMsg({ type: 'err', text: err.response?.data?.error || t('avs_kiosk.inventory.error') }),
  })

  const submitPin = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/change-pin', { current_pin: pinForm.current_pin, new_pin: pinForm.new_pin }),
    onSuccess: () => { setPinMsg({ type: 'ok', text: t('avs_kiosk.profile.pin_success') }); setPinForm({ current_pin: '', new_pin: '', new_pin2: '' }) },
    onError: (err) => setPinMsg({ type: 'err', text: err.response?.data?.error || t('avs_kiosk.login_failed') }),
  })

  const handlePinSubmit = () => {
    setPinMsg({ type: '', text: '' })
    if (pinForm.new_pin !== pinForm.new_pin2) {
      return setPinMsg({ type: 'err', text: t('avs_kiosk.profile.pin_mismatch') })
    }
    submitPin.mutate()
  }

  // P3 — QR kart
  const qrQuery = useQuery({
    queryKey: ['avs-qr', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-qr').then(r => r.data),
    enabled: !!avsToken && activeTab === 'qr',
  })
  const qrData = qrQuery.data
  const [qrImg, setQrImg] = useState(null)
  useEffect(() => {
    if (qrData?.qr_token) {
      import('qrcode').then(m => m.default.toDataURL(qrData.qr_token, { width: 240, margin: 1 }).then(setQrImg).catch(() => setQrImg(null)))
    } else { setQrImg(null) }
  }, [qrData])

  // P3 — Bildirdiğim arızalar
  const { data: myFaults = [] } = useQuery({
    queryKey: ['avs-my-maint', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-maintenance').then(r => r.data),
    enabled: !!avsToken && activeTab === 'quick_fault',
  })

  // P3 — Geri bildirim
  const [fbForm, setFbForm] = useState({ type: 'suggestion', message: '' })
  const [fbSuccess, setFbSuccess] = useState(false)
  const submitFeedback = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/feedback', fbForm),
    onSuccess: () => { setFbSuccess(true); setFbForm({ type: 'suggestion', message: '' }) },
  })

  // P4 — İzin
  const leaveQuery = useQuery({
    queryKey: ['avs-leave', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-leave').then(r => r.data),
    enabled: !!avsToken && activeTab === 'leave',
  })
  const leaveData = leaveQuery.data
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'annual', start_date: '', end_date: '', reason: '' })
  const [leaveSuccess, setLeaveSuccess] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const submitLeave = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/my-leave', leaveForm),
    onSuccess: () => { setLeaveSuccess(true); setLeaveError(''); setLeaveForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '' }); queryClient.invalidateQueries({ queryKey: ['avs-leave', avsToken] }) },
    onError: (err) => setLeaveError(err.response?.data?.error || t('avs_kiosk.fault.error')),
  })

  // P5 — Yemek menüsü (bugün)
  const menuQuery = useQuery({
    queryKey: ['avs-menu-today', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/menu/today').then(r => r.data),
    enabled: !!avsToken && activeTab === 'meals',
  })
  const menuToday = menuQuery.data ?? []

  // Aktif sekmenin query'si → header'daki ↻ yenileme butonu bunu refetch eder.
  // Eşlemede olmayan sekmeler (profil, hızlı arıza) için tüm aktif query'ler tazelenir.
  const TAB_QUERY = {
    shifts: shiftsQuery, transport: transportQuery, tasks: tasksQuery,
    announcements: annQuery, qr: qrQuery, leave: leaveQuery,
    meals: menuQuery, inventory: invQuery,
  }
  const activeQuery = TAB_QUERY[activeTab]
  const handleRefresh = () => {
    if (activeQuery) activeQuery.refetch()
    else queryClient.invalidateQueries()
  }

  // İzin: talep edilen gün sayısı (backend ile aynı) + yıllık bakiye aşımı guard'ı
  const leaveReqDays = leaveDays(leaveForm.start_date, leaveForm.end_date)
  const annualRemaining = leaveData?.balance
    ? (leaveData.balance.annual_total - leaveData.balance.annual_used)
    : null
  const overAnnualBalance =
    leaveForm.leave_type === 'annual' && annualRemaining != null && leaveReqDays > annualRemaining

  const handleSearch = (val) => {
    setNameQuery(val); setSelected(null)
    clearTimeout(searchTimeout.current)
    if (val.length < 2) { setResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/avs-search?q=${encodeURIComponent(val)}`)
        setResults(res.data)
      } catch { setResults([]) }
    }, 300)
  }

  const handleLogin = async (e, completedPin) => {
    e?.preventDefault(); setLoginError('')
    if (!selected) return setLoginError(t('avs_kiosk.select_required'))
    const pinToUse = completedPin ?? pin
    try {
      const res = await api.post('/auth/avs-login', { worker_id: selected.id, pin: pinToUse })
      setAvsToken(res.data.token)
      setActiveTab('shifts')
    } catch (err) { setLoginError(err.response?.data?.error || t('avs_kiosk.login_failed')) }
  }

  // ─── Login ekranı ───────────────────────────────────────────
  if (!avsToken) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-4"><LanguageSwitcher /></div>
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">👷</div>
            <h1 className="text-2xl font-bold text-slate-100">{t('avs_kiosk.title')}</h1>
          </div>
          <form onSubmit={handleLogin} className="bg-slate-900 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.name_search')}</label>
              <input type="text" value={nameQuery} onChange={e => handleSearch(e.target.value)}
                placeholder={t('avs_kiosk.name_search')} autoFocus
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500" />
            </div>

            {results.length > 0 && !selected && (
              <div className="bg-slate-800 rounded-xl overflow-hidden">
                {results.map(w => (
                  <button key={w.id} type="button" disabled={!w.has_pin}
                    onClick={() => { setSelected(w); setResults([]) }}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700 last:border-0 ${!w.has_pin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <div className="text-sm text-slate-200 font-medium">{w.full_name}</div>
                    <div className="text-xs text-slate-500">{w.role_label || '—'} {!w.has_pin ? t('avs_kiosk.pin_not_set') : ''}</div>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                <div>
                  <div className="text-sm text-slate-200 font-medium">{selected.full_name}</div>
                  <div className="text-xs text-slate-500">{selected.role_label || '—'}</div>
                </div>
                <button type="button" onClick={() => { setSelected(null); setPin(''); setNameQuery('') }}
                  className="text-xs text-slate-500 hover:text-slate-300">{t('avs_kiosk.change')}</button>
              </div>
            )}

            {selected && (
              <div>
                <label className="block text-sm text-slate-400 mb-3 text-center">{t('avs_kiosk.pin')}</label>
                <PinPad value={pin} onChange={setPin} length={4}
                  onComplete={(completedPin) => handleLogin(null, completedPin)} error={loginError} />
              </div>
            )}
            <button type="submit" disabled={!selected || pin.length !== 4}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-base font-medium transition-colors">
              {t('avs_kiosk.login_button')}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Ana ekran ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col max-w-lg mx-auto p-4 pb-24">
      <KioskHeader userName={selected?.full_name} onLogout={handleLogout}
        onRefresh={handleRefresh} refreshing={!!activeQuery?.isFetching}
        onBell={openFeed} unread={unread} />
      <NotificationFeed open={feedOpen} onClose={() => setFeedOpen(false)} items={notifications} />
      <div className="mb-4 flex justify-end"><LanguageSwitcher compact /></div>

      {/* Task 12 — Vardiyam */}
      {activeTab === 'shifts' && (
        <TabState query={shiftsQuery}
          isEmpty={(shiftsData?.shifts || []).length === 0} emptyText={t('avs_kiosk.shifts.none')}>
          <div className="space-y-2">
          {(shiftsData?.shifts || []).map(s => {
            const today = new Date().toISOString().slice(0, 10)
            const isToday = s.work_date === today
            const color = s.status === 'worked' ? 'text-green-400' : s.status === 'absent' ? 'text-red-400'
              : s.status === 'on_leave' ? 'text-amber-400' : s.status === 'overtime' ? 'text-purple-400' : 'text-slate-400'
            return (
              <div key={s.work_date} className={`flex justify-between items-center px-4 py-3 rounded-xl ${isToday ? 'bg-blue-900 border border-blue-700' : 'bg-slate-900'}`}>
                <div>
                  <div className="text-sm text-slate-200">{new Date(s.work_date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  {s.shift_name && (
                    <div className="text-xs text-slate-500">
                      {s.shift_name}{s.start_hour != null && ` · ${String(s.start_hour).padStart(2, '0')}:00–${String(s.end_hour).padStart(2, '0')}:00`}
                    </div>
                  )}
                </div>
                <div className={`text-xs font-medium px-2 py-1 rounded-lg bg-slate-800 ${color}`}>{t('avs_kiosk.shifts.status.' + s.status, s.status)}</div>
              </div>
            )
          })}
          </div>
        </TabState>
      )}

      {/* Task 13 — Servisim */}
      {activeTab === 'transport' && (
        <TabState query={transportQuery}
          isEmpty={!transportData?.pickup} emptyText={t('avs_kiosk.transport.none')}>
          <div className="space-y-4">
            <div className="bg-slate-900 rounded-2xl p-5">
              {transportData.schedule?.time && (
                <div className="text-3xl font-bold text-blue-400 mb-1">🕐 {transportData.schedule.time}</div>
              )}
              <h2 className="font-medium text-slate-300 mb-1">📍 {t('avs_kiosk.transport.stop')}</h2>
              <div className="text-xl font-bold text-slate-100">{transportData.pickup.name}</div>
              {(transportData.pickup.district || transportData.pickup.neighborhood) && (
                <div className="text-sm text-slate-500 mt-1">
                  {transportData.pickup.district}{transportData.pickup.neighborhood ? ` · ${transportData.pickup.neighborhood}` : ''}
                </div>
              )}
              {transportData.schedule?.driver_name && (
                <div className="text-sm text-slate-400 mt-2">
                  {t('avs_kiosk.transport.driver')}: {transportData.schedule.driver_name}
                  {transportData.schedule.plate ? ` · ${transportData.schedule.plate}` : ''}
                  {transportData.schedule.driver_phone ? <a href={`tel:${transportData.schedule.driver_phone}`} className="text-blue-400 ml-2">{transportData.schedule.driver_phone}</a> : null}
                </div>
              )}
              {transportData.pickup.notes && (
                <div className="text-sm text-slate-400 mt-2 whitespace-pre-line">{transportData.pickup.notes}</div>
              )}
              {transportData.pickup.lat != null && transportData.pickup.lng != null && (
                <button onClick={() => window.open(`https://www.google.com/maps?q=${transportData.pickup.lat},${transportData.pickup.lng}`, '_blank')}
                  className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl py-3 text-sm font-medium">
                  {t('avs_kiosk.transport.open_map')}
                </button>
              )}
            </div>
          </div>
        </TabState>
      )}

      {/* Task 14 — Görevlerim */}
      {activeTab === 'tasks' && (
        <TabState query={tasksQuery}>
          <div className="space-y-3">
          {tasksData?.type === 'laundry' ? (
            <div className="bg-slate-900 rounded-2xl p-6 text-center">
              <div className="text-4xl mb-3">🧺</div>
              <div className="text-slate-300 text-sm mb-4">{t('avs_kiosk.tasks.laundry_redirect')}</div>
              <a href="/laundry-kiosk" className="inline-block bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-2 text-sm font-medium">
                {t('avs_kiosk.tasks.go_laundry')}
              </a>
            </div>
          ) : tasksData.type === 'housekeeping' ? (
            <>
              <h2 className="font-medium text-slate-300">{t('avs_kiosk.tasks.housekeeping_title')}</h2>
              {tasksData.items.length === 0 ? (
                <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{t('avs_kiosk.tasks.none')}</div>
              ) : tasksData.items.map(task => (
                <div key={task.id} className="bg-slate-900 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <div className="text-sm text-slate-200">{task.area}{task.block ? ` · ${task.block}` : ''}{task.floor != null ? ` · Kat ${task.floor}` : ''}</div>
                    <div className="text-xs text-slate-500">{task.task_type}</div>
                  </div>
                  {task.completed_at ? (
                    <span className="text-xs text-green-400">✓ {t('avs_kiosk.tasks.done')}</span>
                  ) : (
                    <button onClick={() => completeTask.mutate(task.id)} disabled={completeTask.isPending}
                      className="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg px-3 py-1.5">
                      {completeTask.isPending ? t('avs_kiosk.tasks.completing') : t('avs_kiosk.tasks.complete')}
                    </button>
                  )}
                </div>
              ))}
            </>
          ) : tasksData.type === 'maintenance' ? (
            <>
              <h2 className="font-medium text-slate-300">{t('avs_kiosk.tasks.maintenance_title')}</h2>
              {tasksData.items.length === 0 ? (
                <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{t('avs_kiosk.tasks.none')}</div>
              ) : tasksData.items.map(m => (
                <div key={m.id} className="bg-slate-900 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm text-slate-200 font-medium">{m.location}</span>
                    <span className={`text-xs font-medium ${m.priority === 'high' ? 'text-red-400' : m.priority === 'low' ? 'text-slate-400' : 'text-amber-400'}`}>{m.priority}</span>
                  </div>
                  <div className="text-xs text-slate-500 line-clamp-2">{m.description}</div>
                </div>
              ))}
            </>
          ) : (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm text-center py-6">{t('avs_kiosk.tasks.none')}</div>
          )}
          </div>
        </TabState>
      )}

      {/* Task 15 — Duyurular */}
      {activeTab === 'announcements' && (
        <TabState query={annQuery}
          isEmpty={announcements.length === 0} emptyText={t('avs_kiosk.announcements.none')}>
          <div className="space-y-3">
          {announcements.map(a => (
            <div key={a.id} className="bg-slate-900 rounded-2xl p-5">
              <div className="font-medium text-slate-200 mb-2">{a.title}</div>
              <div className="text-sm text-slate-400 whitespace-pre-line">{a.body}</div>
              <div className="text-xs text-slate-600 mt-3">{new Date(a.created_at).toLocaleDateString('tr-TR')}</div>
            </div>
          ))}
          </div>
        </TabState>
      )}

      {/* Task 16 — Hızlı Arıza */}
      {activeTab === 'quick_fault' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
          {faultSuccess ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-green-400 font-medium">{t('avs_kiosk.fault.success')}</div>
              <button onClick={() => setFaultSuccess(false)} className="mt-4 text-xs text-blue-400">{t('avs_kiosk.fault.submit')}</button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.fault.location')}</label>
                <input value={faultForm.location} onChange={e => setFaultForm(p => ({ ...p, location: e.target.value }))}
                  placeholder={t('avs_kiosk.fault.location')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.fault.description')}</label>
                <textarea value={faultForm.description} onChange={e => setFaultForm(p => ({ ...p, description: e.target.value }))}
                  rows={4} placeholder={t('avs_kiosk.fault.description')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.fault.priority')}</label>
                <div className="flex gap-2">
                  {[['high', t('avs_kiosk.fault.high')], ['medium', t('avs_kiosk.fault.medium')], ['low', t('avs_kiosk.fault.low')]].map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setFaultForm(p => ({ ...p, priority: val }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${faultForm.priority === val ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {faultPhoto ? (
                  <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={URL.createObjectURL(faultPhoto)} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      <span className="text-sm text-green-400">{t('avs_kiosk.fault.photo_added')}</span>
                    </div>
                    <button type="button" onClick={() => setFaultPhoto(null)} className="text-xs text-slate-400 hover:text-slate-200">{t('avs_kiosk.fault.remove_photo')}</button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-xl py-3 text-sm text-slate-300 cursor-pointer">
                    {t('avs_kiosk.fault.add_photo')}
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => setFaultPhoto(e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
              {faultError && <div className="text-red-400 text-sm text-center">{faultError}</div>}
              <button onClick={() => submitFault.mutate()}
                disabled={submitFault.isPending || faultForm.location.trim().length < 3 || faultForm.description.trim().length < 10}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                {submitFault.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.fault.submit')}
              </button>
            </>
          )}
          {myFaults.length > 0 && (
            <div className="border-t border-slate-800 pt-4">
              <h3 className="text-sm font-medium text-slate-400 mb-2">{t('avs_kiosk.my_faults.title')}</h3>
              <div className="space-y-2">
                {myFaults.map(m => (
                  <div key={m.id} className="bg-slate-800 rounded-xl px-3 py-2 flex justify-between items-center">
                    <span className="text-sm text-slate-200 truncate">{m.location}</span>
                    <span className={`text-xs font-medium ${m.status === 'closed' ? 'text-green-400' : m.status === 'open' ? 'text-amber-400' : 'text-blue-400'}`}>{m.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task 17 — Profil */}
      {activeTab === 'profile' && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
            <h2 className="font-medium text-slate-300">{t('avs_kiosk.profile.info')}</h2>
            {myInfo?.department_name && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.department')}</span><span className="text-slate-200 font-medium">{myInfo.department_name}</span></div>
            )}
            {myInfo?.role_label && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.role')}</span><span className="text-slate-200 font-medium">{myInfo.role_label}</span></div>
            )}
            {myInfo?.phone && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.phone')}</span><span className="text-slate-200 font-medium">{myInfo.phone}</span></div>
            )}
            {myInfo?.pickup_name && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.pickup')}</span><span className="text-slate-200 font-medium">{myInfo.pickup_name}</span></div>
            )}
            <div className="text-xs text-slate-600 pt-2">{t('avs_kiosk.profile.readonly_note')}</div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
            <h2 className="font-medium text-slate-300">{t('avs_kiosk.profile.change_pin')}</h2>
            {[['current_pin', t('avs_kiosk.profile.current_pin')], ['new_pin', t('avs_kiosk.profile.new_pin')], ['new_pin2', t('avs_kiosk.profile.new_pin2')]].map(([field, lbl]) => (
              <div key={field}>
                <label className="block text-sm text-slate-400 mb-2">{lbl}</label>
                <input type="password" inputMode="numeric" maxLength={4} value={pinForm[field]}
                  onChange={e => setPinForm(p => ({ ...p, [field]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-xl tracking-widest focus:outline-none focus:border-amber-500"
                  placeholder="····" />
              </div>
            ))}
            {pinMsg.text && <div className={`text-sm text-center ${pinMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{pinMsg.text}</div>}
            <button onClick={handlePinSubmit}
              disabled={submitPin.isPending || pinForm.current_pin.length !== 4 || pinForm.new_pin.length !== 4 || pinForm.new_pin2.length !== 4}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
              {submitPin.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.profile.change_pin')}
            </button>
          </div>

          <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
            <h2 className="font-medium text-slate-300">{t('avs_kiosk.feedback.title')}</h2>
            {fbSuccess ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">🙏</div>
                <div className="text-green-400 text-sm">{t('avs_kiosk.feedback.success')}</div>
                <button onClick={() => setFbSuccess(false)} className="mt-3 text-xs text-blue-400">{t('avs_kiosk.feedback.title')}</button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  {[['complaint', t('avs_kiosk.feedback.complaint')], ['suggestion', t('avs_kiosk.feedback.suggestion')], ['other', t('avs_kiosk.feedback.other')]].map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setFbForm(p => ({ ...p, type: val }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium ${fbForm.type === val ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>{lbl}</button>
                  ))}
                </div>
                <textarea value={fbForm.message} onChange={e => setFbForm(p => ({ ...p, message: e.target.value }))}
                  rows={3} placeholder={t('avs_kiosk.feedback.placeholder')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                <button onClick={() => submitFeedback.mutate()} disabled={submitFeedback.isPending || fbForm.message.trim().length < 20}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                  {submitFeedback.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.feedback.submit')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'qr' && (
        <TabState query={qrQuery} skeletonRows={1}
          isEmpty={!!qrData && !qrData.qr_token} emptyText={t('avs_kiosk.qr.none')}>
          <div className="bg-slate-900 rounded-2xl p-6 text-center">
            {qrImg && <img src={qrImg} alt="QR" className="mx-auto w-56 h-56 bg-white p-3 rounded-2xl" />}
            <div className="mt-4 font-semibold text-slate-200">{qrData?.full_name}</div>
            <div className="text-xs text-slate-500 mt-1">{t('avs_kiosk.qr.hint')}</div>
          </div>
        </TabState>
      )}

      {activeTab === 'leave' && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl p-5">
            <div className="text-xs text-slate-500">{t('avs_kiosk.leave.balance_remaining')}</div>
            <div className="text-3xl font-bold text-green-400">
              {leaveData?.balance ? (leaveData.balance.annual_total - leaveData.balance.annual_used) : '—'} <span className="text-base text-slate-400">{t('avs_kiosk.leave.days')}</span>
            </div>
            {leaveData?.balance && (
              <div className="text-xs text-slate-500 mt-2">
                {t('avs_kiosk.leave.sick_used')}: {leaveData.balance.sick_used} · {t('avs_kiosk.leave.emergency_used')}: {leaveData.balance.emergency_used}
              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
            {leaveSuccess ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">🌴</div>
                <div className="text-green-400 text-sm">{t('avs_kiosk.leave.success')}</div>
                <button onClick={() => setLeaveSuccess(false)} className="mt-3 text-xs text-blue-400">{t('avs_kiosk.leave.title')}</button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.leave.type')}</label>
                  <select value={leaveForm.leave_type} onChange={e => setLeaveForm(p => ({ ...p, leave_type: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100">
                    <option value="annual">{t('avs_kiosk.leave.type_annual')}</option>
                    <option value="sick">{t('avs_kiosk.leave.type_sick')}</option>
                    <option value="emergency">{t('avs_kiosk.leave.type_emergency')}</option>
                    <option value="other">{t('avs_kiosk.leave.type_other')}</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.leave.start')}</label>
                    <input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(p => ({ ...p, start_date: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.leave.end')}</label>
                    <input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(p => ({ ...p, end_date: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100" />
                  </div>
                </div>
                {leaveReqDays > 0 && (
                  <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-2.5 text-sm">
                    <span className="text-slate-400">{t('avs_kiosk.leave.requested')}</span>
                    <span className={`font-semibold ${overAnnualBalance ? 'text-red-400' : 'text-slate-100'}`}>
                      {leaveReqDays} {t('avs_kiosk.leave.days')}
                    </span>
                  </div>
                )}
                <textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))}
                  rows={2} placeholder={t('avs_kiosk.leave.reason')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100" />
                {overAnnualBalance && (
                  <div className="text-amber-400 text-sm text-center">
                    {t('avs_kiosk.leave.over_balance')} {annualRemaining} {t('avs_kiosk.leave.days')}.
                  </div>
                )}
                {leaveError && <div className="text-red-400 text-sm text-center">{leaveError}</div>}
                <button onClick={() => submitLeave.mutate()} disabled={submitLeave.isPending || !leaveForm.start_date || !leaveForm.end_date || overAnnualBalance}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                  {submitLeave.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.leave.submit')}
                </button>
              </>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-2">{t('avs_kiosk.leave.my_requests')}</h3>
            {!leaveData?.requests?.length ? (
              <div className="bg-slate-900 rounded-2xl p-4 text-slate-500 text-sm">{t('avs_kiosk.leave.none')}</div>
            ) : (
              <div className="space-y-2">
                {leaveData.requests.map(r => {
                  const color = r.status === 'approved' ? 'text-green-400' : r.status === 'rejected' ? 'text-red-400' : 'text-amber-400'
                  return (
                    <div key={r.id} className="bg-slate-900 rounded-xl px-4 py-3 flex justify-between items-center">
                      <div>
                        <div className="text-sm text-slate-200">{t('avs_kiosk.leave.type_' + r.leave_type, r.leave_type)}</div>
                        <div className="text-xs text-slate-500">{r.start_date} → {r.end_date} ({r.total_days} {t('avs_kiosk.leave.days')})</div>
                      </div>
                      <span className={`text-xs font-medium ${color}`}>{t('avs_kiosk.leave.status_' + r.status)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'meals' && (
        <TabState query={menuQuery} isEmpty={menuToday.length === 0} emptyText={t('avs_kiosk.meals.none')}>
          <div className="space-y-3">
          <h2 className="font-medium text-slate-300">{t('avs_kiosk.meals.title')}</h2>
          {menuToday.map(m => (
            <div key={m.meal_type} className="bg-slate-900 rounded-2xl p-5">
              <div className="font-medium text-slate-200 mb-2">{t('avs_kiosk.meals.' + m.meal_type, m.meal_type)}</div>
              <div className="text-sm text-slate-400 whitespace-pre-line">{m.items}</div>
            </div>
          ))}
          </div>
        </TabState>
      )}
      {activeTab === 'inventory' && hasInventory && (
        <div className="space-y-4 pb-4">
          <h2 className="font-medium text-slate-300">{t('avs_kiosk.inventory.title')}</h2>

          {/* Seçili ürün formu */}
          {invSelected ? (
            <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-100">{invSelected.item_name}</div>
                <button onClick={() => { setInvSelected(null); setInvLocation('') }}
                  className="text-xs text-slate-500">{t('avs_kiosk.change')}</button>
              </div>
              <div className="text-xs text-slate-500">{invSelected.quantity} {invSelected.unit} {t('avs_kiosk.inventory.stock')}</div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('avs_kiosk.inventory.quantity')}</label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setInvQty(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 text-xl">−</button>
                  <span className="text-xl text-slate-100 w-10 text-center">{invQty}</span>
                  <button type="button" onClick={() => setInvQty(q => Math.min(invSelected.quantity, q + 1))}
                    className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 text-xl">+</button>
                </div>
              </div>

              {invSelected.track_locations ? (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t('avs_kiosk.inventory.location')}</label>
                  <select value={invLocation} onChange={e => setInvLocation(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100">
                    <option value="">{t('avs_kiosk.inventory.choose_location')}</option>
                    {invLocations.map(l => (
                      <option key={l.location_id} value={l.location_id}>
                        {l.block ? `${l.block} · ` : ''}{l.name} ({l.quantity})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('avs_kiosk.inventory.note')}</label>
                <input type="text" value={invNote} onChange={e => setInvNote(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
              </div>

              <button type="button" disabled={submitCheckout.isPending || (invSelected.track_locations && !invLocation)}
                onClick={() => { setInvMsg({ type: '', text: '' }); submitCheckout.mutate() }}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 font-medium">
                {t('avs_kiosk.inventory.take')}
              </button>
            </div>
          ) : (
            <>
              <input type="text" value={invSearch} onChange={e => setInvSearch(e.target.value)}
                placeholder={t('avs_kiosk.inventory.search')}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" />
              <div className="space-y-2">
                <TabState query={invQuery}
                  isEmpty={!!invData && (invData.items || []).filter(i => i.item_name.toLowerCase().includes(invSearch.toLowerCase())).length === 0}
                  emptyText={t('avs_kiosk.inventory.none_items')}>
                {(() => {
                  const filtered = (invData?.items || []).filter(i =>
                    i.item_name.toLowerCase().includes(invSearch.toLowerCase()))
                  return filtered.map(i => {
                    const out = i.quantity <= 0
                    return (
                      <button key={i.id} type="button" disabled={out}
                        onClick={() => { setInvSelected(i); setInvQty(1); setInvNote(''); setInvLocation(''); setInvMsg({ type: '', text: '' }) }}
                        className={`w-full text-left bg-slate-900 rounded-xl px-4 py-3 flex justify-between items-center ${out ? 'opacity-50' : 'hover:bg-slate-800'}`}>
                        <span className="text-sm text-slate-200">{i.item_name}</span>
                        <span className={`text-xs ${out ? 'text-red-400' : 'text-slate-500'}`}>
                          {out ? t('avs_kiosk.inventory.out_of_stock') : `${i.quantity} ${i.unit}`}
                        </span>
                      </button>
                    )
                  })
                })()}
                </TabState>
              </div>
            </>
          )}

          {invMsg.text && (
            <div className={`text-sm text-center ${invMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{invMsg.text}</div>
          )}

          {/* Aldıklarım */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-2">{t('avs_kiosk.inventory.mine')}</h3>
            {myCheckouts.length === 0 ? (
              <div className="bg-slate-900 rounded-2xl p-4 text-slate-500 text-sm">{t('avs_kiosk.inventory.none_mine')}</div>
            ) : (
              <div className="space-y-2">
                {myCheckouts.map(c => (
                  <div key={c.id} className="bg-slate-900 rounded-xl px-4 py-2 flex justify-between text-sm">
                    <span className="text-slate-200">{c.item_name}</span>
                    <span className="text-slate-500">{c.quantity} {c.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <BottomNav
        tabs={TAB_KEYS
          .filter(tb => tb.key !== 'inventory' || hasInventory)
          .map(tb => ({ key: tb.key, icon: tb.icon, label: t(tb.i18n), badge: 0 }))}
        active={activeTab} onChange={setActiveTab} moreLabel={t('avs_kiosk.nav.more')} />
    </div>
  )
}
