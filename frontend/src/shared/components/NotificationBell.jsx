import { useState } from 'react'
import { useNotifications } from '../hooks/useNotifications.js'

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, soundEnabled, toggleSound, browserEnabled, toggleBrowser } = useNotifications()
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
        padding: '6px 8px', fontSize: '16px', color: 'var(--text2)',
      }}>
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '-2px', right: '-2px',
            background: 'var(--red)', color: '#fff', fontSize: '9px', fontWeight: 700,
            borderRadius: '50%', width: '18px', height: '18px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--mono)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="notif-dropdown" style={{
          position: 'absolute', right: 0, top: '100%', width: '340px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '10px', boxShadow: '0 12px 36px rgba(0,0,0,.4)',
          zIndex: 999, maxHeight: '480px', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px', color: 'var(--text)' }}>BİLDİRİMLER</div>
              {unreadCount > 0 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{unreadCount} okunmamis</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={toggleSound} title={soundEnabled ? 'Ses açık' : 'Ses kapalı'} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px',
                opacity: soundEnabled ? 1 : 0.3,
              }}>{soundEnabled ? '🔊' : '🔇'}</button>
              <button onClick={toggleBrowser} title={browserEnabled ? 'Bildirim açık' : 'Bildirim kapalı'} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px',
                opacity: browserEnabled ? 1 : 0.3,
              }}>{browserEnabled ? '🔔' : '🔕'}</button>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
                  cursor: 'pointer', padding: '2px 8px',
                  fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '0.5px',
                }}>TUMUNU OKU</button>
              )}
              <a href="/notifications" title="Tüm bildirimler" style={{
                border: '1px solid var(--border)', borderRadius: '4px',
                padding: '2px 8px', textDecoration: 'none',
                fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--accent)', letterSpacing: '0.5px',
              }}>HEPSİ</a>
              <a href="/notifications/preferences" title="Tercihler" style={{
                border: '1px solid var(--border)', borderRadius: '4px',
                padding: '2px 8px', textDecoration: 'none',
                fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '0.5px',
              }}>⚙</a>
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text4)' }}>
                Bildirim yok
              </div>
            ) : notifications.map(n => (
              <div key={n.id} onClick={() => !n.is_read && markRead(n.id)} style={{
                padding: '10px 16px', borderBottom: '1px solid rgba(35,45,63,.3)',
                cursor: n.is_read ? 'default' : 'pointer',
                background: n.is_read ? 'transparent' : 'rgba(99,102,241,.04)',
                transition: 'background .15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px' }}>
                    {n.type === 'critical' ? '🚨' : n.type === 'warning' ? '⚠' : 'ℹ'}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '8px', letterSpacing: '1px',
                    color: n.type === 'critical' ? 'var(--red)' : n.type === 'warning' ? 'var(--amber)' : 'var(--blue)',
                  }}>
                    {(n.module || '').toUpperCase()}
                  </span>
                  {!n.is_read && (
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', marginLeft: 'auto' }} />
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', marginTop: '4px' }}>
                  {new Date(n.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
