import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { SkeletonTable } from '../../../shared/components/Skeleton.jsx'
import { Section, KPI, Empty, Stat, BarList, todayStr, toast } from '../shared.jsx'

export default function ReportsTab() {
  const today = todayStr()
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const [start, setStart] = useState(weekAgo)
  const [end, setEnd] = useState(today)

  const { data, isLoading } = useQuery({
    queryKey: ['transport-reports', start, end],
    queryFn: () => api.get(`/transport/reports?start=${start}&end=${end}`).then(r => r.data),
  })

  function exportCsv(rows, filename, headers) {
    if (!rows?.length) { toast('Veri yok', 'error'); return }
    const csv = [headers.map(h => h.label).join(';')]
      .concat(rows.map(r => headers.map(h => {
        const v = r[h.key] ?? ''
        return typeof v === 'string' && v.includes(';') ? `"${v}"` : v
      }).join(';')))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <SkeletonTable rows={5} cols={5} />
  if (!data) return null

  const { totals, by_pickup, dept_pickup, shift_pickup, route_utilization, by_district, no_pickup_staff, daily_trend, no_show_top = [], per_staff_usage = [] } = data
  const coverage = totals.total_staff > 0 ? Math.round(totals.staff_with_pickup / totals.total_staff * 100) : 0

  // Departman × Durak matrisi tablosu
  const depts = [...new Set(dept_pickup.map(d => d.dept_name))]
  const pickupsInMatrix = [...new Set(dept_pickup.map(d => d.pickup_name))]
  const matrix = {}
  dept_pickup.forEach(r => {
    if (!matrix[r.dept_name]) matrix[r.dept_name] = {}
    matrix[r.dept_name][r.pickup_name] = r.cnt
  })

  return (
    <div>
      {/* Tarih aralığı */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>TARİH ARALIĞI:</span>
        <input type="date" className="form-input" value={start} onChange={e => setStart(e.target.value)} style={{ width: 'auto', fontSize: 12 }} />
        <span style={{ color: 'var(--text3)' }}>→</span>
        <input type="date" className="form-input" value={end} onChange={e => setEnd(e.target.value)} style={{ width: 'auto', fontSize: 12 }} />
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[[7, 'SON 7G'], [30, 'SON 30G'], [90, 'SON 90G']].map(([n, l]) => (
            <button key={n} onClick={() => { setStart(new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10)); setEnd(today) }}
              className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Genel KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        <KPI label="TOPLAM PERSONEL" value={totals.total_staff} color="var(--text)" />
        <KPI label="DURAĞI VAR" value={totals.staff_with_pickup} color="var(--green)" sub={`%${coverage} kapsama`} />
        <KPI label="DURAĞI YOK" value={totals.staff_no_pickup} color={totals.staff_no_pickup > 0 ? 'var(--red)' : 'var(--green)'} />
        <KPI label="AKTİF DURAK" value={totals.active_points} color="var(--accent)" />
        <KPI label="AKTİF ROTA" value={totals.active_routes} color="var(--blue)" />
      </div>

      {/* 1. Durak başına personel — bar chart */}
      <Section title="📍 DURAK BAŞINA PERSONEL"
        right={<button onClick={() => exportCsv(by_pickup, 'durak-personel.csv', [
          { key: 'name', label: 'Durak' }, { key: 'district', label: 'İlçe' },
          { key: 'staff_count', label: 'Kişi' }, { key: 'departments', label: 'Departmanlar' }
        ])} className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }}>CSV</button>}>
        {by_pickup.length === 0 ? <Empty msg="Henüz durağa atanan personel yok" /> : (
          <BarList items={by_pickup.map(p => ({
            label: p.name,
            sub: `${p.district || '—'}${p.departments ? ` · ${p.departments}` : ''}`,
            value: p.staff_count,
          }))} />
        )}
      </Section>

      {/* 2. Bölge/İlçe dağılımı */}
      <Section title="🌍 İLÇE DAĞILIMI">
        {by_district.length === 0 ? <Empty msg="İlçe verisi yok" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {by_district.map(d => (
              <div key={d.district} style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: 1 }}>{d.district}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--text)', marginTop: 2 }}>{d.staff_count}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{d.point_count} durak</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 3. Departman × Durak matrisi */}
      <Section title="🏷 DEPARTMAN × DURAK MATRİSİ">
        {depts.length === 0 ? <Empty msg="Veri yok" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: 6, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEPARTMAN \ DURAK</th>
                  {pickupsInMatrix.map(p => (
                    <th key={p} style={{ padding: 6, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', writingMode: 'sideways-lr', height: 100, minWidth: 32, whiteSpace: 'nowrap' }}>{p}</th>
                  ))}
                  <th style={{ padding: 6, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)' }}>TOPLAM</th>
                </tr>
              </thead>
              <tbody>
                {depts.map(d => {
                  const row = matrix[d] || {}
                  const total = Object.values(row).reduce((s, v) => s + v, 0)
                  return (
                    <tr key={d} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 6, fontWeight: 600 }}>{d}</td>
                      {pickupsInMatrix.map(p => (
                        <td key={p} style={{ padding: 6, textAlign: 'center', fontFamily: 'var(--mono)', color: row[p] ? 'var(--text)' : 'var(--text4)' }}>
                          {row[p] || '·'}
                        </td>
                      ))}
                      <td style={{ padding: 6, textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 4. Vardiya × Durak */}
      <Section title="⏱ VARDİYA × DURAK"
        right={<button onClick={() => exportCsv(shift_pickup, 'vardiya-durak.csv', [
          { key: 'shift_name', label: 'Vardiya' }, { key: 'pickup_name', label: 'Durak' },
          { key: 'district', label: 'İlçe' }, { key: 'cnt', label: 'Kişi' }
        ])} className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }}>CSV</button>}>
        {shift_pickup.length === 0 ? <Empty msg="Bu tarih aralığında vardiya kaydı yok" /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>VARDİYA</th>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DURAK</th>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>İLÇE</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>KİŞİ</th>
              </tr>
            </thead>
            <tbody>
              {shift_pickup.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 8, fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600 }}>
                    {r.shift_name} <span style={{ color: 'var(--text4)' }}>({r.start_hour}-{r.end_hour})</span>
                  </td>
                  <td style={{ padding: 8 }}>{r.pickup_name}</td>
                  <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.district || '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.cnt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 5. Rota kullanım istatistiği */}
      <Section title="🛣 ROTA KULLANIM ANALİZİ"
        right={<button onClick={() => exportCsv(route_utilization, 'rota-kullanim.csv', [
          { key: 'name', label: 'Rota' }, { key: 'vehicle_plate', label: 'Plaka' },
          { key: 'capacity', label: 'Kapasite' }, { key: 'days', label: 'Gün' },
          { key: 'total_assignments', label: 'Toplam Atama' }, { key: 'avg_per_day', label: 'Günlük Ort.' },
          { key: 'avg_fill_pct', label: 'Doluluk %' }
        ])} className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }}>CSV</button>}>
        {route_utilization.length === 0 ? <Empty msg="Henüz rota yok" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {route_utilization.map(r => (
              <div key={r.id} style={{ padding: 12, borderRadius: 10, background: 'var(--surface2)', borderLeft: `4px solid ${r.color || 'var(--accent)'}` }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 8 }}>
                  {r.vehicle_plate || '—'} · {r.capacity} kişilik · {r.shift_name || 'genel'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                  <Stat label="Gün" value={r.days || 0} />
                  <Stat label="Atama" value={r.total_assignments || 0} />
                  <Stat label="Gün/Ort" value={r.avg_per_day || 0} />
                  <Stat label="Doluluk" value={`%${r.avg_fill_pct || 0}`} color={(r.avg_fill_pct || 0) > 90 ? 'var(--red)' : (r.avg_fill_pct || 0) > 60 ? 'var(--green)' : 'var(--amber)'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 6. Günlük trend */}
      <Section title="📈 GÜNLÜK TREND">
        {daily_trend.length === 0 ? <Empty msg="Bu tarihte atama yok" /> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, padding: '0 4px', overflowX: 'auto' }}>
            {daily_trend.map(d => {
              const max = Math.max(...daily_trend.map(x => x.assignments), 1)
              const h = (d.assignments / max) * 80
              return (
                <div key={d.work_date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 32 }} title={`${d.work_date}: ${d.assignments} atama (${d.routes_used} rota)`}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{d.assignments}</span>
                  <div style={{ width: 20, height: h, background: 'var(--accent)', borderRadius: '4px 4px 0 0', marginTop: 2 }} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text4)', marginTop: 2 }}>{d.work_date.slice(5)}</span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* 7. Devamsızlık Top 10 (Faz 6) */}
      {no_show_top.length > 0 && (
        <Section title={`✗ DEVAMSIZLIK TOP 10 (${no_show_top.length})`} danger
          right={<button onClick={() => exportCsv(no_show_top, 'devamsizlik.csv', [
            { key: 'full_name', label: 'Ad Soyad' }, { key: 'dept_name', label: 'Departman' },
            { key: 'pickup_name', label: 'Durak' }, { key: 'no_show_count', label: 'Binmedi' },
            { key: 'boarded_count', label: 'Bindi' }, { key: 'total_assignments', label: 'Toplam Atama' }
          ])} className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }}>CSV</button>}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEPARTMAN</th>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DURAK</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>BİNMEDİ</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)' }}>BİNDİ</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TOPLAM</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>ORAN</th>
              </tr>
            </thead>
            <tbody>
              {no_show_top.map(r => {
                const rate = r.total_assignments > 0 ? Math.round(r.no_show_count / r.total_assignments * 100) : 0
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>{r.full_name}</td>
                    <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 10, color: r.dept_color || 'var(--text3)' }}>{r.dept_name || '—'}</td>
                    <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.pickup_name || '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>{r.no_show_count}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{r.boarded_count}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.total_assignments}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: rate > 30 ? 'var(--red)' : rate > 15 ? 'var(--amber)' : 'var(--text3)' }}>%{rate}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      )}

      {/* 8. Kişi bazı kullanım (Faz 7) */}
      {per_staff_usage.length > 0 && (
        <Section title={`👤 KİŞİ BAZI KULLANIM (${per_staff_usage.length})`}
          right={<button onClick={() => exportCsv(per_staff_usage, 'kisi-bazi-kullanim.csv', [
            { key: 'full_name', label: 'Ad Soyad' }, { key: 'dept_name', label: 'Departman' },
            { key: 'pickup_name', label: 'Durak' }, { key: 'assignment_count', label: 'Atama' },
            { key: 'routes_used', label: 'Rota Sayısı' }, { key: 'last_assigned', label: 'Son Atama' }
          ])} className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }}>CSV</button>}>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                  <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEPARTMAN</th>
                  <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DURAK</th>
                  <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>ATAMA</th>
                  <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>ROTA</th>
                  <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>SON</th>
                </tr>
              </thead>
              <tbody>
                {per_staff_usage.slice(0, 200).map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>{r.full_name}</td>
                    <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 10, color: r.dept_color || 'var(--text3)' }}>{r.dept_name || '—'}</td>
                    <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.pickup_name || '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.assignment_count > 0 ? 'var(--accent)' : 'var(--text4)' }}>{r.assignment_count}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.routes_used}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.last_assigned || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {per_staff_usage.length > 200 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', textAlign: 'center', padding: 8 }}>
                +{per_staff_usage.length - 200} daha (CSV indir)
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 9. Durağı olmayan personel */}
      {no_pickup_staff.length > 0 && (
        <Section title={`⚠ DURAĞI OLMAYAN PERSONEL (${no_pickup_staff.length})`} danger>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
            {no_pickup_staff.map(s => (
              <div key={s.id} style={{ padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11 }}>
                <strong>{s.full_name}</strong>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                  {s.dept_name || '—'}{s.role_label ? ` · ${s.role_label}` : ''}
                  {s.phone ? ` · ${s.phone}` : ''}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

