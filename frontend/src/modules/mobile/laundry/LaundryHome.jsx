import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'
import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js'

const STATUSES = [
  { key: 'dirty',              label: 'Kirli',        color: '#ef4444' },
  { key: 'washing',            label: 'Yıkanıyor',    color: '#3b82f6' },
  { key: 'ready',              label: 'Hazır',        color: '#10b981' },
  { key: 'pending_collection', label: 'Toplanacak',   color: '#f59e0b' },
]

const NEXT_ACTION = {
  pending_collection: { endpoint: 'collect',  label: '→ Topla',     color: '#3b82f6' },
  dirty:              { endpoint: 'advance',  label: '→ Yıkamaya',  color: '#3b82f6' },
  washing:            { endpoint: 'advance',  label: '→ Hazır',     color: '#10b981' },
  ready:              { endpoint: 'deliver',  label: '→ Teslim Et', color: '#10b981' },
}

export default function LaundryHome() {
  const [status, setStatus] = useState('dirty')
  const qc = useQueryClient()

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-laundry-items', status],
    queryFn: () => mobileApi.get(`/laundry/items?status=${status}`).then(r => r.data),
    staleTime: 30_000,
    gcTime: 300_000,
    refetchInterval: 60000,
  })

  const { isPulling, handlers } = usePullToRefresh(refetch)

  const advanceMut = useMutation({
    mutationFn: ({ id, action }) => {
      const method = action === 'collect' ? 'post' : 'patch'
      return mobileApi[method](`/laundry/items/${id}/${action}`, action === 'collect' ? {} : undefined)
    },
    onSuccess: () => { navigator.vibrate?.([15, 30, 15]); qc.invalidateQueries({ queryKey: ['mobile-laundry-items'] }) },
  })

  return (
    <div style={{ padding: '16px' }} {...handlers}>
      {isPulling && <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: '13px', color: '#3b82f6' }}>↓ Yenileniyor...</div>}

      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Çamaşırhane</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
        {STATUSES.map(s => (
          <button key={s.key} onClick={() => setStatus(s.key)}
            style={{ padding: '10px 8px', borderRadius: '10px', border: `2px solid ${status === s.key ? s.color : '#e5e7eb'}`,
              background: status === s.key ? s.color + '18' : '#fff', cursor: 'pointer', textAlign: 'center', fontSize: '12px', fontWeight: 600,
              color: status === s.key ? s.color : '#6b7280' }}>
            {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', height: '60px' }}>
              <div style={{ height: '14px', background: '#e5e7eb', borderRadius: '4px', width: '50%', marginBottom: '8px' }} />
              <div style={{ height: '11px', background: '#f3f4f6', borderRadius: '4px', width: '30%' }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
          {status === 'ready' ? '🎉 Teslim bekleyen yok' : 'Bu durumda öğe yok'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map(it => {
            const action = NEXT_ACTION[status]
            return (
              <div key={it.id} style={{ background: '#fff', borderRadius: '12px', padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{it.intake_name || it.room_label || `#${it.id}`}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      {it.item_count} parça {it.urgent ? ' · ⚡ Acil' : ''} {it.is_premium ? ' · ⭐ Premium' : ''}
                    </div>
                  </div>
                  {action && (
                    <button onClick={() => advanceMut.mutate({ id: it.id, action: action.endpoint })}
                      disabled={advanceMut.isPending}
                      style={{ padding: '8px 12px', borderRadius: '8px', background: action.color, color: '#fff',
                        border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                      {action.label}
                    </button>
                  )}
                </div>
                {it.item_details && (
                  <div style={{ fontSize: '11px', color: '#9ca3af', borderTop: '1px solid #f3f4f6', paddingTop: '6px' }}>
                    {it.item_details}
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
