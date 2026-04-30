import { Outlet, NavLink } from 'react-router-dom'

const TABS = [
  { to: '/settings/email',         label: 'Genel & E-Posta',  icon: '⎓' },
  { to: '/settings/users',         label: 'Kullanicilar',     icon: '⌂' },
  { to: '/settings/kiosk-pins',    label: 'Kiosk PIN',        icon: '⌖' },
  { to: '/settings/announcements', label: 'Duyurular',        icon: '📢' },
  { to: '/settings/avs-workers',   label: 'AVS Calisanlari',  icon: '👷' },
  { to: '/settings/audit',         label: 'Audit Log',        icon: '☷' },
  { to: '/settings/error-log',     label: 'Hata Loglari',     icon: '⚠' },
  { to: '/settings/backup',        label: 'Yedekleme',        icon: '⛁' },
  { to: '/settings/kvkk-admin',    label: 'KVKK',             icon: '§' },
  { to: '/settings/system',        label: 'Sistem Sagligi',   icon: '♥' },
]

export default function SettingsLayout() {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
      <aside style={{
        width: 230,
        padding: '24px 10px',
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)',
          letterSpacing: 2.5, padding: '0 10px', marginBottom: 10,
        }}>
          AYARLAR
        </div>
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            style={{ textDecoration: 'none', display: 'block' }}
          >
            {({ isActive }) => (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 7, marginBottom: 2,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: isActive ? 'rgba(240,165,0,0.1)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  color: isActive ? 'var(--text)' : 'var(--text2)',
                  fontFamily: 'var(--sans)', fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{t.icon}</span>
                <span>{t.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </aside>
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
