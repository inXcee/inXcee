import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'

const LINKS = [
  { to: '/', label: '🏠 Kokpit', roles: ['campus_manager','shift_supervisor'] },
  { to: '/checkin', label: '🚪 Check-in', roles: ['campus_manager','shift_supervisor'] },
  { to: '/capacity', label: '🛏 Kapasiteler', roles: ['campus_manager','shift_supervisor'] },
  { to: '/laundry', label: '🧺 Çamaşırhane', roles: ['campus_manager','laundry'] },
  { to: '/housekeeping', label: '🧹 Housekeeping', roles: ['campus_manager','housekeeper'] },
  { to: '/maintenance', label: '🔧 Teknik Servis', roles: ['campus_manager','shift_supervisor','technical'] },
  { to: '/discipline', label: '⚠️ Disiplin', roles: ['campus_manager','shift_supervisor'] },
  { to: '/shifts', label: '📅 Vardiya', roles: ['campus_manager','shift_supervisor'] },
]

export default function Sidebar({ onClose }) {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const visibleLinks = LINKS.filter(l => l.roles.includes(user?.role))

  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col min-h-screen">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-blue-400">YYS</div>
          <div className="text-xs text-slate-500">Yatakhane Yönetim</div>
        </div>
        {/* Close button — mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden text-slate-400 hover:text-slate-200 p-1"
            aria-label="Menüyü kapat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {visibleLinks.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `block px-3 py-2.5 rounded text-sm transition-colors ${isActive ? 'bg-blue-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-800">
        <div className="text-xs text-slate-400 truncate">{user?.full_name}</div>
        <button onClick={logout} className="text-xs text-red-400 hover:text-red-300 mt-1">Çıkış</button>
      </div>
    </aside>
  )
}
