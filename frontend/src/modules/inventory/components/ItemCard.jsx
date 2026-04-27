import { memo } from 'react'
import { fmt, money, cat } from '../constants.js'

export default memo(function ItemCard({ item, onAdjust, onCheckout, onEdit, onShowLog, onDelete, forecastEntry }) {
  const ct = cat(item.category)
  const isLow = item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold
  const isOut = item.quantity === 0
  const pct = item.reorder_threshold > 0 ? Math.min((item.quantity / (item.reorder_threshold * 3)) * 100, 100) : 100
  const val = (item.quantity || 0) * (item.unit_price || 0)
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isOut ? 'rgba(231,76,60,.2)' : isLow ? 'rgba(240,165,0,.2)' : 'var(--border)'}`,
      borderRadius: '14px', overflow: 'hidden', transition: 'transform .2s ease, box-shadow .2s ease',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.06)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
      {/* Category accent */}
      <div style={{ height: '3px', background: `linear-gradient(90deg, ${ct?.color || 'var(--text3)'}, transparent)`, opacity: 0.6 }} />
      <div style={{ padding: '16px 18px' }}>
        {/* Top: icon + name + status */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: ct?.bg, fontSize: '16px',
          }}>{ct?.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.item_name}
              </div>
              {forecastEntry && (
                <span style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '9px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                  background: forecastEntry.severity === 'critical'
                    ? 'rgba(231,76,60,.15)' : 'rgba(240,165,0,.15)',
                  color: forecastEntry.severity === 'critical'
                    ? 'var(--red)' : 'var(--amber)',
                  border: `1px solid ${forecastEntry.severity === 'critical'
                    ? 'rgba(231,76,60,.3)' : 'rgba(240,165,0,.3)'}`,
                }}>
                  ~{forecastEntry.days_left}g
                </span>
              )}
              {isOut && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: 'rgba(231,76,60,.1)', color: 'var(--red)', fontFamily: 'var(--mono)', flexShrink: 0 }}>TUKENDI</span>}
              {!isOut && isLow && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: 'rgba(240,165,0,.1)', color: 'var(--amber)', fontFamily: 'var(--mono)', flexShrink: 0 }}>DUSUK</span>}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '0.5px', marginTop: '2px' }}>
              {ct?.label} {item.location ? `· ${item.location}` : ''}
            </div>
          </div>
        </div>

        {/* Quantity */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: '28px', color: isOut ? 'var(--red)' : isLow ? 'var(--amber)' : 'var(--text)', letterSpacing: '1px', lineHeight: 1 }}>{item.quantity}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>{item.unit}</span>
          </div>
          <div style={{ height: '5px', background: 'var(--surface2)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '3px', transition: 'width 0.6s cubic-bezier(.22,1,.36,1)', width: `${pct}%`,
              background: isOut ? 'var(--red)' : isLow ? 'linear-gradient(90deg, var(--amber), var(--red))' : 'linear-gradient(90deg, var(--green), var(--teal))',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
            {item.reorder_threshold > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)' }}>min {item.reorder_threshold}</span>}
            {val > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--accent)', fontWeight: 600 }}>{money(val)}</span>}
          </div>
          {item.last_updated && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', marginTop: '4px' }}>
              güncellendi: {fmt(item.last_updated)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          {[
            { label: '+/-', color: 'var(--green)', fn: () => onAdjust(item), flex: true },
            { label: 'TESLİM', color: 'var(--blue)', fn: () => onCheckout(item), flex: true },
            { label: 'LOG', color: 'var(--purple)', fn: () => onShowLog(item), flex: false },
            { label: 'DÜZ', color: 'var(--accent)', fn: () => onEdit(item), flex: false },
            { label: 'SİL', color: 'var(--red)', fn: () => onDelete(item), flex: false },
          ].map(a => (
            <button key={a.label} onClick={a.fn} style={{
              flex: a.flex ? 1 : 'none',
              padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '8px',
              background: 'var(--surface)', color: a.color, fontSize: '9px', fontWeight: 700,
              fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.5px',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${a.color} 8%, var(--surface))` }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)' }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})
