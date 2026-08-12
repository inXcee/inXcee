import { useState, useEffect, useCallback } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useMobileAuth } from '../auth/useMobileAuth.js'
import { useMobileSSE } from '../../../shared/hooks/useMobileSSE.js'
import { getQueue, getQueueSummary, updateQueueItem, getBlob, setOfflineContext, clearOfflineContext } from '../../../shared/utils/offlineDB.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { useMobilePrefs } from '../../../shared/store/mobilePrefsStore.js'
import PushBanner from './PushBanner.jsx'
import { unsubscribePush } from '../../../shared/utils/pushSubscribe.js'
import { RouteErrorBoundary } from '../../../shared/components/ErrorBoundary.jsx'

const MODULE_KEYS = {
  housekeeping: [['mobile-hk-tasks']],
  maintenance: [['mobile-tech-requests']],
  laundry: [['mobile-laundry-items'], ['mobile-laundry-machines']],
}

const topBtn = {
  width:40, height:40, display:'flex', alignItems:'center', justifyContent:'center',
  background:'none', border:'none', fontSize:20, cursor:'pointer', borderRadius:10,
}

export default function MobileLayout({ tabs }) {
  const { logout: rawLogout, token: mobileToken, user } = useMobileAuth()
  // Logout sirasinda push subscription'i da temizle (yeni cihaza login olunduktan
  // sonra eski cihaz bildirim almasin)
  const logout = useCallback(async () => {
    try { await unsubscribePush() } catch {}
    rawLogout()
  }, [rawLogout])
  // Otomatik çıkış yok — oturum yalnızca çıkış düğmesiyle kapanır.
  const { darkMode, toggleDarkMode } = useMobilePrefs()
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [queueStatuses, setQueueStatuses] = useState({})

  useEffect(() => {
    setOfflineContext({
      principal: user?.id ? { kind: 'staff', id: user.id, name: user.full_name || user.username || 'AVS personeli' } : null,
    })
    return () => clearOfflineContext()
  }, [user?.id, user?.full_name, user?.username])

  useEffect(() => {
    const refresh = () => getQueueSummary().then(summary => {
      setPendingCount(summary.total)
      setQueueStatuses(summary.statuses)
    }).catch(() => {})
    refresh()
    window.addEventListener('yys-queue-changed', refresh)
    return () => window.removeEventListener('yys-queue-changed', refresh)
  }, [])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    if (!isOnline) return

    async function replayItem(item, token) {
      const headers = { Authorization: `Bearer ${token}` }
      const ok = r => {
        if (r.ok) return
        const error = new Error(String(r.status))
        error.httpStatus = r.status
        throw error
      }
      if (item.type === 'complete_task') {
        ok(await fetch(`/api/housekeeping/tasks/${item.payload.taskId}/complete`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklist: item.payload.checklist ?? [], via_qr: item.payload.via_qr ?? false }),
        }))
      } else if (item.type === 'skip_task') {
        ok(await fetch(`/api/housekeeping/tasks/${item.payload.taskId}/skip`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: item.payload.reason }),
        }))
      } else if (item.type === 'fault_report') {
        const fd = new FormData()
        fd.append('location', item.payload.location)
        fd.append('description', item.payload.description)
        fd.append('priority', item.payload.priority)
        if (item.blobIds?.length > 0) {
          const blob = await getBlob(item.blobIds[0])
          if (blob) fd.append('photo', blob, 'photo.jpg')
        }
        ok(await fetch('/api/housekeeping/fault-report', { method: 'POST', headers, body: fd }))
      } else if (item.type === 'quick_fault') {
        ok(await fetch('/api/maintenance/requests', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        }))
      }
    }

    async function drain() {
      const queue = await getQueue()
      if (queue.length === 0) return
      const actionable = queue.filter(entry => ['pending', 'sending'].includes(entry.status || 'pending'))
      const initialCount = actionable.length
      let synced = 0
      const { token } = useMobileAuth.getState()
      for (const item of actionable) {
        try {
          await updateQueueItem(item.id, { status: 'sending', last_attempt_at: new Date().toISOString() })
          await replayItem(item, token)
          await updateQueueItem(item.id, { status: 'synced', error: null, server_result: { synced_at: new Date().toISOString() } })
          synced++
          if (item.type === 'complete_task' || item.type === 'skip_task') {
            qc.invalidateQueries({ queryKey: ['mobile-hk-tasks'] })
          }
          if (item.type === 'quick_fault') {
            qc.invalidateQueries({ queryKey: ['mobile-tech-requests'] })
          }
        } catch (error) {
          const retries = (item.retries || 0) + 1
          const httpStatus = Number(error?.httpStatus || error?.message)
          const status = httpStatus === 409
            ? 'conflict'
            : httpStatus >= 400 && httpStatus < 500
              ? 'rejected'
              : retries >= 3 ? 'manual_review' : 'pending'
          await updateQueueItem(item.id, {
            status,
            retries,
            error: Number.isFinite(httpStatus) ? `HTTP ${httpStatus}` : 'Ağ veya sunucu hatası',
            last_attempt_at: new Date().toISOString(),
          })
          if (['manual_review', 'conflict', 'rejected'].includes(status)) {
            addToast(`Çevrimdışı işlem korundu; ${status === 'conflict' ? 'çakışma' : status === 'rejected' ? 'sunucu reddi' : 'manuel inceleme'} gerekiyor (${item.type})`, 'error')
          }
        }
      }
      // Gercek sayiyi yeniden oku (retry'da kalan item'lar varsa 0 degil)
      const remaining = await getQueue()
      setPendingCount(remaining.length)
      setQueueStatuses((await getQueueSummary()).statuses)
      if (synced === initialCount && synced > 0) {
        addToast(`✓ ${synced} cevrimdisi islem senkronize edildi`, 'success')
      }
    }

    drain().catch(() => {})
  }, [isOnline])

  // Token silent refresh
  useEffect(() => {
    if (!mobileToken) return
    let timer
    try {
      const payload = JSON.parse(atob(mobileToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      const msUntilRefresh = payload.exp * 1000 - Date.now() - 60 * 60 * 1000
      if (msUntilRefresh <= 0) return
      // setTimeout gecikmesi 32-bit int'te tutulur: ~24.8 günü aşan değer taşar ve
      // zamanlayıcı ANINDA tetiklenir. Token ömrü 30 gün olduğu için bu, açılışta
      // sonsuz yenileme döngüsü demek olurdu. Uzaksa hiç kurma — uygulama tekrar
      // açıldığında bu effect yeniden değerlendirilir.
      if (msUntilRefresh > 2 ** 31 - 1) return
      timer = setTimeout(async () => {
        try {
          const r = await fetch('/api/mobile/auth/refresh', {
            method: 'POST',
            headers: { Authorization: `Bearer ${mobileToken}` },
          })
          if (r.ok) {
            const { token } = await r.json()
            useMobileAuth.getState().login(token, useMobileAuth.getState().user)
          } else {
            logout()
          }
        } catch {
          logout()
        }
      }, msUntilRefresh)
    } catch {}
    return () => clearTimeout(timer)
  }, [mobileToken, logout])

  // SSE: real-time query invalidation
  const handleSSEEvent = useCallback((event) => {
    const keys = MODULE_KEYS[event.module]
    if (keys) keys.forEach(key => qc.invalidateQueries({ queryKey: key }))
  }, [qc])

  useMobileSSE(handleSSEEvent)

  const offlineBanner = (!isOnline || pendingCount > 0) && (
    <div style={{ position:'fixed', top:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:'480px', background: isOnline ? '#b45309' : '#ef4444', color:'#fff', textAlign:'center', padding:'calc(8px + env(safe-area-inset-top)) 8px 8px', fontSize:'13px', fontWeight:600, zIndex:200 }}>
      {!isOnline ? 'Çevrimdışı — bağlantı bekleniyor' : 'Senkronizasyon takibi'}
      {pendingCount > 0 && ` · ${pendingCount} işlem (${(queueStatuses.manual_review || 0) + (queueStatuses.conflict || 0) + (queueStatuses.rejected || 0)} inceleme)`}
    </div>
  )

  return (
    <div className={darkMode ? 'mobile-dark' : ''} style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f9fafb', maxWidth:'480px', margin:'0 auto' }}>
      {offlineBanner}
      {/* Üst bar: koyu mod + çıkış buradan yönetilir. Alt nav yalnız rol
          sekmelerine ayrılır — 7 hücreye bölününce 360px'te dokunma alanı
          ~50px'e düşüyordu. Tüm mobil roller bu layout'u paylaşır. */}
      <header style={{
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
        background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'8px 12px',
        paddingTop: isOnline && pendingCount === 0 ? 'calc(8px + env(safe-area-inset-top))' : 'calc(44px + env(safe-area-inset-top))',
      }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#374151' }}>{user?.full_name || 'AVS Mobil'}</span>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={toggleDarkMode} aria-label={darkMode ? 'Açık mod' : 'Koyu mod'}
            style={topBtn}>{darkMode ? '☀️' : '🌙'}</button>
          <button onClick={logout} aria-label="Çıkış yap" style={topBtn}>🚪</button>
        </div>
      </header>
      <PushBanner />
      <main style={{ flex:1, overflowY:'auto', paddingBottom:'calc(72px + env(safe-area-inset-bottom))' }}>
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>
      <nav aria-label="Ana navigasyon" style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:'480px', display:'flex', background:'#fff', borderTop:'1px solid #e5e7eb', zIndex:100, paddingBottom:'env(safe-area-inset-bottom)' }}>
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} end aria-label={t.label}
            style={({ isActive }) => ({ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', color: isActive ? '#3b82f6' : '#9ca3af', textDecoration:'none', fontSize:'11px', fontWeight:600, gap:'4px' })}>
            <span aria-hidden="true" style={{ fontSize:'20px' }}>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
