const GARMENT_COLORS = {
  white: '#f8fafc', black: '#0f172a', gray: '#94a3b8', navy: '#1d4ed8',
  blue: '#3b82f6', red: '#dc2626', green: '#16a34a', yellow: '#ca8a04',
  orange: '#ea580c', purple: '#7c3aed', pink: '#db2777', brown: '#92400e', charcoal: '#4b5563',
}

const VARIANT_ACCENT = {
  ironing: '#a78bfa',
  deliver: '#fbbf24',
  default: '#60a5fa',
}

export default function GarmentChecklist({ garments, ticked, onToggle, variant = 'default' }) {
  if (!garments || garments.length === 0) return null

  const tickedCount = Object.values(ticked).filter(Boolean).length
  const allTicked = tickedCount === garments.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {garments.map((g, i) => {
        const colors = g.colors ?? (g.color ? [{ key: g.color, label: g.color_label || g.color }] : [])
        return (
          <div key={i} onClick={() => onToggle(i)}
            style={{
              background: ticked[i] ? '#052e16' : '#1e293b', borderRadius: 10, padding: '12px 14px',
              cursor: 'pointer', border: `1px solid ${ticked[i] ? '#22c55e' : '#334155'}`,
              transition: 'all 0.15s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: ticked[i] ? '#15803d' : '#0f172a',
                border: `2px solid ${ticked[i] ? '#22c55e' : '#475569'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 18, fontWeight: 700,
                transition: 'all 0.15s',
              }}>
                {ticked[i] ? '✓' : ''}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, color: ticked[i] ? '#86efac' : '#e2e8f0', fontWeight: 600 }}>
                  {g.emoji || '👔'} {g.type_name}
                  {g.count > 1 && (
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>× {g.count}</span>
                  )}
                </div>
              </div>
            </div>
            {(colors.length > 0 || (g.pattern && g.pattern !== 'solid')) && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, marginLeft: 44, flexWrap: 'wrap', alignItems: 'center' }}>
                {colors.map(c => (
                  <span key={c.key} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#0f172a', borderRadius: 20, padding: '3px 8px',
                    border: '1px solid #334155',
                  }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: GARMENT_COLORS[c.key] || '#888',
                      display: 'inline-block', flexShrink: 0,
                      border: c.key === 'white' ? '1px solid #475569' : 'none',
                    }} />
                    <span style={{ color: '#94a3b8', fontSize: 10 }}>{c.label}</span>
                  </span>
                ))}
                {g.pattern && g.pattern !== 'solid' && g.pattern_label && (
                  <span style={{
                    fontSize: 10, color: '#64748b',
                    background: '#0f172a', borderRadius: 20, padding: '3px 8px',
                    border: '1px solid #334155',
                  }}>
                    {g.pattern_label}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
      <div style={{
        fontSize: 12,
        color: allTicked ? '#22c55e' : (VARIANT_ACCENT[variant] || VARIANT_ACCENT.default),
        fontWeight: allTicked ? 700 : 400,
      }}>
        {allTicked ? '✓ Tümü doğrulandı' : `${tickedCount}/${garments.length} doğrulandı`}
      </div>
    </div>
  )
}
