// Yapıyı koruyan loading placeholder'lar — spinner'a göre algılanan hız 2x.
// CSS animasyonu inline keyframe ile (Tailwind/keyframe import yok).

const SHIMMER_BG = 'linear-gradient(90deg, var(--surface) 0%, var(--surface2, #2a2a2a) 50%, var(--surface) 100%)'

const baseStyle = {
  background: SHIMMER_BG,
  backgroundSize: '200% 100%',
  animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
  borderRadius: 6,
  display: 'block',
}

// Tek ortak <style> — keyframe sayfa başına bir kez yeterli.
// React style-tag her render'da reconcile eder; idempotent çünkü içerik sabit.
function ShimmerStyle() {
  return (
    <style>{`
      @keyframes skeleton-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `}</style>
  )
}

export function SkeletonText({ width = '100%', height = 14, style }) {
  return (
    <>
      <ShimmerStyle />
      <span style={{ ...baseStyle, width, height, ...style }} />
    </>
  )
}

export function SkeletonBlock({ width = '100%', height = 80, style }) {
  return (
    <>
      <ShimmerStyle />
      <div style={{ ...baseStyle, width, height, borderRadius: 10, ...style }} />
    </>
  )
}

// Liste/grid kartı placeholder'ı (personnel, companies vs.)
export function SkeletonCard({ lines = 3, style }) {
  return (
    <>
      <ShimmerStyle />
      <div style={{
        padding: 14, borderRadius: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 8,
        ...style,
      }}>
        <span style={{ ...baseStyle, width: '60%', height: 16 }} />
        {Array.from({ length: lines - 1 }).map((_, i) => (
          <span key={i} style={{ ...baseStyle, width: `${85 - i * 10}%`, height: 11 }} />
        ))}
      </div>
    </>
  )
}

// Çoklu kart grid — tipik liste sayfası loading state
export function SkeletonGrid({ count = 8, minWidth = 280, lines = 3 }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
      gap: 10,
    }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} lines={lines} />)}
    </div>
  )
}

// Tablo placeholder'ı — kolon sayısı + satır sayısı
export function SkeletonTable({ rows = 8, cols = 5 }) {
  return (
    <>
      <ShimmerStyle />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
            {Array.from({ length: cols }).map((_, c) => (
              <span key={c} style={{ ...baseStyle, height: 12, opacity: 1 - r * 0.05 }} />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
