import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'

function WeeklyTrendChart({ data }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.received, d.delivered, 1)))
  const BAR_H = 80

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      {data.map((d, i) => {
        const recPct = d.received / maxVal
        const delPct = d.delivered / maxVal
        const dayLabel = new Date(d.day + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: BAR_H }}>
              <div style={{
                flex: 1, height: Math.max(4, recPct * BAR_H),
                background: 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 0.8,
              }} title={`Alınan: ${d.received}`} />
              <div style={{
                flex: 1, height: Math.max(4, delPct * BAR_H),
                background: 'var(--green)', borderRadius: '3px 3px 0 0', opacity: 0.8,
              }} title={`Teslim: ${d.delivered}`} />
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.3 }}>
              {dayLabel}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text4)', textAlign: 'center' }}>
              {d.received}/{d.delivered}
            </div>
          </div>
        )
      })}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'flex-start', marginLeft: 8, fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: 1, display: 'inline-block' }} />
          Alınan
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: 'var(--green)', borderRadius: 1, display: 'inline-block' }} />
          Teslim
        </span>
      </div>
    </div>
  )
}

export default function LaundryReport() {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [personSearch, setPersonSearch] = useState('')
  const [personName, setPersonName] = useState(null)
  const { data: personData, isLoading: personLoading } = useQuery({
    queryKey: ['laundry-person', personName],
    queryFn: () => laundryApi.getPersonHistory(personName),
    enabled: !!personName,
  })

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

          {/* HAFTALIK TREND */}
          {stats.weekly_trend?.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <span className="panel-title">HAFTALIK TREND</span>
                <span className="panel-subtitle">Son 7 gün alınan ve teslim edilen</span>
              </div>
              <div className="panel-body">
                <WeeklyTrendChart data={stats.weekly_trend} />
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
          {/* KİŞİ BAZLI RAPOR */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <span className="panel-title">KİŞİ BAZLI RAPOR</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  value={personSearch}
                  onChange={e => setPersonSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && personSearch.trim() && setPersonName(personSearch.trim())}
                  placeholder="Personel adı ara..."
                  style={{ flex: 1 }}
                />
                <button className="btn btn-sm" onClick={() => personSearch.trim() && setPersonName(personSearch.trim())}>
                  Ara
                </button>
              </div>
              {personLoading && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Yükleniyor...</div>}
              {personData && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                    {[
                      { label: 'Toplam Verilen', value: personData.total_given, color: 'var(--text2)' },
                      { label: 'Teslim Edilen', value: personData.total_delivered, color: 'var(--green)' },
                      { label: 'Kayıp', value: personData.total_lost, color: 'var(--red)' },
                      { label: 'Ort. Süre (saat)', value: personData.avg_hours ?? '—', color: 'var(--accent)' },
                    ].map(s => (
                      <div key={s.label} className="panel" style={{ padding: '8px', textAlign: 'center', borderTop: `2px solid ${s.color}` }}>
                        <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: s.color }}>{s.value}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {personData.room && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
                      Oda: {personData.room} · Tel: {personData.phone || '—'}
                    </div>
                  )}
                  {personData.items?.length > 0 && (
                    <table className="data-table">
                      <thead>
                        <tr><th>ID</th><th>Oluşturulma</th><th>Parça</th><th>Durum</th><th>Süre</th></tr>
                      </thead>
                      <tbody>
                        {personData.items.slice(0, 20).map(i => (
                          <tr key={i.id}>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: 9 }}>#{i.id}</td>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: 9 }}>{new Date(i.created_at).toLocaleDateString('tr-TR')}</td>
                            <td>{i.item_count}</td>
                            <td>
                              <span className={`badge badge-${i.status === 'delivered' ? 'green' : i.status === 'lost' ? 'red' : 'gray'}`} style={{ fontSize: 7 }}>
                                {i.status}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{i.total_hours ? `${i.total_hours}s` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
