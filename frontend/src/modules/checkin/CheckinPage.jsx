import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import BlacklistAlert from './BlacklistAlert.jsx'
import ZimmetForm from './ZimmetForm.jsx'

const ALL_BLOCKS = ['M1','M2','M3','S1','S2','S3']
const STEPS = [
  { key: 'search', label: 'ARAMA' },
  { key: 'register', label: 'KAYIT' },
  { key: 'room', label: 'ODA ATAMA' },
  { key: 'zimmet', label: 'ZİMMET' },
]

function StepBar({ step }) {
  return (
    <div style={{ display: 'flex', gap: '0', marginBottom: '24px' }}>
      {STEPS.map((s, i) => {
        const done = i < step, active = i === step
        return (
          <div key={s.key} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '7px',
                background: active ? 'rgba(240,165,0,.1)' : done ? 'rgba(39,201,106,.08)' : 'var(--surface2)',
                border: `1px solid ${active ? 'rgba(240,165,0,.3)' : done ? 'rgba(39,201,106,.2)' : 'var(--border)'}`,
              }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--surface3)',
                  fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                  color: active || done ? '#000' : 'var(--text3)',
                }}>{done ? '✓' : i + 1}</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px',
                  color: active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--text3)' }}>{s.label}</span>
              </div>
            </div>
            {i < STEPS.length - 1 && <div style={{ width: '16px', height: '1px', flexShrink: 0, background: done ? 'rgba(39,201,106,.4)' : 'var(--border)' }} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Autocomplete Input ──────────────────────────────────────────────────────
function AutoInput({ label, value, onChange, suggestions, placeholder }) {
  const [focused, setFocused] = useState(false)
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value).slice(0, 6)
  return (
    <div style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <input className="form-input" value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder} />
      {focused && value.length >= 1 && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
          overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.4)', marginTop: '2px',
        }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={() => onChange(s)} style={{
              padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '11px',
              color: 'var(--text)', borderBottom: '1px solid var(--border)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Room Picker ─────────────────────────────────────────────────────────────
function RoomPicker({ onSelect, selectedRoom, suggestedRoom }) {
  const [block, setBlock] = useState(suggestedRoom?.block || 'M1')
  const [floor, setFloor] = useState(suggestedRoom?.floor || 1)

  const { data: rooms = [] } = useQuery({
    queryKey: ['available-rooms', block],
    queryFn: () => api.get(`/checkin/available-rooms?block=${block}`).then(r => r.data),
  })

  const floorRooms = rooms.filter(r => r.floor === floor)
  const isM = block.startsWith('M')
  const isS2Floor2 = block === 'S2' && floor === 2
  const defaultCap = isS2Floor2 ? 4 : 6

  const oddRooms = floorRooms.filter(r => Number(r.room_no) % 2 !== 0)
  const evenRooms = floorRooms.filter(r => Number(r.room_no) % 2 === 0)

  return (
    <div>
      {/* Block & floor selector */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {ALL_BLOCKS.map(b => (
          <button key={b} onClick={() => { setBlock(b); setFloor(1) }}
            className={`filter-chip${block === b ? ' active' : ''}`}
            style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1px', padding: '5px 12px' }}>
            {b}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          {[1, 2].map(f => (
            <button key={f} onClick={() => setFloor(f)}
              className={`filter-chip${floor === f ? ' active' : ''}`}
              style={{ padding: '5px 10px', fontSize: '11px' }}>KAT {f}</button>
          ))}
        </div>
      </div>

      {/* Block info */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '8px' }}>
        {block} BLOK · KAT {floor} · {isM ? 'ORTAK BANYO' : 'ÖZEL BANYO'}{isS2Floor2 ? ' · 4 KİŞİLİK' : ' · 6 KİŞİLİK'}
        {' · '}{floorRooms.filter(r => r.current_count < r.active_beds).length} BOŞ ODA
      </div>

      {/* Room grid - corridor layout */}
      <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
        <div style={{ minWidth: 'max-content' }}>
          {/* SOL — odd */}
          <div style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
            <div style={{ width: '32px', flexShrink: 0, fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text4)', textAlign: 'center', lineHeight: 1.4, alignSelf: 'center' }}>SOL<br/>TEK</div>
            {oddRooms.map(r => {
              const full = r.current_count >= r.active_beds
              const sel = selectedRoom?.room_id === r.room_id
              const isSuggested = suggestedRoom?.room_id === r.room_id
              return (
                <div key={r.room_id} onClick={() => !full && onSelect(r)}
                  title={`${r.room_no} — ${r.current_count}/${r.active_beds}`}
                  style={{
                    width: '48px', height: '52px', borderRadius: '5px', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
                    cursor: full ? 'not-allowed' : 'pointer',
                    background: sel ? 'rgba(240,165,0,.2)' : full ? 'rgba(231,76,60,.1)' : isSuggested ? 'rgba(59,140,240,.12)' : r.current_count > 0 ? 'rgba(240,165,0,.06)' : 'rgba(39,201,106,.06)',
                    border: `${sel ? '2px' : '1px'} solid ${sel ? 'var(--accent)' : full ? 'rgba(231,76,60,.3)' : isSuggested ? 'rgba(59,140,240,.5)' : r.current_count > 0 ? 'rgba(240,165,0,.2)' : 'rgba(39,201,106,.2)'}`,
                    opacity: full ? 0.5 : 1, transition: 'all .12s',
                  }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: sel ? 'var(--accent)' : full ? 'var(--red)' : isSuggested ? 'var(--blue)' : 'var(--text)' }}>{r.room_no}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: full ? 'var(--red)' : 'var(--text3)' }}>{r.current_count}/{r.active_beds}</div>
                  {isSuggested && !sel && <div style={{ fontFamily: 'var(--mono)', fontSize: '5px', color: 'var(--blue)', letterSpacing: '0.5px' }}>ÖNERİ</div>}
                </div>
              )
            })}
          </div>
          {/* Corridor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '16px', margin: '2px 0' }}>
            <div style={{ width: '32px', flexShrink: 0 }} />
            <div style={{ flex: 1, height: '100%', background: 'linear-gradient(90deg,rgba(0,0,0,.25),rgba(35,45,63,.4),rgba(0,0,0,.25))', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '6px', color: 'var(--text4)', letterSpacing: '4px' }}>KORİDOR</span>
            </div>
          </div>
          {/* SAĞ — even */}
          <div style={{ display: 'flex', gap: '3px' }}>
            <div style={{ width: '32px', flexShrink: 0, fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text4)', textAlign: 'center', lineHeight: 1.4, alignSelf: 'center' }}>SAĞ<br/>ÇİFT</div>
            {evenRooms.map(r => {
              const full = r.current_count >= r.active_beds
              const sel = selectedRoom?.room_id === r.room_id
              const isSuggested = suggestedRoom?.room_id === r.room_id
              return (
                <div key={r.room_id} onClick={() => !full && onSelect(r)}
                  title={`${r.room_no} — ${r.current_count}/${r.active_beds}`}
                  style={{
                    width: '48px', height: '52px', borderRadius: '5px', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
                    cursor: full ? 'not-allowed' : 'pointer',
                    background: sel ? 'rgba(240,165,0,.2)' : full ? 'rgba(231,76,60,.1)' : isSuggested ? 'rgba(59,140,240,.12)' : r.current_count > 0 ? 'rgba(240,165,0,.06)' : 'rgba(39,201,106,.06)',
                    border: `${sel ? '2px' : '1px'} solid ${sel ? 'var(--accent)' : full ? 'rgba(231,76,60,.3)' : isSuggested ? 'rgba(59,140,240,.5)' : r.current_count > 0 ? 'rgba(240,165,0,.2)' : 'rgba(39,201,106,.2)'}`,
                    opacity: full ? 0.5 : 1, transition: 'all .12s',
                  }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: sel ? 'var(--accent)' : full ? 'var(--red)' : isSuggested ? 'var(--blue)' : 'var(--text)' }}>{r.room_no}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: full ? 'var(--red)' : 'var(--text3)' }}>{r.current_count}/{r.active_beds}</div>
                  {isSuggested && !sel && <div style={{ fontFamily: 'var(--mono)', fontSize: '5px', color: 'var(--blue)', letterSpacing: '0.5px' }}>ÖNERİ</div>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
        {[
          ['rgba(39,201,106,.2)', 'BOŞ'],
          ['rgba(240,165,0,.25)', 'KISMİ DOLU'],
          ['rgba(231,76,60,.3)', 'DOLU'],
          ['rgba(59,140,240,.5)', 'ÖNERİLEN'],
          ['var(--accent)', 'SEÇİLİ'],
        ].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', border: `2px solid ${c}` }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)' }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stats Dashboard ─────────────────────────────────────────────────────────
function StatsDashboard() {
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
                    <div style={{ padding: '10px 16px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>Yükleniyor...</div>
                  ) : (
                    <table className="data-table" style={{ margin: 0 }}>
                      <thead><tr><th>AD SOYAD</th><th>MESLEK</th><th>ODA</th><th>VARDİYA</th></tr></thead>
                      <tbody>
                        {personnel.map(p => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 600, fontSize: '11px' }}>{p.full_name}</td>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>{p.job_title || '—'}</td>
                            <td>{p.block ? <span className="badge badge-gray">{p.block} {p.room_no}</span> : <span style={{ color: 'var(--text4)', fontSize: '9px' }}>—</span>}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '3px' }}>
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

// ── Main Page ───────────────────────────────────────────────────────────────
export default function CheckinPage() {
  const [step, setStep] = useState(0)
  const [searchMode, setSearchMode] = useState('name')
  const [tcNo, setTcNo] = useState('')
  const [passportNo, setPassportNo] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [nameResults, setNameResults] = useState([])
  const [nameSearching, setNameSearching] = useState(false)
  const [foundPerson, setFoundPerson] = useState(null)
  const [blacklistPerson, setBlacklistPerson] = useState(null)
  const [formData, setFormData] = useState({ full_name: '', company: '', job_title: '', preferred_block: '', phone_number: '' })
  const [shiftType, setShiftType] = useState('day')
  const [personnelId, setPersonnelId] = useState(null)
  const [suggestedRoom, setSuggestedRoom] = useState(null)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [assignedBed, setAssignedBed] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const qc = useQueryClient()

  // Autocomplete suggestions
  const { data: companySugg = [] } = useQuery({
    queryKey: ['company-suggestions'],
    queryFn: () => api.get('/checkin/company-suggestions').then(r => r.data),
  })
  const { data: jobSugg = [] } = useQuery({
    queryKey: ['job-suggestions'],
    queryFn: () => api.get('/checkin/job-suggestions').then(r => r.data),
  })

  const companyNames = companySugg.map(c => c.company)
  const jobNames = jobSugg.map(j => j.job_title)

  const handleNameSearch = async (q) => {
    setNameSearch(q)
    if (q.trim().length < 2) { setNameResults([]); return }
    setNameSearching(true)
    try {
      const res = await api.post('/checkin/search-name', { name: q.trim() })
      setNameResults(res.data)
    } catch { setNameResults([]) }
    finally { setNameSearching(false) }
  }

  const handleSelectPerson = async (person) => {
    if (person.is_blacklisted) { setBlacklistPerson(person); return }
    setFoundPerson(person)
    setPersonnelId(person.id)
    setFormData({ full_name: person.full_name, company: person.company || '', job_title: person.job_title || '', preferred_block: person.preferred_block || '' })
    setShiftType(person.shift_type || 'day')
    setNameResults([])
    setError('')
    setLoading(true)
    try {
      const roomRes = await api.post('/checkin/suggest-room', { company: person.company || '', hometown: '' })
      setSuggestedRoom(roomRes.data)
      setSelectedRoom(roomRes.data)
    } catch { setSuggestedRoom(null); setSelectedRoom(null) }
    setLoading(false)
    setStep(2)
  }

  const handleLookup = async () => {
    if (!tcNo && !passportNo) return
    setLoading(true); setError('')
    try {
      const res = await api.post('/checkin/lookup', { tc_no: tcNo || undefined, passport_no: passportNo || undefined })
      if (res.data.found) {
        await handleSelectPerson(res.data)
      } else {
        setStep(1)
      }
    } catch (e) { setError(e.response?.data?.error || 'Arama hatası') }
    finally { setLoading(false) }
  }

  const handleRegister = async () => {
    setLoading(true); setError('')
    try {
      const res = await api.post('/checkin/register', { tc_no: tcNo || undefined, passport_no: passportNo || undefined, ...formData })
      setPersonnelId(res.data.id)
      try { await api.post('/checkin/set-shift', { personnel_id: res.data.id, shift_type: shiftType }) } catch {}
      qc.invalidateQueries(['company-suggestions'])
      qc.invalidateQueries(['job-suggestions'])
      try {
        const roomRes = await api.post('/checkin/suggest-room', { company: formData.company, hometown: '' })
        setSuggestedRoom(roomRes.data)
        setSelectedRoom(roomRes.data)
      } catch { setSuggestedRoom(null); setSelectedRoom(null) }
      setStep(2)
    } catch (e) { setError(e.response?.data?.error || 'Kayıt hatası') }
    finally { setLoading(false) }
  }

  const handleAssignRoom = async () => {
    if (!selectedRoom) return
    setLoading(true); setError('')
    try {
      const res = await api.post('/checkin/assign-room', { personnel_id: personnelId, room_id: selectedRoom.room_id || selectedRoom.id })
      setAssignedBed(res.data.bed_no)
      try { await api.post('/checkin/set-shift', { personnel_id: personnelId, shift_type: shiftType }) } catch {}
      qc.invalidateQueries(['company-stats'])
      qc.invalidateQueries(['checkin-stats'])
      qc.invalidateQueries(['job-stats'])
      setStep(3)
    } catch (e) { setError(e.response?.data?.error || 'Oda atama hatası') }
    finally { setLoading(false) }
  }

  const resetFlow = () => {
    setStep(0); setTcNo(''); setPassportNo(''); setNameSearch(''); setNameResults([])
    setFoundPerson(null); setFormData({ full_name: '', company: '', job_title: '', preferred_block: '', phone_number: '' })
    setShiftType('day'); setPersonnelId(null); setSuggestedRoom(null); setSelectedRoom(null)
    setAssignedBed(null); setError('')
  }

  return (
    <div style={{ position: 'relative', zIndex: 1 }} className="fade-up">
      {blacklistPerson && <BlacklistAlert person={blacklistPerson} onClose={() => setBlacklistPerson(null)} />}

      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '28px', letterSpacing: '4px', color: 'var(--text)' }}>CHECK-IN</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            GİRİŞ KAYDI · ODA ATAMASI · VARDİYA YÖNETİMİ
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
        {/* LEFT: Check-in flow */}
        <div>
          <StepBar step={step} />

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '14px' }}>
              <span>!</span><span>{error}</span>
            </div>
          )}

          {/* Step 0: Arama */}
          {step === 0 && (
            <div className="panel fade-up-1">
              <div className="panel-header">
                <div><div className="panel-title">PERSONEL ARA</div><div className="panel-subtitle">AD, TC VEYA PASAPORT İLE ARAMA</div></div>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border)' }}>
                  {[{ id: 'name', label: '👤 AD SOYAD' }, { id: 'tc', label: '⊕ TC' }, { id: 'passport', label: '⊕ PASAPORT' }].map(m => (
                    <button key={m.id} onClick={() => { setSearchMode(m.id); setError(''); setNameResults([]) }}
                      style={{
                        flex: 1, padding: '7px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                        background: searchMode === m.id ? 'var(--accent)' : 'transparent',
                        color: searchMode === m.id ? '#000' : 'var(--text3)',
                      }}>{m.label}</button>
                  ))}
                </div>

                {searchMode === 'name' && (
                  <>
                    <div>
                      <label className="form-label">Ad Soyad, Firma veya Meslek</label>
                      <input value={nameSearch} onChange={e => handleNameSearch(e.target.value)}
                        className="form-input" placeholder="En az 2 harf yazın..." autoFocus />
                    </div>
                    {nameSearching && <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>Aranıyor...</div>}
                    {nameResults.length > 0 && (
                      <div style={{ border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden', background: 'var(--surface2)', maxHeight: '320px', overflowY: 'auto' }}>
                        {nameResults.map(p => (
                          <div key={p.id} onClick={() => handleSelectPerson(p)}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid rgba(35,45,63,.4)', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div style={{
                              width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                              background: p.is_blacklisted ? 'var(--red)' : 'linear-gradient(135deg,var(--accent),var(--purple))',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: 'var(--display)', fontSize: '12px', color: '#fff',
                            }}>{p.is_blacklisted ? '!' : p.full_name.charAt(0).toUpperCase()}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: p.is_blacklisted ? 'var(--red)' : 'var(--text)' }}>
                                {p.full_name}
                                {p.is_blacklisted && <span style={{ marginLeft: '6px', fontSize: '8px', color: 'var(--red)' }}>KARA LİSTE</span>}
                              </div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '1px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <span>{p.company || '—'}</span>
                                {p.job_title && <span style={{ color: 'var(--teal)' }}>{p.job_title}</span>}
                                {p.block && <span style={{ color: 'var(--blue)' }}>{p.block} {p.room_no}</span>}
                                {p.shift_type && <span style={{ color: p.shift_type === 'night' ? 'var(--purple)' : 'var(--accent)' }}>{p.shift_type === 'night' ? '☾ GECE' : '☀ GÜNDÜZ'}</span>}
                              </div>
                            </div>
                            <button className="btn btn-primary btn-xs">SEÇ</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {nameSearch.trim().length >= 2 && !nameSearching && nameResults.length === 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', padding: '12px 0' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>Sonuç bulunamadı</div>
                        <button className="btn btn-primary btn-sm" onClick={() => { setFormData(p => ({ ...p, full_name: nameSearch.trim() })); setStep(1) }}>
                          + YENİ PERSONEL KAYDET
                        </button>
                      </div>
                    )}
                  </>
                )}

                {searchMode === 'tc' && (
                  <>
                    <div><label className="form-label">TC Kimlik No</label>
                      <input value={tcNo} onChange={e => setTcNo(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLookup()}
                        className="form-input" maxLength={11} placeholder="11 haneli TC kimlik no" autoFocus /></div>
                    <button onClick={handleLookup} disabled={loading || !tcNo} className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', opacity: (loading || !tcNo) ? 0.6 : 1 }}>
                      {loading ? 'SORGULANIYIR...' : '⊕ SORGULA'}</button>
                  </>
                )}

                {searchMode === 'passport' && (
                  <>
                    <div><label className="form-label">Pasaport No</label>
                      <input value={passportNo} onChange={e => setPassportNo(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLookup()}
                        className="form-input" placeholder="Pasaport numarası" autoFocus /></div>
                    <button onClick={handleLookup} disabled={loading || !passportNo} className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', opacity: (loading || !passportNo) ? 0.6 : 1 }}>
                      {loading ? 'SORGULANIYIR...' : '⊕ SORGULA'}</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 1: Kayıt */}
          {step === 1 && (
            <div className="panel fade-up-1">
              <div className="panel-header">
                <div><div className="panel-title">YENİ PERSONEL KAYDI</div><div className="panel-subtitle">BİLGİLERİ GİRİN</div></div>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="form-label">Ad Soyad *</label>
                  <input value={formData.full_name} onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))}
                    className="form-input" placeholder="Ad Soyad" />
                </div>
                <AutoInput label="Firma" value={formData.company} onChange={v => setFormData(p => ({ ...p, company: v }))}
                  suggestions={companyNames} placeholder="Firma adı yazın..." />
                <AutoInput label="Meslek / Ne İşçisi" value={formData.job_title} onChange={v => setFormData(p => ({ ...p, job_title: v }))}
                  suggestions={jobNames} placeholder="Kalıpçı, Elektrikçi, Boyacı..." />
                <div>
                  <label className="form-label">Telefon Numarası</label>
                  <input value={formData.phone_number} onChange={e => setFormData(p => ({ ...p, phone_number: e.target.value }))}
                    className="form-input" placeholder="05XX XXX XX XX" type="tel" />
                </div>

                {/* Shift */}
                <div>
                  <label className="form-label">VARDİYA</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { id: 'day', label: '☀ GÜNDÜZ', sub: '08:00–17:00', bg: 'rgba(240,165,0,.15)', border: 'rgba(240,165,0,.4)', color: 'var(--accent)' },
                      { id: 'night', label: '☾ GECE', sub: '20:00–08:00', bg: 'rgba(99,102,241,.15)', border: 'rgba(99,102,241,.4)', color: 'var(--purple)' },
                    ].map(s => (
                      <button key={s.id} onClick={() => setShiftType(s.id)}
                        style={{
                          flex: 1, padding: '10px', borderRadius: '7px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700,
                          background: shiftType === s.id ? s.bg : 'var(--surface2)',
                          color: shiftType === s.id ? s.color : 'var(--text3)',
                          border: `1px solid ${shiftType === s.id ? s.border : 'var(--border)'}`,
                        }}>
                        {s.label}
                        <span style={{ fontSize: '8px', opacity: 0.7 }}>{s.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
                  <button onClick={() => setStep(0)} className="btn btn-ghost">&larr; GERİ</button>
                  <button onClick={handleRegister} disabled={loading || !formData.full_name} className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center', opacity: (loading || !formData.full_name) ? 0.6 : 1 }}>
                    {loading ? 'KAYDEDİLİYOR...' : 'KAYDET VE DEVAM →'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Oda Ataması - tam seçim */}
          {step === 2 && (
            <div className="panel fade-up-1">
              <div className="panel-header">
                <div><div className="panel-title">ODA ATAMASI</div>
                  <div className="panel-subtitle">ODA SEÇİN VEYA ÖNERİYİ KABUL EDİN</div></div>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Person summary */}
                <div style={{ background: 'var(--surface2)', borderRadius: '7px', padding: '10px 14px', border: '1px solid var(--border)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,var(--accent),var(--purple))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--display)', fontSize: '14px', color: '#fff',
                  }}>{(formData.full_name || 'P').charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px' }}>{formData.full_name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                      <span>{formData.company || '—'}</span>
                      {formData.job_title && <span style={{ color: 'var(--teal)' }}>{formData.job_title}</span>}
                      <span style={{ color: shiftType === 'night' ? 'var(--purple)' : 'var(--accent)' }}>
                        {shiftType === 'night' ? '☾ GECE' : '☀ GÜNDÜZ'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Room picker */}
                <RoomPicker
                  suggestedRoom={suggestedRoom}
                  selectedRoom={selectedRoom}
                  onSelect={setSelectedRoom}
                />

                {/* Selected room info */}
                {selectedRoom && (
                  <div style={{
                    background: 'rgba(240,165,0,.08)', borderRadius: '7px', padding: '10px 14px',
                    border: '1px solid rgba(240,165,0,.3)', display: 'flex', alignItems: 'center', gap: '12px',
                  }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color: 'var(--accent)', letterSpacing: '1px' }}>
                      {selectedRoom.block} — {selectedRoom.room_no}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>
                      KAT {selectedRoom.floor} · {selectedRoom.current_count}/{selectedRoom.active_beds} KİŞİ
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setStep(0)} className="btn btn-ghost">&larr; GERİ</button>
                  <button onClick={handleAssignRoom} disabled={loading || !selectedRoom} className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center', opacity: (loading || !selectedRoom) ? 0.6 : 1 }}>
                    {loading ? 'ATANIYOR...' : '✓ ODAYI ONAYLA'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Zimmet */}
          {step === 3 && (
            <div className="fade-up-1">
              <div className="alert alert-success" style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '16px' }}>✓</span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>Oda ataması tamamlandı</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>
                    {selectedRoom?.block} {selectedRoom?.room_no} · YATAK {assignedBed}
                    {' · '}
                    <span style={{ color: shiftType === 'night' ? 'var(--purple)' : 'var(--accent)' }}>
                      {shiftType === 'night' ? '☾ GECE' : '☀ GÜNDÜZ'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <div><div className="panel-title">ZİMMET VE İMZA</div><div className="panel-subtitle">EKİPMAN TESLİM ALINDI ONAYI</div></div>
                </div>
                <div className="panel-body">
                  <ZimmetForm personnelId={personnelId} onDone={() => {}} />
                </div>
              </div>
              <button onClick={resetFlow} className="btn btn-primary" style={{ width: '100%', marginTop: '16px', justifyContent: 'center' }}>
                + YENİ CHECK-IN
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Stats Dashboard */}
        <StatsDashboard />
      </div>
    </div>
  )
}
