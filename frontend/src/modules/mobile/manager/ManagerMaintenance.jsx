import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js'
import { SkeletonTable } from '../../../shared/components/Skeleton.jsx'

const PRIORITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
const PRIORITY_LABEL = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' }

export default function ManagerMaintenance() {
  const qc = useQueryClient()
  const { addToast } = useToastStore()

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-mgr-maintenance-open'],
    queryFn: () => mobileApi.get('/maintenance/requests?status=open').then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const { isPulling, handlers } = usePullToRefresh(refetch)

  const priorityMut = useMutation({
    mutationFn: ({ id, priority }) => mobileApi.patch(`/maintenance/requests/${id}/priority`, { priority }),
    onSuccess: (_, vars) => {
      navigator.vibrate?.([10])
      addToast(`Öncelik: ${PRIORITY_LABEL[vars.priority]}`, 'success')
      qc.invalidateQueries({ queryKey: ['mobile-mgr-maintenance-open'] })
    },
  })

  return (
    <div style={{ padding: '16px' }} {...handlers}>
      {isPulling && <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '13px', color: '#3b82f6' }}>↓ Yenileniyor...</div>}

      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Açık Talepler</h1>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>Onay/öncelik aksiyonu</p>

      {isLoading ? (
        <SkeletonTable rows={4} cols={3} />
      ) : rows.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '48px' }}>🎉 Açık talep yok</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map(r => (
            <div key={r.id} style={{ background: '#fff', borderRadius: '12px', padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', flex: 1, marginRight: '8px' }}>{r.location}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: PRIORITY_COLOR[r.priority] }}>
                  {PRIORITY_LABEL[r.priority]}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 8px', lineHeight: 1.4 }}>
                {(r.description ?? '').slice(0, 100)}
              </p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['high','medium','low'].filter(p => p !== r.priority).map(p => (
                  <button key={p} onClick={() => priorityMut.mutate({ id: r.id, priority: p })}
                    disabled={priorityMut.isPending}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${PRIORITY_COLOR[p]}`,
                      background: '#fff', color: PRIORITY_COLOR[p], fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                    → {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
