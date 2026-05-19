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
    <div className="fade-up" style={{ marginTop: '24px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '3px', color: 'var(--text)' }}>
            TREND GRAFİKLERİ
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '2px' }}>
            MODÜL BAZLI PERFORMANS TRENDİ
          </div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px' }}>
          {label || `SON ${days} GÜN`}
        </div>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
          Yükleniyor...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {METRICS.map(metric => (
            <TrendCard key={metric} metric={metric} data={data?.[metric]} />
          ))}
        </div>
      )}
    </div>
  )
}
