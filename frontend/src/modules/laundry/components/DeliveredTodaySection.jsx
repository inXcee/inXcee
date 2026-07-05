import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

// ── DeliveredTodaySection ──────────────────────────────────────
export default function DeliveredTodaySection() {
  const [open, setOpen] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const { data: items = [] } = useQuery({
    queryKey: ['laundry-delivered-today'],
    queryFn: () => laundryApi.getItems({ status: 'delivered' }),
    refetchInterval: 30000,
    select: (data) => data.filter(i => {
      const d = i.updated_at || i.created_at || ''
      return d.slice(0, 10) === today
    }),
  })

  return (
    <div style={{ marginTop: 16 }}>
      <div
        onClick={() => setOpen(s => !s)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          padding: '8px 0', borderTop: '1px solid var(--border)',
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1,
          userSelect: 'none',
        }}
      >
        <span>BUGÜN TESLİM</span>
        <span style={{
          background: 'rgba(39,201,106,0.12)', color: 'var(--green)',
          border: '1px solid rgba(39,201,106,0.25)',
          borderRadius: 10, padding: '1px 8px', fontSize: 9, fontWeight: 700,
        }}>{items.length}</span>
        <span style={{ marginLeft: 'auto' }}>{open ? '▲' : '▾'}</span>
      </div>
      {open && items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {items.map(item => (
            <div key={item.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: '2px solid var(--green)', borderRadius: 8,
              padding: '8px 12px', minWidth: 180,
            }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2 }}>
                {item.block} · {item.room_no}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 3 }}>
                {item.item_count} parça
                {item.updated_at && ` · ${new Date(item.updated_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
              </div>
            </div>
          ))}
        </div>
      )}
      {open && items.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', padding: '8px 0' }}>
          Henüz bugün teslim yok
        </div>
      )}
    </div>
  )
}
