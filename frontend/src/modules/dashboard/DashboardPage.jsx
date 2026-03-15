import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import KPICard from './KPICard.jsx'
import HeatMap from './HeatMap.jsx'
import { useNotifications } from '../../shared/hooks/useNotifications.js'

export default function DashboardPage() {
  const { data: kpi, isLoading: kpiLoading } = useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: () => api.get('/dashboard/kpi').then(r => r.data),
    refetchInterval: 30000
  })

  const { data: heatmap = [] } = useQuery({
    queryKey: ['dashboard-heatmap'],
    queryFn: () => api.get('/dashboard/heatmap').then(r => r.data),
    refetchInterval: 30000
  })

  const { data: projection = [] } = useQuery({
    queryKey: ['dashboard-projection'],
    queryFn: () => api.get('/dashboard/projection').then(r => r.data)
  })

  const { notifications } = useNotifications()
  const criticalNotifs = notifications.filter(n => n.type === 'critical').slice(0, 10)

  const occupancyColor = !kpi ? 'blue' : kpi.occupancy_pct > 95 ? 'red' : kpi.occupancy_pct > 80 ? 'yellow' : 'green'

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-100">Kokpit</h1>
        <div className="text-xs text-slate-500">Her 30 saniyede yenilenir</div>
      </div>

      {/* KPI Cards */}
      {kpiLoading ? (
        <div className="text-slate-500">Yükleniyor...</div>
      ) : kpi && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard icon="👤" label="Aktif Personel" value={kpi.active_personnel} color="blue" />
          <KPICard icon="🛏" label="Doluluk" value={`${kpi.occupancy_pct}%`} color={occupancyColor} subtitle={`${kpi.occupied}/${kpi.total_beds} yatak`} />
          <KPICard icon="🔧" label="Açık Arıza" value={kpi.open_maintenance} color={kpi.open_maintenance > 10 ? 'red' : kpi.open_maintenance > 5 ? 'yellow' : 'green'} />
          <KPICard icon="🔵" label="Karantina Oda" value={kpi.quarantine_rooms} color={kpi.quarantine_rooms > 0 ? 'yellow' : 'green'} />
        </div>
      )}

      {/* Heatmap */}
      <div>
        <h2 className="text-sm font-medium text-slate-400 mb-4">Blok Doluluk Haritası</h2>
        <HeatMap data={heatmap} />
        <div className="flex gap-4 mt-3 text-xs text-slate-500">
          <span>🟢 &lt;60%</span>
          <span>🟡 60-80%</span>
          <span>🟠 80-95%</span>
          <span>🔴 &gt;95%</span>
          <span>🔵 Karantina</span>
        </div>
      </div>

      {/* Projection */}
      {projection.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-400 mb-3">Önümüzdeki 14 Gün — Ayrılacak Personel</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {projection.map(p => (
              <div key={p.block} className="bg-slate-900 rounded-lg p-3">
                <div className="font-bold text-slate-200">{p.block}</div>
                <div className="text-xl font-mono text-yellow-400">{p.c} kişi</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical notifications */}
      {criticalNotifs.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-400 mb-3">🚨 Kritik Uyarılar</h2>
          <div className="space-y-2">
            {criticalNotifs.map(n => (
              <div key={n.id} className={`bg-red-950/40 border border-red-800 rounded-lg p-3 text-sm ${n.is_read ? 'opacity-50' : ''}`}>
                <div className="text-red-300">{n.message}</div>
                <div className="text-xs text-red-500 mt-1">{n.module} · {new Date(n.created_at).toLocaleString('tr-TR')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
