import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from '../components/Modal.jsx'
import { fmt, fmtDate, money } from '../constants.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'

const STATUS_LABELS = {
  draft: { label: 'TASLAK', color: 'var(--text3)' },
  sent: { label: 'GONDERILDI', color: 'var(--blue)' },
  partial_received: { label: 'KISMI', color: 'var(--amber)' },
  received: { label: 'TESLIM ALINDI', color: 'var(--green)' },
  cancelled: { label: 'IPTAL', color: 'var(--red)' },
}

function CreatePOModal({ items, suppliers, onClose, onCreated, initialSupplierId, initialItemId }) {
  const [supplierId, setSupplierId] = useState(initialSupplierId ? String(initialSupplierId) : '')
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState(() => {
    if (initialItemId) {
      const it = items.find(i => i.id === initialItemId)
      const suggestedQty = it ? Math.max((it.reorder_threshold || 0) * 2 - (it.quantity || 0), 1) : ''
      return [{ item_id: String(initialItemId), qty_ordered: String(suggestedQty), unit_price: it?.unit_price ? String(it.unit_price) : '' }]
    }
    return [{ item_id: '', qty_ordered: '', unit_price: '' }]
  })
  const addLine = () => setLines(p => [...p, { item_id: '', qty_ordered: '', unit_price: '' }])
  const updateLine = (idx, k, v) => setLines(p => p.map((l, i) => i === idx ? { ...l, [k]: v } : l))
  const removeLine = idx => setLines(p => p.filter((_, i) => i !== idx))

  const valid = lines.filter(l => l.item_id && +l.qty_ordered > 0)
  const total = valid.reduce((s, l) => s + (+l.qty_ordered) * (+l.unit_price || 0), 0)

  const mut = useMutation({
    mutationFn: d => api.post('/inventory/po', d),
    onSuccess: () => { onCreated(); onClose() },
  })

  return (
    <Modal onClose={onClose} title="YENI SIPARIS" sub="SATIN ALMA SIPARISI" color="var(--accent),var(--blue)" wide>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '14px' }}>
        <div>
          <label className="form-label">Tedarikci *</label>
          <select className="form-select" value={supplierId} onChange={e => setSupplierId(e.target.value)} style={{ borderRadius: '10px' }}>
            <option value="">Sec...</option>
            {suppliers.filter(s => s.is_active === 1).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Beklenen Teslim</label>
          <input className="form-input" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} style={{ borderRadius: '10px' }} />
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px' }}>KALEMLER</div>
          <button onClick={addLine} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--green)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer' }}>+ EKLE</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {lines.map((line, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 28px', gap: '6px', padding: '8px', background: 'var(--surface2)', borderRadius: '8px' }}>
              <select className="form-select" value={line.item_id} onChange={e => {
                updateLine(idx, 'item_id', e.target.value)
                const it = items.find(i => i.id === +e.target.value)
                if (it && !line.unit_price) updateLine(idx, 'unit_price', it.unit_price || 0)
              }} style={{ borderRadius: '6px', fontSize: '11px' }}>
                <option value="">Urun sec...</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.item_name}</option>)}
              </select>
              <input className="form-input" type="number" min="0" step="any" value={line.qty_ordered} placeholder="adet"
                onChange={e => updateLine(idx, 'qty_ordered', e.target.value)} style={{ borderRadius: '6px', fontSize: '11px', textAlign: 'center' }} />
              <input className="form-input" type="number" min="0" step="any" value={line.unit_price} placeholder="TL"
                onChange={e => updateLine(idx, 'unit_price', e.target.value)} style={{ borderRadius: '6px', fontSize: '11px', textAlign: 'center' }} />
              <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                style={{ border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--red)', cursor: lines.length === 1 ? 'default' : 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Not (opsiyonel)..." style={{ marginBottom: '12px', borderRadius: '10px' }} />

      {mut.isError && <div className="alert alert-danger" style={{ marginBottom: '10px', borderRadius: '10px' }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>{valid.length} kalem · {money(total)}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
          <button className="btn btn-primary" disabled={!supplierId || valid.length === 0 || mut.isPending}
            onClick={() => mut.mutate({
              supplier_id: +supplierId,
              expected_date: expectedDate || null,
              notes,
              items: valid.map(l => ({ item_id: +l.item_id, qty_ordered: +l.qty_ordered, unit_price: +l.unit_price || 0 }))
            })} style={{ borderRadius: '10px' }}>
            {mut.isPending ? '...' : 'OLUSTUR'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ReceiveModal({ poId, onClose, onDone }) {
  const { data: po } = useQuery({
    queryKey: ['po-detail', poId],
    queryFn: () => api.get(`/inventory/po/${poId}`).then(r => r.data),
  })
  const [recv, setRecv] = useState({}) // { po_item_id: qty }
  const mut = useMutation({
    mutationFn: items => api.post(`/inventory/po/${poId}/receive`, { items }),
    onSuccess: () => { onDone(); onClose() },
  })

  if (!po) return null
  const submit = () => {
    const items = Object.entries(recv).filter(([_, q]) => +q > 0)
      .map(([id, q]) => ({ po_item_id: +id, qty_received_now: +q }))
    if (items.length === 0) return
    mut.mutate(items)
  }

  return (
    <Modal onClose={onClose} title={`TESLIM AL: ${po.po_no}`} sub={po.supplier_name} color="var(--green),var(--teal)" wide>
      <table className="data-table responsive-stack" style={{ margin: 0, marginBottom: '14px' }}>
        <thead><tr><th>URUN</th><th>SIPARIS</th><th>ALINAN</th><th>KALAN</th><th>SIMDI ALINAN</th></tr></thead>
        <tbody>
          {po.items.map(it => {
            const remaining = it.qty_ordered - it.qty_received
            return (
              <tr key={it.id}>
                <td data-label="Urun" style={{ fontWeight: 500, fontSize: '12px' }}>{it.item_name}</td>
                <td data-label="Siparis" style={{ fontFamily: 'var(--mono)' }}>{it.qty_ordered} {it.unit}</td>
                <td data-label="Alinan" style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{it.qty_received}</td>
                <td data-label="Kalan" style={{ fontFamily: 'var(--mono)', color: remaining > 0 ? 'var(--amber)' : 'var(--green)', fontWeight: 700 }}>{remaining}</td>
                <td data-label="Simdi Alinan">
                  <input type="number" min="0" max={remaining} value={recv[it.id] ?? ''}
                    onChange={e => setRecv(p => ({ ...p, [it.id]: e.target.value }))}
                    disabled={remaining === 0}
                    style={{ width: '80px', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '12px', textAlign: 'center', background: 'var(--surface)', color: 'var(--text)' }} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {mut.isError && <div className="alert alert-danger" style={{ marginBottom: '10px', borderRadius: '10px' }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" onClick={submit} disabled={mut.isPending} style={{ borderRadius: '10px' }}>
          {mut.isPending ? '...' : 'TESLIM AL'}
        </button>
      </div>
    </Modal>
  )
}

export default function PurchaseOrdersTab({ items, prefill, onPrefillConsumed }) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [creating, setCreating] = useState(!!prefill)
  const [receiving, setReceiving] = useState(null)

  const { data: pos = [] } = useQuery({
    queryKey: ['pos', statusFilter],
    queryFn: () => api.get(`/inventory/po${statusFilter ? `?status=${statusFilter}` : ''}`).then(r => r.data),
  })
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-active'],
    queryFn: () => api.get('/inventory/suppliers?active=1').then(r => r.data),
  })

  const inv = () => { qc.invalidateQueries({ queryKey: ['pos'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }) }
  const draftMut = useMutation({
    mutationFn: () => api.post('/inventory/po/draft-from-low-stock'),
    onSuccess: () => { inv() },
  })
  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/inventory/po/${id}/status`, { status }),
    onSuccess: inv,
  })

  const downloadPdf = id => {
    api.get(`/inventory/po/${id}/pdf`, { responseType: 'blob' }).then(r => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a'); a.href = url; a.download = `PO-${id}.pdf`; a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {[['', 'TUMU'], ['draft', 'TASLAK'], ['sent', 'GONDERILDI'], ['partial_received', 'KISMI'], ['received', 'TESLIM']].map(([k, l]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`btn btn-xs ${statusFilter === k ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => draftMut.mutate()} className="btn btn-ghost btn-sm" disabled={draftMut.isPending} style={{ borderRadius: '10px', color: 'var(--amber)' }}>
            {draftMut.isPending ? '...' : 'DUSUK STOKTAN OTOMATIK'}
          </button>
          <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ YENI SIPARIS</button>
        </div>
      </div>

      {draftMut.isSuccess && draftMut.data?.data?.created?.length > 0 && (
        <div style={{ padding: '10px 14px', background: 'rgba(39,201,106,.06)', border: '1px solid rgba(39,201,106,.2)', borderRadius: '10px', marginBottom: '12px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--green)' }}>
          {draftMut.data.data.created.filter(c => c.id).length} taslak siparis olusturuldu.
          {draftMut.data.data.created.filter(c => !c.supplier_id).length > 0 && ` ${draftMut.data.data.created.filter(c => !c.supplier_id).length} urun tedarikci atanmamis.`}
        </div>
      )}

      {pos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>📦</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px', marginBottom: '6px', color: 'var(--text2)' }}>SIPARIS YOK</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--accent),var(--green))' }} />
          <table className="data-table responsive-stack" style={{ margin: 0 }}>
            <thead><tr><th>NO</th><th>TEDARIKCI</th><th>KALEM</th><th>TUTAR</th><th>BEKLENEN</th><th>DURUM</th><th>OLUSTURAN</th><th style={{ textAlign: 'center' }}>ISLEM</th></tr></thead>
            <tbody>
              {pos.map(po => {
                const st = STATUS_LABELS[po.status] || { label: po.status, color: 'var(--text3)' }
                return (
                  <tr key={po.id}>
                    <td data-label="No" style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', fontSize: '11px' }}>{po.po_no}</td>
                    <td data-label="Tedarikci" style={{ fontWeight: 500, fontSize: '12px' }}>{po.supplier_name}</td>
                    <td data-label="Kalem" style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{po.item_count}</td>
                    <td data-label="Tutar" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>{money(po.total_value)}</td>
                    <td data-label="Beklenen" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{po.expected_date ? fmtDate(po.expected_date) : '-'}</td>
                    <td data-label="Durum"><span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color, fontFamily: 'var(--mono)' }}>{st.label}</span></td>
                    <td data-label="Olusturan" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{po.created_by_name}</td>
                    <td data-label="Islem">
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => downloadPdf(po.id)} style={{ color: 'var(--purple)', borderRadius: '6px' }}>PDF</button>
                        {po.status === 'draft' && (
                          <button className="btn btn-ghost btn-xs" onClick={() => statusMut.mutate({ id: po.id, status: 'sent' })} style={{ color: 'var(--blue)', borderRadius: '6px' }}>GONDER</button>
                        )}
                        {(po.status === 'sent' || po.status === 'partial_received') && (
                          <button className="btn btn-ghost btn-xs" onClick={() => setReceiving(po.id)} style={{ color: 'var(--green)', borderRadius: '6px' }}>TESLIM AL</button>
                        )}
                        {(po.status === 'draft' || po.status === 'sent') && (
                          <button className="btn btn-ghost btn-xs" onClick={async () => { if (await confirmDialog({ title: 'Sipariş İptal', body: 'İptal edilsin mi?', danger: true })) statusMut.mutate({ id: po.id, status: 'cancelled' }) }} style={{ color: 'var(--red)', borderRadius: '6px' }}>IPTAL</button>
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

      {creating && <CreatePOModal
        items={items} suppliers={suppliers}
        initialSupplierId={prefill?.supplierId}
        initialItemId={prefill?.itemId}
        onClose={() => { setCreating(false); onPrefillConsumed?.() }}
        onCreated={() => { inv(); onPrefillConsumed?.() }} />}
      {receiving && <ReceiveModal poId={receiving} onClose={() => setReceiving(null)} onDone={inv} />}
    </div>
  )
}
