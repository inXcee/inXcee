import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

function Gauge({ score, color }) {
  const radius = 56
  const cx = 70, cy = 70
  const startAngle = Math.PI            // 180° (sol)
  const endAngle = 2 * Math.PI          // 360° (sağ)
  const progressAngle = startAngle + (endAngle - startAngle) * (score / 100)

  const arcPath = (start, end) => {
    const x1 = cx + radius * Math.cos(start)
    const y1 = cy + radius * Math.sin(start)
    const x2 = cx + radius * Math.cos(end)
    const y2 = cy + radius * Math.sin(end)
    const largeArc = end - start > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`
  }

  const colorVar = color === 'green' ? 'var(--green)' : color === 'amber' ? 'var(--accent)' : 'var(--red)'

  return (
    <svg viewBox="0 0 140 90" width="100%" style={{ maxHeight: '110px' }}>
      <path d={arcPath(startAngle, endAngle)} stroke="var(--border)" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d={arcPath(startAngle, progressAngle)} stroke={colorVar} strokeWidth="10" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function BreakdownBar({ label, value, weight }) {
  const color = value >= 80 ? 'var(--green)' : value >= 60 ? 'var(--accent)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px', minWidth: '64px' }}>
        {label}
      </div>
      <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, transition: 'width .6s ease' }} />
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', minWidth: '28px', textAlign: 'right' }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '8.5px', color: 'var(--text4)', minWidth: '28px', textAlign: 'right' }}>
        ×{weight.toFixed(2)}
      </div>
    </div>
  )
}

export default function HealthScoreWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-health'],
    queryFn: () => api.get('/dashboard/health').then(r => r.data),
    refetchInterval: 60000,
  })

  if (isLoading || !data) {
    return (
      <div className="panel card-glass cat-stripe cat-stripe-health" style={{ minHeight: '280px' }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">SAĞLIK SKORU</div>
            <div className="panel-subtitle">SİSTEM GENEL DURUMU</div>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '160px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>Yükleniyor…</div>
        </div>
      </div>
    )
  }

  const colorVar = data.color === 'green' ? 'var(--green)' : data.color === 'amber' ? 'var(--accent)' : 'var(--red)'

  return (
    <div className="panel card-glass cat-stripe cat-stripe-health">
      <div className="panel-header">
        <div>
          <div className="panel-title">SAĞLIK SKORU</div>
          <div className="panel-subtitle">SİSTEM GENEL DURUMU</div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: '18px 20px' }}>
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: '12px' }}>
          <Gauge score={data.score} color={data.color} />
          <div style={{
            position: 'absolute', top: '40%', left: 0, right: 0, textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '44px', lineHeight: 1, color: colorVar, letterSpacing: '1px' }}>
              {data.score}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '2px', marginTop: '2px' }}>
              / 100
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          {data.breakdown.map(c => (
            <BreakdownBar key={c.label} {...c} />
          ))}
        </div>
      </div>
    </div>
  )
}
