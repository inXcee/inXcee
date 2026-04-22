import { NavLink, Outlet } from 'react-router-dom'
import { useMobileAuth } from '../auth/useMobileAuth.js'

export default function MobileLayout({ tabs }) {
  const { logout } = useMobileAuth()
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f9fafb', maxWidth:'480px', margin:'0 auto' }}>
      <main style={{ flex:1, overflowY:'auto', paddingBottom:'72px' }}>
        <Outlet />
      </main>
      <nav style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:'480px', display:'flex', background:'#fff', borderTop:'1px solid #e5e7eb', zIndex:100 }}>
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
