import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore.js'
import { useNotifications } from '../hooks/useNotifications.js'
import { useTheme } from '../hooks/useTheme.js'
import { useToastStore } from '../store/toastStore.js'
import api from '../api/client.js'
import ChangePasswordModal from './ChangePasswordModal.jsx'

const NAV_GROUPS = [
  {
    label: 'GENEL BAKIS',
    links: [
      { to: '/', icon: '\u25A3', label: 'Dashboard', roles: ['campus_manager','shift_supervisor'] },
      { to: '/campus-map', icon: '\u29C9', label: 'Kampus Haritasi', roles: ['campus_manager','shift_supervisor'] },
    ]
  },
  {
    label: 'KAPASITE',
    links: [
      { to: '/checkin', icon: '\u2197', label: 'Check-in', roles: ['campus_manager','shift_supervisor'] },
      { to: '/capacity', icon: '\u229E', label: 'Kapasiteler', roles: ['campus_manager','shift_supervisor'] },
      { to: '/checkout', icon: '\u2199', label: 'Check-out', roles: ['campus_manager','shift_supervisor'] },
      { to: '/bulk-actions', icon: '\u2630', label: 'Toplu Islem', roles: ['campus_manager','shift_supervisor'] },
    ]
  },
  {
    label: 'OPERASYON',
    links: [
      { to: '/housekeeping', icon: '\u25C8', label: 'Housekeeping', roles: ['campus_manager','housekeeper'] },
      { to: '/maintenance', icon: '\u2699', label: 'Teknik Servis', roles: ['campus_manager','shift_supervisor','technical'], badge: true },
      { to: '/discipline', icon: '\u26A0', label: 'Disiplin', roles: ['campus_manager','shift_supervisor'] },
      { to: '/shifts', icon: '\u29D7', label: 'Vardiyalar', roles: ['campus_manager','shift_supervisor'] },
      { to: '/transport', icon: '\uD83D\uDE8C', label: 'Servisler', roles: ['campus_manager','shift_supervisor'] },
      { to: '/laundry', icon: '\u2668', label: 'Camasirhane', roles: ['campus_manager','laundry'] },
      { to: '/risk', icon: '\u26A0', label: 'Risk Listesi', roles: ['campus_manager','shift_supervisor'] },
      { to: '/hr', icon: '\uD83D\uDCCB', label: 'IK Akislari', roles: ['campus_manager','shift_supervisor'] },
      { to: '/archived-personnel', icon: '\uD83D\uDDC4', label: 'Arsiv', roles: ['campus_manager','shift_supervisor'] },
    ]
  },
  {
    label: 'YONETIM',
    links: [
      { to: '/inventory', icon: '\u25a8', label: 'Envanter', roles: ['campus_manager','shift_supervisor','laundry','housekeeper'] },
      { to: '/laundry-kiosk', icon: '🧺', label: 'Camasir Kiosk', roles: ['campus_manager'], external: true },
      { to: '/settings', icon: '\u2393', label: 'Ayarlar', roles: ['campus_manager'] },
    ]
  },
  {
    label: 'RAPORLAR',
    links: [
      { to: '/reports', icon: '\u2193', label: 'PDF Raporlar', roles: ['campus_manager','shift_supervisor'] },
      { to: '/room-history', icon: '\u29D6', label: 'Oda Gecmisi', roles: ['campus_manager','shift_supervisor','housekeeper','technical'] },
      { to: '/whatsapp', icon: '\u260E', label: 'WhatsApp', roles: ['campus_manager','shift_supervisor','technical'] },
    ]
  },
  {
    label: 'BILDIRIM',
    links: [
      { to: '/notifications', icon: '\uD83D\uDD14', label: 'Bildirim Merkezi', roles: ['campus_manager','shift_supervisor','laundry','housekeeper','technical'], notifBadge: true },
      { to: '/notifications/preferences', icon: '\u2699', label: 'Tercihler', roles: ['campus_manager','shift_supervisor','laundry','housekeeper','technical'] },
    ]
  },
]

function LiveClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text)', letterSpacing: '1px' }}>
      {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

export default function Sidebar({ mobileOpen, onClose }) {
  const user = useAuthStore(s => s.user)
  const location = useLocation()
  const logout = useAuthStore(s => s.logout)
  const { unreadCount } = useNotifications()
  const { theme, toggle: toggleTheme } = useTheme()
  const addToast = useToastStore(s => s.addToast)
  const [showChangePw, setShowChangePw] = useState(false)

  const { data: kpi } = useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: () => api.get('/dashboard/kpi').then(r => r.data),
    staleTime: 30000,
    refetchInterval: 30000,
  })

  const today = new Date()
  const dateStr = today.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <>
    {showChangePw && (
      <ChangePasswordModal onClose={result => {
        setShowChangePw(false)
        if (result === 'success') addToast('Sifre basariyla degistirildi', 'success')
      }} />
    )}
    {mobileOpen && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 99 }} />}
    <nav className={mobileOpen ? 'sidebar-container mobile-open' : 'sidebar-container'} style={{
      width: '240px',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0, left: 0,
      height: '100vh',
      zIndex: 100,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{
            width: '40px', height: '40px',
            background: 'linear-gradient(135deg, var(--accent), var(--accent3))',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--display)', fontSize: '14px', color: '#000',
            letterSpacing: '1px', flexShrink: 0,
          }}>
            SKY
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '20px', letterSpacing: '3px', color: 'var(--text)', lineHeight: 1 }}>
              SANTIYE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '9px', color: '#000',
                background: 'var(--accent)', padding: '1px 6px', borderRadius: '3px', letterSpacing: '1px',
              }}>v3.0</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>YYS</span>
            </div>
          </div>
        </div>

        {/* Live strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--surface2)', borderRadius: '6px', padding: '7px 10px',
          border: '1px solid var(--border)',
        }}>
          <div className="live-dot" />
          <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>CANLI</span>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <LiveClock />
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        {NAV_GROUPS.map(group => {
          const visible = group.links.filter(l => !user?.role || l.roles.includes(user.role))
          if (visible.length === 0) return null
          return (
            <div key={group.label} style={{ marginBottom: '18px' }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: '8.5px', color: 'var(--text4)',
                letterSpacing: '2.5px', padding: '0 10px', marginBottom: '6px',
              }}>
                {group.label}
              </div>
              {visible.map(link => {
                const parentActive = location.pathname === link.to ||
                  (link.sublinks && link.sublinks.some(s => location.pathname === s.to))
                return (
                  <div key={link.to}>
                    {link.external ? (
                      <a href={link.to} target="_blank" rel="noopener noreferrer" onClick={onClose} style={{ textDecoration: 'none', display: 'block' }}>
                        <div className="sidebar-nav-item" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '7px', marginBottom: '2px', cursor: 'pointer', transition: 'all 0.15s', borderLeft: '2px solid transparent', color: 'var(--text2)' }}>
                          <span style={{ fontSize: '14px', width: '18px', textAlign: 'center', flexShrink: 0 }}>{link.icon}</span>
                          <span style={{ fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: 400, flex: 1 }}>{link.label}</span>
                          <span style={{ fontSize: '9px', color: 'var(--text4)' }}>↗</span>
                        </div>
                      </a>
                    ) : (
                    <NavLink to={link.sublinks ? link.sublinks[0].to : link.to} end={link.to === '/'} onClick={onClose} style={{ textDecoration: 'none', display: 'block' }}>
                      {({ isActive: navActive }) => {
                        const active = link.sublinks ? parentActive : navActive
                        return (
                          <div
                            className={`sidebar-nav-item ${active ? 'active' : ''}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '9px 10px', borderRadius: '7px', marginBottom: '2px',
                              cursor: 'pointer', position: 'relative', transition: 'all 0.15s',
                              background: active ? 'rgba(240,165,0,0.1)' : 'transparent',
                              borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                              color: active ? 'var(--text)' : 'var(--text2)',
                            }}
                          >
                            <span style={{ fontSize: '14px', width: '18px', textAlign: 'center', flexShrink: 0 }}>{link.icon}</span>
                            <span style={{ fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: active ? 600 : 400, flex: 1 }}>
                              {link.label}
                            </span>
                            {link.badge && kpi?.open_maintenance > 0 && (
                              <span style={{
                                fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                                background: 'var(--red)', color: '#fff',
                                padding: '1px 6px', borderRadius: '10px', minWidth: '18px', textAlign: 'center',
                              }}>
                                {kpi.open_maintenance}
                              </span>
                            )}
                            {link.notifBadge && unreadCount > 0 && (
                              <span style={{
                                fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                                background: 'var(--red)', color: '#fff',
                                padding: '1px 6px', borderRadius: '10px', minWidth: '18px', textAlign: 'center',
                              }}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            )}
                            {link.sublinks && (
                              <span style={{ fontSize: '9px', color: 'var(--text3)', marginLeft: 2 }}>
                                {parentActive ? '▾' : '›'}
                              </span>
                            )}
                          </div>
                        )
                      }}
                    </NavLink>
                    )}
                    {/* Sub-links — show when parent is active */}
                    {link.sublinks && parentActive && (
                      <div style={{ marginLeft: 28, marginBottom: 4 }}>
                        {link.sublinks.map(sub => (
                          <NavLink key={sub.to} to={sub.to} end={sub.exact || false} onClick={onClose}
                            style={{ textDecoration: 'none', display: 'block' }}>
                            {({ isActive }) => (
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 10px', borderRadius: 6, marginBottom: 1,
                                cursor: 'pointer', transition: 'all 0.15s',
                                background: isActive ? 'rgba(240,165,0,0.08)' : 'transparent',
                                color: isActive ? 'var(--accent)' : 'var(--text3)',
                                borderLeft: isActive ? '1px solid rgba(240,165,0,0.4)' : '1px solid var(--border)',
                              }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--text2)' }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--text3)' }}
                              >
                                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                                <span style={{ fontFamily: 'var(--sans)', fontSize: '12px', fontWeight: isActive ? 600 : 400 }}>
                                  {sub.label}
                                </span>
                              </div>
                            )}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          <div style={{
            background: 'var(--surface2)', borderRadius: '6px', padding: '8px 10px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '4px' }}>BOS YATAK</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '20px', color: 'var(--green)', letterSpacing: '1px' }}>
              {kpi ? (kpi.total_beds - kpi.occupied) : '\u2014'}
            </div>
          </div>
          <div style={{
            background: 'var(--surface2)', borderRadius: '6px', padding: '8px 10px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '4px' }}>AKTIF ARIZA</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '20px', color: kpi?.open_maintenance > 0 ? 'var(--red)' : 'var(--text2)', letterSpacing: '1px' }}>
              {kpi?.open_maintenance ?? '\u2014'}
            </div>
          </div>
        </div>

        {/* Date + user + theme + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginBottom: '2px' }}>{dateStr}</div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--text2)', fontWeight: 500 }}>{user?.username}</div>
          </div>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Acik tema' : 'Koyu tema'}
            style={{
              background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text3)', padding: '6px 8px', cursor: 'pointer', fontSize: '13px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'rgba(240,165,0,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            {theme === 'dark' ? '\u2600' : '\u263E'}
          </button>
          <button
            onClick={() => setShowChangePw(true)}
            title="Sifre degistir"
            style={{
              background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text3)', padding: '6px 8px', cursor: 'pointer', fontSize: '13px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'rgba(240,165,0,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            &#128273;
          </button>
          <button
            onClick={logout}
            title="Cikis"
            style={{
              background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text3)', padding: '6px 8px', cursor: 'pointer', fontSize: '13px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'rgba(231,76,60,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            \u23FB
          </button>
        </div>
      </div>
    </nav>
    </>
  )
}
