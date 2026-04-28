import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from './Modal.jsx'
import { money } from '../constants.js'

export default function ReceiptModal({ items, onClose }) {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); qc.invalidateQueries({ queryKey: ['inv-recent-moves'] }); qc.invalidateQueries({ queryKey: ['goods-receipts'] }) }

  const [supplier, setSupplier] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([{ item_id: '', quantity: '', unit_price: '', lot_no: '', expiry_date: '' }])
  const [lineSearches, setLineSearches] = useState({})
  const [result, setResult] = useState(null)

  const updateLineSearch = (idx, val) => setLineSearches(p => ({ ...p, [idx]: val }))

  const addLine = () => setLines(p => [...p, { item_id: '', quantity: '', unit_price: '', lot_no: '', expiry_date: '' }])
  const removeLine = idx => setLines(p => p.filter((_, i) => i !== idx))
  const updateLine = (idx, key, val) => setLines(p => p.map((l, i) => i === idx ? { ...l, [key]: val } : l))

  const totalValue = lines.reduce((sum, l) => {
    const q = +l.quantity || 0
    const p = +l.unit_price || (items.find(i => i.id === +l.item_id)?.unit_price || 0)
    return sum + q * p
  }, 0)

  const validLines = lines.filter(l => l.item_id && +l.quantity > 0)

  const mut = useMutation({
    mutationFn: d => api.post('/inventory/receipts', d),
    onSuccess: d => { inv(); setResult(d.data) },
  })

  if (result) {
    return (
      <Modal onClose={onClose} title="MAL GIRIS KAYDEDILDI" color="var(--green),var(--teal)">
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(39,201,106,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '24px', color: 'var(--green)' }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '1px', marginBottom: '6px' }}>KAYIT TAMAMLANDI</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)', marginBottom: '4px', fontWeight: 700 }}>{result.receipt_no}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginBottom: '18px' }}>
            {validLines.length} kalem · {money(result.total_value)}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>KAPAT</button>
            <button className="btn btn-primary" onClick={() => { setResult(null); setSupplier(''); setInvoiceNo(''); setNotes(''); setLines([{ item_id: '', quantity: '', unit_price: '' }]) }} style={{ borderRadius: '10px' }}>YENI GIRIS</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} title="MAL GIRIS" sub="TEDARIKCI SIPARIS KAYDI" color="var(--green),var(--blue)" wide>
      {/* Supplier info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Tedarikci / Firma *</label>
          <input className="form-input" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Tedarikci adi..." autoFocus style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Fatura No</label>
          <input className="form-input" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Opsiyonel" style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Tarih</label>
          <input className="form-input" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} style={{ borderRadius: '10px' }} />
        </div>
      </div>

      {/* Items */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px' }}>KALEMLER</div>
          <button onClick={addLine} style={{
            padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '8px',
            background: 'var(--surface)', color: 'var(--green)', fontSize: '10px', fontWeight: 700,
            fontFamily: 'var(--mono)', cursor: 'pointer',
          }}>+ EKLE</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {lines.map((line, idx) => {
            const selectedItem = items.find(i => i.id === +line.item_id)
            const showLotFields = selectedItem?.track_lots === 1
            return (
              <div key={idx} style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 90px 28px', gap: '6px', alignItems: 'end',
                padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)',
              }}>
                <div>
                  <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', display: 'block', marginBottom: '3px' }}>ÜRÜN</label>
                  <input className="form-input" placeholder="Ürün ara..." value={lineSearches[idx] ?? ''}
                    onChange={e => updateLineSearch(idx, e.target.value)}
                    style={{ borderRadius: '8px', fontSize: '11px', marginBottom: '3px' }} />
                  <select className="form-select" value={line.item_id} onChange={e => {
                    updateLine(idx, 'item_id', e.target.value)
                    updateLineSearch(idx, '')
                    const it = items.find(i => i.id === +e.target.value)
                    if (it && !line.unit_price) updateLine(idx, 'unit_price', it.unit_price || '')
                  }} style={{ borderRadius: '8px', fontSize: '11px' }}>
                    <option value="">Ürün seç...</option>
                    {items.filter(i => !lineSearches[idx] || i.item_name.toLowerCase().includes(lineSearches[idx].toLowerCase())).map(i => <option key={i.id} value={i.id}>{i.item_name} ({i.quantity} {i.unit})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', display: 'block', marginBottom: '3px' }}>MIKTAR</label>
                  <input className="form-input" type="number" min="0" step="any" value={line.quantity}
                    onChange={e => updateLine(idx, 'quantity', e.target.value)}
                    placeholder={selectedItem ? selectedItem.unit : '0'}
                    style={{ borderRadius: '8px', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--mono)', textAlign: 'center' }} />
                </div>
                <div>
                  <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', display: 'block', marginBottom: '3px' }}>FIYAT</label>
                  <input className="form-input" type="number" min="0" step="any" value={line.unit_price}
                    onChange={e => updateLine(idx, 'unit_price', e.target.value)}
                    placeholder="TL"
                    style={{ borderRadius: '8px', fontSize: '12px', fontFamily: 'var(--mono)', textAlign: 'center' }} />
                </div>
                <button onClick={() => removeLine(idx)} disabled={lines.length <= 1} style={{
                  width: '28px', height: '32px', border: '1px solid var(--border)', borderRadius: '8px',
                  background: 'var(--surface)', color: lines.length > 1 ? 'var(--red)' : 'var(--text4)',
                  cursor: lines.length > 1 ? 'pointer' : 'default', fontSize: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✕</button>
                {showLotFields && (
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px', padding: '6px 0 0', borderTop: '1px dashed var(--border)' }}>
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--purple)', letterSpacing: '1px', display: 'block', marginBottom: '3px' }}>⏳ LOT NO</label>
                      <input className="form-input" placeholder="LOT-A1, parti, ureticikodu..." value={line.lot_no || ''}
                        onChange={e => updateLine(idx, 'lot_no', e.target.value)}
                        style={{ borderRadius: '8px', fontSize: '11px' }} />
                    </div>
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--purple)', letterSpacing: '1px', display: 'block', marginBottom: '3px' }}>⏳ SON KULLANMA</label>
                      <input className="form-input" type="date" value={line.expiry_date || ''}
                        onChange={e => updateLine(idx, 'expiry_date', e.target.value)}
                        style={{ borderRadius: '8px', fontSize: '11px' }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Notes */}
      <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Not (opsiyonel)..." style={{ marginBottom: '16px', borderRadius: '10px' }} />

      {/* Footer */}
      {mut.isError && <div className="alert alert-danger" style={{ marginBottom: '12px', borderRadius: '10px' }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>
          {validLines.length} kalem · {money(totalValue)}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
          <button className="btn btn-primary" style={{ borderRadius: '10px', padding: '10px 20px' }}
            disabled={!supplier || validLines.length === 0 || mut.isPending}
            onClick={() => mut.mutate({
              supplier, invoice_no: invoiceNo, receipt_date: receiptDate, notes,
              items: validLines.map(l => ({
                item_id: +l.item_id,
                quantity: +l.quantity,
                unit_price: +l.unit_price || undefined,
                lot_no: l.lot_no || undefined,
                expiry_date: l.expiry_date || undefined,
              }))
            })}>
            {mut.isPending ? 'KAYDEDILIYOR...' : 'MAL GIRIS KAYDET'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
