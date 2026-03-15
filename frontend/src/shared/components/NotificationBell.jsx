import { useState } from 'react'
import { useNotifications } from '../hooks/useNotifications.js'

export default function NotificationBell() {
  const { notifications, unreadCount, markRead } = useNotifications()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="relative p-2 text-slate-400 hover:text-white">
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          <div className="p-3 border-b border-slate-700 text-sm font-medium">Bildirimler</div>
          {notifications.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Bildirim yok</div>
          ) : notifications.map(n => (
            <div
              key={n.id}
              onClick={() => !n.is_read && markRead(n.id)}
              className={`p-3 border-b border-slate-700 cursor-pointer hover:bg-slate-700 ${!n.is_read ? 'bg-slate-750' : ''}`}
            >
              <div className={`text-xs font-medium mb-1 ${n.type === 'critical' ? 'text-red-400' : n.type === 'warning' ? 'text-yellow-400' : 'text-blue-400'}`}>
                {n.type === 'critical' ? '🚨' : n.type === 'warning' ? '⚠️' : 'ℹ️'} {n.module?.toUpperCase()}
              </div>
              <div className="text-sm text-slate-300">{n.message}</div>
              <div className="text-xs text-slate-500 mt-1">{new Date(n.created_at).toLocaleString('tr-TR')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
