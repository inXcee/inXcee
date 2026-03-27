import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import MachineStrip from './components/MachineStrip.jsx'
import QueuePanel from './components/QueuePanel.jsx'
import SlaAlert from './components/SlaAlert.jsx'

/* ── Kanban column ──────────────────────────────────────────── */
function KanbanCol({ title, color, items, emptyText }) {
  return (
    <div style={{
      flex: 1, minWidth: 200,
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface)',
      border: `1px solid var(--border)`,
      borderTop: `2px solid ${color}`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Col header */}
      <div style={{
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: `linear-gradient(135deg, ${color}0a, transparent)`,
      }}>
        <span style={{
          fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2.5, color,
        }}>
          {title}
        </span>
        <span style={{
          fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 1, color,
          lineHeight: 1,
        }}>
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ overflowY: 'auto', maxHeight: 400, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length === 0 ? (
          <div style={{
            padding: '20px 12px', textAlign: 'center',
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 0.5,
          }}>
            {emptyText}
          </div>
        ) : items.map(item => (
          <div key={item.id} style={{
            padding: '8px 10px',
            background: 'var(--surface2)',
            border: `1px solid ${item.urgent ? 'rgba(231,76,60,0.25)' : 'var(--border)'}`,
            borderLeft: `2px solid ${item.urgent ? 'var(--red)' : color}`,
            borderRadius: 7,
            transition: 'transform 0.15s, box-shadow 0.15s',
            cursor: 'default',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{
                fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2, color: 'var(--text)', lineHeight: 1,
              }}>
                {item.block} · {item.room_no}
              </span>
              {item.urgent === 1 && (
                <span className="badge badge-red" style={{ fontSize: 7 }}>ACİL</span>
              )}
            </div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4,
              display: 'flex', gap: 8,
            }}>
              <span>{item.item_count} parça</span>
              {item.machine_name && <span>⚙ {item.machine_name}</span>}
              {item.shelf_location && <span>▣ {item.shelf_location}</span>}
              {item.hours_in_status != null && (
                <span style={{
                  color: item.hours_in_status > 48 ? 'var(--red)'
                    : item.hours_in_status > 24 ? 'var(--accent)' : 'var(--text3)',
                }}>
                  {item.hours_in_status}s
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Stat row ───────────────────────────────────────────────── */
function StatRow({ label, value, color }) {
  return (
    <tr>
      <td style={{ fontWeight: 600, fontSize: 12 }}>{label}</td>
      <td style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 1, color, lineHeight: 1 }}>{value}</td>
    </tr>
  )
}

/* ── Page ───────────────────────────────────────────────────── */
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

  const running = machines.filter(m => m.status === 'running').length

  return (
    <div style={{ maxWidth: 1100, position: 'relative', zIndex: 1 }} className="fade-up">

      {/* HEADER */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontFamily: 'var(--display)', fontSize: 32, letterSpacing: 5,
          color: 'var(--text)', lineHeight: 1, marginBottom: 4,
        }}>
          DASHBOARD
        </h1>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
          {running > 0
            ? <span style={{ color: 'var(--accent)' }}>{running} makine çalışıyor</span>
            : 'Makine boşta'}
          {violations.length > 0 && (
            <span style={{ color: 'var(--red)', marginLeft: 12 }}>
              · {violations.length} SLA ihlali
            </span>
          )}
        </div>
        <div style={{
          height: 1, marginTop: 12,
          background: 'linear-gradient(90deg, var(--accent), var(--blue), transparent)',
          opacity: 0.4,
        }} />
      </div>

      {/* SLA */}
      <SlaAlert violations={violations} />

      {/* KPI STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Sepette',   value: dirty.length,   color: 'var(--accent)' },
          { label: 'Yıkanan',   value: washing.length, color: 'var(--blue)' },
          { label: 'Hazır',     value: ready.length,   color: 'var(--green)' },
          { label: 'SLA İhlal', value: violations.length, color: 'var(--red)' },
          { label: 'Makine',    value: `${running}/${machines.length}`, color: 'var(--text2)' },
        ].map(s => (
          <div key={s.label} className="kpi-card panel" style={{
            padding: '12px 14px', textAlign: 'center', borderTop: `2px solid ${s.color}`,
          }}>
            <div style={{
              fontFamily: 'var(--display)', fontSize: 32, letterSpacing: 3,
              color: s.color, lineHeight: 1, marginBottom: 4,
            }}>
              {s.value}
            </div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: 1.5,
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* MACHINE STRIP */}
      <MachineStrip machines={machines} />

      {/* KANBAN */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <KanbanCol title="SEPET"     color="var(--accent)" items={dirty}   emptyText="Sepet boş" />
        <KanbanCol title="YIKANIYOR" color="var(--blue)"   items={washing} emptyText="Yıkanan yok" />
        <KanbanCol title="HAZIR"     color="var(--green)"  items={ready}   emptyText="Hazır bekleyen yok" />
      </div>

      {/* BOTTOM ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <QueuePanel />

        {/* Quick stats */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">ÖZET</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="data-table">
              <tbody>
                <StatRow label="Ort. Tamamlanma"
                  value={stats?.avg_hours != null ? `${stats.avg_hours.toFixed(1)}s` : '—'}
                  color="var(--accent)" />
                <StatRow label="Bugün Teslim"
                  value={stats?.delivered_today ?? '—'}
                  color="var(--green)" />
                <StatRow label="Aktif Makine"
                  value={`${running} / ${machines.length}`}
                  color="var(--blue)" />
                <StatRow label="Kritik SLA"
                  value={violations.filter(v => v.sla_level === 'critical').length}
                  color="var(--red)" />
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MACHINE STATS TABLE */}
      {stats?.machine_stats?.length > 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
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
                  <th>Ort. Süre</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {stats.machine_stats.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 9, textTransform: 'uppercase',
                        background: m.machine_type === 'dryer' ? 'rgba(240,92,42,0.12)' : 'rgba(59,140,240,0.12)',
                        color: m.machine_type === 'dryer' ? 'var(--accent2)' : 'var(--blue)',
                        border: `1px solid ${m.machine_type === 'dryer' ? 'rgba(240,92,42,0.25)' : 'rgba(59,140,240,0.25)'}`,
                        borderRadius: 3, padding: '2px 6px',
                      }}>
                        {m.machine_type === 'dryer' ? 'Kurutma' : 'Yıkama'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 1 }}>
                      {m.completed_count || 0}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                      {m.avg_cycle_minutes ? `${Math.round(m.avg_cycle_minutes)} dk` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${m.status === 'running' ? 'badge-amber' : m.status === 'done' ? 'badge-red' : 'badge-gray'}`}>
                        {m.status === 'running' ? 'Çalışıyor' : m.status === 'done' ? 'Bitti' : 'Boşta'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
