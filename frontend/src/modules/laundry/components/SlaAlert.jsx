export default function SlaAlert({ violations = [] }) {
  if (!violations.length) return null

  const criticalCount = violations.filter(v => v.sla_level === 'critical').length
  const warningCount = violations.length - criticalCount

  return (
    <div className={criticalCount > 0 ? 'alert alert-danger' : 'alert alert-warn'}
      style={{ marginBottom: 12 }}>
      <div className="live-dot" style={{ marginTop: 4, background: criticalCount > 0 ? 'var(--red)' : 'var(--accent)', boxShadow: criticalCount > 0 ? '0 0 8px var(--red)' : '0 0 8px var(--accent)' }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 12 }}>
          {criticalCount > 0 && `${criticalCount} KRİTİK`}
          {criticalCount > 0 && warningCount > 0 && ' · '}
          {warningCount > 0 && `${warningCount} uyarı`}
          {' '}SLA ihlali
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, marginTop: 3, opacity: 0.7 }}>
          {violations.slice(0, 3).map(v =>
            `${v.block || '?'} ${v.room_no || '?'} (${v.hours_in_status}s)`
          ).join(' · ')}
          {violations.length > 3 && ` +${violations.length - 3} daha`}
        </div>
      </div>
    </div>
  )
}
