import { useQuery } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'
import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js'
import { SkeletonTable } from '../../../shared/components/Skeleton.jsx'

function pctColor(pct) {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  if (pct >= 30) return '#10b981'
  return '#3b82f6'
}

export default function BlockHeatmap() {
  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-mgr-heatmap'],
    queryFn: () => mobileApi.get('/dashboard/heatmap').then(r => r.data),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
  const { isPulling, handlers } = usePullToRefresh(refetch)

  return (
    <div style={{ padding: '16px' }} {...handlers}>
      {isPulling && <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '13px', color: '#3b82f6' }}>↓ Yenileniyor...</div>}

      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px' }}>Blok Doluluk</h1>

      {isLoading ? (
        <SkeletonTable rows={5} cols={3} />
      ) : rows.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '48px' }}>Veri yok</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {rows.map(b => {
            const pct = Number(b.pct) || 0
            const color = pctColor(pct)
            return (
              <div key={b.block} style={{ background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>{b.block}</span>
                  <span style={{ fontWeight: 700, fontSize: '14px', color }}>%{pct}</span>
                </div>
                <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                  {b.occupied || 0} / {b.total_beds || 0} yatak
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
