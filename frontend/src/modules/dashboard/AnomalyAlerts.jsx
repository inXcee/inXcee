import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

function AlertRow({ severity, title, detail, action_path }) {
  const navigate = useNavigate()
  const isCritical = severity === 'critical'
  const color = isCritical ? 'var(--red)' : 'var(--accent)'
  const bg = isCritical ? 'rgba(231,76,60,.08)' : 'rgba(240,165,0,.08)'
  const border = isCritical ? 'rgba(231,76,60,.25)' : 'rgba(240,165,0,.25)'

  return (
    <div
      onClick={() => action_path && navigate(action_path)}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '12px 16px',
        background: bg, border: `1px solid ${border}`,
        borderRadius: '10px',
        cursor: action_path ? 'pointer' : 'default',
        transition: 'transform .15s, box-shadow .15s',
      }}
      onMouseEnter={e => { if (action_path) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${border}` } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{
        width: '32px', height: '32px', borderRadius: '8px',
        background: color, color: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--display)', fontSize: '20px', fontWeight: 700,
        flexShrink: 0,
      }}>!</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600, marginBottom: '2px' }}>
          {title}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
          {detail}
        </div>
      </div>
      {action_path && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color, letterSpacing: '1px', flexShrink: 0 }}>
          İNCELE →
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
    <div className="panel card-glass cat-stripe cat-stripe-alert">
      <div className="panel-header">
        <div>
          <div className="panel-title">ANOMALİ UYARILARI</div>
          <div className="panel-subtitle">OTOMATIK TESPIT · {anomalies.length} KAYIT</div>
        </div>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {anomalies.map(a => (
          <AlertRow key={a.id} {...a} />
        ))}
      </div>
    </div>
  )
}
