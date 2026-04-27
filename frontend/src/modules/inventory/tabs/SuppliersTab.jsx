import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from '../components/Modal.jsx'
import { fmt, fmtDate, money } from '../constants.js'

const PAYMENT_TERMS = [
  { key: 'cash', label: 'Pesin' },
  { key: 'net_30', label: 'Vadeli 30 gun' },
  { key: 'net_60', label: 'Vadeli 60 gun' },
  { key: 'net_90', label: 'Vadeli 90 gun' },
]

const INIT = { name: '', tax_no: '', contact_name: '', phone: '', email: '', address: '', payment_term: 'cash', default_lead_time_days: 7, notes: '', is_active: 1 }

function SupplierForm({ supplier, onClose, onSave, isPending }) {
  const [f, setF] = useState(supplier || INIT)
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal onClose={onClose} title={supplier?.id ? 'TEDARIKCI DUZENLE' : 'YENI TEDARIKCI'} sub={supplier?.id ? supplier.name : 'Yeni kayit'} color="var(--accent),var(--blue)" wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Tedarikci Adi *</label>
          <input className="form-input" value={f.name} onChange={e => u('name', e.target.value)} autoFocus style={{ borderRadius: '10px' }} />
        </div>
        <div><label className="form-label">VKN/TCKN</label><input className="form-input" value={f.tax_no || ''} onChange={e => u('tax_no', e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">Yetkili</label><input className="form-input" value={f.contact_name || ''} onChange={e => u('contact_name', e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">Telefon</label><input className="form-input" value={f.phone || ''} onChange={e => u('phone', e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">E-posta</label><input className="form-input" value={f.email || ''} onChange={e => u('email', e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label className="form-label">Adres</label><input className="form-input" value={f.address || ''} onChange={e => u('address', e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div>
          <label className="form-label">Odeme Sekli</label>
          <select className="form-select" value={f.payment_term} onChange={e => u('payment_term', e.target.value)} style={{ borderRadius: '10px' }}>
            {PAYMENT_TERMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Tedarik Suresi (gun)</label>
          <input className="form-input" type="number" min="0" value={f.default_lead_time_days || 0} onChange={e => u('default_lead_time_days', +e.target.value)} style={{ borderRadius: '10px' }} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Not</label>
          <input className="form-input" value={f.notes || ''} onChange={e => u('notes', e.target.value)} style={{ borderRadius: '10px' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '18px', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" disabled={!f.name || isPending} onClick={() => onSave(f)} style={{ borderRadius: '10px' }}>
          {isPending ? '...' : supplier?.id ? 'GUNCELLE' : 'KAYDET'}
        </button>
      </div>
    </Modal>
  )
}

function PriceHistoryModal({ supplier, onClose }) {
  const { data: prices = [] } = useQuery({
    queryKey: ['supplier-prices', supplier.id],
    queryFn: () => api.get(`/inventory/suppliers/${supplier.id}/price-history`).then(r => r.data),
  })
  const { data: scorecard } = useQuery({
    queryKey: ['supplier-scorecard', supplier.id],
    queryFn: () => api.get(`/inventory/suppliers/${supplier.id}/scorecard`).then(r => r.data),
  })
  return (
    <Modal onClose={onClose} title={supplier.name} sub="FIYAT GECMISI VE KARNE" color="var(--purple),var(--accent)" wide>
      {scorecard && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
          {[
            ['MAL GIRIS', scorecard.receipt_count],
            ['TOPLAM', money(scorecard.total_value)],
            ['URUN CESIDI', scorecard.distinct_items],
            ['SON GIRIS', scorecard.last_receipt ? fmtDate(scorecard.last_receipt.receipt_date) : '-'],
          ].map(([lbl, val]) => (
            <div key={lbl} style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '4px' }}>{lbl}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {prices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Fiyat kaydi yok</div>
      ) : (
        <div style={{ maxHeight: '380px', overflow: 'auto' }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead><tr><th>URUN</th><th>FIYAT</th><th>KAYNAK</th><th>TARIH</th></tr></thead>
            <tbody>
              {prices.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500, fontSize: '12px' }}>{p.item_name}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>{money(p.unit_price)} <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400 }}>/{p.unit}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{p.source}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{fmt(p.effective_from)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

export default function SuppliersTab() {
  const qc = useQueryClient()
  const [activeOnly, setActiveOnly] = useState(false)
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [historyFor, setHistoryFor] = useState(null)

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', activeOnly],
    queryFn: () => api.get(`/inventory/suppliers${activeOnly ? '?active=1' : ''}`).then(r => r.data),
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['suppliers'] })
  const createMut = useMutation({ mutationFn: d => api.post('/inventory/suppliers', d), onSuccess: () => { inv(); setCreating(false) } })
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => api.put(`/inventory/suppliers/${id}`, d), onSuccess: () => { inv(); setEditing(null) } })
  const deleteMut = useMutation({ mutationFn: id => api.delete(`/inventory/suppliers/${id}`), onSuccess: inv })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => setActiveOnly(false)} className={`btn btn-xs ${!activeOnly ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>TUMU ({suppliers.length})</button>
          <button onClick={() => setActiveOnly(true)} className={`btn btn-xs ${activeOnly ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>AKTIF</button>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ YENI TEDARIKCI</button>
      </div>

      {suppliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>⛓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px', marginBottom: '6px', color: 'var(--text2)' }}>TEDARIKCI YOK</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginBottom: '16px' }}>Mal giris yapinca otomatik olusur veya manuel ekleyin</div>
          <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ YENI TEDARIKCI</button>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--accent),var(--blue))' }} />
          <table className="data-table" style={{ margin: 0 }}>
            <thead><tr><th>AD</th><th>YETKILI</th><th>TELEFON</th><th>ODEME</th><th>SURE</th><th>DURUM</th><th style={{ textAlign: 'center' }}>ISLEM</th></tr></thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600, fontSize: '12px' }}>{s.name}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text2)' }}>{s.contact_name || '-'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{s.phone || '-'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{PAYMENT_TERMS.find(p => p.key === s.payment_term)?.label || s.payment_term}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{s.default_lead_time_days}g</td>
                  <td>
                    {s.is_active
                      ? <span className="badge badge-green" style={{ fontSize: '8px' }}>AKTIF</span>
                      : <span className="badge badge-red" style={{ fontSize: '8px' }}>PASIF</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--purple)', borderRadius: '6px' }} onClick={() => setHistoryFor(s)}>FIYAT</button>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--accent)', borderRadius: '6px' }} onClick={() => setEditing(s)}>DUZ</button>
                      {s.is_active === 1 && (
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', borderRadius: '6px' }}
                          onClick={() => { if (window.confirm(`${s.name} pasif edilsin mi?`)) deleteMut.mutate(s.id) }}>✕</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <SupplierForm supplier={null} onClose={() => setCreating(false)} onSave={d => createMut.mutate(d)} isPending={createMut.isPending} />}
      {editing && <SupplierForm supplier={editing} onClose={() => setEditing(null)} onSave={d => updateMut.mutate({ id: editing.id, ...d })} isPending={updateMut.isPending} />}
      {historyFor && <PriceHistoryModal supplier={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  )
}
