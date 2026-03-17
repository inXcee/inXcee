import { useNavigate } from 'react-router-dom'

function getStyle(block) {
  if (block.status === 'quarantine') return {
    accent: 'var(--blue)', grad: 'linear-gradient(90deg,var(--blue),var(--purple))',
    bg: 'rgba(59,140,240,.07)', border: 'rgba(59,140,240,.3)', bar: 'var(--blue)',
  }
  const pct = block.pct || 0
  if (pct > 95) return {
    accent: 'var(--red)', grad: 'linear-gradient(90deg,var(--red),var(--red2))',
    bg: 'rgba(231,76,60,.07)', border: 'rgba(231,76,60,.3)', bar: 'var(--red)',
  }
  if (pct > 80) return {
    accent: 'var(--accent2)', grad: 'linear-gradient(90deg,var(--accent2),var(--accent))',
    bg: 'rgba(224,92,42,.07)', border: 'rgba(224,92,42,.3)', bar: 'var(--accent2)',
  }
  if (pct >= 60) return {
    accent: 'var(--accent)', grad: 'linear-gradient(90deg,var(--accent),var(--accent3))',
    bg: 'rgba(240,165,0,.07)', border: 'rgba(240,165,0,.3)', bar: 'var(--accent)',
  }
  return {
    accent: 'var(--green)', grad: 'linear-gradient(90deg,var(--green),var(--teal))',
    bg: 'rgba(39,201,106,.07)', border: 'rgba(39,201,106,.25)', bar: 'var(--green)',
  }
}

function blockTag(name) {
  const isM = name.startsWith('M')
  return <span className={`tag tag-${isM ? 'm' : 's'}`}>{isM ? 'M' : 'S'}</span>
}

export default function HeatMap({ data = [] }) {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
      {data.map(block => {
        const s = getStyle(block)
        const isS2 = block.block === 'S2'
        const empty = (block.total_beds || 0) - (block.occupied || 0)
        return (
          <div
            key={block.block}
            className="heatmap-block"
            onClick={() => navigate(`/capacity?block=${block.block}`)}
            style={{
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: '10px',
              overflow: 'hidden',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            {/* Top accent line */}
            <div style={{ height: '2px', background: s.grad }} />

            <div style={{ padding: '14px 16px' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '2px', color: 'var(--text)' }}>
                  {block.block} BLOK
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {blockTag(block.block)}
                  {isS2 && <span className="tag tag-exc">İSTİSNA</span>}
                </div>
              </div>

              {/* 3-stat mini grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                {[
                  { label: 'TOPLAM', value: block.total_beds || 0, color: 'var(--text2)' },
                  { label: 'DOLU', value: block.occupied || 0, color: s.accent },
                  { label: 'BOŞ', value: empty, color: 'var(--green)' },
                ].map(stat => (
                  <div key={stat.label} style={{
                    background: 'rgba(0,0,0,.2)', borderRadius: '5px', padding: '6px 4px', textAlign: 'center',
                  }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '2px' }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Pct label */}
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '6px', textAlign: 'right' }}>
                %{block.pct ?? 0} DOLU
              </div>

              {/* Occupancy bar */}
              <div className="prog-bar">
                <div style={{ height: '100%', width: `${Math.min(block.pct || 0, 100)}%`, background: s.bar, borderRadius: '2px', transition: 'width 1s ease' }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
