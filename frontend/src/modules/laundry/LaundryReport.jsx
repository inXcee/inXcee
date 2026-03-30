import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'

export default function LaundryReport() {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))

  const { data: stats, isLoading } = useQuery({
    queryKey: ['laundry-stats', from, to],
    queryFn: () => laundryApi.getStats({ from, to }),
  })

  const handleExport = () => {
    laundryApi.exportCsv({ from, to }).then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `camasir-${from}-${to}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div style={{ maxWidth: 860, position: 'relative', zIndex: 1 }} className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 4, color: 'var(--text)' }}>
          ÇAMAŞIRHANE RAPOR
        </h1>
        <button className="btn btn-ghost btn-sm" onClick={handleExport}>CSV İndir</button>
      </div>

      {/* DATE RANGE */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-body" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label className="form-label">BAŞLANGIÇ</label>
            <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label">BİTİŞ</label>
            <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state"><div className="empty-sub">Yükleniyor...</div></div>
      ) : !stats ? null : (
        <>
          {/* SUMMARY CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Toplam Kayıt',      value: stats.period_total?.count ?? 0,     color: 'var(--text2)' },
              { label: 'Teslim Edilen',     value: stats.period_delivered?.count ?? 0, color: 'var(--green)' },
              { label: 'SLA İhlali',        value: stats.sla_violations?.count ?? 0,   color: 'var(--red)' },
              { label: 'Bugün Teslim',      value: stats.delivered_today?.count ?? 0,  color: 'var(--accent)' },
              { label: 'Kayıp (Dönem)',     value: stats.lost_period?.count ?? 0,      color: 'var(--red)' },
              { label: 'Ort. Teslim (saat)', value: stats.avg_delivery_hours ?? '—',   color: 'var(--teal)' },
            ].map(s => (
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

          {/* STATUS BREAKDOWN */}
          {stats.by_status?.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <span className="panel-title">DURUM DAĞILIMI</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Durum</th><th>Adet</th></tr>
                  </thead>
                  <tbody>
                    {stats.by_status.map(row => (
                      <tr key={row.status}>
                        <td style={{ textTransform: 'capitalize' }}>{row.status}</td>
                        <td style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 1 }}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AVG HOURS BY STAGE */}
          {stats.avg_hours?.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <span className="panel-title">ORTALAMA BEKLEME SÜRESİ</span>
                <span className="panel-subtitle">Her aşamada şu an ne kadar bekleniyor</span>
              </div>
              <div className="panel-body" style={{ display: 'flex', gap: 12 }}>
                {stats.avg_hours.map(row => {
                  const label = { dirty: 'Kirli Sepette', washing: 'Makinede', ready: 'Rafta' }[row.status] || row.status
                  return (
                    <div key={row.status} style={{
                      flex: 1, textAlign: 'center', padding: '12px',
                      background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
                    }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 28, color: 'var(--accent)', lineHeight: 1, marginBottom: 4 }}>
                        {row.avg_h}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>SAAT — {label.toUpperCase()}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* MACHINE STATS */}
          {stats.machine_stats?.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <span className="panel-title">MAKİNE DURUMU</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Makine</th><th>Tip</th><th>Durum</th><th>Aktif Yük</th><th>Toplam Çalışma</th></tr>
                  </thead>
                  <tbody>
                    {stats.machine_stats.map(m => (
                      <tr key={m.name}>
                        <td style={{ fontFamily: 'var(--display)', letterSpacing: 1 }}>{m.name}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{m.type}</td>
                        <td>
                          <span className={`badge badge-${m.status === 'running' ? 'blue' : m.status === 'done' ? 'green' : m.status === 'maintenance' ? 'red' : 'gray'}`} style={{ fontSize: 8 }}>
                            {m.status === 'running' ? 'ÇALIŞIYOR' : m.status === 'done' ? 'BİTTİ' : m.status === 'idle' ? 'BOŞ' : m.status === 'maintenance' ? 'BAKIM' : m.status}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--display)', fontSize: 16, color: m.active_loads > 0 ? 'var(--blue)' : 'var(--text3)' }}>
                          {m.active_loads > 0 ? m.active_loads : '—'}
                        </td>
                        <td style={{
                          fontFamily: 'var(--display)', fontSize: 16,
                          color: m.needs_maintenance ? 'var(--red)' : m.total_runs > 40 ? 'var(--accent)' : 'var(--text3)',
                        }}>
                          {m.total_runs || 0}{m.needs_maintenance ? ' ⚠' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TOP ROOMS */}
          {stats.by_room?.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <span className="panel-title">EN AKTİF ODALAR</span>
                <span className="panel-subtitle">Dönem içinde en fazla kayıt oluşturulan odalar</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Oda</th><th>Toplam</th><th>Teslim</th><th>Kayıp</th></tr>
                  </thead>
                  <tbody>
                    {stats.by_room.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--display)', letterSpacing: 2 }}>{r.block} · {r.room_no}</td>
                        <td style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{r.total}</td>
                        <td style={{ color: 'var(--green)' }}>{r.delivered}</td>
                        <td style={{ color: r.lost > 0 ? 'var(--red)' : 'var(--text3)' }}>{r.lost || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CLOTHING BREAKDOWN */}
          {stats.clothing_breakdown?.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <span className="panel-title">KIYAFet DAĞILIMI</span>
                <span className="panel-subtitle">Dönemde en çok yıkanan kıyafet türleri</span>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {stats.clothing_breakdown.map(c => (
                  <div key={c.type} style={{
                    padding: '8px 14px', background: 'var(--surface2)',
                    border: '1px solid var(--border)', borderRadius: 20,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)' }}>{c.type}</span>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--accent)', lineHeight: 1 }}>{c.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
