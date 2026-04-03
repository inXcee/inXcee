import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { useAuthStore } from '../../../shared/store/authStore.js'

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000)
  if (diff < 60) return 'şimdi'
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

export default function LaundryChat() {
  const currentUser = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const listRef = useRef(null)
  const lastSeenRef = useRef(
    () => parseInt(localStorage.getItem('laundry_last_seen_msg') || '0')
  )

  const { data: messages = [] } = useQuery({
    queryKey: ['laundry-messages'],
    queryFn: laundryApi.getMessages,
    refetchInterval: open ? 10_000 : 30_000,
  })

  const pinnedMessages = messages.filter(m => m.is_pinned)
  const unreadCount = messages.filter(m => m.id > (lastSeenRef.current() || 0)).length

  useEffect(() => {
    if (open && messages.length > 0) {
      const maxId = Math.max(...messages.map(m => m.id))
      localStorage.setItem('laundry_last_seen_msg', String(maxId))
      lastSeenRef.current = () => maxId
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight
      }
    }
  }, [open, messages])

  const send = useMutation({
    mutationFn: () => laundryApi.sendMessage({
      message: input.trim(),
      message_type: isUrgent ? 'urgent' : 'normal',
    }),
    onSuccess: () => {
      setInput('')
      setIsUrgent(false)
      qc.invalidateQueries({ queryKey: ['laundry-messages'] })
    },
  })

  const del = useMutation({
    mutationFn: (id) => laundryApi.deleteMessage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-messages'] }),
  })

  const pin = useMutation({
    mutationFn: ({ id, is_pinned }) => laundryApi.pinMessage(id, is_pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-messages'] }),
  })

  const handleSend = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    send.mutate()
  }

  const canDelete = (msg) =>
    currentUser && (msg.sender_id === currentUser.id || currentUser.role === 'campus_manager')
  const canPin = (msg) =>
    currentUser && (currentUser.role === 'campus_manager' || currentUser.role === 'laundry')

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          height: 40, padding: '0 14px',
          background: 'linear-gradient(90deg,rgba(59,130,246,0.08),rgba(37,99,235,0.05))',
          border: '1px solid rgba(59,130,246,0.18)',
          borderLeft: '3px solid rgba(59,130,246,0.6)',
          borderRadius: open ? '8px 8px 0 0' : 8,
          cursor: 'pointer', transition: 'border-radius 0.15s',
        }}
      >
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: 'rgba(59,130,246,0.9)', letterSpacing: 2 }}>
          💬 MESAJLAŞMA
        </span>
        {unreadCount > 0 && !open && (
          <span style={{
            background: 'var(--red)', color: '#fff',
            fontFamily: 'var(--mono)', fontSize: 8, padding: '1px 6px',
            borderRadius: 4, letterSpacing: 0,
          }}>+{unreadCount}</span>
        )}
        {messages.length > 0 && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>
            {messages.length} mesaj
          </span>
        )}
        <span style={{
          marginLeft: 'auto', color: 'var(--text3)', fontSize: 10,
          transition: 'transform 0.2s', display: 'inline-block',
          transform: open ? 'rotate(180deg)' : '',
        }}>▼</span>
      </button>

      {open && (
        <div style={{
          border: '1px solid rgba(59,130,246,0.15)',
          borderTop: 'none', borderLeft: '3px solid rgba(59,130,246,0.5)',
          borderRadius: '0 0 8px 8px',
          background: 'var(--surface)',
          display: 'flex', flexDirection: 'column',
          height: 320,
        }}>
          {/* Pinned messages */}
          {pinnedMessages.length > 0 && (
            <div style={{
              background: 'rgba(240,165,0,0.08)', borderBottom: '1px solid rgba(240,165,0,0.2)',
              padding: '6px 12px',
            }}>
              {pinnedMessages.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)',
                }}>
                  <span>📌</span>
                  <span style={{ fontWeight: 700 }}>{m.sender_name}:</span>
                  <span style={{ color: 'var(--text)' }}>{m.message}</span>
                  {canPin(m) && (
                    <button onClick={() => pin.mutate({ id: m.id, is_pinned: 0 })} style={{
                      marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text3)', fontSize: 10, padding: 0,
                    }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Message list */}
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {messages.length === 0 && (
              <div style={{ margin: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                Henüz mesaj yok
              </div>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  padding: '6px 8px', borderRadius: 6,
                  background: msg.message_type === 'urgent'
                    ? 'rgba(239,68,68,0.07)'
                    : 'transparent',
                  borderLeft: msg.message_type === 'urgent'
                    ? '2px solid rgba(239,68,68,0.5)'
                    : '2px solid transparent',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: msg.message_type === 'urgent'
                    ? 'rgba(239,68,68,0.15)'
                    : 'rgba(59,130,246,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
                  color: msg.message_type === 'urgent' ? 'var(--red)' : 'rgba(59,130,246,0.8)',
                }}>
                  {initials(msg.sender_name)}
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: 'var(--text)' }}>
                      {msg.sender_name}
                    </span>
                    {msg.message_type === 'urgent' && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--red)', letterSpacing: 1 }}>ACİL</span>
                    )}
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginLeft: 'auto' }}>
                      {timeAgo(msg.created_at)}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {msg.message}
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {canPin(msg) && !msg.is_pinned && (
                    <button onClick={() => pin.mutate({ id: msg.id, is_pinned: 1 })} title="Sabitle" style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text3)', fontSize: 10, padding: '0 2px', opacity: 0.5,
                    }}>📌</button>
                  )}
                  {canDelete(msg) && (
                    <button onClick={() => del.mutate(msg.id)} title="Sil" style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text3)', fontSize: 10, padding: '0 2px', opacity: 0.5,
                    }}>✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} style={{
            display: 'flex', gap: 6, padding: '8px 10px',
            borderTop: '1px solid var(--border)',
          }}>
            <button
              type="button"
              onClick={() => setIsUrgent(v => !v)}
              title="Acil mesaj"
              style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: 6,
                background: isUrgent ? 'rgba(239,68,68,0.15)' : 'transparent',
                border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                cursor: 'pointer', fontSize: 12,
              }}
            >🚨</button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={isUrgent ? 'Acil mesaj yaz...' : 'Mesaj yaz...'}
              style={{
                flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '0 10px', height: 28,
                fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || send.isPending}
              style={{
                flexShrink: 0, height: 28, padding: '0 12px', borderRadius: 6,
                background: isUrgent ? 'rgba(239,68,68,0.8)' : 'rgba(59,130,246,0.8)',
                border: 'none', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: '#fff',
                opacity: (!input.trim() || send.isPending) ? 0.5 : 1,
              }}
            >
              {send.isPending ? '...' : 'Gönder'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
