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
  const [selectedItemForLots, setSelectedItemForLots] = useState(null)

  const { data: expiring = [] } = useQuery({
    queryKey: ['lots-expiring', days],
    queryFn: () => api.get(`/inventory/lots/expiring?days=${days}`).then(r => r.data),
  })
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-active'],
    queryFn: () => api.get('/inventory/suppliers?active=1').then(r => r.data),
  })
  const { data: itemLots = [] } = useQuery({
    queryKey: ['item-lots', selectedItemForLots?.id],
    queryFn: () => selectedItemForLots ? api.get(`/inventory/items/${selectedItemForLots.id}/lots`).then(r => r.data) : [],
    enabled: !!selectedItemForLots,
  })

  const trackedItems = items.filter(i => i.track_lots === 1)
  const inv = () => { qc.invalidateQueries({ queryKey: ['lots-expiring'] }); qc.invalidateQueries({ queryKey: ['item-lots'] }) }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>SON</span>
          {[7, 14, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`btn btn-xs ${days === d ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>{d}G</button>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" disabled={trackedItems.length === 0} style={{ borderRadius: '10px' }}>+ MANUEL LOT</button>
      </div>

      {/* Lot izlemeli urunler ozet */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', marginBottom: '14px' }}>
        <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--purple),var(--blue))' }} />
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '2px' }}>LOT/SKT IZLEMEDEKI URUNLER ({trackedItems.length})</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
            Urun duzenleme menusunden "Lot/SKT Izleme" toggle'ini ac. Mal Giriste lot no + son kullanma sorulur.
          </div>
        </div>
        {trackedItems.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
            Henuz lot/SKT izlemeli urun yok. Stok sekmesinden bir urunu duzenleyip "Lot/SKT izleme" toggle'ini ac.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '12px 18px' }}>
            {trackedItems.map(it => {
              const active = selectedItemForLots?.id === it.id
              return (
                <button key={it.id} onClick={() => setSelectedItemForLots(active ? null : it)}
                  style={{
                    padding: '6px 12px',
                    border: `1px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
                    background: active ? 'rgba(155,89,182,.1)' : 'var(--surface2)',
                    color: active ? 'var(--purple)' : 'var(--text2)',
                    borderRadius: '8px', cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 600,
                  }}>
                  ⏳ {it.item_name} <span style={{ color: 'var(--text4)', marginLeft: '4px' }}>({it.quantity} {it.unit})</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Secili urun lot detayi */}
      {selectedItemForLots && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--purple)', borderRadius: '14px', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1px', color: 'var(--purple)' }}>{selectedItemForLots.item_name} — TUM LOTLAR</div>
            <button onClick={() => setSelectedItemForLots(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
          </div>
          {itemLots.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
              Lot kaydi yok. Mal giris yaparken lot no + SKT girilirse buraya eklenir.
            </div>
          ) : (
            <table className="data-table" style={{ margin: 0 }}>
              <thead><tr><th>LOT</th><th>MIKTAR</th><th>SKT</th><th>DURUM</th><th>TEDARIKCI</th><th>GIRIS</th></tr></thead>
              <tbody>
                {itemLots.map(l => (
                  <tr key={l.id} style={{ opacity: l.status === 'depleted' ? 0.5 : 1 }}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)' }}>{l.lot_no || `#${l.id}`}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{l.quantity}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{l.expiry_date ? fmtDate(l.expiry_date) : '-'}</td>
                    <td><span className={`badge badge-${l.status === 'active' ? 'green' : l.status === 'depleted' ? 'red' : 'amber'}`} style={{ fontSize: '8px' }}>{l.status}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{l.supplier_name || '-'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)' }}>{fmt(l.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* SKT yaklasanlar */}
      {expiring.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px', opacity: 0.3 }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '2px', marginBottom: '4px', color: 'var(--text2)' }}>SON KULLANMA YAKIN LOT YOK</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>Onumuzdeki {days} gun icinde dolacak lot yok</div>
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
