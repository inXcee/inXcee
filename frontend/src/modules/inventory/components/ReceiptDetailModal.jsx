import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from './Modal.jsx'
import { fmt, fmtDate, money, cat } from '../constants.js'

export default function ReceiptDetailModal({ receiptId, onClose }) {
  const { data: receipt } = useQuery({
    queryKey: ['receipt-detail', receiptId],
    queryFn: () => api.get(`/inventory/receipts/${receiptId}`).then(r => r.data),
  })
  if (!receipt) return null
  return (
    <Modal onClose={onClose} title={receipt.receipt_no} sub={`${receipt.supplier} · ${fmtDate(receipt.receipt_date)}`} color="var(--green),var(--teal)" wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '18px' }}>
        <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '4px' }}>TEDARIKCI</div>
          <div style={{ fontSize: '12px', fontWeight: 600 }}>{receipt.supplier}</div>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '4px' }}>FATURA NO</div>
          <div style={{ fontSize: '12px', fontWeight: 600 }}>{receipt.invoice_no || '-'}</div>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '4px' }}>TOPLAM</div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>{money(receipt.total_value)}</div>
        </div>
      </div>

      {receipt.notes && (
        <div style={{ padding: '10px 12px', background: 'rgba(240,165,0,.04)', border: '1px solid rgba(240,165,0,.1)', borderRadius: '10px', marginBottom: '14px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>
          {receipt.notes}
        </div>
      )}

      <table className="data-table" style={{ margin: 0 }}>
        <thead><tr><th>URUN</th><th>KAT.</th><th>MIKTAR</th><th>BIRIM FIYAT</th><th>TOPLAM</th></tr></thead>
        <tbody>
          {receipt.items?.map(ri => {
            const ct = cat(ri.category)
            return (
              <tr key={ri.id}>
                <td style={{ fontWeight: 500, fontSize: '12px' }}>{ri.item_name}</td>
                <td><span style={{ padding: '2px 6px', borderRadius: '6px', fontSize: '9px', fontWeight: 600, background: ct?.bg, color: ct?.color, fontFamily: 'var(--mono)' }}>{ct?.icon} {ct?.label}</span></td>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{ri.quantity} <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400 }}>{ri.unit}</span></td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{money(ri.unit_price)}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>{money(ri.quantity * ri.unit_price)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>Kaydeden: {receipt.created_by_name} · {fmt(receipt.created_at)}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>{money(receipt.total_value)}</div>
      </div>
    </Modal>
  )
}
