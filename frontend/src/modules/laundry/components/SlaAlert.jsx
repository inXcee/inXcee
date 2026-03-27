import { useState } from 'react'

export default function SlaAlert({ violations = [] }) {
  const [expanded, setExpanded] = useState(false)
  if (!violations.length) return null

  const critical = violations.filter(v => v.sla_level === 'critical')
  const warnings = violations.filter(v => v.sla_level !== 'critical')
  const isCrit = critical.length > 0
  const color = isCrit ? 'var(--red)' : 'var(--accent)'
  const bg    = isCrit ? 'rgba(231,76,60,0.07)' : 'rgba(240,165,0,0.07)'
  const border = isCrit ? 'rgba(231,76,60,0.2)' : 'rgba(240,165,0,0.2)'

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 10,
      marginBottom: 14, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <span className="live-dot" style={{
          background: color,
          boxShadow: `0 0 8px ${color}`,
          flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color,
          }}>
            {isCrit && `${critical.length} KRİTİK`}
            {isCrit && warnings.length > 0 && ' · '}
            {warnings.length > 0 && `${warnings.length} UYARI`}
            {' '}— SLA İHLALİ
          </span>
          {!expanded && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: `${color}aa`,
              marginLeft: 10,
            }}>
              {violations.slice(0, 2).map(v => `${v.block || '?'}·${v.room_no || '?'}`).join('  ')}
              {violations.length > 2 && ` +${violations.length - 2}`}
            </span>
          )}
        </div>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9, color,
          transition: 'transform 0.2s',
          transform: expanded ? 'rotate(180deg)' : 'none',
          display: 'inline-block',
        }}>▾</span>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${border}` }}>
          {violations.map((v, i) => {
            const vc = v.sla_level === 'critical' ? 'var(--red)' : 'var(--accent)'
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 14px',
                borderBottom: i < violations.length - 1 ? `1px solid ${border}` : 'none',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: vc, flexShrink: 0,
                }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text)', flex: '0 0 80px' }}>
                  {v.block || '?'} · {v.room_no || '?'}
                </span>
                <span style={{
                  flex: 1, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)',
                }}>
                  {v.item_count} parça · {v.status}
                </span>
                <span style={{
                  fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 1, color: vc,
                }}>
                  {v.hours_in_status}s
                </span>
                <span className={`badge ${v.sla_level === 'critical' ? 'badge-red' : 'badge-amber'}`}
                  style={{ fontSize: 8 }}>
                  {v.sla_level === 'critical' ? 'KRİTİK' : 'UYARI'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
