import { useState } from 'react'
import { cardShadow, cardShadowHover } from './dashStyles.js'

const STATUS_COLOR = {
  red: 'var(--red)',
  green: 'var(--green)',
  orange: 'var(--accent)',
  amber: 'var(--accent)',
  blue: 'var(--text)',
  purple: 'var(--text)',
  teal: 'var(--text)',
}

const STATUS_DOT = {
  red: 'var(--red)',
  green: 'var(--green)',
  orange: 'var(--accent)',
  amber: 'var(--accent)',
}

export default function KPICard({ label, value, color = 'blue', subtitle, barPct, trend, delta, onClick }) {
  const [hover, setHover] = useState(false)
  const numColor = STATUS_COLOR[color] || 'var(--text)'
  const dotColor = STATUS_DOT[color] // sadece status renkleri (red/green/accent) için
  const isStatus = !!dotColor

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderColor: hover ? 'var(--border2)' : 'var(--border)',
        borderRadius: '14px',
        padding: '20px 20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        boxShadow: hover ? cardShadowHover : cardShadow,
        transform: hover ? 'translateY(-1px)' : 'none',
        transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
      }}
      aria-label={`${label} ${value}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isStatus && (
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: dotColor, boxShadow: `0 0 0 3px ${dotColor}1a`,
            display: 'inline-block', flexShrink: 0,
          }} aria-hidden />
        )}
        <span style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 500, letterSpacing: '-0.005em' }}>{label}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{
          fontFamily: 'var(--sans)',
          fontSize: '38px',
          fontWeight: 700,
          lineHeight: 1,
          color: numColor,
          letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </span>
        {trend && (
          <span style={{
            fontSize: '12px', fontWeight: 700,
            color: trend === 'up' ? 'var(--green)' : 'var(--red)',
            letterSpacing: '-0.01em',
          }}>
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
        {delta != null && delta !== 0 && (
          <span title="7 güne göre" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', letterSpacing: '-0.01em' }}>
            {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}
          </span>
        )}
      </div>

      {subtitle && (
        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
          {subtitle}
        </div>
      )}

      {barPct !== undefined && (
        <div style={{ marginTop: '4px', height: '4px', background: 'var(--surface3)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(barPct, 100)}%`,
            height: '100%',
            background: numColor,
            borderRadius: '2px',
            transition: 'width .5s ease',
          }} />
        </div>
      )}
    </div>
  )
}
