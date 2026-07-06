import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import DashCard from './DashCard.jsx'
import { SkeletonBlock } from '../../shared/components/Skeleton.jsx'

function Gauge({ score, color }) {
  const radius = 56
  const cx = 70, cy = 70
  const startAngle = Math.PI
  const endAngle = 2 * Math.PI
  const progressAngle = startAngle + (endAngle - startAngle) * (score / 100)

  const arcPath = (start, end) => {
    const x1 = cx + radius * Math.cos(start)
    const y1 = cy + radius * Math.sin(start)
    const x2 = cx + radius * Math.cos(end)
    const y2 = cy + radius * Math.sin(end)
    const largeArc = end - start > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`
  }

  return (
    <svg viewBox="0 0 140 90" width="100%" style={{ maxHeight: '100px' }}>
      <path d={arcPath(startAngle, endAngle)} stroke="var(--border)" strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d={arcPath(startAngle, progressAngle)} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function BreakdownBar({ label, value, weight }) {
  const color = value >= 80 ? 'var(--green)' : value >= 60 ? 'var(--accent)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text2)', minWidth: '70px' }}>
        {label}
      </div>
      <div style={{ flex: 1, height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, transition: 'width .4s ease' }} />
      </div>
      <div style={{
        fontSize: '12px', color: 'var(--text)', minWidth: '26px', textAlign: 'right',
        fontWeight: 600, fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text4)', minWidth: '28px', textAlign: 'right' }}>
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
      <DashCard title="Sağlık skoru">
        <SkeletonBlock height={160} />
      </DashCard>
    )
  }

  const colorVar = data.color === 'green' ? 'var(--green)' : data.color === 'amber' ? 'var(--accent)' : 'var(--red)'

  // İsimleri sentence case'e çevir (DOLULUK → Doluluk)
  const breakdown = data.breakdown.map(b => ({
    ...b,
    label: b.label.charAt(0) + b.label.slice(1).toLocaleLowerCase('tr'),
  }))

  return (
    <DashCard title="Sağlık skoru">
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: '8px' }}>
        <Gauge score={data.score} color={colorVar} />
        <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--sans)', fontSize: '42px', fontWeight: 700, lineHeight: 1, color: colorVar,
            letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
          }}>
            {data.score}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
            / 100
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
        {breakdown.map(c => (
          <BreakdownBar key={c.label} {...c} />
        ))}
      </div>
    </DashCard>
  )
}
