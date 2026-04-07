import { useState } from 'react'

export default function SlaAlert({ violations = [], preWarnings = [] }) {
  const [expanded, setExpanded] = useState(false)
  const [preExpanded, setPreExpanded] = useState(false)

  const critical = violations.filter(v => v.sla_level === 'critical')
  const warnings  = violations.filter(v => v.sla_level !== 'critical')
  const isCrit    = critical.length > 0
  const color     = isCrit ? 'var(--red)' : 'var(--accent)'
  const bg        = isCrit ? 'rgba(231,76,60,0.07)' : 'rgba(240,165,0,0.07)'
  const border    = isCrit ? 'rgba(231,76,60,0.2)' : 'rgba(240,165,0,0.2)'

  return (
    <>
      {/* Pre-warning banner — SLA yaklaşıyor */}
      {preWarnings.length > 0 && (
        <div style={{
          background: 'rgba(251,146,60,0.07)', border: '1px solid rgba(251,146,60,0.2)',
          borderRadius: 10, marginBottom: 8, overflow: 'hidden',
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setPreExpanded(e => !e)}
          >
            <span style={{ fontSize: 9, flexShrink: 0 }}>⚠️</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#fb923c', flex: 1 }}>
              {preWarnings.length} kayıt SLA'ya yaklaşıyor
            </span>
            {!preExpanded && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(251,146,60,0.7)' }}>
                {preWarnings.slice(0,2).map(v => `${v.block||'?'}·${v.room_no||'?'}`).join('  ')}
                {preWarnings.length > 2 && ` +${preWarnings.length-2}`}
              </span>
            )}
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: '#fb923c',
              transition: 'transform 0.2s', transform: preExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block',
            }}>▾</span>
          </div>
          {preExpanded && (
            <div style={{ borderTop: '1px solid rgba(251,146,60,0.2)' }}>
              {preWarnings.map((v, i) => {
                const hoursLeft = v.warning_hours != null
                  ? Math.round((v.warning_hours - v.hours_in_status) * 10) / 10
                  : '?'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px',
                    borderBottom: i < preWarnings.length - 1 ? '1px solid rgba(251,146,60,0.15)' : 'none',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fb923c', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text)', flex: '0 0 80px' }}>
                      {v.block||'?'} · {v.room_no||'?'}
                    </span>
                    <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)' }}>
                      {v.item_count} parça · {v.status}
                    </span>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 1, color: '#fb923c' }}>
                      {hoursLeft}s kaldı
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Mevcut violations banner */}
      {violations.length > 0 && (
        <div style={{
          background: bg, border: `1px solid ${border}`, borderRadius: 10,
          marginBottom: 14, overflow: 'hidden',
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setExpanded(e => !e)}
          >
            <span className="live-dot" style={{ background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color }}>
                {isCrit && `${critical.length} KRİTİK`}
                {isCrit && warnings.length > 0 && ' · '}
                {warnings.length > 0 && `${warnings.length} UYARI`}
                {' '}— SLA İHLALİ
              </span>
              {!expanded && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: `${color}aa`, marginLeft: 10 }}>
                  {violations.slice(0,2).map(v => `${v.block||'?'}·${v.room_no||'?'}`).join('  ')}
                  {violations.length > 2 && ` +${violations.length-2}`}
                </span>
              )}
            </div>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color,
              transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block',
            }}>▾</span>
          </div>
          {expanded && (
            <div style={{ borderTop: `1px solid ${border}` }}>
              {violations.map((v, i) => {
                const vc = v.sla_level === 'critical' ? 'var(--red)' : 'var(--accent)'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
                    borderBottom: i < violations.length - 1 ? `1px solid ${border}` : 'none',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: vc, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text)', flex: '0 0 80px' }}>
                      {v.block||'?'} · {v.room_no||'?'}
                    </span>
                    <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)' }}>
                      {v.item_count} parça · {v.status}
                    </span>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 1, color: vc }}>
                      {v.hours_in_status}s
                    </span>
                    <span className={`badge ${v.sla_level === 'critical' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: 8 }}>
                      {v.sla_level === 'critical' ? 'KRİTİK' : 'UYARI'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
