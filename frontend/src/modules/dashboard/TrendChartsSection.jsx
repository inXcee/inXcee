import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import TrendCard from './TrendCard.jsx'

const DAYS_OPTIONS = [
  { label: '7G', value: 7 },
  { label: '30G', value: 30 },
  { label: '90G', value: 90 },
]

const METRICS = ['occupancy', 'sla', 'housekeeping', 'checkins']

export default function TrendChartsSection() {
  const [days, setDays] = useState(30)

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

        {/* Days toggle */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface2)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          {DAYS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              style={{
                padding: '4px 12px',
                borderRadius: '5px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: '10px',
                letterSpacing: '1px',
                background: days === opt.value ? 'var(--surface4, var(--surface3))' : 'transparent',
                color: days === opt.value ? 'var(--text)' : 'var(--text3)',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
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
