import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'
import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js'

const STATUS_COLOR = {
  idle: '#10b981',
  running: '#3b82f6',
  maintenance: '#f59e0b',
  broken: '#ef4444',
}
const STATUS_LABEL = {
  idle: 'Boşta',
  running: 'Çalışıyor',
  maintenance: 'Bakımda',
  broken: 'Arızalı',
}

export default function MachineList() {
  const qc = useQueryClient()
  const { data: machines = [], isLoading, refetch } = useQuery({
    queryKey: ['mobile-laundry-machines'],
    queryFn: () => mobileApi.get('/laundry/machines').then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { isPulling, handlers } = usePullToRefresh(refetch)

  const updateMut = useMutation({
    mutationFn: ({ id, status }) => mobileApi.patch(`/laundry/machines/${id}`, { status }),
    onSuccess: () => { navigator.vibrate?.([15]); qc.invalidateQueries({ queryKey: ['mobile-laundry-machines'] }) },
  })

  return (
    <div style={{ padding: '16px' }} {...handlers}>
      {isPulling && <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: '13px', color: '#3b82f6' }}>↓ Yenileniyor...</div>}

      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px' }}>Makineler</h1>

      {isLoading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '24px' }}>Yükleniyor...</div>
      ) : machines.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '48px' }}>Makine kaydı yok</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {machines.map(m => (
            <div key={m.id} style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{m.name}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{m.type || 'Makine'}</div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px',
                  background: (STATUS_COLOR[m.status] || '#9ca3af') + '20', color: STATUS_COLOR[m.status] || '#9ca3af' }}>
                  {STATUS_LABEL[m.status] || m.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['idle','running','maintenance','broken'].filter(s => s !== m.status).map(s => (
                  <button key={s} onClick={() => updateMut.mutate({ id: m.id, status: s })}
                    disabled={updateMut.isPending}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${STATUS_COLOR[s]}`,
                      background: '#fff', color: STATUS_COLOR[s], fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    → {STATUS_LABEL[s]}
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
