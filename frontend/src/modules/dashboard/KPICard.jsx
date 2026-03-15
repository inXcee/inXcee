export default function KPICard({ icon, label, value, color = 'blue', subtitle }) {
  const colorMap = {
    blue: 'text-blue-400 bg-blue-900/20 border-blue-800',
    green: 'text-green-400 bg-green-900/20 border-green-800',
    yellow: 'text-yellow-400 bg-yellow-900/20 border-yellow-800',
    red: 'text-red-400 bg-red-900/20 border-red-800',
  }

  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl mb-1">{icon}</div>
          <div className={`text-3xl font-bold ${colorMap[color].split(' ')[0]}`}>{value}</div>
          <div className="text-sm text-slate-400 mt-1">{label}</div>
          {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
        </div>
      </div>
    </div>
  )
}
