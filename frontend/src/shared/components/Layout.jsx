import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile header */}
      <div className="mobile-header">
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>&#9776;</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '3px' }}>YYS</span>
      </div>

      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main-content" style={{
        flex: 1,
        marginLeft: 'var(--sidebar)',
        padding: '32px 40px',
        minHeight: '100vh',
        overflowY: 'auto',
      }}>
        <Outlet />
      </main>
    </div>
  )
}
