// Orkestratör — auth/state/query/mutation'lar burada; login ekranı components/LoginScreen,
// sekme görselleri tabs/ altında (prop/callback, sekme değişiminde form taslakları korunur).
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useTranslation } from '../../shared/i18n/index.js'
import { useIdleTimeout } from '../../shared/hooks/useIdleTimeout.js'
import LanguageSwitcher from '../../shared/components/LanguageSwitcher.jsx'
import BottomNav from './components/BottomNav.jsx'
import KioskHeader from './components/KioskHeader.jsx'
import TabState from './components/TabState.jsx'
import NotificationFeed from './components/NotificationFeed.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import { leaveDays } from './leaveDays.js'
import ActivityTimeline from '../activity/ActivityTimeline.jsx'
import ShiftsTab from './tabs/ShiftsTab.jsx'
import TransportTab from './tabs/TransportTab.jsx'
import TasksTab from './tabs/TasksTab.jsx'
import AnnouncementsTab from './tabs/AnnouncementsTab.jsx'
import QuickFaultTab from './tabs/QuickFaultTab.jsx'
import ProfileTab from './tabs/ProfileTab.jsx'
import QrTab from './tabs/QrTab.jsx'
import LeaveTab from './tabs/LeaveTab.jsx'
import MealsTab from './tabs/MealsTab.jsx'
import InventoryTab from './tabs/InventoryTab.jsx'

const TAB_KEYS = [
  { key: 'shifts',        icon: '⏱', i18n: 'avs_kiosk.nav.shifts' },
  { key: 'transport',     icon: '🚌', i18n: 'avs_kiosk.nav.transport' },
  { key: 'tasks',         icon: '✅', i18n: 'avs_kiosk.nav.tasks' },
  { key: 'announcements', icon: '📢', i18n: 'avs_kiosk.nav.announcements' },
  { key: 'quick_fault',   icon: '🔧', i18n: 'avs_kiosk.nav.quick_fault' },
  { key: 'profile',       icon: '👤', i18n: 'avs_kiosk.nav.profile' },
  { key: 'qr',            icon: '🪪', i18n: 'avs_kiosk.nav.qr' },
  { key: 'activity',      icon: '🕐', i18n: 'avs_kiosk.nav.activity' },
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

  // P2 — Görev tamamlama (opsiyonel temizlik kanıt fotoğrafıyla)
  const completeTask = useMutation({
    mutationFn: ({ taskId, photoBlob }) => {
      if (!photoBlob) return avsApi.post(`/avs-self-service/tasks/${taskId}/complete`)
      const fd = new FormData()
      fd.append('photo', photoBlob, 'temizlik.jpg')
      return avsApi.post(`/avs-self-service/tasks/${taskId}/complete`, fd)
    },
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

  // Kartlarım — ayrı giriş + yemek kartı (her biri kendi QR'ı)
  const cardsQuery = useQuery({
    queryKey: ['avs-cards', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-cards').then(r => r.data),
    enabled: !!avsToken && activeTab === 'qr',
  })
  const myCards = cardsQuery.data?.cards || []

  // Geçmişim — birleşik hareket geçmişi (okutma/yemek/zimmet/izin/servis)
  const activityQuery = useQuery({
    queryKey: ['avs-activity', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-activity').then(r => r.data),
    enabled: !!avsToken && activeTab === 'activity',
  })

  const [cardImgs, setCardImgs] = useState({})
  useEffect(() => {
    const cards = cardsQuery.data?.cards || []
    if (cards.length) {
      import('qrcode').then(m => Promise.all(
        cards.map(c => m.default.toDataURL(c.code, { width: 240, margin: 1 })
          .then(img => [c.card_type, img]).catch(() => [c.card_type, null]))
      ).then(pairs => setCardImgs(Object.fromEntries(pairs))))
    } else { setCardImgs({}) }
  }, [cardsQuery.data])

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

  // Faz 8 — yarınki öğün seçimi (mutfak sayımı)
  // sv-SE = yerel YYYY-MM-DD (toISOString UTC basar — gece 00-03 TR'de yanlış gün)
  const tomorrowDate = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE')
  const mealSelQuery = useQuery({
    queryKey: ['avs-meal-selection', avsToken, tomorrowDate],
    queryFn: () => avsApi.get(`/avs-self-service/my-meal-selection?date=${tomorrowDate}`).then(r => r.data),
    enabled: !!avsToken && activeTab === 'meals',
  })
  const mealSel = mealSelQuery.data?.selections ?? {}
  const setMealSel = useMutation({
    mutationFn: ({ meal_type, attending }) => avsApi.put('/avs-self-service/my-meal-selection', { meal_date: tomorrowDate, meal_type, attending }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avs-meal-selection', avsToken, tomorrowDate] }),
  })

  // Aktif sekmenin query'si → header'daki ↻ yenileme butonu bunu refetch eder.
  // Eşlemede olmayan sekmeler (profil, hızlı arıza) için tüm aktif query'ler tazelenir.
  const TAB_QUERY = {
    shifts: shiftsQuery, transport: transportQuery, tasks: tasksQuery,
    announcements: annQuery, qr: cardsQuery, leave: leaveQuery,
    meals: menuQuery, inventory: invQuery, activity: activityQuery,
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
      <LoginScreen
        nameQuery={nameQuery} onSearch={handleSearch}
        results={results} selected={selected}
        onSelect={(w) => { setSelected(w); setResults([]) }}
        onClearSelected={() => { setSelected(null); setPin(''); setNameQuery('') }}
        pin={pin} setPin={setPin}
        loginError={loginError} onLogin={handleLogin}
      />
    )
  }

  // ─── Ana ekran ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col max-w-lg mx-auto p-4 pb-24">
      <KioskHeader userName={selected?.full_name} onLogout={handleLogout}
        onRefresh={handleRefresh} refreshing={!!activeQuery?.isFetching}
        onBell={openFeed} unread={unread} />
      <NotificationFeed open={feedOpen} onClose={() => setFeedOpen(false)} items={notifications} avsApi={avsApi} />
      <div className="mb-4 flex justify-end"><LanguageSwitcher compact /></div>

      {activeTab === 'shifts' && <ShiftsTab query={shiftsQuery} data={shiftsData} />}

      {activeTab === 'transport' && <TransportTab query={transportQuery} data={transportData} />}

      {activeTab === 'tasks' && <TasksTab query={tasksQuery} data={tasksData} completeTask={completeTask} />}

      {activeTab === 'announcements' && <AnnouncementsTab query={annQuery} announcements={announcements} />}

      {activeTab === 'quick_fault' && (
        <QuickFaultTab
          faultForm={faultForm} setFaultForm={setFaultForm}
          faultPhoto={faultPhoto} setFaultPhoto={setFaultPhoto}
          faultSuccess={faultSuccess} setFaultSuccess={setFaultSuccess}
          faultError={faultError} submitFault={submitFault} myFaults={myFaults}
        />
      )}

      {activeTab === 'profile' && (
        <ProfileTab
          myInfo={myInfo}
          pinForm={pinForm} setPinForm={setPinForm} pinMsg={pinMsg}
          handlePinSubmit={handlePinSubmit} submitPin={submitPin}
          fbForm={fbForm} setFbForm={setFbForm}
          fbSuccess={fbSuccess} setFbSuccess={setFbSuccess} submitFeedback={submitFeedback}
        />
      )}

      {activeTab === 'qr' && <QrTab query={cardsQuery} myCards={myCards} cardImgs={cardImgs} />}

      {activeTab === 'activity' && (
        <TabState query={activityQuery} skeletonRows={4}
          isEmpty={!!activityQuery.data && (activityQuery.data.items?.length ?? 0) === 0}
          emptyText={t('avs_kiosk.activity.none')}>
          <div className="bg-slate-900 rounded-2xl overflow-hidden">
            <ActivityTimeline items={activityQuery.data?.items} dark emptyText={t('avs_kiosk.activity.none')} />
          </div>
        </TabState>
      )}

      {activeTab === 'leave' && (
        <LeaveTab
          leaveData={leaveData}
          leaveForm={leaveForm} setLeaveForm={setLeaveForm}
          leaveSuccess={leaveSuccess} setLeaveSuccess={setLeaveSuccess}
          leaveError={leaveError} submitLeave={submitLeave}
          leaveReqDays={leaveReqDays} annualRemaining={annualRemaining}
          overAnnualBalance={overAnnualBalance}
        />
      )}

      {activeTab === 'meals' && <MealsTab menuToday={menuToday} mealSel={mealSel} setMealSel={setMealSel} />}

      {activeTab === 'inventory' && hasInventory && (
        <InventoryTab
          query={invQuery} data={invData} myCheckouts={myCheckouts} invLocations={invLocations}
          invSearch={invSearch} setInvSearch={setInvSearch}
          invSelected={invSelected} setInvSelected={setInvSelected}
          invQty={invQty} setInvQty={setInvQty}
          invNote={invNote} setInvNote={setInvNote}
          invLocation={invLocation} setInvLocation={setInvLocation}
          invMsg={invMsg} setInvMsg={setInvMsg}
          submitCheckout={submitCheckout}
        />
      )}

      <BottomNav
        tabs={TAB_KEYS
          .filter(tb => tb.key !== 'inventory' || hasInventory)
          .map(tb => ({ key: tb.key, icon: tb.icon, label: t(tb.i18n), badge: 0 }))}
        active={activeTab} onChange={setActiveTab} moreLabel={t('avs_kiosk.nav.more')} />
    </div>
  )
}
