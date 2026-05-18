const COLOR_MAP = {
  orange: { accent: 'var(--accent)',  bg: 'rgba(240,165,0,.10)',  cat: 'personnel' },
  amber:  { accent: 'var(--accent)',  bg: 'rgba(240,165,0,.10)',  cat: 'personnel' },
  red:    { accent: 'var(--red)',     bg: 'rgba(231,76,60,.10)',  cat: 'maintenance' },
  green:  { accent: 'var(--green)',   bg: 'rgba(39,201,106,.10)', cat: 'housekeeping' },
  blue:   { accent: 'var(--blue)',    bg: 'rgba(59,140,240,.10)', cat: 'occupancy' },
  purple: { accent: 'var(--purple)',  bg: 'rgba(155,89,182,.10)', cat: 'finance' },
  teal:   { accent: 'var(--teal)',    bg: 'rgba(26,188,156,.10)', cat: 'health' },
}

export default function KPICard({ icon, label, value, color = 'orange', subtitle, barPct, trend, category }) {
  const c = COLOR_MAP[color] || COLOR_MAP.orange
  const catName = category || c.cat
  const progClass = color === 'red' ? 'prog-red' : color === 'green' ? 'prog-green' : color === 'blue' ? 'prog-blue' : 'prog-amber'

  return (
    <div
      className={`kpi-card card-glass cat-stripe cat-stripe-${catName}`}
      style={{ padding: '22px 20px 20px', transition: 'all .2s' }}
      aria-label={`${label} ${value}`}
    >
      <div style={{
        width: '34px', height: '34px',
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px',
        marginBottom: '14px',
        background: c.bg,
      }}>
        {icon}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', marginBottom: '4px' }}>
        <div style={{
          fontFamily: 'var(--display)', fontSize: '44px', lineHeight: 1,
          color: c.accent, letterSpacing: '1px',
        }}>
          {value}
        </div>
        {trend && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
            color: trend === 'up' ? 'var(--green)' : 'var(--red)',
            marginBottom: '6px',
          }}>
            {trend === 'up' ? '▲' : '▼'}
          </span>
        )}
      </div>

      <div style={{
        fontFamily: 'var(--mono)', fontSize: '10px',
        color: 'var(--text3)', letterSpacing: '2px', textTransform: 'uppercase',
      }}>
        {label}
      </div>

      {subtitle && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', marginTop: '4px' }}>
          {subtitle}
        </div>
      )}

      {barPct !== undefined && (
        <div className="prog-bar" style={{ marginTop: '14px' }}>
          <div className={`prog-fill ${progClass}`} style={{ width: `${Math.min(barPct, 100)}%` }} />
        </div>
      )}
    </div>
  )
}
