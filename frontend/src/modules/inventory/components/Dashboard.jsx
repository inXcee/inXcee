import { memo } from 'react'
import { CATEGORIES, money, cat } from '../constants.js'

export const KPIRow = memo(function KPIRow({ stats }) {
  if (!stats) return null
  const kpis = [
    { label: 'TOPLAM URUN', val: stats.total_items, color: 'var(--accent)', icon: '▦', gradient: 'linear-gradient(135deg, rgba(240,165,0,.06), rgba(240,165,0,.02))' },
    { label: 'DUSUK STOK', val: stats.low_stock, color: stats.low_stock > 0 ? 'var(--red)' : 'var(--green)', icon: '▼', gradient: stats.low_stock > 0 ? 'linear-gradient(135deg, rgba(231,76,60,.06), rgba(231,76,60,.02))' : 'linear-gradient(135deg, rgba(39,201,106,.06), rgba(39,201,106,.02))' },
    { label: 'TUKENMIS', val: stats.out_of_stock, color: stats.out_of_stock > 0 ? 'var(--red)' : 'var(--green)', icon: '✕', gradient: stats.out_of_stock > 0 ? 'linear-gradient(135deg, rgba(231,76,60,.06), rgba(231,76,60,.02))' : 'linear-gradient(135deg, rgba(39,201,106,.06), rgba(39,201,106,.02))' },
    { label: 'TOPLAM DEGER', val: money(stats.total_value || 0), color: 'var(--accent)', icon: '₺', small: true, gradient: 'linear-gradient(135deg, rgba(240,165,0,.06), rgba(240,165,0,.02))' },
    { label: 'AKTIF TESLIM', val: stats.active_checkouts || 0, color: 'var(--blue)', icon: '→', gradient: 'linear-gradient(135deg, rgba(52,152,219,.06), rgba(52,152,219,.02))' },
    { label: 'SON 24S', val: stats.movements_24h, color: 'var(--teal)', icon: '↺', gradient: 'linear-gradient(135deg, rgba(26,188,156,.06), rgba(26,188,156,.02))' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }} className="fade-up">
      {kpis.map(k => (
        <div key={k.label} style={{
          background: k.gradient, border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 18px',
          position: 'relative', overflow: 'hidden', transition: 'transform .15s, box-shadow .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,.08)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
          <div style={{ position: 'absolute', top: '12px', right: '14px', fontSize: '20px', opacity: 0.12, color: k.color }}>{k.icon}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '8px' }}>{k.label}</div>
          <div style={{ fontFamily: k.small ? 'var(--mono)' : 'var(--display)', fontSize: k.small ? '16px' : '26px', color: k.color, letterSpacing: '1px', lineHeight: 1 }}>{k.val}</div>
        </div>
      ))}
    </div>
  )
})

export const CategoryChart = memo(function CategoryChart({ stats }) {
  if (!stats?.by_category?.length) return null
  const mx = Math.max(...stats.by_category.map(c => c.value || 0), 1)
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 20px', marginBottom: '20px',
    }} className="fade-up-1">
      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '14px' }}>KATEGORI BAZLI DEGER</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {stats.by_category.map(c => {
          const ct = cat(c.category)
          const pct = mx > 0 ? ((c.value || 0) / mx) * 100 : 0
          return (
            <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: ct?.bg, fontSize: '14px',
              }}>{ct?.icon}</div>
              <div style={{ width: '55px', fontFamily: 'var(--mono)', fontSize: '10px', color: ct?.color, letterSpacing: '0.5px', flexShrink: 0 }}>{ct?.label}</div>
              <div style={{ flex: 1, height: '24px', background: 'var(--surface2)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  height: '100%', borderRadius: '8px', transition: 'width 0.8s cubic-bezier(.22,1,.36,1)', width: `${pct}%`,
                  background: `linear-gradient(90deg, ${ct?.color}, color-mix(in srgb, ${ct?.color} 60%, transparent))`,
                  opacity: 0.5,
                }} />
                <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', fontWeight: 600 }}>
                  {money(c.value || 0)}
                </span>
              </div>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px', background: 'var(--surface2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)', fontWeight: 700, flexShrink: 0,
              }}>{c.count}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

export const LowStockAlert = memo(function LowStockAlert({ items }) {
  const low = items.filter(i => i.reorder_threshold > 0 && i.quantity <= i.reorder_threshold)
  if (!low.length) return null
  return (
    <div style={{
      padding: '14px 18px', marginBottom: '16px', borderRadius: '14px',
      background: 'linear-gradient(135deg, rgba(231,76,60,.04), rgba(231,76,60,.01))',
      border: '1px solid rgba(231,76,60,.15)',
    }} className="fade-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '24px', height: '24px', borderRadius: '8px', background: 'rgba(231,76,60,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--red)' }}>!</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', letterSpacing: '2px', fontWeight: 700 }}>DUSUK STOK — {low.length} URUN</div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {low.map(i => (
          <span key={i.id} style={{
            padding: '5px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 600,
            background: 'rgba(231,76,60,.08)', color: 'var(--red)', fontFamily: 'var(--mono)',
            border: '1px solid rgba(231,76,60,.1)',
          }}>
            {i.item_name}: {i.quantity} {i.unit}
          </span>
        ))}
      </div>
    </div>
  )
})
