const STATUS_COLOR = {
  red: 'var(--red)',
  green: 'var(--green)',
  orange: 'var(--accent)',
  amber: 'var(--accent)',
  blue: 'var(--text)',
  purple: 'var(--text)',
  teal: 'var(--text)',
}

export default function KPICard({ icon, label, value, color = 'blue', subtitle, barPct, trend }) {
  // Sade dil: numara rengi yalnızca durum sinyali olduğunda renkli (red/green/amber),
  // diğer durumlarda normal metin rengi. Icon ve gradient yok.
  const numColor = STATUS_COLOR[color] || 'var(--text)'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '18px 18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
      aria-label={`${label} ${value}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {icon && (
          <span style={{ fontSize: '14px', opacity: 0.7, lineHeight: 1 }} aria-hidden>{icon}</span>
        )}
        <span style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 500 }}>{label}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
        <span style={{
          fontFamily: 'var(--sans)',
          fontSize: '32px',
          fontWeight: 600,
          lineHeight: 1,
          color: numColor,
        }}>
          {value}
        </span>
        {trend && (
          <span style={{ fontSize: '11px', fontWeight: 600, color: trend === 'up' ? 'var(--green)' : 'var(--red)' }}>
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>

      {subtitle && (
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
          {subtitle}
        </div>
      )}

      {barPct !== undefined && (
        <div style={{ marginTop: '10px', height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(barPct, 100)}%`,
            height: '100%',
            background: numColor,
            transition: 'width .4s ease',
          }} />
        </div>
      )}
    </div>
  )
}
