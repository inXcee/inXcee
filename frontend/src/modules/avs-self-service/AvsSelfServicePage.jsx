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
import HomeTab from './tabs/HomeTab.jsx'

const TAB_KEYS = [
  { key: 'home',          icon: '🏠', i18n: 'avs_kiosk.nav.home' },
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

const EMPTY_FAULT_FORM = {
  location: '',
  description: '',
  priority: 'medium',
  category: 'genel',
  block: '',
  room_id: '',
  cleaning_task_id: '',
}

export default function AvsSelfServicePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [avsToken, setAvsToken] = useState(null)
  const [activeTab, setActiveTab] = useState('home')

  // İsimle giriş
  const [nameQuery, setNameQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [loginError, setLoginError] = useState('')
  const searchTimeout = useRef(null)

  // Bildirim akışı paneli (header zili)
  const [feedOpen, setFeedOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ))

  // Task 16 — Hızlı Arıza
  const [faultForm, setFaultForm] = useState(EMPTY_FAULT_FORM)
  const [faultPhoto, setFaultPhoto] = useState(null)
  const [faultSuccess, setFaultSuccess] = useState(false)
  const [faultError, setFaultError] = useState('')
  const [taskPhotoDrafts, setTaskPhotoDrafts] = useState({})
  const [taskUploadProgress, setTaskUploadProgress] = useState({})
  const [taskBlock, setTaskBlock] = useState('')

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
  const taskDraftCount = Object.values(taskPhotoDrafts).filter(photos => photos?.length > 0).length
  const faultHasDraft = Boolean(
    faultPhoto
    || faultForm.location.trim()
    || faultForm.description.trim()
    || faultForm.cleaning_task_id
  )
  const hasSessionDrafts = taskDraftCount > 0 || faultHasDraft

  const handleLogout = useCallback(() => {
    setAvsToken(null)
    setSelected(null)
    setPin('')
    setNameQuery('')
    setResults([])
    setActiveTab('home')
    setLoginError('')
    setFaultSuccess(false)
    setFaultError('')
    setFaultForm(EMPTY_FAULT_FORM)
    setFaultPhoto(null)
    setTaskPhotoDrafts({})
    setTaskUploadProgress({})
    setTaskBlock('')
    setPinMsg({ type: '', text: '' })
    setPinForm({ current_pin: '', new_pin: '', new_pin2: '' })
    setInvSearch(''); setInvSelected(null); setInvQty(1); setInvNote(''); setInvLocation('')
    setInvMsg({ type: '', text: '' })
    setFeedOpen(false)
    setLogoutConfirmOpen(false)
  }, [])

  const requestLogout = () => {
    if (hasSessionDrafts) setLogoutConfirmOpen(true)
    else handleLogout()
  }

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  useEffect(() => {
    if (!hasSessionDrafts) return undefined
    const protectDrafts = event => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectDrafts)
    return () => window.removeEventListener('beforeunload', protectDrafts)
  }, [hasSessionDrafts])

  // 5dk inaktivite → logout (son 30sn'de toast uyarısı)
  useIdleTimeout({
    timeoutMs: 5 * 60 * 1000,
    warnBeforeMs: 30 * 1000,
    token: avsToken,
    onLogout: handleLogout,
  })

  const avsApi = {
    get: (url) => api.get(url, { headers: { Authorization: `Bearer ${avsToken}` } }),
    post: (url, data, config = {}) => api.post(url, data, {
      ...config,
      headers: { ...config.headers, Authorization: `Bearer ${avsToken}` },
    }),
    put: (url, data) => api.put(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
    patch: (url, data) => api.patch(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
  }

  const overviewQuery = useQuery({
    queryKey: ['avs-overview', avsToken, taskBlock],
    queryFn: () => avsApi.get(
      `/avs-self-service/overview${taskBlock ? `?block=${encodeURIComponent(taskBlock)}` : ''}`
    ).then(r => r.data),
    enabled: !!avsToken,
  })
  const overview = overviewQuery.data

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
    queryKey: ['avs-tasks', avsToken, taskBlock],
    queryFn: () => avsApi.get(`/avs-self-service/my-tasks${taskBlock ? `?block=${encodeURIComponent(taskBlock)}` : ''}`).then(r => r.data),
    enabled: !!avsToken && activeTab === 'tasks',
  })
  const tasksData = tasksQuery.data
  const faultRoomsQuery = useQuery({
    queryKey: ['avs-location-rooms', avsToken, faultForm.block],
    queryFn: () => avsApi.get(`/avs-self-service/location-rooms?block=${encodeURIComponent(faultForm.block)}`).then(r => r.data),
    enabled: !!avsToken && activeTab === 'quick_fault' && !!faultForm.block && !faultForm.cleaning_task_id,
  })

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
    mutationFn: ({ taskId, photoBlobs }) => {
      const fd = new FormData()
      photoBlobs.forEach((photoBlob, index) => {
        fd.append('photos', photoBlob, `temizlik-${index + 1}.jpg`)
      })
      setTaskUploadProgress(previous => ({ ...previous, [taskId]: 0 }))
      return avsApi.post(`/avs-self-service/tasks/${taskId}/complete`, fd, {
        onUploadProgress: event => {
          if (!event.total) return
          const value = Math.min(100, Math.round((event.loaded * 100) / event.total))
          setTaskUploadProgress(previous => ({ ...previous, [taskId]: value }))
        },
      })
    },
    onSuccess: (_response, variables) => {
      setTaskPhotoDrafts(previous => {
        const next = { ...previous }
        delete next[variables.taskId]
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['avs-tasks', avsToken] })
      queryClient.invalidateQueries({ queryKey: ['avs-overview', avsToken] })
    },
    onSettled: (_response, _error, variables) => {
      setTaskUploadProgress(previous => {
        const next = { ...previous }
        delete next[variables.taskId]
        return next
      })
    },
  })

  const skipTask = useMutation({
    mutationFn: ({ taskId, reason, note }) => (
      avsApi.patch(`/avs-self-service/tasks/${taskId}/skip`, { reason, note })
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avs-tasks', avsToken] })
      queryClient.invalidateQueries({ queryKey: ['avs-overview', avsToken] })
    },
  })

  // Task 16 — Hızlı Arıza mutation (P2: foto → FormData)
  const submitFault = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('location', faultForm.location)
      fd.append('description', faultForm.description)
      fd.append('priority', faultForm.priority)
      fd.append('category', faultForm.category)
      if (faultForm.block) fd.append('block', faultForm.block)
      if (faultForm.room_id) fd.append('room_id', faultForm.room_id)
      if (faultForm.cleaning_task_id) fd.append('cleaning_task_id', faultForm.cleaning_task_id)
      if (faultPhoto) fd.append('photo', faultPhoto)
      return avsApi.post('/avs-self-service/maintenance', fd)
    },
    onSuccess: (response) => {
      setFaultSuccess(response.data)
      setFaultError('')
      setFaultForm(EMPTY_FAULT_FORM)
      setFaultPhoto(null)
      queryClient.invalidateQueries({ queryKey: ['avs-my-maint', avsToken] })
      queryClient.invalidateQueries({ queryKey: ['avs-overview', avsToken] })
    },
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
    home: overviewQuery,
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
      setActiveTab('home')
    } catch (err) { setLoginError(err.response?.data?.error || t('avs_kiosk.login_failed')) }
  }

  const openFaultFromTask = (task) => {
    setFaultSuccess(false)
    setFaultError('')
    setFaultForm({
      ...EMPTY_FAULT_FORM,
      location: task.area || `${task.block} Kat ${task.floor}`,
      block: task.block || '',
      room_id: task.room_id || '',
      cleaning_task_id: task.id,
    })
    setActiveTab('quick_fault')
  }

  const navigateTo = (tabKey) => {
    if (tabKey === 'quick_fault' && taskBlock && !faultForm.block && !faultForm.cleaning_task_id) {
      setFaultForm(previous => ({ ...previous, block: taskBlock }))
    }
    setActiveTab(tabKey)
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
      <KioskHeader userName={selected?.full_name} onLogout={requestLogout}
        onRefresh={handleRefresh} refreshing={!!activeQuery?.isFetching}
        onBell={openFeed} unread={unread} />
      <NotificationFeed open={feedOpen} onClose={() => setFeedOpen(false)} items={notifications} avsApi={avsApi} />
      <div className="mb-4 flex justify-end"><LanguageSwitcher compact /></div>

      {!isOnline && (
        <div role="status" className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-200">
          <span className="text-xl">☁</span>
          <div>
            <div className="font-semibold">{t('avs_kiosk.offline')}</div>
            <div className="text-xs text-amber-300/70">{t('avs_kiosk.offline_hint')}</div>
          </div>
        </div>
      )}

      {hasSessionDrafts && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {taskDraftCount > 0 && (
            <button type="button" onClick={() => navigateTo('tasks')}
              className="min-h-12 rounded-xl border border-violet-500/40 bg-violet-950/40 px-3 text-left text-xs text-violet-200">
              <b>📷 {taskDraftCount}</b> {t('avs_kiosk.task_drafts')}
            </button>
          )}
          {faultHasDraft && (
            <button type="button" onClick={() => navigateTo('quick_fault')}
              className="min-h-12 rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 text-left text-xs text-amber-200">
              <b>🔧 1</b> {t('avs_kiosk.fault_draft')}
            </button>
          )}
        </div>
      )}

      {logoutConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div role="dialog" aria-modal="true" aria-labelledby="avs-logout-title"
            className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h2 id="avs-logout-title" className="text-lg font-semibold text-white">
              {t('avs_kiosk.logout_draft_title')}
            </h2>
            <p className="mt-2 text-sm text-slate-400">{t('avs_kiosk.logout_draft_hint')}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setLogoutConfirmOpen(false)}
                className="min-h-12 rounded-xl bg-slate-800 text-sm font-semibold text-slate-200">
                {t('common.cancel')}
              </button>
              <button type="button" onClick={handleLogout}
                className="min-h-12 rounded-xl bg-red-600 text-sm font-semibold text-white">
                {t('avs_kiosk.logout_anyway')}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'home' && (
        <HomeTab query={overviewQuery} data={overview} onNavigate={navigateTo}
          selectedBlock={taskBlock} onSelectBlock={setTaskBlock} />
      )}

      {activeTab === 'shifts' && <ShiftsTab query={shiftsQuery} data={shiftsData} />}

      {activeTab === 'transport' && <TransportTab query={transportQuery} data={transportData} />}

      {activeTab === 'tasks' && (
        <TasksTab
          query={tasksQuery} data={tasksData}
          completeTask={completeTask} skipTask={skipTask}
          photoDrafts={taskPhotoDrafts} setPhotoDrafts={setTaskPhotoDrafts}
          uploadProgress={taskUploadProgress}
          onReportFault={openFaultFromTask}
          selectedBlock={taskBlock} onSelectBlock={setTaskBlock}
          isOnline={isOnline}
        />
      )}

      {activeTab === 'announcements' && <AnnouncementsTab query={annQuery} announcements={announcements} />}

      {activeTab === 'quick_fault' && (
        <QuickFaultTab
          faultForm={faultForm} setFaultForm={setFaultForm}
          faultPhoto={faultPhoto} setFaultPhoto={setFaultPhoto}
          faultSuccess={faultSuccess} setFaultSuccess={setFaultSuccess}
          faultError={faultError} submitFault={submitFault} myFaults={myFaults}
          locationRooms={faultRoomsQuery.data?.items || []}
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
        tabs={[...TAB_KEYS]
          .sort((a, b) => {
            const orders = {
              housekeeping: ['home', 'tasks', 'quick_fault', 'shifts'],
              technical: ['home', 'tasks', 'quick_fault', 'inventory'],
              general: ['home', 'shifts', 'transport', 'announcements'],
              laundry: ['home', 'tasks', 'shifts', 'inventory'],
            }
            const order = orders[overview?.role_group] || orders.general
            const ai = order.indexOf(a.key)
            const bi = order.indexOf(b.key)
            if (ai === -1 && bi === -1) return 0
            if (ai === -1) return 1
            if (bi === -1) return -1
            return ai - bi
          })
          .filter(tb => tb.key !== 'inventory' || hasInventory)
          .map(tb => ({
            key: tb.key,
            icon: tb.icon,
            label: t(tb.i18n),
            badge: tb.key === 'tasks'
              ? Math.min(99, Number(overview?.tasks?.pending || 0))
              : tb.key === 'quick_fault' && faultHasDraft
                ? 1
                : 0,
          }))}
        active={activeTab} onChange={navigateTo} moreLabel={t('avs_kiosk.nav.more')} />
    </div>
  )
}
