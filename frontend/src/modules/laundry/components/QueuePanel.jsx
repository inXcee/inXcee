import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function QueuePanel() {
  const qc = useQueryClient()
  const { data: queue = [] } = useQuery({
    queryKey: ['laundry-queue'],
    queryFn: () => laundryApi.getQueue(),
    refetchInterval: 15000,
  })

  const remove = useMutation({
    mutationFn: (id) => laundryApi.removeFromQueue(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-queue'] }),
  })

  return (
    <div className="panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="panel-title">YIKAMA KUYRUĞU</span>
          {queue.length > 0 && (
            <span className="badge badge-amber">{queue.length}</span>
          )}
        </div>
        {queue.length > 0 && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
            bekleyen
          </span>
        )}
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {queue.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '28px 20px', gap: 8,
          }}>
            <div style={{ fontSize: 20, opacity: 0.4 }}>✓</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
              Kuyruk boş
            </span>
          </div>
        ) : (
          queue.map((q, idx) => (
            <div key={q.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              borderBottom: idx < queue.length - 1 ? '1px solid rgba(35,45,63,0.4)' : 'none',
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.018)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Position number */}
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                background: idx === 0 ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
                border: `1px solid ${idx === 0 ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
                color: idx === 0 ? 'var(--accent)' : 'var(--text3)',
                flexShrink: 0,
              }}>
                {idx + 1}
              </span>

              {/* Room */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: 0.3 }}>
                  {q.block || '?'} · {q.room_no || '?'}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                  {q.item_count} parça
                </div>
              </div>

              {/* Priority */}
              <span className={q.priority === 'urgent' ? 'badge badge-red' : 'badge badge-gray'}
                style={{ fontSize: 8 }}>
                {q.priority === 'urgent' ? 'ACİL' : 'Normal'}
              </span>

              {/* Remove */}
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => remove.mutate(q.id)}
                disabled={remove.isPending}
                style={{ color: 'var(--text3)', fontSize: 9 }}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
