import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore.js'
import { useNotifications } from '../hooks/useNotifications.js'
import api from '../api/client.js'

const NAV_GROUPS = [
  {
    label: 'GENEL BAKIS',
    links: [
      { to: '/', icon: '\u25A3', label: 'Dashboard', roles: ['campus_manager','shift_supervisor'] },
    ]
  },
  {
    label: 'KAPASITE',
    links: [
      { to: '/checkin', icon: '\u2197', label: 'Check-in', roles: ['campus_manager','shift_supervisor'] },
      { to: '/capacity', icon: '\u229E', label: 'Kapasiteler', roles: ['campus_manager','shift_supervisor'] },
    ]
  },
  {
    label: 'OPERASYON',
    links: [
      { to: '/housekeeping', icon: '\u25C8', label: 'Housekeeping', roles: ['campus_manager','housekeeper'] },
      { to: '/maintenance', icon: '\u2699', label: 'Teknik Servis', roles: ['campus_manager','shift_supervisor','technical'], badge: true },
      { to: '/discipline', icon: '\u26A0', label: 'Disiplin', roles: ['campus_manager','shift_supervisor'] },
      { to: '/shifts', icon: '\u29D7', label: 'Vardiyalar', roles: ['campus_manager','shift_supervisor'] },
    ]
  },
  {
    label: 'RAPORLAR',
    links: [
      { to: '/room-history', icon: '\u29D6', label: 'Oda Gecmisi', roles: ['campus_manager','shift_supervisor','housekeeper','technical'] },
      { to: '/whatsapp', icon: '\u260E', label: 'WhatsApp', roles: ['campus_manager','shift_supervisor','technical'] },
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
  const logout = useAuthStore(s => s.logout)
  const { unreadCount } = useNotifications()

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
              {visible.map(link => (
                <NavLink key={link.to} to={link.to} end={link.to === '/'} onClick={onClose} style={{ textDecoration: 'none', display: 'block' }}>
                  {({ isActive }) => (
                    <div
                      className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 10px', borderRadius: '7px', marginBottom: '2px',
                        cursor: 'pointer', position: 'relative', transition: 'all 0.15s',
                        background: isActive ? 'rgba(240,165,0,0.1)' : 'transparent',
                        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                        color: isActive ? 'var(--text)' : 'var(--text2)',
                      }}
                    >
                      <span style={{ fontSize: '14px', width: '18px', textAlign: 'center', flexShrink: 0 }}>{link.icon}</span>
                      <span style={{ fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: isActive ? 600 : 400, flex: 1 }}>
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
                    </div>
                  )}
                </NavLink>
              ))}
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

        {/* Date + user + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginBottom: '2px' }}>{dateStr}</div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--text2)', fontWeight: 500 }}>{user?.username}</div>
          </div>
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
