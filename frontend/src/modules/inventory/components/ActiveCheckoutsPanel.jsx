import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { fmt } from '../constants.js'

export default function ActiveCheckoutsPanel({ fullView }) {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); qc.invalidateQueries({ queryKey: ['checkouts-active'] }) }
  const [returningId, setReturningId] = useState(null)
  const [returnQty, setReturnQty] = useState(1)

  const { data: checkouts = [] } = useQuery({
    queryKey: ['checkouts-active'],
    queryFn: () => api.get('/inventory/checkouts/active').then(r => r.data),
    refetchInterval: 30000,
  })

  const returnMut = useMutation({
    mutationFn: ({ id, qty }) => api.post(`/inventory/return/${id}`, { quantity: qty }),
    onSuccess: () => { inv(); setReturningId(null) },
  })

  if (!fullView && checkouts.length === 0) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', ...(fullView ? {} : { marginTop: '20px' }) }}>
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--blue),var(--red))' }} />
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px' }}>AKTİF TESLİMLER</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{checkouts.length} MALZEME PERSONELDE</div>
        </div>
      </div>
      {checkouts.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Aktif teslim yok</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table responsive-stack" style={{ margin: 0 }}>
            <thead><tr><th>PERSONEL</th><th>ODA</th><th>MALZEME</th><th>ADET</th><th>TARİH</th><th>VEREN</th><th>İADE</th></tr></thead>
            <tbody>
              {checkouts.map(co => {
                const remaining = co.quantity - co.returned_qty
                return (
                  <tr key={co.id}>
                    <td data-label="Personel">
                      <div style={{ fontWeight: 500, fontSize: '12px' }}>{co.personnel_name}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{co.company || '-'}</div>
                    </td>
                    <td data-label="Oda" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>{co.block ? `${co.block}-${co.room_no}` : '-'}</td>
                    <td data-label="Malzeme" style={{ fontSize: '12px' }}>{co.item_name}</td>
                    <td data-label="Adet" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{remaining} <span style={{ fontSize: '9px', fontWeight: 400, color: 'var(--text3)' }}>{co.unit}</span></td>
                    <td data-label="Tarih" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmt(co.checked_out_at)}</td>
                    <td data-label="Veren" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{co.given_by}</td>
                    <td data-label="Iade">
                      {returningId === co.id ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input type="number" min="1" max={remaining} value={returnQty}
                            onChange={e => setReturnQty(Math.max(1, Math.min(remaining, +e.target.value)))}
                            style={{ width: '52px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, textAlign: 'center', background: 'var(--surface)', color: 'var(--text)' }} />
                          <button onClick={() => returnMut.mutate({ id: co.id, qty: returnQty })} disabled={returnMut.isPending}
                            style={{ padding: '4px 8px', border: '1px solid rgba(39,201,106,.3)', borderRadius: '6px', background: 'rgba(39,201,106,.08)', color: 'var(--green)', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}>✓</button>
                          <button onClick={() => setReturningId(null)}
                            style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface2)', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <button onClick={() => { setReturningId(co.id); setReturnQty(remaining) }}
                          style={{
                            padding: '5px 12px', border: '1px solid rgba(39,201,106,.2)', borderRadius: '8px',
                            background: 'rgba(39,201,106,.05)', color: 'var(--green)', fontSize: '9px', fontWeight: 700,
                            fontFamily: 'var(--mono)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(39,201,106,.1)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(39,201,106,.05)' }}>
                          İADE
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
