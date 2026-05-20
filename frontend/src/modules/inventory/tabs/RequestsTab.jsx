import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from '../components/Modal.jsx'
import { fmt } from '../constants.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'

const STATUS_LABELS = {
  pending: { label: 'BEKLIYOR', color: 'var(--amber)' },
  approved: { label: 'ONAYLANDI', color: 'var(--blue)' },
  rejected: { label: 'REDDEDILDI', color: 'var(--red)' },
  fulfilled: { label: 'KARSILANDI', color: 'var(--green)' },
  cancelled: { label: 'IPTAL', color: 'var(--text3)' },
}

function NewRequestModal({ items, suppliers, onClose, onCreated }) {
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const mut = useMutation({
    mutationFn: d => api.post('/inventory/requests', d),
    onSuccess: () => { onCreated(); onClose() },
  })
  return (
    <Modal onClose={onClose} title="MALZEME TALEP" sub="Yeni talep" color="var(--blue),var(--accent)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label className="form-label">Urun *</label>
          <select className="form-select" value={itemId} onChange={e => setItemId(e.target.value)} style={{ borderRadius: '10px' }}>
            <option value="">Sec...</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.item_name} (Stokta: {i.quantity} {i.unit})</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Miktar *</label>
          <input className="form-input" type="number" min="1" value={quantity} onChange={e => setQuantity(+e.target.value)} style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Neden</label>
          <input className="form-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Aciklama (opsiyonel)" style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Tercih Edilen Tedarikci</label>
          <select className="form-select" value={supplierId} onChange={e => setSupplierId(e.target.value)} style={{ borderRadius: '10px' }}>
            <option value="">-</option>
            {suppliers.filter(s => s.is_active === 1).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      {mut.isError && <div className="alert alert-danger" style={{ marginTop: '10px', borderRadius: '10px' }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" disabled={!itemId || !quantity || mut.isPending}
          onClick={() => mut.mutate({ item_id: +itemId, quantity, reason, preferred_supplier_id: supplierId ? +supplierId : null })}
          style={{ borderRadius: '10px' }}>
          {mut.isPending ? '...' : 'TALEP OLUSTUR'}
        </button>
      </div>
    </Modal>
  )
}

function FulfillModal({ requestId, onClose, onDone }) {
  const [personQ, setPersonQ] = useState('')
  const [person, setPerson] = useState(null)
  // Tüm aktif AVS personeli, modal açılışında — arama tetikleyici yok
  const { data: allStaff = [] } = useQuery({
    queryKey: ['fulfill-staff-all'],
    queryFn: () => api.get('/inventory/staff/search').then(r => r.data),
  })
  const results = personQ.trim()
    ? allStaff.filter(p => {
        const f = personQ.toLowerCase()
        return p.full_name?.toLowerCase().includes(f) ||
          p.role_label?.toLowerCase().includes(f) ||
          p.position?.toLowerCase().includes(f) ||
          p.assigned_block?.toLowerCase().includes(f)
      })
    : allStaff
  const mut = useMutation({
    mutationFn: () => api.post(`/inventory/requests/${requestId}/fulfill`, { staff_id: person.id }),
    onSuccess: () => { onDone(); onClose() },
  })
  return (
    <Modal onClose={onClose} title="TALEBI KARSILA" sub="AVS personeli sec" color="var(--green),var(--blue)">
      {!person ? (
        <>
          <input className="form-input" value={personQ} onChange={e => setPersonQ(e.target.value)}
            placeholder="🔍 Ad/görev/blok ile filtrele…" autoFocus style={{ borderRadius: '10px' }} />
          <div style={{ maxHeight: '300px', overflow: 'auto', marginTop: '10px', border: '1px solid var(--border)', borderRadius: 10 }}>
            {results.map(p => (
              <div key={p.id} onClick={() => setPerson(p)} style={{
                padding: '10px 12px', cursor: 'pointer', borderRadius: '10px', marginBottom: '4px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{p.full_name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                  {p.role_label || p.position || '—'}
                  {p.assigned_block && ` · ${p.assigned_block}${p.assigned_floor != null ? '/' + p.assigned_floor + '.kat' : ''}`}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: '10px', marginBottom: '12px' }}>
            <div style={{ fontWeight: 600 }}>{person.full_name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
              {person.role_label || person.position || '—'}
              {person.assigned_block && ` · ${person.assigned_block}${person.assigned_floor != null ? '/' + person.assigned_floor + '.kat' : ''}`}
            </div>
          </div>
          {mut.isError && <div className="alert alert-danger" style={{ marginBottom: '10px', borderRadius: '10px' }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-ghost" onClick={() => setPerson(null)} style={{ borderRadius: '10px' }}>DEGISTIR</button>
            <button className="btn btn-primary" disabled={mut.isPending} onClick={() => mut.mutate()} style={{ borderRadius: '10px' }}>
              {mut.isPending ? '...' : 'TESLIM ET'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

export default function RequestsTab({ items }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isMgr = user?.role === 'campus_manager' || user?.role === 'shift_supervisor'
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState(isMgr ? 'pending' : '')
  const [fulfillFor, setFulfillFor] = useState(null)
  const [rejectFor, setRejectFor] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data: requests = [] } = useQuery({
    queryKey: ['inv-requests', statusFilter],
    queryFn: () => api.get(`/inventory/requests${statusFilter ? `?status=${statusFilter}` : ''}`).then(r => r.data),
  })
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-active'],
    queryFn: () => api.get('/inventory/suppliers?active=1').then(r => r.data),
  })

  const inv = () => { qc.invalidateQueries({ queryKey: ['inv-requests'] }); qc.invalidateQueries({ queryKey: ['inventory'] }) }
  const approveMut = useMutation({ mutationFn: id => api.patch(`/inventory/requests/${id}/approve`), onSuccess: inv })
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => api.patch(`/inventory/requests/${id}/reject`, { reason }),
    onSuccess: () => { inv(); setRejectFor(null); setRejectReason('') },
  })
  const cancelMut = useMutation({ mutationFn: id => api.post(`/inventory/requests/${id}/cancel`), onSuccess: inv })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {[['', 'TUMU'], ['pending', 'BEKLIYOR'], ['approved', 'ONAYLI'], ['rejected', 'REDDEDILDI'], ['fulfilled', 'KARSILANDI']].map(([k, l]) => (
            <button key={k} onClick={() => setStatusFilter(k)} className={`btn btn-xs ${statusFilter === k ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>{l}</button>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ YENI TALEP</button>
      </div>

      {requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>📝</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px', marginBottom: '6px', color: 'var(--text2)' }}>TALEP YOK</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--blue),var(--green))' }} />
          <table className="data-table responsive-stack" style={{ margin: 0 }}>
            <thead><tr>
              <th>TALEP</th><th>TALEPCI</th>{isMgr && <th>NEDEN</th>}<th>STOK</th><th>DURUM</th><th>TARIH</th><th style={{ textAlign: 'center' }}>ISLEM</th>
            </tr></thead>
            <tbody>
              {requests.map(r => {
                const st = STATUS_LABELS[r.status]
                return (
                  <tr key={r.id}>
                    <td data-label="Talep" style={{ fontWeight: 500, fontSize: '12px' }}>
                      {r.item_name} <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>x{r.quantity}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginLeft: '4px' }}>{r.unit}</span>
                    </td>
                    <td data-label="Talepci" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{r.requester_full_name || r.requester_name}</td>
                    {isMgr && <td data-label="Neden" style={{ fontSize: '11px', color: 'var(--text3)' }}>{r.reason || '-'}</td>}
                    <td data-label="Stok" style={{ fontFamily: 'var(--mono)', color: r.available_qty < r.quantity ? 'var(--red)' : 'var(--green)', fontSize: '11px' }}>{r.available_qty}</td>
                    <td data-label="Durum"><span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color, fontFamily: 'var(--mono)' }}>{st.label}</span></td>
                    <td data-label="Tarih" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{fmt(r.created_at)}</td>
                    <td data-label="Islem">
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {isMgr && r.status === 'pending' && (
                          <>
                            <button className="btn btn-ghost btn-xs" onClick={() => approveMut.mutate(r.id)} style={{ color: 'var(--green)', borderRadius: '6px' }}>ONAY</button>
                            <button className="btn btn-ghost btn-xs" onClick={() => setRejectFor(r.id)} style={{ color: 'var(--red)', borderRadius: '6px' }}>RED</button>
                          </>
                        )}
                        {isMgr && r.status === 'approved' && (
                          <button className="btn btn-ghost btn-xs" onClick={() => setFulfillFor(r.id)} style={{ color: 'var(--blue)', borderRadius: '6px' }}>KARSILA</button>
                        )}
                        {!isMgr && r.requester_name === user?.username && r.status === 'pending' && (
                          <button className="btn btn-ghost btn-xs" onClick={async () => { if (await confirmDialog({ title: 'Talebi İptal Et', body: 'İptal edilsin mi?', danger: true })) cancelMut.mutate(r.id) }} style={{ color: 'var(--red)', borderRadius: '6px' }}>IPTAL</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <NewRequestModal items={items} suppliers={suppliers} onClose={() => setCreating(false)} onCreated={inv} />}
      {fulfillFor && <FulfillModal requestId={fulfillFor} onClose={() => setFulfillFor(null)} onDone={inv} />}
      {rejectFor && (
        <Modal onClose={() => setRejectFor(null)} title="TALEBI REDDET" color="var(--red),var(--amber)">
          <input className="form-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
            placeholder="Red nedeni (opsiyonel)" autoFocus style={{ marginBottom: '14px', borderRadius: '10px' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="btn btn-ghost" onClick={() => setRejectFor(null)} style={{ borderRadius: '10px' }}>IPTAL</button>
            <button className="btn btn-primary" onClick={() => rejectMut.mutate({ id: rejectFor, reason: rejectReason })}
              disabled={rejectMut.isPending} style={{ borderRadius: '10px' }}>
              {rejectMut.isPending ? '...' : 'REDDET'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
