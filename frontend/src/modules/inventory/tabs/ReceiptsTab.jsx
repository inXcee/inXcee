import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { fmt, fmtDate, money } from '../constants.js'
import ReceiptDetailModal from '../components/ReceiptDetailModal.jsx'

export default function ReceiptsTab({ onNewReceipt }) {
  const [detailId, setDetailId] = useState(null)
  const { data: receipts = [] } = useQuery({
    queryKey: ['goods-receipts'],
    queryFn: () => api.get('/inventory/receipts').then(r => r.data),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px' }}>{receipts.length} MAL GIRIS KAYDI</div>
        <button onClick={onNewReceipt} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ YENI MAL GIRIS</button>
      </div>

      {receipts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 20px', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '14px', color: 'var(--text3)',
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>↓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px', marginBottom: '6px', color: 'var(--text2)' }}>MAL GIRIS KAYDI YOK</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginBottom: '16px' }}>Ilk tedarik kaydini olustur</div>
          <button onClick={onNewReceipt} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ YENI MAL GIRIS</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {receipts.map(r => (
            <div key={r.id} onClick={() => setDetailId(r.id)} style={{
              display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
              cursor: 'pointer', transition: 'all .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(39,201,106,.06)', fontSize: '16px', color: 'var(--green)',
              }}>↓</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>{r.receipt_no}</span>
                  <span style={{ fontWeight: 600, fontSize: '12px' }}>{r.supplier}</span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                  {fmtDate(r.receipt_date)} · {r.item_count} kalem · {r.created_by_name}
                  {r.invoice_no ? ` · Fatura: ${r.invoice_no}` : ''}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>
                {money(r.total_value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailId && <ReceiptDetailModal receiptId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}
