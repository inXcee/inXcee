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

  const handlePremiumExport = () => {
    laundryApi.exportPremiumCsv({ from, to }).then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `premium-kiyafetler-${from}-${to}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const { data: premiumReport } = useQuery({
    queryKey: ['laundry-premium-report', from, to],
    queryFn: () => laundryApi.getPremiumReport({ from, to }),
  })

  return (
    <div style={{ maxWidth: 860, position: 'relative', zIndex: 1 }} className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 4, color: 'var(--text)' }}>
          ÇAMAŞIRHANE RAPOR
        </h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>CSV İndir</button>
          <button className="btn btn-ghost btn-sm" onClick={handlePremiumExport}
            style={{ color: 'var(--accent)', borderColor: 'rgba(240,165,0,0.3)' }}>
            ★ Premium CSV
          </button>
        </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16, alignItems: 'stretch' }}>
            {[
              { label: 'Toplam Kayıt',      value: stats.period_total?.count ?? 0,     color: 'var(--text2)' },
              { label: 'Teslim Edilen',     value: stats.period_delivered?.count ?? 0, color: 'var(--green)' },
              { label: 'SLA İhlali',        value: stats.sla_violations?.count ?? 0,   color: 'var(--red)' },
              { label: 'Bugün Teslim',      value: stats.delivered_today?.count ?? 0,  color: 'var(--accent)' },
              { label: 'Kayıp (Dönem)',     value: stats.lost_period?.count ?? 0,      color: 'var(--red)' },
              { label: 'Ort. Teslim (saat)', value: stats.avg_delivery_hours ?? '—',   color: 'var(--teal)' },
            ].map(s => (
              <div key={s.label} className="kpi-card panel" style={{ padding: '10px 12px', textAlign: 'center', borderTop: `2px solid ${s.color}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
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
                <table className="data-table responsive-stack">
                  <thead>
                    <tr><th>Durum</th><th>Adet</th></tr>
                  </thead>
                  <tbody>
                    {stats.by_status.map(row => (
                      <tr key={row.status}>
                        <td data-label="Durum" style={{ textTransform: 'capitalize' }}>{row.status}</td>
                        <td data-label="Adet" style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 1 }}>{row.count}</td>
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
                <table className="data-table responsive-stack">
                  <thead>
                    <tr><th>Makine</th><th>Tip</th><th>Durum</th><th>Aktif Yük</th><th>Toplam Çalışma</th></tr>
                  </thead>
                  <tbody>
                    {stats.machine_stats.map(m => (
                      <tr key={m.name}>
                        <td data-label="Makine" style={{ fontFamily: 'var(--display)', letterSpacing: 1 }}>{m.name}</td>
                        <td data-label="Tip" style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{m.type}</td>
                        <td data-label="Durum">
                          <span className={`badge badge-${m.status === 'running' ? 'blue' : m.status === 'done' ? 'green' : m.status === 'maintenance' ? 'red' : 'gray'}`} style={{ fontSize: 8 }}>
                            {m.status === 'running' ? 'ÇALIŞIYOR' : m.status === 'done' ? 'BİTTİ' : m.status === 'idle' ? 'BOŞ' : m.status === 'maintenance' ? 'BAKIM' : m.status}
                          </span>
                        </td>
                        <td data-label="Aktif Yuk" style={{ fontFamily: 'var(--display)', fontSize: 16, color: m.active_loads > 0 ? 'var(--blue)' : 'var(--text3)' }}>
                          {m.active_loads > 0 ? m.active_loads : '—'}
                        </td>
                        <td data-label="Toplam Calisma" style={{
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
                <table className="data-table responsive-stack">
                  <thead>
                    <tr><th>Oda</th><th>Toplam</th><th>Teslim</th><th>Kayıp</th></tr>
                  </thead>
                  <tbody>
                    {stats.by_room.map((r, i) => (
                      <tr key={i}>
                        <td data-label="Oda" style={{ fontFamily: 'var(--display)', letterSpacing: 2 }}>{r.block} · {r.room_no}</td>
                        <td data-label="Toplam" style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{r.total}</td>
                        <td data-label="Teslim" style={{ color: 'var(--green)' }}>{r.delivered}</td>
                        <td data-label="Kayip" style={{ color: r.lost > 0 ? 'var(--red)' : 'var(--text3)' }}>{r.lost || '—'}</td>
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
                    <table className="data-table responsive-stack">
                      <thead>
                        <tr><th>ID</th><th>Oluşturulma</th><th>Parça</th><th>Durum</th><th>Süre</th></tr>
                      </thead>
                      <tbody>
                        {personData.items.slice(0, 20).map(i => (
                          <tr key={i.id}>
                            <td data-label="ID" style={{ fontFamily: 'var(--mono)', fontSize: 9 }}>#{i.id}</td>
                            <td data-label="Olusturulma" style={{ fontFamily: 'var(--mono)', fontSize: 9 }}>{new Date(i.created_at).toLocaleDateString('tr-TR')}</td>
                            <td data-label="Parca">{i.item_count}</td>
                            <td data-label="Durum">
                              <span className={`badge badge-${i.status === 'delivered' ? 'green' : i.status === 'lost' ? 'red' : 'gray'}`} style={{ fontSize: 7 }}>
                                {i.status}
                              </span>
                            </td>
                            <td data-label="Sure" style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{i.total_hours ? `${i.total_hours}s` : '—'}</td>
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

      {/* ── PREMİUM ÖZET ── */}
      {premiumReport && premiumReport.totals?.total > 0 && (
        <div className="panel fade-up" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <span className="panel-title" style={{ color: 'var(--accent)' }}>★ PREMİUM KIYAFET ÖZET</span>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {[
                ['TOPLAM', premiumReport.totals.total, 'var(--accent)'],
                ['TESLİM EDİLDİ', premiumReport.totals.total_delivered, 'var(--green)'],
                ['DEVAM EDIYOR', premiumReport.totals.total_in_progress, 'var(--blue)'],
                ['KAYIP', premiumReport.totals.total_lost, 'var(--red)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{
                  padding: '10px 12px', borderRadius: 8, textAlign: 'center',
                  background: `${color}0d`, border: `1px solid ${color}25`,
                }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 24, color, lineHeight: 1 }}>{val ?? 0}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginTop: 3, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Ortalama teslim süresi */}
            {premiumReport.avgDelivery && (
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  ['Premium Ort. Süre', premiumReport.avgDelivery.premium_avg_hours, 'var(--accent)'],
                  ['Regular Ort. Süre', premiumReport.avgDelivery.regular_avg_hours, 'var(--text2)'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{
                    flex: 1, padding: '8px 12px', borderRadius: 7,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color, fontWeight: 700 }}>
                      {val != null ? `${val} saat` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Blok bazında */}
            {premiumReport.byBlock?.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>BLOK DAĞILIMI</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {premiumReport.byBlock.map(b => (
                    <div key={b.block} style={{
                      padding: '5px 10px', borderRadius: 6,
                      background: 'rgba(240,165,0,0.07)', border: '1px solid rgba(240,165,0,0.2)',
                      fontFamily: 'var(--mono)', fontSize: 10,
                    }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{b.block}</span>
                      <span style={{ color: 'var(--text2)', marginLeft: 6 }}>{b.total} parça</span>
                      {b.lost > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>✗ {b.lost}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tip bazında + Kayıp listesi yan yana */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Tip bazında */}
              {premiumReport.byType?.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>TİP DAĞILIMI</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {premiumReport.byType.slice(0, 8).map(t => (
                      <div key={t.garment_type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)', flex: 1 }}>{t.garment_type}</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>{t.total}</span>
                        {t.lost > 0 && <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)', fontSize: 9 }}>✗{t.lost}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* En aktif odalar */}
              {premiumReport.topRooms?.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>EN AKTİF ODALAR</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {premiumReport.topRooms.slice(0, 8).map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 9, width: 14 }}>{i+1}.</span>
                        <span style={{ fontFamily: 'var(--display)', letterSpacing: 1, color: 'var(--text)', flex: 1 }}>
                          {r.block} · {r.room_no}
                        </span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>{r.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Kayıp listesi */}
            {premiumReport.lostList?.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)', letterSpacing: 1, marginBottom: 6 }}>
                  KAYIP PARÇALAR ({premiumReport.lostList.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
                  {premiumReport.lostList.map(g => (
                    <div key={g.garment_code} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                      background: 'rgba(231,76,60,0.06)', borderRadius: 5, border: '1px solid rgba(231,76,60,0.15)',
                    }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>{g.garment_code}</span>
                      <span style={{ fontFamily: 'var(--display)', fontSize: 11, letterSpacing: 1 }}>{g.block} · {g.room_no}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)', flex: 1 }}>
                        {g.garment_type}{g.brand ? ` · ${g.brand}` : ''}{g.size ? ` · ${g.size}` : ''}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', flexShrink: 0 }}>
                        {g.intake_date?.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
