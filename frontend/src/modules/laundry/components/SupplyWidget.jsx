import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function SupplyWidget({ onNavigateSettings }) {
  const { data: alerts = [] } = useQuery({
    queryKey: ['supply-alerts'],
    queryFn: () => laundryApi.getSupplyAlerts(),
    refetchInterval: 60_000,
  })

  if (alerts.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 0', marginBottom: 4 }}>
      {alerts.map(s => (
        <button
          key={s.id}
          onClick={onNavigateSettings}
          title={`${s.name}: ${s.current_stock} ${s.unit} — Stok Ayarlarına Git`}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: s.alert_level === 'critical' ? 'var(--red)' : 'var(--amber, #f0a500)',
            color: s.alert_level === 'critical' ? '#fff' : '#000',
            border: 'none', borderRadius: 4, padding: '3px 8px',
            fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <span>{s.alert_level === 'critical' ? '🔴' : '🟡'}</span>
          <span>{s.name}: {s.current_stock} {s.unit}</span>
        </button>
      ))}
    </div>
  )
}
