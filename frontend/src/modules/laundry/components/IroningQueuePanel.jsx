import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

function formatHours(h) {
  if (h === null || h === undefined) return '—'
  if (h < 1) return `${Math.round(h * 60)}dk`
  return `${h.toFixed(1)}s`
}

export default function IroningQueuePanel() {
  const qc = useQueryClient()

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ['ironing-queue'],
    queryFn: () => laundryApi.getItems({ status: 'ironing' }),
    staleTime: 30_000,
    gcTime: 300_000,
    refetchInterval: 60_000,
  })

  const items = [...rawItems].sort((a, b) => {
    if (b.urgent !== a.urgent) return (b.urgent || 0) - (a.urgent || 0)
    return (b.hours_in_status || 0) - (a.hours_in_status || 0)
  })

  const urgentCount = items.filter(i => i.urgent).length

  const { mutate: markReady, isPending } = useMutation({
    mutationFn: (id) => laundryApi.advanceItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['ironing-queue'] })
      const prev = qc.getQueryData(['ironing-queue'])
      qc.setQueryData(['ironing-queue'], old => (old || []).filter(i => i.id !== id))
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['ironing-queue'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ironing-queue'] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
    },
  })

  if (isLoading) {
    return (
      <div style={{ padding: 20, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
        Yükleniyor...
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="panel" style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, marginBottom: 6 }}>🎉</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
          Ütüde bekleyen parça yok
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Summary */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)',
      }}>
        <span>{items.length} parça bekliyor</span>
        {urgentCount > 0 && (
          <span style={{
            color: 'var(--red)', fontWeight: 700,
            background: 'rgba(239,68,68,0.1)', padding: '2px 10px',
            borderRadius: 4, border: '1px solid rgba(239,68,68,0.25)',
          }}>
            {urgentCount} acil
          </span>
        )}
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => {
          const isUrgent = !!item.urgent
          return (
            <div
              key={item.id}
              style={{
                background: 'var(--surface)',
                border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                borderLeft: `3px solid ${isUrgent ? 'var(--red)' : '#6366f1'}`,
                borderRadius: 8,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              {/* Room + name */}
              <span style={{ fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2, color: 'var(--text)' }}>
                {item.block} · {item.room_no}
              </span>
              {item.intake_name && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                  {item.intake_name}
                </span>
              )}

              {/* Count */}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                {item.item_count} parça
              </span>

              {/* Wait time */}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                {formatHours(item.hours_in_status)} bekledi
              </span>

              {/* Urgent badge */}
              {isUrgent && (
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 9,
                  fontFamily: 'var(--mono)', background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)', fontWeight: 700,
                }}>
                  ACİL
                </span>
              )}

              {/* Notes */}
              {item.notes && (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                  fontStyle: 'italic', flex: '1 1 120px',
                }}>
                  {item.notes}
                </span>
              )}

              {/* Ready button */}
              <button
                type="button"
                disabled={isPending}
                onClick={() => markReady(item.id)}
                style={{
                  marginLeft: 'auto',
                  padding: '5px 14px',
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: 6,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'var(--green)',
                  opacity: isPending ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                ✓ Hazır
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
