import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from './Modal.jsx'
import { fmt, MOVE_LABEL, MOVE_COLOR } from '../constants.js'

export default function LogModal({ item, onClose }) {
  const { data: moves = [] } = useQuery({
    queryKey: ['inv-moves', item.id],
    queryFn: () => api.get(`/inventory/${item.id}/movements`).then(r => r.data),
  })
  return (
    <Modal onClose={onClose} title="HAREKET GECMISI" sub={item.item_name} color="var(--purple),var(--accent)" wide>
      {moves.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Hareket yok</div>
      ) : (
        <div style={{ maxHeight: '380px', overflow: 'auto' }}>
          {moves.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `color-mix(in srgb, ${MOVE_COLOR[m.type]} 10%, transparent)`,
                color: MOVE_COLOR[m.type], fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700,
              }}>{m.delta > 0 ? '+' : ''}{m.delta}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '8px', fontWeight: 700, fontFamily: 'var(--mono)',
                    padding: '2px 6px', borderRadius: '4px',
                    background: `color-mix(in srgb, ${MOVE_COLOR[m.type]} 10%, transparent)`,
                    color: MOVE_COLOR[m.type], letterSpacing: '0.5px',
                  }}>{MOVE_LABEL[m.type]}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.reason || '-'}</span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', marginTop: '2px' }}>
                  {fmt(m.created_at)} · {m.username} · Sonuc: {m.quantity_after} {m.unit}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
