import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useMobileAuth } from '../auth/useMobileAuth.js'

export default function MobileLayout({ tabs }) {
  const { logout } = useMobileAuth()
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

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

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f9fafb', maxWidth:'480px', margin:'0 auto' }}>
      {!isOnline && (
        <div style={{ position:'fixed', top:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:'480px', background:'#ef4444', color:'#fff', textAlign:'center', padding:'8px', fontSize:'13px', fontWeight:600, zIndex:200 }}>
          Çevrimdışı — Bağlantı bekleniyor...
        </div>
      )}
      <main style={{ flex:1, overflowY:'auto', paddingBottom:'calc(72px + env(safe-area-inset-bottom))', paddingTop: isOnline ? 0 : '36px' }}>
        <Outlet />
      </main>
      <nav style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:'480px', display:'flex', background:'#fff', borderTop:'1px solid #e5e7eb', zIndex:100, paddingBottom:'env(safe-area-inset-bottom)' }}>
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} end
            style={({ isActive }) => ({ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', color: isActive ? '#3b82f6' : '#9ca3af', textDecoration:'none', fontSize:'11px', fontWeight:600, gap:'4px' })}>
            <span style={{ fontSize:'20px' }}>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
        <button onClick={logout} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', background:'none', border:'none', color:'#9ca3af', fontSize:'11px', fontWeight:600, gap:'4px', cursor:'pointer' }}>
          <span style={{ fontSize:'20px' }}>🚪</span>Çıkış
        </button>
      </nav>
    </div>
  )
}
