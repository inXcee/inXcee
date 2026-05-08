import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'

// Mobile breakpoint (<768px) icin bottom nav - en sik kullanilan 5 link
// Sidebar drawer hala calisir (hamburger ile), bu sadece hizli erisim.
// Roller filtrelenir, kullanici 5'ten az link gorebilir.

const QUICK_LINKS = [
  { to: '/', icon: '◣', label: 'Pano',     roles: ['campus_manager','shift_supervisor'] },
  { to: '/checkin', icon: '↗', label: 'Giris', roles: ['campus_manager','shift_supervisor'] },
  { to: '/housekeeping', icon: '◈', label: 'Temizlik', roles: ['campus_manager','housekeeper'] },
  { to: '/maintenance', icon: '⚙', label: 'Teknik', roles: ['campus_manager','shift_supervisor','technical'] },
  { to: '/laundry/dashboard', icon: '♨', label: 'Çamaşır', roles: ['campus_manager','laundry'] },
  { to: '/inventory', icon: '▦', label: 'Envanter', roles: ['campus_manager','shift_supervisor','laundry','housekeeper'] },
]

export default function MobileBottomNav() {
  const role = useAuthStore(s => s.user?.role)
  const links = QUICK_LINKS.filter(l => l.roles.includes(role)).slice(0, 5)

  if (links.length === 0) return null

  return (
    <nav className="mobile-bottom-nav" aria-label="Hızlı erişim">
      {links.map(l => (
        <NavLink key={l.to} to={l.to} end={l.to === '/'}
          className={({ isActive }) => `mbn-item${isActive ? ' active' : ''}`}>
          <span className="mbn-icon" aria-hidden="true">{l.icon}</span>
          <span className="mbn-label">{l.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
