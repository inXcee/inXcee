// Disiplin istatistik panosu (stats prop'undan beslenir): KPI'lar, en çok ceza
// alanlar, şirket dağılımı, 30 günlük trend, sebep dağılımı ve son işlemler.
import { useState } from 'react'
import { fmtFull, KPI } from './shared.jsx'

export default function StatsDashboard({ stats }) {
  const [companyExpanded, setCompanyExpanded] = useState(null)

  if (!stats) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* KPI Row */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <KPI label="TOPLAM KART" value={stats.total_records || 0} sub={`${stats.yellow_cards || 0} sarı · ${stats.red_cards || 0} kırmızı`} />
        <KPI label="KARA LİSTE" value={stats.blacklisted_count || 0} color="var(--red)" />
        <KPI label="KRİTİK" value={stats.critical_count || 0} color="var(--red)" sub="3+ puan" />
        <KPI label="UYARILI" value={stats.warned_count || 0} color="var(--accent)" sub="1-2 puan" />
      </div>

      {/* Top offenders */}
      {stats.topOffenders?.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">EN ÇOK CEZA ALAN PERSONEL</div>
            <span className="badge badge-gray">{stats.topOffenders.length}</span>
          </div>
          <div style={{ padding: '4px 16px' }}>
            {stats.topOffenders.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 4px', borderBottom: '1px solid rgba(35,45,63,.3)',
              }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '6px',
                  background: p.discipline_points >= 3 ? 'rgba(231,76,60,.15)' : 'rgba(240,165,0,.12)',
                  border: `1px solid ${p.discipline_points >= 3 ? 'rgba(231,76,60,.3)' : 'rgba(240,165,0,.25)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--display)', fontSize: '14px',
                  color: p.discipline_points >= 3 ? 'var(--red)' : 'var(--accent)',
                }}>
                  {p.discipline_points}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{p.full_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                    {p.company || '—'} · {p.job_title || '—'} · {p.yellow}S {p.red}K
                  </div>
                </div>
                {p.is_blacklisted ? (
                  <span className="badge badge-red">KARA LİSTE</span>
                ) : p.discipline_points >= 3 ? (
                  <span className="badge badge-red">KRİTİK</span>
                ) : (
                  <span className="badge badge-amber">UYARI</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Company distribution */}
      {stats.byCompany?.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">ŞİRKET BAZLI DAĞILIM</div>
          </div>
          <div style={{ padding: '4px 16px' }}>
            {stats.byCompany.map(c => (
              <div key={c.company}
                onClick={() => setCompanyExpanded(companyExpanded === c.company ? null : c.company)}
                style={{
                  padding: '10px 4px', borderBottom: '1px solid rgba(35,45,63,.3)',
                  cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{c.company}</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="badge badge-amber">{c.yellow}S</span>
                    <span className="badge badge-red">{c.red}K</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                      Toplam: {c.total}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend Chart (last 30 days) */}
      {stats.trend?.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">30 GUNLUK TREND</div>
          </div>
          <div style={{ padding: '16px', overflowX: 'auto' }}>
            {(() => {
              const maxVal = Math.max(...stats.trend.map(d => d.yellow + d.red), 1)
              const barW = Math.max(16, Math.min(32, 600 / stats.trend.length))
              return (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '120px', minWidth: stats.trend.length * (barW + 2) }}>
                  {stats.trend.map(d => {
                    const yH = (d.yellow / maxVal) * 100
                    const rH = (d.red / maxVal) * 100
                    const dateLabel = d.date.slice(5)
                    return (
                      <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: barW + 'px' }} title={`${d.date}: ${d.yellow}S ${d.red}K`}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%' }}>
                          {d.red > 0 && <div style={{ height: rH + '%', minHeight: '3px', background: 'var(--red)', borderRadius: '2px 2px 0 0' }} />}
                          {d.yellow > 0 && <div style={{ height: yH + '%', minHeight: '3px', background: 'var(--amber)', borderRadius: d.red ? '0' : '2px 2px 0 0' }} />}
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text4)', marginTop: '4px', transform: 'rotate(-45deg)', transformOrigin: 'top left', whiteSpace: 'nowrap' }}>
                          {dateLabel}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
            <div style={{ display: 'flex', gap: '16px', marginTop: '20px', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--amber)' }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>SARI KART</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--red)' }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>KIRMIZI KART</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reason distribution */}
      {stats.reasonStats?.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">SEBEP DAGILIMI</div>
          </div>
          <div style={{ padding: '8px 16px' }}>
            {stats.reasonStats.map((r, i) => {
              const maxCnt = stats.reasonStats[0]?.cnt || 1
              const pct = (r.cnt / maxCnt) * 100
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid rgba(35,45,63,.2)' }}>
                  <div style={{ flex: 1, fontSize: '11px', color: 'var(--text2)' }}>{r.reason || '—'}</div>
                  <div style={{ width: '100px', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', borderRadius: '3px', background: r.card_type === 'yellow' ? 'var(--amber)' : 'var(--red)' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', width: '24px', textAlign: 'right' }}>{r.cnt}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {stats.recentActivity?.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">SON İŞLEMLER</div>
          </div>
          <div style={{ padding: '4px 16px' }}>
            {stats.recentActivity.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '10px 4px', borderBottom: '1px solid rgba(35,45,63,.3)',
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', marginTop: '5px', flexShrink: 0,
                  background: a.card_type === 'yellow' ? 'var(--accent)' : 'var(--red)',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: 'var(--text)' }}>
                    <strong>{a.personnel_name}</strong> — {a.reason}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                    {a.company || '—'} · {a.created_by_name} · {fmtFull(a.created_at)}
                  </div>
                </div>
                <span className={`badge ${a.card_type === 'yellow' ? 'badge-amber' : 'badge-red'}`}>
                  {a.card_type === 'yellow' ? 'SARI' : 'KIRMIZI'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
