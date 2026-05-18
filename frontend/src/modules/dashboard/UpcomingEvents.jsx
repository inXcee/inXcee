import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

function daysUntil(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

function EventRow({ date, days, title, sub, color, onClick }) {
  const isOverdue = days != null && days < 0
  const isUrgent = days != null && days >= 0 && days <= 2
  const dayColor = isOverdue ? 'var(--red)' : isUrgent ? 'var(--accent)' : color
  const dayLabel = days == null ? '—' : days < 0 ? `${Math.abs(days)} gün geçti` : days === 0 ? 'BUGÜN' : `${days} gün`

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 14px', borderBottom: '1px solid rgba(35,45,63,.3)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'rgba(255,255,255,.02)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        minWidth: '50px', padding: '6px 8px',
        background: `color-mix(in srgb, ${dayColor} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${dayColor} 25%, transparent)`,
        borderRadius: '6px', textAlign: 'center',
      }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '8.5px', color: dayColor, letterSpacing: '1px', fontWeight: 600 }}>
          {dayLabel}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 500, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

export default function UpcomingEvents() {
  const navigate = useNavigate()

  const { data: drillStats } = useQuery({
    queryKey: ['upcoming-drills'],
    queryFn: () => api.get('/drills/stats').then(r => r.data).catch(() => null),
    refetchInterval: 5 * 60 * 1000,
  })
  const { data: expiring = [] } = useQuery({
    queryKey: ['upcoming-companies'],
    queryFn: () => api.get('/companies/expiring?days=30').then(r => r.data).catch(() => []),
    refetchInterval: 5 * 60 * 1000,
  })
  const { data: openMaint = [] } = useQuery({
    queryKey: ['upcoming-sla'],
    queryFn: () => api.get('/maintenance/requests?status=open').then(r => r.data).catch(() => []),
    refetchInterval: 60 * 1000,
  })

  const events = []

  if (drillStats?.upcoming) {
    events.push({
      key: 'drill',
      days: daysUntil(drillStats.upcoming),
      title: 'Sonraki tatbikat',
      sub: drillStats.upcoming,
      color: 'var(--purple)',
      onClick: () => navigate('/settings/drills'),
    })
  }

  for (const c of expiring) {
    if (c.days_left != null && c.days_left <= 7) {
      events.push({
        key: `co-${c.id}`,
        days: c.days_left,
        title: `${c.name} sözleşmesi bitiyor`,
        sub: c.contract_end || '—',
        color: 'var(--purple)',
        onClick: () => navigate('/settings/companies'),
      })
    }
  }

  for (const r of openMaint) {
    if (r.sla_deadline) {
      const d = daysUntil(r.sla_deadline)
      if (d != null && d <= 7) {
        events.push({
          key: `sla-${r.id}`,
          days: d,
          title: `SLA: ${(r.description || '').slice(0, 40)}`,
          sub: r.location,
          color: 'var(--red)',
          onClick: () => navigate('/maintenance'),
        })
      }
    }
  }

  events.sort((a, b) => (a.days ?? 999) - (b.days ?? 999))
  const top = events.slice(0, 5)

  return (
    <div className="panel card-glass cat-stripe cat-stripe-finance">
      <div className="panel-header">
        <div>
          <div className="panel-title">YAKLAŞAN ETKİNLİKLER</div>
          <div className="panel-subtitle">ÖNÜMÜZDEKİ 7 GÜN</div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {top.length === 0 ? (
          <div style={{ padding: '24px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', color: 'var(--text3)', marginBottom: '6px' }}>—</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px' }}>
              YAKLAŞAN ETKİNLİK YOK
            </div>
          </div>
        ) : top.map(ev => (
          <EventRow key={ev.key} {...ev} />
        ))}
      </div>
    </div>
  )
}
