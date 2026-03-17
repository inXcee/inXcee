const COLOR_MAP = {
  orange: { accent: 'var(--accent)',  bg: 'rgba(240,165,0,.08)',   grad: 'linear-gradient(90deg,var(--accent),var(--accent3))' },
  amber:  { accent: 'var(--accent)',  bg: 'rgba(240,165,0,.08)',   grad: 'linear-gradient(90deg,var(--accent),var(--accent3))' },
  red:    { accent: 'var(--red)',     bg: 'rgba(231,76,60,.08)',   grad: 'linear-gradient(90deg,var(--red),var(--red2))' },
  green:  { accent: 'var(--green)',   bg: 'rgba(39,201,106,.08)',  grad: 'linear-gradient(90deg,var(--green),var(--teal))' },
  blue:   { accent: 'var(--blue)',    bg: 'rgba(59,140,240,.08)',  grad: 'linear-gradient(90deg,var(--blue),var(--purple))' },
  purple: { accent: 'var(--purple)',  bg: 'rgba(155,89,182,.08)',  grad: 'linear-gradient(90deg,var(--purple),var(--blue))' },
}

export default function KPICard({ icon, label, value, color = 'orange', subtitle, barPct, trend }) {
  const c = COLOR_MAP[color] || COLOR_MAP.orange
  const progClass = color === 'red' ? 'prog-red' : color === 'green' ? 'prog-green' : color === 'blue' ? 'prog-blue' : 'prog-amber'

  return (
    <div
      className="kpi-card"
      style={{
        background: 'var(--surface)',
        padding: '20px',
        borderRadius: '10px',
        border: '1px solid var(--border)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.2s',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Top accent border */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '2px',
        background: c.grad,
      }} />

      {/* Icon */}
      <div style={{
        width: '32px', height: '32px',
        borderRadius: '7px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '15px',
        marginBottom: '14px',
        background: c.bg,
      }}>
        {icon}
      </div>

      {/* Value row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', marginBottom: '4px' }}>
        <div style={{
          fontFamily: 'var(--display)',
          fontSize: '40px',
          lineHeight: 1,
          color: c.accent,
          letterSpacing: '1px',
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

      {/* Label */}
      <div style={{
        fontFamily: 'var(--mono)', fontSize: '9px',
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
        <div className="prog-bar" style={{ marginTop: '12px' }}>
          <div className={`prog-fill ${progClass}`} style={{ width: `${Math.min(barPct, 100)}%` }} />
        </div>
      )}
    </div>
  )
}
