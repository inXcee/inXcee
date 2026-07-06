// Küçük alan-grafiği (son N gün doluluk trendi). points: [{ date, occupancy_pct }]
export default function Sparkline({ points, color, width = 300, height = 40 }) {
  if (!points || points.length < 2) return null
  const maxPct = Math.max(...points.map(p => p.occupancy_pct), 100)
  const minPct = Math.min(...points.map(p => p.occupancy_pct), 0)
  const range = Math.max(1, maxPct - minPct)
  const pad = 4
  const pathData = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (width - pad * 2)
    const y = height - pad - ((p.occupancy_pct - minPct) / range) * (height - pad * 2)
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  const areaData = `${pathData} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ display: 'block' }}>
      <path d={areaData} fill={color} opacity="0.15" />
      <path d={pathData} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => {
        const x = pad + (i / (points.length - 1)) * (width - pad * 2)
        const y = height - pad - ((p.occupancy_pct - minPct) / range) * (height - pad * 2)
        return <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 3 : 1.5}
          fill={color} stroke="var(--surface2)" strokeWidth={i === points.length - 1 ? 1.5 : 0.5}>
          <title>{p.date}: %{p.occupancy_pct}</title>
        </circle>
      })}
    </svg>
  )
}
