import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import MachineStrip from './components/MachineStrip.jsx'
import QueuePanel from './components/QueuePanel.jsx'
import SlaAlert from './components/SlaAlert.jsx'

function KanbanColumn({ title, color, items }) {
  return (
    <div className="panel" style={{ flex: 1, minWidth: 220 }}>
      <div className="panel-header" style={{ borderTop: `2px solid ${color}` }}>
        <span className="panel-title" style={{ color }}>{title}</span>
        <span className="badge" style={{ background: color + '22', color }}>{items.length}</span>
      </div>
      <div className="panel-body" style={{ padding: 0, maxHeight: 380, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
            Boş
          </div>
        ) : items.map(item => (
          <div key={item.id} style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>
              {item.block} · {item.room_no}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
              {item.item_count} parça
              {item.urgent ? <span style={{ color: 'var(--red)', marginLeft: 6 }}>● ACİL</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatsTable({ stats }) {
  if (!stats?.machine_stats?.length) return null
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">MAKİNE İSTATİSTİKLERİ</span>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Makine</th>
              <th>Tip</th>
              <th>Tamamlanan</th>
              <th>Ort. Süre (dk)</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {stats.machine_stats.map(m => (
              <tr key={m.id}>
                <td style={{ fontWeight: 600 }}>{m.name}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>
                  {m.machine_type}
                </td>
                <td style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 1 }}>
                  {m.completed_count || 0}
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                  {m.avg_cycle_minutes ? Math.round(m.avg_cycle_minutes) : '—'}
                </td>
                <td>
                  <span className={`badge ${m.status === 'running' ? 'badge-amber' : m.status === 'done' ? 'badge-green' : 'badge-gray'}`}>
                    {m.status === 'running' ? 'Çalışıyor' : m.status === 'done' ? 'Bitti' : 'Boşta'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function LaundryDashboard() {
  const { data: items = [] } = useQuery({
    queryKey: ['laundry-items', 'all'],
    queryFn: () => laundryApi.getItems({}),
    refetchInterval: 30000,
  })

  const { data: machines = [] } = useQuery({
    queryKey: ['laundry-machines'],
    queryFn: laundryApi.getMachines,
    refetchInterval: 15000,
  })

  const { data: violations = [] } = useQuery({
    queryKey: ['laundry-sla'],
    queryFn: laundryApi.getSlaViolations,
    refetchInterval: 60000,
  })

  const { data: stats } = useQuery({
    queryKey: ['laundry-stats'],
    queryFn: () => laundryApi.getStats({}),
    refetchInterval: 60000,
  })

  const dirty   = items.filter(i => i.status === 'dirty')
  const washing = items.filter(i => i.status === 'washing')
  const ready   = items.filter(i => i.status === 'ready')

  const kpis = [
    { label: 'Sepette',    value: dirty.length,    color: 'var(--accent)' },
    { label: 'Yıkanan',   value: washing.length,  color: 'var(--blue)' },
    { label: 'Hazır',     value: ready.length,    color: 'var(--green)' },
    { label: 'SLA İhlal', value: violations.length, color: 'var(--red)' },
    { label: 'Makine',    value: machines.filter(m => m.status === 'running').length + '/' + machines.length, color: 'var(--text2)' },
  ]

  return (
    <div style={{ maxWidth: 1100, position: 'relative', zIndex: 1 }} className="fade-up">

      {/* HEADER */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 4, color: 'var(--text)' }}>
          ÇAMAŞIRHANE DASHBOARD
        </h1>
      </div>

      {/* SLA ALERT */}
      <SlaAlert violations={violations} />

      {/* KPI STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
        {kpis.map(s => (
          <div key={s.label} className="kpi-card panel" style={{ padding: '10px 12px', textAlign: 'center', borderTop: `2px solid ${s.color}` }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: 2, color: s.color, lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* MACHINE STRIP */}
      <MachineStrip machines={machines} />

      {/* KANBAN */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <KanbanColumn title="SEPET" color="var(--accent)" items={dirty} />
        <KanbanColumn title="YIKANIYOR" color="var(--blue)" items={washing} />
        <KanbanColumn title="HAZIR" color="var(--green)" items={ready} />
      </div>

      {/* QUEUE + STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <QueuePanel />
        <div>
          {stats?.avg_hours != null && (
            <div className="panel" style={{ marginBottom: 12 }}>
              <div className="panel-header">
                <span className="panel-title">ORT. TAMAMLANMA SÜRESİ</span>
              </div>
              <div className="panel-body" style={{ textAlign: 'center', padding: '16px 12px' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 42, letterSpacing: 3, color: 'var(--accent)', lineHeight: 1 }}>
                  {stats.avg_hours.toFixed(1)}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6, letterSpacing: 1 }}>
                  SAAT (SON 30 GÜN)
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MACHINE STATS TABLE */}
      <StatsTable stats={stats} />
    </div>
  )
}
