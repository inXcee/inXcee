export default function HeatMap({ data = [] }) {
  const getColor = (block) => {
    if (block.status === 'quarantine') return 'bg-blue-900/60 border-blue-700 text-blue-300'
    const pct = block.pct || 0
    if (pct > 95) return 'bg-red-900/60 border-red-700 text-red-300'
    if (pct > 80) return 'bg-orange-900/60 border-orange-700 text-orange-300'
    if (pct >= 60) return 'bg-yellow-900/60 border-yellow-700 text-yellow-300'
    return 'bg-green-900/40 border-green-800 text-green-300'
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {data.map(block => (
        <div key={block.block} className={`rounded-xl border p-4 ${getColor(block)}`}>
          <div className="text-lg font-bold">{block.block}</div>
          <div className="text-2xl font-mono font-bold mt-1">{block.pct ?? 0}%</div>
          <div className="text-xs mt-1 opacity-75">{block.occupied}/{block.total_beds} kişi</div>
          {block.status === 'quarantine' && <div className="text-xs mt-1">🔵 Karantina</div>}
        </div>
      ))}
    </div>
  )
}
