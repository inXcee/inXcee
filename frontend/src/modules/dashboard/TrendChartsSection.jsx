import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import TrendCard from './TrendCard.jsx'

const METRICS = ['occupancy', 'sla', 'housekeeping', 'checkins']

export default function TrendChartsSection({ days = 30, label }) {
  const { data, isLoading } = useQuery({
    queryKey: ['trends', days],
    queryFn: () => api.get(`/dashboard/trends?days=${days}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
          Trendler
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
          {label || `Son ${days} gün`}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', fontSize: '12px', color: 'var(--text3)' }}>
          Yükleniyor…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
          {METRICS.map(metric => (
            <TrendCard key={metric} metric={metric} data={data?.[metric]} />
          ))}
        </div>
      )}
    </div>
  )
}
