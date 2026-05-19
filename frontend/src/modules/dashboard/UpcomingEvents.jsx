import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import DashCard from './DashCard.jsx'

function daysUntil(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

function EventRow({ days, title, sub, onClick, isLast }) {
  const isOverdue = days != null && days < 0
  const isUrgent = days != null && days >= 0 && days <= 2
  const sigColor = isOverdue ? 'var(--red)' : isUrgent ? 'var(--accent)' : 'var(--text2)'
  const bgChip = isOverdue
    ? 'color-mix(in srgb, var(--red) 12%, transparent)'
    : isUrgent
    ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
    : 'var(--surface2)'
  const dayLabel = days == null ? '—' : days < 0 ? `${Math.abs(days)}g geçti` : days === 0 ? 'Bugün' : `${days} gün`

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 6px',
        margin: '0 -6px',
        borderRadius: '8px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        minWidth: '68px', textAlign: 'center',
        padding: '6px 8px', borderRadius: '8px',
        background: bgChip,
        fontSize: '11px', fontWeight: 700,
        color: sigColor, letterSpacing: '-0.005em',
      }}>
        {dayLabel}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.005em' }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          onClick: () => navigate('/maintenance'),
        })
      }
    }
  }

  events.sort((a, b) => (a.days ?? 999) - (b.days ?? 999))
  const top = events.slice(0, 5)

  return (
    <DashCard title="Yaklaşan etkinlikler">
      {top.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' }}>
          Önümüzdeki 7 günde etkinlik yok
        </div>
      ) : top.map((ev, i) => (
        <EventRow key={ev.key} {...ev} isLast={i === top.length - 1} />
      ))}
    </DashCard>
  )
}
