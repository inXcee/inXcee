import { CATEGORIES } from '../constants.js'

// Tek satir / kart, hizli aksiyon butonlari ile. Detay drawer'i acmak icin onClick'te onDetail.
export default function SimpleItemRow({ item, view, forecast, onAdjust, onCheckout, onDetail }) {
  const c = CATEGORIES.find(x => x.key === item.category)
  const isOut = item.quantity <= 0
  const isLow = !isOut && item.quantity <= item.reorder_threshold
  const value = (item.quantity || 0) * (item.unit_price || 0)
  const stockColor = isOut ? 'var(--red)' : isLow ? 'var(--accent)' : 'var(--text)'
  const stockBg = isOut ? 'rgba(239,68,68,.06)' : isLow ? 'rgba(240,165,0,.04)' : 'transparent'

  function badge(text, color, bg) {
    return (
      <span style={{
        padding: '2px 8px', fontSize: 10, borderRadius: 10, fontFamily: 'var(--mono)',
        background: bg, color, border: `1px solid ${color}44`, letterSpacing: 1,
      }}>{text}</span>
    )
  }

  if (view === 'cards') {
    return (
      <div
        onClick={onDetail}
        style={{
          padding: 14, borderRadius: 10, cursor: 'pointer',
          background: stockBg, border: `1px solid ${isOut ? 'var(--red)' : isLow ? 'rgba(240,165,0,.4)' : 'var(--border)'}`,
          display: 'flex', flexDirection: 'column', gap: 8,
          transition: 'transform 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ color: c?.color || 'var(--text3)' }}>{c?.icon || '▨'}</span>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>{item.item_name}</strong>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>
              {c?.label || '-'} · {item.location || '—'}
            </div>
          </div>
          {isOut ? badge('STOK YOK', 'var(--red)', 'rgba(239,68,68,.15)')
            : isLow ? badge('YETERSIZ', 'var(--accent)', 'rgba(240,165,0,.15)')
            : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: stockColor, lineHeight: 1, fontFamily: 'var(--mono)' }}>
            {item.quantity}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{item.unit}</div>
          {item.reorder_threshold > 0 && (
            <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              Eşik: {item.reorder_threshold}
            </div>
          )}
        </div>

        {forecast && (
          <div style={{ fontSize: 10, color: forecast.severity === 'critical' ? 'var(--red)' : 'var(--accent)', fontFamily: 'var(--mono)' }}>
            ⌛ ~{forecast.days_left} gün
          </div>
        )}

        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onAdjust(item, '+')} className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--green)' }}>+ Stok</button>
          <button onClick={() => onCheckout(item)} className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--red)' }}>− Çıkış</button>
        </div>
      </div>
    )
  }

  // table row
  return (
    <tr
      onClick={onDetail}
      style={{
        borderTop: '1px solid var(--border)', background: stockBg, cursor: 'pointer',
      }}
    >
      <td style={{ padding: '8px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: c?.color || 'var(--text3)' }}>{c?.icon || '▨'}</span>
          <strong>{item.item_name}</strong>
          {isOut && badge('YOK', 'var(--red)', 'rgba(239,68,68,.15)')}
          {isLow && !isOut && badge('AZ', 'var(--accent)', 'rgba(240,165,0,.15)')}
        </div>
      </td>
      <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text2)' }}>{c?.label || '-'}</td>
      <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{item.location || '—'}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: stockColor }}>
        {item.quantity} <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>{item.unit}</span>
      </td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
        {item.reorder_threshold > 0 ? item.reorder_threshold : '—'}
      </td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
        {value > 0 ? Math.round(value).toLocaleString('tr-TR') + ' ₺' : '—'}
      </td>
      <td style={{ padding: '8px 10px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <button onClick={() => onAdjust(item, '+')} title="Stok ekle" style={iconBtn('var(--green)')}>+</button>
          <button onClick={() => onCheckout(item)} title="Çıkış yap" style={iconBtn('var(--red)')}>−</button>
          <button onClick={onDetail} title="Detay" style={iconBtn('var(--text3)')}>↗</button>
        </div>
      </td>
    </tr>
  )
}

function iconBtn(color) {
  return {
    width: 26, height: 26, padding: 0,
    background: 'var(--surface2)', border: `1px solid ${color}44`, borderRadius: 5,
    color, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }
}
