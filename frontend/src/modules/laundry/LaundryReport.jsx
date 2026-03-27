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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Toplam Kayıt', value: stats.total || 0, color: 'var(--text2)' },
              { label: 'Teslim Edilen', value: stats.delivered || 0, color: 'var(--green)' },
              { label: 'SLA İhlali', value: stats.sla_violations || 0, color: 'var(--red)' },
              { label: 'Ort. Süre (saat)', value: stats.avg_hours != null ? stats.avg_hours.toFixed(1) : '—', color: 'var(--accent)' },
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
        </>
      )}
    </div>
  )
}
