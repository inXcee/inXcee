import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { fmt } from '../constants.js'

export default function ActiveCheckoutsPanel({ fullView }) {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); qc.invalidateQueries({ queryKey: ['checkouts-active'] }) }
  const [returningId, setReturningId] = useState(null)
  const [returnQty, setReturnQty] = useState(1)
  const [search, setSearch] = useState('')

  const { data: checkouts = [] } = useQuery({
    queryKey: ['checkouts-active'],
    queryFn: () => api.get('/inventory/checkouts/active').then(r => r.data),
    refetchInterval: 30000,
  })

  const returnMut = useMutation({
    mutationFn: ({ id, qty }) => api.post(`/inventory/return/${id}`, { quantity: qty }),
    onSuccess: () => { inv(); setReturningId(null) },
  })

  const filtered = search
    ? checkouts.filter(c => `${c.personnel_name} ${c.item_name} ${c.role_label || ''} ${c.department_name || ''} ${c.block || ''}${c.floor != null ? c.floor : ''}`.toLowerCase().includes(search.toLowerCase()))
    : checkouts

  if (!fullView && checkouts.length === 0) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', ...(fullView ? {} : { marginTop: '20px' }) }}>
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--blue),var(--red))' }} />
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px' }}>AKTİF TESLİMLER</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{checkouts.length} MALZEME AVS PERSONELİNDE</div>
        </div>
        {fullView && checkouts.length > 0 && (
          <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="AVS personel, malzeme, blok, kat, görev ara..."
            style={{ width: 280, fontSize: 11, borderRadius: 10, padding: '6px 10px' }} />
        )}
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
          {checkouts.length === 0 ? 'Aktif teslim yok' : 'Eşleşen kayıt yok'}
        </div>
      ) : (
        <div style={{ padding: '6px 12px 12px' }}>
          {filtered.map(co => {
            const remaining = co.quantity - co.returned_qty
            const isReturning = returningId === co.id
            return (
              <div key={co.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 8px', borderBottom: '1px solid var(--border)',
              }}>
                {/* Avatar / quantity badge */}
                <div style={{
                  flexShrink: 0, width: 42, height: 42, borderRadius: 10,
                  background: 'color-mix(in srgb, var(--blue) 10%, transparent)',
                  color: 'var(--blue)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--mono)', fontWeight: 700,
                }}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>{remaining}</span>
                  <span style={{ fontSize: 8, opacity: 0.7, marginTop: 1 }}>{co.unit}</span>
                </div>

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{co.personnel_name}</span>
                    {(co.block || co.floor != null) && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>
                        {co.block || '—'}{co.floor != null ? ` / ${co.floor}.kat` : ''}
                      </span>
                    )}
                    {(co.role_label || co.department_name) && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                        · {co.role_label || co.department_name}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    <strong>{co.item_name}</strong>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 8 }}>
                      {fmt(co.checked_out_at)} · {co.given_by}
                    </span>
                  </div>
                </div>

                {/* Return action */}
                {isReturning ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    <input type="number" min="1" max={remaining} value={returnQty}
                      onChange={e => setReturnQty(Math.max(1, Math.min(remaining, +e.target.value)))}
                      style={{ width: 56, padding: '5px 6px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, textAlign: 'center', background: 'var(--surface)', color: 'var(--text)' }} />
                    <button onClick={() => returnMut.mutate({ id: co.id, qty: returnQty })} disabled={returnMut.isPending}
                      style={{ padding: '5px 9px', border: '1px solid rgba(39,201,106,.3)', borderRadius: 6, background: 'rgba(39,201,106,.08)', color: 'var(--green)', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>✓</button>
                    <button onClick={() => setReturningId(null)}
                      style={{ padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text3)', fontSize: 12, cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => { setReturningId(co.id); setReturnQty(remaining) }}
                    style={{
                      flexShrink: 0,
                      padding: '6px 12px', border: '1px solid rgba(39,201,106,.25)', borderRadius: 8,
                      background: 'rgba(39,201,106,.06)', color: 'var(--green)', fontSize: 9, fontWeight: 700,
                      fontFamily: 'var(--mono)', cursor: 'pointer', letterSpacing: 1,
                    }}>
                    İADE
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
