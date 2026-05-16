import { memo, useState } from 'react'
import { money } from '../constants.js'

export const KPIRow = memo(function KPIRow({ stats }) {
  if (!stats) return null
  const kpis = [
    {
      label: 'TOPLAM ÜRÜN', val: stats.total_items, sub: `${stats.active_checkouts || 0} aktif teslim`,
      color: 'var(--accent)', tint: 'rgba(240,165,0,.06)',
    },
    {
      label: 'DÜŞÜK / TÜKENMİŞ', val: (stats.low_stock || 0) + (stats.out_of_stock || 0),
      sub: `${stats.out_of_stock || 0} tükendi · ${stats.low_stock || 0} azaldı`,
      color: ((stats.low_stock || 0) + (stats.out_of_stock || 0)) > 0 ? 'var(--red)' : 'var(--green)',
      tint: ((stats.low_stock || 0) + (stats.out_of_stock || 0)) > 0 ? 'rgba(231,76,60,.06)' : 'rgba(39,201,106,.06)',
    },
    {
      label: 'STOK DEĞERİ', val: money(stats.total_value || 0), sub: `son 24s · ${stats.movements_24h || 0} hareket`,
      color: 'var(--accent)', tint: 'rgba(240,165,0,.06)', small: true,
    },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 16 }} className="fade-up">
      {kpis.map(k => (
        <div key={k.label} style={{
          background: k.tint, border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, marginBottom: 6 }}>{k.label}</div>
          <div style={{
            fontFamily: k.small ? 'var(--mono)' : 'var(--display)',
            fontSize: k.small ? 20 : 30, color: k.color, letterSpacing: 1, lineHeight: 1,
          }}>{k.val}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 6 }}>{k.sub}</div>
        </div>
      ))}
    </div>
  )
})

export const AlertsBar = memo(function AlertsBar({ items, forecast = [] }) {
  const [open, setOpen] = useState(false)
  const low = items.filter(i => i.reorder_threshold > 0 && i.quantity <= i.reorder_threshold)
  const out = items.filter(i => i.quantity <= 0)
  const critical = forecast.filter(f => f.severity === 'critical')
  const warning = forecast.filter(f => f.severity === 'warning')
  const total = low.length + critical.length

  if (total === 0) return null
  const severe = out.length > 0 || critical.length > 0
  const color = severe ? 'var(--red)' : 'var(--amber)'
  const tint = severe ? 'rgba(231,76,60,.05)' : 'rgba(240,165,0,.05)'

  return (
    <div style={{
      padding: '10px 14px', marginBottom: 16, borderRadius: 12,
      background: tint, border: `1px solid ${color}33`,
    }} className="fade-up">
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
      }}>
        <span style={{ fontSize: 14, color }}>⚠</span>
        <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 11, color, letterSpacing: 1 }}>
          {out.length > 0 && <span style={{ fontWeight: 700 }}>{out.length} tükendi</span>}
          {out.length > 0 && low.length > out.length && <span> · </span>}
          {low.length > out.length && <span>{low.length - out.length} düşük stok</span>}
          {critical.length > 0 && <span> · {critical.length} ≤3 gün</span>}
          {warning.length > 0 && <span style={{ color: 'var(--text3)' }}> · {warning.length} ≤7 gün</span>}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${color}33`, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {low.map(i => (
            <span key={`l-${i.id}`} style={{
              padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)',
              background: i.quantity <= 0 ? 'rgba(231,76,60,.1)' : 'rgba(240,165,0,.08)',
              color: i.quantity <= 0 ? 'var(--red)' : 'var(--amber)',
            }}>
              {i.item_name}: {i.quantity} {i.unit}
            </span>
          ))}
          {critical.map(f => (
            <span key={`f-${f.id}`} style={{
              padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)',
              background: 'rgba(231,76,60,.08)', color: 'var(--red)',
            }}>
              ⌛ {f.item_name} ~{f.days_left}g
            </span>
          ))}
        </div>
      )}
    </div>
  )
})
