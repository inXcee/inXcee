import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from '../components/Modal.jsx'
import { fmt, fmtDate } from '../constants.js'

function NewLotModal({ items, suppliers, onClose, onCreated }) {
  const [itemId, setItemId] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [quantity, setQuantity] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [unitCost, setUnitCost] = useState('')

  const trackedItems = items.filter(i => i.track_lots === 1)
  const mut = useMutation({
    mutationFn: d => api.post('/inventory/lots', d),
    onSuccess: () => { onCreated(); onClose() },
  })

  return (
    <Modal onClose={onClose} title="YENI LOT" sub="Stok partisi" color="var(--purple),var(--blue)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label className="form-label">Urun (track_lots aktif olan) *</label>
          <select className="form-select" value={itemId} onChange={e => setItemId(e.target.value)} style={{ borderRadius: '10px' }}>
            <option value="">Sec...</option>
            {trackedItems.map(i => <option key={i.id} value={i.id}>{i.item_name}</option>)}
          </select>
          {trackedItems.length === 0 && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--amber)', marginTop: '4px' }}>Hicbir urunde lot izleme aktif degil. Urun duzenleme menusunde acin.</div>}
        </div>
        <div>
          <label className="form-label">Lot No</label>
          <input className="form-input" value={lotNo} onChange={e => setLotNo(e.target.value)} placeholder="Opsiyonel" style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Miktar *</label>
          <input className="form-input" type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Son Kullanma</label>
          <input className="form-input" type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Tedarikci</label>
          <select className="form-select" value={supplierId} onChange={e => setSupplierId(e.target.value)} style={{ borderRadius: '10px' }}>
            <option value="">-</option>
            {suppliers.filter(s => s.is_active === 1).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Birim Maliyet (TL)</label>
          <input className="form-input" type="number" min="0" step="any" value={unitCost} onChange={e => setUnitCost(e.target.value)} style={{ borderRadius: '10px' }} />
        </div>
      </div>
      {mut.isError && <div className="alert alert-danger" style={{ marginTop: '10px', borderRadius: '10px' }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" disabled={!itemId || !quantity || mut.isPending}
          onClick={() => mut.mutate({
            item_id: +itemId, lot_no: lotNo || null, quantity: +quantity,
            expiry_date: expiryDate || null,
            supplier_id: supplierId ? +supplierId : null,
            unit_cost: unitCost ? +unitCost : 0,
          })} style={{ borderRadius: '10px' }}>
          {mut.isPending ? '...' : 'KAYDET'}
        </button>
      </div>
    </Modal>
  )
}

export default function LotsExpiryTab({ items }) {
  const qc = useQueryClient()
  const [days, setDays] = useState(30)
  const [creating, setCreating] = useState(false)

  const { data: expiring = [] } = useQuery({
    queryKey: ['lots-expiring', days],
    queryFn: () => api.get(`/inventory/lots/expiring?days=${days}`).then(r => r.data),
  })
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-active'],
    queryFn: () => api.get('/inventory/suppliers?active=1').then(r => r.data),
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['lots-expiring'] })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>SON</span>
          {[7, 14, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`btn btn-xs ${days === d ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>{d}G</button>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ YENI LOT</button>
      </div>

      {expiring.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>⏳</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px', marginBottom: '6px', color: 'var(--text2)' }}>SON KULLANMA YAKIN LOT YOK</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>Onumuzdeki {days} gun icinde son kullanmasi dolacak lot yok</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--red),var(--amber))' }} />
          <table className="data-table" style={{ margin: 0 }}>
            <thead><tr><th>URUN</th><th>LOT NO</th><th>MIKTAR</th><th>SON KULLANMA</th><th>KALAN</th><th>TEDARIKCI</th><th>GIRIS</th></tr></thead>
            <tbody>
              {expiring.map(l => {
                const critical = l.days_left <= 7
                return (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500, fontSize: '12px' }}>{l.item_name}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)' }}>{l.lot_no || '-'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{l.quantity} <span style={{ fontSize: '9px', fontWeight: 400, color: 'var(--text3)' }}>{l.unit}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{fmtDate(l.expiry_date)}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, fontFamily: 'var(--mono)',
                        background: critical ? 'rgba(231,76,60,.12)' : 'rgba(240,165,0,.12)',
                        color: critical ? 'var(--red)' : 'var(--amber)',
                      }}>{l.days_left <= 0 ? 'GECTI' : `${l.days_left}G`}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{l.supplier_name || '-'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)' }}>{fmt(l.received_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <NewLotModal items={items} suppliers={suppliers} onClose={() => setCreating(false)} onCreated={inv} />}
    </div>
  )
}
