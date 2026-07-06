// Panel yükleme placeholder'ı. props: rows=3
export default function KioskSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-slate-900 rounded-2xl p-5 animate-pulse">
          <div className="h-4 bg-slate-800 rounded w-1/3 mb-3" />
          <div className="h-3 bg-slate-800 rounded w-2/3" />
        </div>
      ))}
    </div>
  )
}
