import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import NotificationBell from './NotificationBell.jsx'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/checkin': 'Check-in',
  '/capacity': 'Kapasite',
  '/checkout': 'Check-out',
  '/housekeeping': 'Temizlik',
  '/maintenance': 'Teknik Servis',
  '/discipline': 'Disiplin',
  '/shifts': 'Vardiyalar',
  '/laundry/dashboard': 'Camasirhane — Dashboard',
  '/laundry/list': 'Camasirhane — Kayıtlar',
  '/laundry/report': 'Camasirhane — Rapor',
  '/laundry/settings': 'Camasirhane — Ayarlar',
  '/inventory': 'Envanter',
  '/room-history': 'Oda Geçmişi',
  '/whatsapp': 'WhatsApp',
  '/reports': 'Raporlar',
  '/users': 'Kullanicilar',
  '/audit': 'Audit Log',
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const pageTitle = PAGE_TITLES[location.pathname] || 'YYS'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile header */}
      <div className="mobile-header">
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>&#9776;</button>
        <span style={{
          fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '3px',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {pageTitle}
        </span>
        <NotificationBell />
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
