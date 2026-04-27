import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { fmt, MOVE_LABEL, MOVE_COLOR } from '../constants.js'

export default function RecentMovements({ fullView }) {
  const [typeFilter, setTypeFilter] = useState('')
  const { data: moves = [] } = useQuery({
    queryKey: ['inv-recent-moves'],
    queryFn: () => api.get(`/inventory/movements/recent?limit=${fullView ? 100 : 8}`).then(r => r.data),
    refetchInterval: 30000,
  })
  const displayed = typeFilter ? moves.filter(m => m.type === typeFilter) : moves
  if (!fullView && !moves.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', ...(fullView ? {} : { marginTop: '20px' }) }}>
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--accent),var(--purple))' }} />
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px' }}>SON HAREKETLER</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{fullView ? `${displayed.length} hareket gösteriliyor` : 'SON 8 STOK İŞLEM'}</div>
        </div>
        {fullView && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[['', 'TÜMÜ'], ['in', 'GİRİŞ'], ['out', 'ÇIKIŞ'], ['count', 'SAYIM'], ['initial', 'KAYIT']].map(([key, label]) => (
              <button key={key} onClick={() => setTypeFilter(key)}
                style={{
                  padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px',
                  background: typeFilter === key ? (key === 'in' ? 'var(--green)' : key === 'out' ? 'var(--red)' : key === 'count' ? 'var(--blue)' : 'var(--accent)') : 'var(--surface)',
                  color: typeFilter === key ? '#000' : key === 'in' ? 'var(--green)' : key === 'out' ? 'var(--red)' : key === 'count' ? 'var(--blue)' : 'var(--text3)',
                  borderColor: typeFilter === key ? 'transparent' : 'var(--border)',
                }}>{label}</button>
            ))}
          </div>
        )}
      </div>
      {displayed.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Hareket yok</div>
      ) : (
        <div style={{ padding: '0 18px 14px' }}>
          {(fullView ? displayed : displayed.slice(0, 8)).map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `color-mix(in srgb, ${MOVE_COLOR[m.type]} 10%, transparent)`,
                color: MOVE_COLOR[m.type], fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700,
              }}>{m.delta > 0 ? '+' : ''}{m.delta}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>{m.item_name}</span>
                  <span style={{
                    fontSize: '8px', fontWeight: 700, fontFamily: 'var(--mono)',
                    padding: '1px 5px', borderRadius: '4px',
                    background: `color-mix(in srgb, ${MOVE_COLOR[m.type]} 10%, transparent)`,
                    color: MOVE_COLOR[m.type], letterSpacing: '0.5px',
                  }}>{MOVE_LABEL[m.type]}</span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', marginTop: '1px' }}>
                  {m.reason || '-'} · {m.username} · {fmt(m.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
