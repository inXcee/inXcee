import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import NotificationBell from './NotificationBell.jsx'
import { useAuthStore } from '../store/authStore.js'

export default function Layout() {
  const user = useAuthStore(s => s.user)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <div className={`fixed md:static inset-y-0 left-0 z-40 transition-transform duration-200 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-2">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden text-slate-400 hover:text-slate-200 mr-2"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menüyü aç"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-xs font-bold text-blue-400 md:hidden">YYS</span>
          <div className="flex-1" />
          <span className="text-xs text-slate-500">{user?.role}</span>
          <NotificationBell />
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
