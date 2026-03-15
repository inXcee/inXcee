import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import NotificationBell from './NotificationBell.jsx'
import { useAuthStore } from '../store/authStore.js'

export default function Layout() {
  const user = useAuthStore(s => s.user)
  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-end px-4 gap-2">
          <span className="text-xs text-slate-500">{user?.role}</span>
          <NotificationBell />
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
