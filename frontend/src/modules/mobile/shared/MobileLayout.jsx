import { useState, useEffect, useCallback } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useMobileAuth } from '../auth/useMobileAuth.js'
import { useMobileSSE } from '../../../shared/hooks/useMobileSSE.js'
import { getQueue, dequeue, updateRetries, getBlob } from '../../../shared/utils/offlineDB.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { useMobilePrefs } from '../../../shared/store/mobilePrefsStore.js'

const MODULE_KEYS = {
  housekeeping: [['mobile-hk-tasks']],
  maintenance: [['mobile-tech-requests']],
}

export default function MobileLayout({ tabs }) {
  const { logout } = useMobileAuth()
  const { darkMode, toggleDarkMode } = useMobilePrefs()
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    getQueue().then(q => setPendingCount(q.length)).catch(() => {})
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
      const ok = r => { if (!r.ok) throw new Error(r.status) }
      if (item.type === 'complete_task') {
        ok(await fetch(`/api/housekeeping/tasks/${item.payload.taskId}/complete`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklist: item.payload.checklist ?? [] }),
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
      const { token } = useMobileAuth.getState()
      for (const item of queue) {
        try {
          await replayItem(item, token)
          await dequeue(item.id)
          if (item.type === 'complete_task' || item.type === 'skip_task') {
            qc.invalidateQueries({ queryKey: ['mobile-hk-tasks'] })
          }
          if (item.type === 'quick_fault') {
            qc.invalidateQueries({ queryKey: ['mobile-tech-requests'] })
          }
        } catch {
          if (item.retries >= 2) {
            addToast(`Çevrimdışı işlem gönderilemedi — silindi (${item.type})`, 'error')
            await dequeue(item.id)
          } else {
            await updateRetries(item.id, item.retries + 1)
          }
        }
      }
      setPendingCount(0)
    }

    drain().catch(() => {})
  }, [isOnline])

  // Token auto-refresh
  useEffect(() => {
    async function tryRefresh() {
      const { token, login } = useMobileAuth.getState()
      if (!token) return
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        const msLeft = payload.exp * 1000 - Date.now()
        if (msLeft > 0 && msLeft < 60 * 60 * 1000) {
          const res = await fetch('/api/mobile/auth/refresh', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) {
            const data = await res.json()
            login(data.token, data.user)
          }
        }
      } catch {}
    }
    tryRefresh()
    const id = setInterval(tryRefresh, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // SSE: real-time query invalidation
  const handleSSEEvent = useCallback((event) => {
    const keys = MODULE_KEYS[event.module]
    if (keys) keys.forEach(key => qc.invalidateQueries({ queryKey: key }))
  }, [qc])

  useMobileSSE(handleSSEEvent)

  const offlineBanner = !isOnline && (
    <div style={{ position:'fixed', top:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:'480px', background:'#ef4444', color:'#fff', textAlign:'center', padding:'8px', fontSize:'13px', fontWeight:600, zIndex:200 }}>
      Çevrimdışı — Bağlantı bekleniyor...
      {pendingCount > 0 && ` (${pendingCount} işlem bekliyor)`}
    </div>
  )

  return (
    <div className={darkMode ? 'mobile-dark' : ''} style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f9fafb', maxWidth:'480px', margin:'0 auto' }}>
      {offlineBanner}
      <main style={{ flex:1, overflowY:'auto', paddingBottom:'calc(72px + env(safe-area-inset-bottom))', paddingTop: isOnline ? 0 : '36px' }}>
        <Outlet />
      </main>
      <nav aria-label="Ana navigasyon" style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:'480px', display:'flex', background:'#fff', borderTop:'1px solid #e5e7eb', zIndex:100, paddingBottom:'env(safe-area-inset-bottom)' }}>
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} end aria-label={t.label}
            style={({ isActive }) => ({ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', color: isActive ? '#3b82f6' : '#9ca3af', textDecoration:'none', fontSize:'11px', fontWeight:600, gap:'4px' })}>
            <span aria-hidden="true" style={{ fontSize:'20px' }}>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
        <button onClick={toggleDarkMode} aria-label={darkMode ? 'Açık mod' : 'Koyu mod'}
          style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', background:'none', border:'none', color:'#9ca3af', fontSize:'11px', fontWeight:600, gap:'4px', cursor:'pointer' }}>
          <span aria-hidden="true" style={{ fontSize:'20px' }}>{darkMode ? '☀️' : '🌙'}</span>
          {darkMode ? 'Açık' : 'Koyu'}
        </button>
        <button onClick={logout} aria-label="Çıkış yap"
          style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', background:'none', border:'none', color:'#9ca3af', fontSize:'11px', fontWeight:600, gap:'4px', cursor:'pointer' }}>
          <span aria-hidden="true" style={{ fontSize:'20px' }}>🚪</span>Çıkış
        </button>
      </nav>
    </div>
  )
}
