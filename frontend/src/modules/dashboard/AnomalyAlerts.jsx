import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import DashCard from './DashCard.jsx'

function AlertRow({ severity, title, detail, action_path }) {
  const navigate = useNavigate()
  const isCritical = severity === 'critical'
  const color = isCritical ? 'var(--red)' : 'var(--accent)'

  return (
    <div
      onClick={() => action_path && navigate(action_path)}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 14px',
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: '8px',
        cursor: action_path ? 'pointer' : 'default',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (action_path) e.currentTarget.style.background = 'var(--surface3)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500, marginBottom: '2px' }}>
          {title}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
          {detail}
        </div>
      </div>
      {action_path && (
        <div style={{ fontSize: '12px', color, flexShrink: 0 }}>
          →
        </div>
      )}
    </div>
  )
}

export default function AnomalyAlerts() {
  const { data } = useQuery({
    queryKey: ['dashboard-anomalies'],
    queryFn: () => api.get('/dashboard/anomalies').then(r => r.data),
    refetchInterval: 120000,
  })

  const anomalies = data?.anomalies ?? []
  if (anomalies.length === 0) return null

  return (
    <DashCard
      title="Anomali uyarıları"
      action={<span style={{ fontSize: '11px', color: 'var(--text3)' }}>{anomalies.length} kayıt</span>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {anomalies.map(a => (
          <AlertRow key={a.id} {...a} />
        ))}
      </div>
    </DashCard>
  )
}
