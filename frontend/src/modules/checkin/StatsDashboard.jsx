// Check-in sağ paneli: yatak doluluk + blok dağılımı KPI'ları ve firma/meslek
// kırılımı (firma genişletilince personel + vardiya hızlı değişimi).
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

export default function StatsDashboard() {
  const qc = useQueryClient()
  const [expandedCompany, setExpandedCompany] = useState(null)
  const [statsTab, setStatsTab] = useState('company') // company | job | block

  const { data: stats } = useQuery({ queryKey: ['checkin-stats'], queryFn: () => api.get('/checkin/stats').then(r => r.data) })
  const { data: companyStats = [] } = useQuery({ queryKey: ['company-stats'], queryFn: () => api.get('/checkin/company-stats').then(r => r.data) })
  const { data: jobStats = [] } = useQuery({ queryKey: ['job-stats'], queryFn: () => api.get('/checkin/job-stats').then(r => r.data) })
  const { data: personnel = [], isFetching: personnelFetching } = useQuery({
    queryKey: ['company-personnel', expandedCompany],
    queryFn: () => api.get(`/checkin/company-personnel/${encodeURIComponent(expandedCompany)}`).then(r => r.data),
    enabled: !!expandedCompany,
  })

  const mutShift = useMutation({
    mutationFn: ({ personnel_id, shift_type }) => api.post('/checkin/set-shift', { personnel_id, shift_type }),
    onSuccess: () => {
      qc.invalidateQueries(['company-personnel', expandedCompany])
      qc.invalidateQueries(['company-stats'])
      qc.invalidateQueries(['checkin-stats'])
      qc.invalidateQueries(['job-stats'])
    },
  })

  if (!stats) return null

  const bedPct = stats.total_beds > 0 ? Math.round((stats.total_occupied / stats.total_beds) * 100) : 0

  const TAB = (id, label) => (
    <button key={id} onClick={() => { setStatsTab(id); setExpandedCompany(null) }}
      style={{
        padding: '6px 14px', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '1px',
        background: statsTab === id ? 'var(--accent)' : 'transparent',
        color: statsTab === id ? '#000' : 'var(--text3)',
        borderBottom: statsTab === id ? '2px solid var(--accent)' : '2px solid transparent',
      }}>{label}</button>
  )

  return (
    <div className="panel fade-up-1">
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--purple),var(--blue),var(--teal))' }} />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1px', background: 'var(--border)' }}>
        {[
          { label: 'TOPLAM PERSONEL', value: stats.total, color: 'var(--text)' },
          { label: 'ODA ATANMIŞ', value: stats.checked_in, color: 'var(--green)' },
          { label: 'GÜNDÜZ VARDİYA', value: stats.day_shift, color: 'var(--accent)' },
          { label: 'GECE VARDİYA', value: stats.night_shift, color: 'var(--purple)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', padding: '12px 14px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text3)', letterSpacing: '1.5px', marginBottom: '3px' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Bed occupancy */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '14px', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '4px' }}>YATAK DOLULUK</div>
          <div className="prog-bar" style={{ height: '6px' }}>
            <div className={`prog-fill ${bedPct >= 90 ? 'prog-red' : bedPct >= 70 ? 'prog-amber' : 'prog-green'}`} style={{ width: `${bedPct}%` }} />
          </div>
        </div>
        <div style={{ fontFamily: 'var(--display)', fontSize: '20px', color: bedPct >= 90 ? 'var(--red)' : bedPct >= 70 ? 'var(--accent)' : 'var(--green)' }}>%{bedPct}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
          {stats.total_occupied}/{stats.total_beds} yatak · {stats.full_rooms} dolu oda
        </div>
      </div>

      {/* Block distribution mini */}
      {stats.blockDist && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {stats.blockDist.map(b => {
            const bPct = b.beds > 0 ? Math.round((b.occupied / b.beds) * 100) : 0
            return (
              <div key={b.block} style={{
                flex: 1, minWidth: '80px', padding: '8px 10px', borderRadius: '6px',
                background: 'var(--surface2)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: '14px', color: 'var(--text)', letterSpacing: '1px' }}>{b.block}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: bPct >= 90 ? 'var(--red)' : 'var(--text3)' }}>%{bPct}</span>
                </div>
                <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${bPct}%`, height: '100%', background: bPct >= 90 ? 'var(--red)' : bPct >= 70 ? 'var(--accent)' : 'var(--green)', transition: 'width .4s' }} />
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text4)', marginTop: '3px' }}>{b.occupied}/{b.beds}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        {TAB('company', `FİRMALAR (${companyStats.length})`)}
        {TAB('job', `MESLEKLER (${jobStats.length})`)}
      </div>

      {/* Tab content */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {statsTab === 'company' && companyStats.map(c => {
          const isExp = expandedCompany === c.company
          const total = companyStats.reduce((s, x) => s + x.total, 0)
          const pct = total > 0 ? Math.round((c.total / total) * 100) : 0
          return (
            <div key={c.company || '—'}>
              <div onClick={() => setExpandedCompany(isExp ? null : c.company)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: isExp ? 'rgba(99,102,241,.05)' : 'transparent',
                }}
                onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = isExp ? 'rgba(99,102,241,.05)' : 'transparent' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text)' }}>{c.company || '(Belirtilmemiş)'}</div>
                </div>
                <div style={{ width: '60px', height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: '3px' }} />
                </div>
                <span className="badge badge-blue" style={{ fontSize: '9px', minWidth: '24px', textAlign: 'center' }}>{c.total}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--accent)' }}>☀{c.day_shift}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--purple)' }}>☾{c.night_shift}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
              </div>
              {isExp && (
                <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  {personnelFetching ? (
                    <SkeletonTable rows={3} cols={4} />
                  ) : (
                    <table className="data-table responsive-stack" style={{ margin: 0 }}>
                      <thead><tr><th>AD SOYAD</th><th>MESLEK</th><th>ODA</th><th>VARDİYA</th></tr></thead>
                      <tbody>
                        {personnel.map(p => (
                          <tr key={p.id}>
                            <td data-label="Ad Soyad" style={{ fontWeight: 600, fontSize: '11px' }}>{p.full_name}</td>
                            <td data-label="Meslek" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>{p.job_title || '—'}</td>
                            <td data-label="Oda">{p.block ? <span className="badge badge-gray">{p.block} {p.room_no}</span> : <span style={{ color: 'var(--text4)', fontSize: '9px' }}>—</span>}</td>
                            <td data-label="Vardiya">
                              <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end' }}>
                                <button onClick={() => mutShift.mutate({ personnel_id: p.id, shift_type: 'day' })}
                                  style={{ padding: '2px 6px', borderRadius: '3px', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '8px', fontWeight: 700,
                                    background: (p.shift_type === 'day' || !p.shift_type) ? 'var(--accent)' : 'var(--surface3)', color: (p.shift_type === 'day' || !p.shift_type) ? '#000' : 'var(--text3)' }}>
                                  ☀</button>
                                <button onClick={() => mutShift.mutate({ personnel_id: p.id, shift_type: 'night' })}
                                  style={{ padding: '2px 6px', borderRadius: '3px', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '8px', fontWeight: 700,
                                    background: p.shift_type === 'night' ? 'var(--purple)' : 'var(--surface3)', color: p.shift_type === 'night' ? '#fff' : 'var(--text3)' }}>
                                  ☾</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {statsTab === 'job' && jobStats.map(j => {
          const total = jobStats.reduce((s, x) => s + x.total, 0)
          const pct = total > 0 ? Math.round((j.total / total) * 100) : 0
          return (
            <div key={j.job_title} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text)' }}>{j.job_title}</div>
              </div>
              <div style={{ width: '60px', height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', borderRadius: '3px' }} />
              </div>
              <span className="badge badge-gray" style={{ fontSize: '9px', minWidth: '24px', textAlign: 'center' }}>{j.total}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>%{pct}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--accent)' }}>☀{j.day_shift}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--purple)' }}>☾{j.night_shift}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
