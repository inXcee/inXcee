import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore } from '../../shared/store/authStore.js'

const MGMT = ['campus_manager', 'shift_supervisor']
const ADMIN = ['campus_manager']
const TECH = ['campus_manager', 'shift_supervisor', 'technical']

const TAB_GROUPS = [
  {
    label: 'OPERASYON',
    tabs: [
      { to: '/settings/personnel',          label: 'Personel',           icon: '👤', roles: MGMT },
      { to: '/settings/risk',               label: 'Risk Listesi',       icon: '⚠',  roles: MGMT },
      { to: '/settings/hr',                 label: 'İK Akışları',        icon: '📋', roles: MGMT },
      { to: '/settings/safety',             label: 'İş Güvenliği',       icon: '🦺', roles: TECH },
      { to: '/settings/discipline',         label: 'Disiplin',           icon: '⚠',  roles: MGMT },
      { to: '/settings/performance',        label: 'Performans',         icon: '⭐', roles: MGMT },
      { to: '/settings/meals',              label: 'Yemekhane',          icon: '🍽', roles: MGMT },
      { to: '/settings/comms',              label: 'İletişim',           icon: '📨', roles: MGMT },
      { to: '/settings/payroll',            label: 'Bordro Özet',        icon: '💰', roles: MGMT },
      { to: '/settings/combined-absences',  label: 'Devamsızlık',        icon: '✗',  roles: MGMT },
      { to: '/settings/holidays',           label: 'Resmi Tatiller',     icon: '🎉', roles: MGMT },
      { to: '/settings/archived-personnel', label: 'Arşiv',              icon: '🗄', roles: MGMT },
    ],
  },
  {
    label: 'YÖNETİM',
    tabs: [
      { to: '/settings/companies',           label: 'Firmalar',           icon: '⌂',  roles: ADMIN },
      { to: '/settings/visitors',            label: 'Ziyaretçiler',       icon: '👥', roles: ADMIN },
      { to: '/settings/surveys',             label: 'Memnuniyet',         icon: '★',  roles: ADMIN },
      { to: '/settings/feedback',            label: 'Geri Bildirim',      icon: '💬', roles: MGMT },
      { to: '/settings/drills',              label: 'Tatbikatlar',        icon: '🔥', roles: ADMIN },
      { to: '/settings/documents',           label: 'Belgeler',           icon: '📄', roles: ADMIN },
      { to: '/settings/expenses',            label: 'Bütçe',              icon: '₺',  roles: ADMIN },
      { to: '/settings/notification-groups', label: 'Bildirim Grupları',  icon: '👥', roles: ADMIN },
      { to: '/settings/automation',          label: 'Otomasyon',          icon: '⚙',  roles: ADMIN },
    ],
  },
  {
    label: 'SİSTEM',
    tabs: [
      { to: '/settings/email',         label: 'Genel & E-Posta',  icon: '⎓',  roles: ADMIN },
      { to: '/settings/users',         label: 'Kullanicilar',     icon: '⌂',  roles: ADMIN },
      { to: '/settings/kiosk-pins',    label: 'Kiosk PIN',        icon: '⌖',  roles: ADMIN },
      { to: '/settings/announcements', label: 'Duyurular',        icon: '📢', roles: ADMIN },
      { to: '/settings/avs-workers',   label: 'AVS Calisanlari',  icon: '👷', roles: ADMIN },
      { to: '/settings/audit',         label: 'Audit Log',        icon: '☷',  roles: ADMIN },
      { to: '/settings/error-log',     label: 'Hata Loglari',     icon: '⚠',  roles: ADMIN },
      { to: '/settings/backup',        label: 'Yedekleme',        icon: '⛁',  roles: ADMIN },
      { to: '/settings/kvkk-admin',    label: 'KVKK',             icon: '§',  roles: ADMIN },
      { to: '/settings/system',        label: 'Sistem Sagligi',   icon: '♥',  roles: ADMIN },
    ],
  },
]

export default function SettingsLayout() {
  const role = useAuthStore(s => s.user?.role)
  const visibleGroups = TAB_GROUPS
    .map(g => ({ ...g, tabs: g.tabs.filter(t => !role || t.roles.includes(role)) }))
    .filter(g => g.tabs.length > 0)
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
      <aside style={{
        width: 230,
        padding: '24px 10px',
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        overflowY: 'auto',
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)',
          letterSpacing: 2.5, padding: '0 10px', marginBottom: 10,
        }}>
          AYARLAR
        </div>
        {visibleGroups.map((grp, gi) => (
          <div key={grp.label} style={{ marginBottom: 16 }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)',
              letterSpacing: 2, padding: '0 10px', marginBottom: 6,
              marginTop: gi === 0 ? 0 : 4,
            }}>
              {grp.label}
            </div>
            {grp.tabs.map(t => (
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
          </div>
        ))}
      </aside>
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
