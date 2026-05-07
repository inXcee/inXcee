import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'

const TYPE_COLOR = {
  critical: '#ef4444',
  warning:  '#f59e0b',
  info:     '#3b82f6',
}

const TYPE_LABEL = {
  critical: 'KRİTİK',
  warning:  'UYARI',
  info:     'BİLGİ',
}

function relativeTime(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'şimdi'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} dk`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} sa`
  return `${Math.floor(ms / 86_400_000)} gün`
}

export default function NotificationsPage() {
  const qc = useQueryClient()
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['mobile-notifications'],
    queryFn: () => mobileApi.get('/notifications').then(r => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const markRead = useMutation({
    mutationFn: id => mobileApi.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile-notifications'] }),
  })

  const unread = notifications.filter(n => !n.is_read)

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Bildirimler</h1>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>
        {unread.length > 0 ? `${unread.length} okunmamış · ${notifications.length} toplam` : `${notifications.length} bildirim`}
      </p>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ height: '12px', background: '#e5e7eb', borderRadius: '4px', width: '40%', marginBottom: '8px' }} />
              <div style={{ height: '14px', background: '#f3f4f6', borderRadius: '4px', width: '90%' }} />
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9ca3af' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔕</div>
          Henüz bildirim yok
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notifications.map(n => {
            const color = TYPE_COLOR[n.type] || '#6b7280'
            return (
              <div key={n.id}
                onClick={() => { if (!n.is_read) markRead.mutate(n.id) }}
                style={{
                  background: '#fff',
                  borderLeft: `4px solid ${color}`,
                  borderRadius: '10px',
                  padding: '12px 14px',
                  boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                  cursor: n.is_read ? 'default' : 'pointer',
                  opacity: n.is_read ? 0.6 : 1,
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', color }}>
                    {TYPE_LABEL[n.type] || n.type?.toUpperCase()}
                    {n.module && <span style={{ color: '#9ca3af', marginLeft: '8px' }}>· {n.module}</span>}
                  </span>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                    {relativeTime(n.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.4 }}>
                  {n.message}
                </div>
                {!n.is_read && (
                  <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', background: color, borderRadius: '50%' }} />
                    <span style={{ fontSize: '10px', color, fontWeight: 600 }}>okunmadı</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
