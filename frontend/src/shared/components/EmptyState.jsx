export default function EmptyState({ icon = '∅', title = 'Kayıt yok', hint, action }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '48px 16px', textAlign: 'center', color: 'var(--text3)',
    }}>
      <div style={{ fontSize: 40, opacity: 0.4, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text2)', letterSpacing: 2, marginBottom: 6 }}>
        {title}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 380, lineHeight: 1.5, marginBottom: 16 }}>
          {hint}
        </div>
      )}
      {action}
    </div>
  )
}

export function Skeleton({ width = '100%', height = 16, style }) {
  return (
    <div
      style={{
        width, height,
        background: 'linear-gradient(90deg, var(--surface2) 25%, var(--surface3) 50%, var(--surface2) 75%)',
        backgroundSize: '200% 100%',
        borderRadius: 4,
        animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

export function SkeletonRows({ count = 5, columns = 4 }) {
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} height={14} />
          ))}
        </div>
      ))}
    </div>
  )
}
