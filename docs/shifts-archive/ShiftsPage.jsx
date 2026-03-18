import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'

// ─── Constants ────────────────────────────────────────────────────────────────
const LEAVE_TYPES = {
  annual:      { label: 'Yillik',     badge: 'badge-blue' },
  sick:        { label: 'Hastalik',   badge: 'badge-red' },
  emergency:   { label: 'Acil',       badge: 'badge-amber' },
  maternity:   { label: 'Dogum',      badge: 'badge-red' },
  paternity:   { label: 'Babalik',    badge: 'badge-blue' },
  marriage:    { label: 'Evlilik',    badge: 'badge-amber' },
  bereavement: { label: 'Olum',       badge: 'badge-gray' },
}

const STATUS_MAP = {
  pending:  { label: 'Bekliyor',    badge: 'badge-amber' },
  approved: { label: 'Onayli',      badge: 'badge-green' },
  rejected: { label: 'Reddedildi',  badge: 'badge-red' },
}

const SWAP_STATUS = {
  pending:  { label: 'Bekliyor',  badge: 'badge-amber' },
  approved: { label: 'Onaylandi', badge: 'badge-green' },
  rejected: { label: 'Reddedildi', badge: 'badge-red' },
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

function shortDay(dateStr) {
  return new Date(dateStr).toLocaleDateString('tr-TR', { weekday: 'short' })
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// ─── Shared modal overlay ─────────────────────────────────────────────────────
function ModalOverlay({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '24px',
          width: '100%',
          maxWidth: '460px',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── PersonnelSearch component ────────────────────────────────────────────────
function PersonnelSearch({ value, onChange, placeholder = 'Personel ara...', onPersonClick }) {
  const [inputValue, setInputValue] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const timerRef = useRef(null)

  const { data: results = [] } = useQuery({
    queryKey: ['personnel-search', query],
    queryFn: () => api.get('/shifts/personnel/search', { params: { q: query } }).then(r => r.data),
    enabled: query.length >= 2,
  })

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInput = (val) => {
    setInputValue(val)
    onChange('')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setQuery(val), 300)
    setOpen(true)
  }

  const select = (person) => {
    onChange(person.id)
    setInputValue(person.full_name)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className="form-input"
        placeholder={placeholder}
        value={inputValue}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { if (results.length > 0 && !value) setOpen(true) }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '0 0 7px 7px', maxHeight: '200px', overflowY: 'auto',
        }}>
          {results.map(p => (
            <div
              key={p.id}
              onClick={() => select(p)}
              style={{
                padding: '8px 13px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                fontSize: '12.5px', color: 'var(--text)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: p.gender === 'female' ? '#f472b6' : 'var(--blue)', fontSize: '11px' }}>
                {p.gender === 'female' ? '\u2640' : '\u2642'}
              </span>
              <span
                onClick={(e) => { if (onPersonClick) { e.stopPropagation(); select(p); onPersonClick(p.id) } }}
                style={{ cursor: onPersonClick ? 'pointer' : 'inherit' }}
              >{p.full_name}</span>
              {p.dept_name && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginLeft: 'auto' }}>
                  {p.dept_name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Personnel Detail Panel ──────────────────────────────────────────────────
function PersonnelDetailPanel({ personnelId, onClose }) {
  const [detailTab, setDetailTab] = useState('overview')

  const { data, isLoading } = useQuery({
    queryKey: ['personnel-detail', personnelId],
    queryFn: () => api.get(`/shifts/personnel/${personnelId}/detail`).then(r => r.data),
    enabled: !!personnelId,
  })

  if (!personnelId) return null

  const DETAIL_TABS = [
    { id: 'overview', label: 'OZET' },
    { id: 'shifts', label: 'VARDIYALAR' },
    { id: 'leave', label: 'IZINLER' },
    { id: 'overtime', label: 'MESAI' },
    { id: 'attendance', label: 'YOKLAMA' },
  ]

  const person = data?.person
  const stats = data?.stats

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 55,
        background: 'rgba(0,0,0,.65)',
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '600px', height: '100vh',
          background: 'var(--bg)', borderLeft: '1px solid var(--border)',
          overflowY: 'auto', padding: '24px',
          animation: 'slideInRight .25s ease-out',
        }}
      >
        {isLoading ? (
          <div className="empty-state"><div className="empty-sub">Yukleniyor...</div></div>
        ) : !data ? (
          <div className="empty-state"><div className="empty-sub">Veri bulunamadi</div></div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: person.gender === 'female' ? 'rgba(244,114,182,.15)' : 'rgba(59,140,240,.15)',
                    color: person.gender === 'female' ? '#f472b6' : 'var(--blue)',
                    fontSize: '18px',
                  }}>
                    {person.gender === 'female' ? '\u2640' : '\u2642'}
                  </span>
                  <div>
                    <h3 style={{ fontFamily: 'var(--display)', fontSize: '22px', letterSpacing: '2px', color: 'var(--text)', margin: 0 }}>
                      {person.full_name}
                    </h3>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '2px' }}>
                      TC: {person.tc_no || '—'} &middot; ID: {person.id}
                    </div>
                  </div>
                </div>
                {person.dept_name && (
                  <span className="badge badge-blue" style={{ marginTop: '4px' }}>{person.dept_name}</span>
                )}
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>
                  Giris: {person.check_in_date ? new Date(person.check_in_date).toLocaleDateString('tr-TR') : '—'}
                  {person.check_out_date && ` · Cikis: ${new Date(person.check_out_date).toLocaleDateString('tr-TR')}`}
                </div>
              </div>
              <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ fontSize: '18px', lineHeight: 1 }}>✕</button>
            </div>

            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '20px' }}>
              {[
                { label: 'Toplam Vardiya', value: stats.totalShifts, color: 'var(--blue)' },
                { label: 'Calisti', value: stats.workedShifts, color: 'var(--green)' },
                { label: 'Mesai (saat)', value: stats.totalOvertime, color: 'var(--accent)' },
                { label: 'Izin', value: stats.totalLeave, color: 'var(--purple)' },
                { label: 'Devamsiz', value: stats.absentCount, color: 'var(--red)' },
              ].map(s => (
                <div key={s.label} className="panel" style={{ padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color: s.color, letterSpacing: '1px' }}>{s.value}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '2px' }}>{s.label.toUpperCase()}</div>
                </div>
              ))}
            </div>

            {/* Detail tabs */}
            <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
              {DETAIL_TABS.map(t => (
                <button key={t.id} onClick={() => setDetailTab(t.id)}
                  className={`filter-chip ${detailTab === t.id ? 'active' : ''}`}
                  style={{ borderRadius: '7px 7px 0 0', borderBottom: detailTab === t.id ? '2px solid var(--accent)' : '2px solid transparent', fontSize: '10px' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {detailTab === 'overview' && (
              <div>
                <h4 style={{ fontFamily: 'var(--display)', fontSize: '14px', color: 'var(--accent)', letterSpacing: '2px', marginBottom: '10px' }}>SON VARDIYALAR</h4>
                {data.shiftHistory.length === 0 ? (
                  <div className="empty-state" style={{ padding: '16px' }}><div className="empty-sub">Vardiya kaydi yok</div></div>
                ) : (
                  <div className="panel" style={{ marginBottom: '16px' }}>
                    <table className="data-table">
                      <thead><tr><th>Tarih</th><th>Vardiya</th><th>Departman</th><th>Durum</th></tr></thead>
                      <tbody>
                        {data.shiftHistory.slice(0, 10).map((s, i) => {
                          const sc = shiftColor(s.shift_color)
                          return (
                            <tr key={i}>
                              <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{new Date(s.work_date).toLocaleDateString('tr-TR')}</td>
                              <td><span style={{ background: sc.bg, color: sc.text, padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>{s.shift_name}</span></td>
                              <td style={{ fontSize: '11px' }}>{s.dept_name}</td>
                              <td><span className={`badge ${s.status === 'worked' ? 'badge-green' : s.status === 'on_leave' ? 'badge-amber' : s.status === 'absent' ? 'badge-red' : 'badge-blue'}`}>{s.status}</span></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <h4 style={{ fontFamily: 'var(--display)', fontSize: '14px', color: 'var(--accent)', letterSpacing: '2px', marginBottom: '10px' }}>SON MESAILER</h4>
                {data.overtimeRecords.length === 0 ? (
                  <div className="empty-state" style={{ padding: '16px' }}><div className="empty-sub">Mesai kaydi yok</div></div>
                ) : (
                  <div className="panel">
                    <table className="data-table">
                      <thead><tr><th>Tarih</th><th>Saat</th><th>Sebep</th></tr></thead>
                      <tbody>
                        {data.overtimeRecords.slice(0, 5).map((o, i) => (
                          <tr key={i}>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{new Date(o.work_date).toLocaleDateString('tr-TR')}</td>
                            <td><span className="badge badge-amber">{o.hours} saat</span></td>
                            <td style={{ fontSize: '11px', color: 'var(--text2)' }}>{o.reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Shifts tab */}
            {detailTab === 'shifts' && (
              <div className="panel">
                {data.shiftHistory.length === 0 ? (
                  <div className="empty-state" style={{ padding: '16px' }}><div className="empty-sub">Vardiya kaydi yok</div></div>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Tarih</th><th>Vardiya</th><th>Saat</th><th>Departman</th><th>Durum</th></tr></thead>
                    <tbody>
                      {data.shiftHistory.map((s, i) => {
                        const sc = shiftColor(s.shift_color)
                        return (
                          <tr key={i}>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{new Date(s.work_date).toLocaleDateString('tr-TR')}</td>
                            <td><span style={{ background: sc.bg, color: sc.text, padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>{s.shift_name}</span></td>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>{s.start_hour}:00–{s.end_hour === 24 ? '00' : s.end_hour}:00</td>
                            <td style={{ fontSize: '11px' }}>{s.dept_name}</td>
                            <td><span className={`badge ${s.status === 'worked' ? 'badge-green' : s.status === 'on_leave' ? 'badge-amber' : s.status === 'absent' ? 'badge-red' : 'badge-blue'}`}>{s.status}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Leave tab */}
            {detailTab === 'leave' && (
              <div className="panel">
                {data.leaveHistory.length === 0 ? (
                  <div className="empty-state" style={{ padding: '16px' }}><div className="empty-sub">Izin kaydi yok</div></div>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Tur</th><th>Baslangic</th><th>Bitis</th><th>Gun</th><th>Durum</th></tr></thead>
                    <tbody>
                      {data.leaveHistory.map((l, i) => (
                        <tr key={i}>
                          <td><span className={`badge ${LEAVE_TYPES[l.leave_type]?.badge || 'badge-gray'}`}>{LEAVE_TYPES[l.leave_type]?.label || l.leave_type}</span></td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{new Date(l.start_date).toLocaleDateString('tr-TR')}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{new Date(l.end_date).toLocaleDateString('tr-TR')}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', textAlign: 'center' }}>{l.total_days}</td>
                          <td><span className={`badge ${STATUS_MAP[l.status]?.badge || 'badge-gray'}`}>{STATUS_MAP[l.status]?.label || l.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Overtime tab */}
            {detailTab === 'overtime' && (
              <div className="panel">
                {data.overtimeRecords.length === 0 ? (
                  <div className="empty-state" style={{ padding: '16px' }}><div className="empty-sub">Mesai kaydi yok</div></div>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Tarih</th><th>Saat</th><th>Sebep</th></tr></thead>
                    <tbody>
                      {data.overtimeRecords.map((o, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{new Date(o.work_date).toLocaleDateString('tr-TR')}</td>
                          <td><span className="badge badge-amber">{o.hours} saat</span></td>
                          <td style={{ fontSize: '11px', color: 'var(--text2)' }}>{o.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Attendance tab */}
            {detailTab === 'attendance' && (
              <div className="panel">
                {data.attendanceLogs.length === 0 ? (
                  <div className="empty-state" style={{ padding: '16px' }}><div className="empty-sub">Yoklama kaydi yok</div></div>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Giris</th><th>Cikis</th><th>Sure (saat)</th></tr></thead>
                    <tbody>
                      {data.attendanceLogs.map((a, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{a.check_in_at ? new Date(a.check_in_at).toLocaleString('tr-TR') : '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{a.check_out_at ? new Date(a.check_out_at).toLocaleString('tr-TR') : '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', textAlign: 'center' }}>{a.actual_hours ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Shift color helpers ──────────────────────────────────────────────────────
function shiftColor(colorClass) {
  const map = {
    'bg-blue-400':   { bg: 'rgba(59,140,240,.15)', text: 'var(--blue)' },
    'bg-orange-400': { bg: 'rgba(240,165,0,.15)',   text: 'var(--accent)' },
    'bg-indigo-600': { bg: 'rgba(155,89,182,.15)',  text: 'var(--purple)' },
  }
  return map[colorClass] || { bg: 'var(--surface3)', text: 'var(--text2)' }
}

function deptColor(colorClass) {
  const map = {
    'bg-red-600':    { bg: 'rgba(231,76,60,.12)',   text: 'var(--red)' },
    'bg-green-600':  { bg: 'rgba(39,201,106,.12)',  text: 'var(--green)' },
    'bg-orange-500': { bg: 'rgba(240,165,0,.12)',   text: 'var(--accent)' },
    'bg-blue-600':   { bg: 'rgba(59,140,240,.12)',  text: 'var(--blue)' },
    'bg-yellow-500': { bg: 'rgba(245,200,66,.12)',  text: 'var(--accent3)' },
    'bg-lime-500':   { bg: 'rgba(39,201,106,.12)',  text: 'var(--green)' },
    'bg-pink-500':   { bg: 'rgba(244,114,182,.12)', text: '#f472b6' },
    'bg-purple-600': { bg: 'rgba(155,89,182,.12)',  text: 'var(--purple)' },
  }
  return map[colorClass] || { bg: 'var(--surface3)', text: 'var(--text2)' }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 1 — Cizelge (Schedule)
// ═══════════════════════════════════════════════════════════════════════════════
function ScheduleTab({ departments, shiftDefs, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  const [deptFilter, setDeptFilter] = useState('')
  const [editModal, setEditModal] = useState(null)
  const [editShiftDef, setEditShiftDef] = useState('')

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = weekDays[6]

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['schedule', weekStart, deptFilter],
    queryFn: () => api.get('/shifts/schedule', {
      params: { week: weekStart, week_end: weekEnd, dept_id: deptFilter || undefined }
    }).then(r => r.data),
  })

  const personnelMap = useMemo(() => {
    const map = new Map()
    rows.forEach(r => {
      if (!map.has(r.personnel_id)) {
        map.set(r.personnel_id, {
          id: r.personnel_id, full_name: r.full_name, gender: r.gender,
          dept_id: r.dept_id, dept_name: r.dept_name, dept_color: r.dept_color,
          days: {}
        })
      }
      map.get(r.personnel_id).days[r.work_date] = r
    })
    return map
  }, [rows])

  const personnelList = Array.from(personnelMap.values())

  const updateShift = useMutation({
    mutationFn: ({ personnelId, deptId, shiftDefId, date }) =>
      api.post('/shifts/schedule', {
        entries: [{ personnel_id: personnelId, dept_id: deptId, shift_def_id: shiftDefId, work_date: date }]
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setEditModal(null) }
  })

  const deleteShift = useMutation({
    mutationFn: ({ personnelId, date }) =>
      api.delete(`/shifts/schedule/${personnelId}/${date}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setEditModal(null) }
  })

  const copyWeek = useMutation({
    mutationFn: () => api.post('/shifts/schedule/copy-week', { source_week: weekStart }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }) }
  })

  const openEdit = (person, date) => {
    if (!canEdit) return
    const existing = person.days[date]
    setEditShiftDef(existing?.shift_def_id?.toString() || '')
    setEditModal({ personnelId: person.id, deptId: person.dept_id, date })
  }

  return (
    <div className="fade-up">
      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          &larr; Onceki
        </button>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
          {formatDate(weekStart)} &ndash; {formatDate(weekEnd)}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          Sonraki &rarr;
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(getWeekStart(new Date()))}>
          Bu Hafta
        </button>

        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Bolumler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => copyWeek.mutate()}
            disabled={copyWeek.isPending}
            style={{ marginLeft: 'auto' }}>
            {copyWeek.isPending ? 'Kopyalaniyor...' : 'Haftayi Kopyala'}
          </button>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        {shiftDefs.map(s => {
          const c = shiftColor(s.color_class)
          return (
            <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: c.text, display: 'inline-block' }} />
              {s.name} ({s.start_hour}:00&ndash;{s.end_hour === 24 ? '00' : s.end_hour}:00)
            </span>
          )
        })}
      </div>

      {isLoading ? (
        <div className="empty-state"><div className="empty-sub">Yukleniyor...</div></div>
      ) : (
        <div className="panel">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--surface)', minWidth: '150px' }}>Personel</th>
                  <th>Bolum</th>
                  {weekDays.map(d => (
                    <th key={d} style={{ textAlign: 'center', minWidth: '100px' }}>
                      <div style={{ textTransform: 'capitalize' }}>{shortDay(d)}</div>
                      <div style={{ color: 'var(--text3)', fontWeight: 400 }}>{formatDate(d)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {personnelList.map(person => {
                  const dc = deptColor(person.dept_color)
                  return (
                    <tr key={person.id}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderLeft: `3px solid ${person.gender === 'female' ? '#f472b6' : 'var(--blue)'}`, paddingLeft: '8px' }}>
                          <span style={{ color: person.gender === 'female' ? '#f472b6' : 'var(--blue)', fontSize: '11px' }}>
                            {person.gender === 'female' ? '\u2640' : '\u2642'}
                          </span>
                          <span
                            onClick={() => onPersonClick && onPersonClick(person.id)}
                            style={{ fontSize: '12px', color: 'var(--text)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: onPersonClick ? 'pointer' : 'default', borderBottom: onPersonClick ? '1px dashed var(--text3)' : 'none' }}>
                            {person.full_name}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                          background: dc.bg, color: dc.text,
                          fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}>{person.dept_name}</span>
                      </td>
                      {weekDays.map(d => {
                        const cell = person.days[d]
                        const sc = cell ? shiftColor(cell.shift_color) : null
                        return (
                          <td key={d} style={{ textAlign: 'center', padding: '6px 8px' }}>
                            <button
                              onClick={() => openEdit(person, d)}
                              disabled={!canEdit}
                              style={{
                                width: '100%', padding: '4px 6px', borderRadius: '5px',
                                border: 'none', cursor: canEdit ? 'pointer' : 'default',
                                background: cell
                                  ? cell.status === 'on_leave' ? 'rgba(240,165,0,.12)'
                                  : cell.status === 'absent' ? 'rgba(231,76,60,.12)'
                                  : sc?.bg || 'transparent'
                                  : 'transparent',
                                color: cell
                                  ? cell.status === 'on_leave' ? 'var(--accent)'
                                  : cell.status === 'absent' ? 'var(--red)'
                                  : sc?.text || 'var(--text2)'
                                  : 'var(--text3)',
                                fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 600,
                                transition: 'opacity .15s',
                              }}
                              onMouseEnter={e => { if (canEdit) e.currentTarget.style.opacity = '0.8' }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                            >
                              {cell
                                ? cell.status === 'on_leave' ? 'Izin'
                                : cell.status === 'absent' ? 'Yok'
                                : `${cell.shift_name} ${cell.start_hour}\u2013${cell.end_hour === 24 ? '00' : cell.end_hour}`
                                : '\u2014'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {personnelList.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center' }}>
                    <div className="empty-state">
                      <div className="empty-icon">&#128197;</div>
                      <div className="empty-title">VERI YOK</div>
                      <div className="empty-sub">Bu hafta icin vardiya verisi bulunamadi</div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <ModalOverlay onClose={() => setEditModal(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            VARDIYA DEGISTIR &mdash; {formatDate(editModal.date)}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {shiftDefs.map(s => {
              const active = editShiftDef === s.id.toString()
              return (
                <button
                  key={s.id}
                  onClick={() => setEditShiftDef(s.id.toString())}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: '7px',
                    textAlign: 'left', fontSize: '13px', cursor: 'pointer',
                    border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'rgba(240,165,0,.08)' : 'var(--surface2)',
                    color: active ? 'var(--accent)' : 'var(--text2)',
                    fontFamily: 'var(--sans)',
                    transition: 'all .15s',
                  }}
                >
                  {s.name} &mdash; {s.start_hour}:00 &ndash; {s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-primary"
              onClick={() => updateShift.mutate({ ...editModal, shiftDefId: parseInt(editShiftDef) })}
              disabled={!editShiftDef || updateShift.isPending}
              style={{ flex: 1, opacity: (!editShiftDef || updateShift.isPending) ? 0.5 : 1 }}
            >
              {updateShift.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button className="btn btn-danger btn-sm"
              onClick={() => deleteShift.mutate({ personnelId: editModal.personnelId, date: editModal.date })}
              disabled={deleteShift.isPending}>
              {deleteShift.isPending ? 'Siliniyor...' : 'Vardiyayi Sil'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditModal(null)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 2 — Izinler (Leave)
// ═══════════════════════════════════════════════════════════════════════════════
function LeaveTab({ departments }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canApprove = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [filters, setFilters] = useState({ status: '', dept_id: '', leave_type: '' })
  const [newLeave, setNewLeave] = useState(false)
  const [form, setForm] = useState({ personnel_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', filters],
    queryFn: () => api.get('/shifts/leave', { params: filters }).then(r => r.data),
  })

  const { data: balance } = useQuery({
    queryKey: ['leave-balance', form.personnel_id],
    queryFn: () => api.get(`/shifts/leave/balance/${form.personnel_id}`).then(r => r.data),
    enabled: false, // lazy
  })

  const approveMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/shifts/leave/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaves'] }),
  })

  const cancelMut = useMutation({
    mutationFn: (id) => api.delete(`/shifts/leave/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaves'] }),
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/leave', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] })
      setNewLeave(false)
      setForm({ personnel_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  // Summary counts
  const countByType = Object.fromEntries(
    Object.keys(LEAVE_TYPES).map(k => [k, leaves.filter(l => l.leave_type === k).length])
  )

  return (
    <div className="fade-up">
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        {['', 'pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            className={`filter-chip ${filters.status === s ? 'active' : ''}`}
            onClick={() => setFilters(p => ({ ...p, status: s }))}
          >
            {s === '' ? 'Tumunu' : STATUS_MAP[s]?.label}
          </button>
        ))}
        <select className="form-select" value={filters.dept_id} onChange={e => setFilters(p => ({ ...p, dept_id: e.target.value }))}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Bolumler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => setNewLeave(true)} style={{ marginLeft: 'auto' }}>
          + Yeni Izin
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', marginBottom: '20px' }}>
        {Object.entries(LEAVE_TYPES).map(([k, v]) => (
          <div key={k} style={{
            padding: '10px 12px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color: 'var(--text)', lineHeight: 1 }}>
              {countByType[k]}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
              {v.label.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Leave table */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">IZIN TALEPLERI</div>
            <div className="panel-subtitle">{leaves.length} KAYIT</div>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {leaves.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#127796;</div>
              <div className="empty-title">IZIN YOK</div>
              <div className="empty-sub">Izin talebi bulunamadi</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Bolum</th>
                  <th>Tur</th>
                  <th>Tarih</th>
                  <th>Gun</th>
                  <th>Durum</th>
                  {canApprove && <th>Islem</th>}
                </tr>
              </thead>
              <tbody>
                {leaves.map(l => {
                  const dc = deptColor(l.dept_color)
                  return (
                    <tr key={l.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: l.gender === 'female' ? '#f472b6' : 'var(--blue)', fontSize: '11px' }}>
                            {l.gender === 'female' ? '\u2640' : '\u2642'}
                          </span>
                          <span>{l.full_name}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                          background: dc.bg, color: dc.text,
                          fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                        }}>{l.dept_name}</span>
                      </td>
                      <td><span className={`badge ${LEAVE_TYPES[l.leave_type]?.badge || 'badge-gray'}`}>{LEAVE_TYPES[l.leave_type]?.label}</span></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {formatDate(l.start_date)} &ndash; {formatDate(l.end_date)}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{l.total_days}</td>
                      <td><span className={`badge ${STATUS_MAP[l.status]?.badge}`}>{STATUS_MAP[l.status]?.label}</span></td>
                      {canApprove && (
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {l.status === 'pending' && (
                              <>
                                <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }}
                                  onClick={() => approveMut.mutate({ id: l.id, status: 'approved' })}>Onayla</button>
                                <button className="btn btn-danger btn-sm"
                                  onClick={() => approveMut.mutate({ id: l.id, status: 'rejected' })}>Reddet</button>
                              </>
                            )}
                            {l.status === 'approved' && (
                              <button className="btn btn-danger btn-sm"
                                onClick={() => cancelMut.mutate(l.id)}
                                disabled={cancelMut.isPending}>
                                Iptal Et
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* New Leave Modal */}
      {newLeave && (
        <ModalOverlay onClose={() => setNewLeave(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            YENI IZIN TALEBI
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Personel</label>
              <PersonnelSearch value={form.personnel_id} onChange={v => setForm(p => ({ ...p, personnel_id: v }))} />
            </div>
            <div>
              <label className="form-label">Izin Turu</label>
              <select className="form-select" value={form.leave_type} onChange={e => setForm(p => ({ ...p, leave_type: e.target.value }))}>
                {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Baslangic</label>
                <input type="date" className="form-input" value={form.start_date}
                  onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Bitis</label>
                <input type="date" className="form-input" value={form.end_date}
                  onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Aciklama (istege bagli)</label>
              <textarea className="form-textarea" value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={2}
                style={{ minHeight: '60px' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (createMut.isPending || !form.personnel_id || !form.start_date || !form.end_date) ? 0.5 : 1 }}
              onClick={() => createMut.mutate(form)}
              disabled={createMut.isPending || !form.personnel_id || !form.start_date || !form.end_date}>
              {createMut.isPending ? 'Kaydediliyor...' : 'Gonder'}
            </button>
            <button className="btn btn-ghost" onClick={() => setNewLeave(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 3 — Mesai (Overtime)
// ═══════════════════════════════════════════════════════════════════════════════
function OvertimeTab({ departments }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canAdd = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [deptFilter, setDeptFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ personnel_id: '', work_date: '', hours: '', reason: '' })

  const { data: records = [] } = useQuery({
    queryKey: ['overtime', month, deptFilter],
    queryFn: () => api.get('/shifts/overtime', { params: { month, dept_id: deptFilter || undefined } }).then(r => r.data),
  })

  const { data: summary = [] } = useQuery({
    queryKey: ['overtime-summary', month],
    queryFn: () => api.get('/shifts/overtime/summary', { params: { month } }).then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/overtime', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overtime'] })
      qc.invalidateQueries({ queryKey: ['overtime-summary'] })
      setShowForm(false)
      setForm({ personnel_id: '', work_date: '', hours: '', reason: '' })
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const totalHours = records.reduce((s, r) => s + r.hours, 0)
  const uniquePersonnel = new Set(records.map(r => r.personnel_id)).size

  return (
    <div className="fade-up">
      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value)}
          style={{ width: 'auto', padding: '5px 11px', fontSize: '12px' }} />
        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Bolumler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {canAdd && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)} style={{ marginLeft: 'auto' }}>
            + Mesai Ekle
          </button>
        )}
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'TOPLAM MESAI', value: `${totalHours.toFixed(1)}s`, color: 'var(--purple)' },
          { label: 'MESAI KAYDI', value: records.length, color: 'var(--text)' },
          { label: 'KISI SAYISI', value: uniquePersonnel, color: 'var(--blue)' },
          { label: 'ORT./KISI', value: uniquePersonnel ? `${(totalHours / uniquePersonnel).toFixed(1)}s` : '\u2014', color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '14px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Dept summary */}
      {summary.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          {summary.map(s => {
            const dc = deptColor(s.color_class)
            return (
              <div key={s.dept_id} style={{
                padding: '12px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: '8px',
              }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                  background: dc.bg, color: dc.text,
                  fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                }}>{s.dept_name}</span>
                <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color: 'var(--text)', lineHeight: 1, marginTop: '8px' }}>
                  {s.total_hours?.toFixed(1)}s
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                  {s.personnel_count} kisi
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Records table */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">MESAI KAYITLARI</div>
            <div className="panel-subtitle">{records.length} KAYIT</div>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {records.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#9201;</div>
              <div className="empty-title">MESAI YOK</div>
              <div className="empty-sub">Bu ay mesai kaydi yok</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Bolum</th>
                  <th>Tarih</th>
                  <th>Saat</th>
                  <th>Sebep</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const dc = deptColor(r.dept_color)
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: r.gender === 'female' ? '#f472b6' : 'var(--blue)', fontSize: '11px' }}>
                            {r.gender === 'female' ? '\u2640' : '\u2642'}
                          </span>
                          <span>{r.full_name}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                          background: dc.bg, color: dc.text,
                          fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                        }}>{r.dept_name}</span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{formatDate(r.work_date)}</td>
                      <td style={{ fontFamily: 'var(--display)', fontSize: '18px', color: 'var(--purple)' }}>{r.hours}s</td>
                      <td style={{ color: 'var(--text2)' }}>{r.reason || '\u2014'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showForm && (
        <ModalOverlay onClose={() => setShowForm(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            MESAI KAYDI EKLE
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Personel</label>
              <PersonnelSearch value={form.personnel_id} onChange={v => setForm(p => ({ ...p, personnel_id: v }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Tarih</label>
                <input type="date" className="form-input" value={form.work_date}
                  onChange={e => setForm(p => ({ ...p, work_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Saat</label>
                <input type="number" step="0.5" min="0.5" max="12" className="form-input" value={form.hours}
                  onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Sebep</label>
              <input className="form-input" value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (createMut.isPending || !form.personnel_id || !form.work_date || !form.hours) ? 0.5 : 1 }}
              onClick={() => createMut.mutate({ ...form, personnel_id: parseInt(form.personnel_id), hours: parseFloat(form.hours) })}
              disabled={createMut.isPending || !form.personnel_id || !form.work_date || !form.hours}>
              {createMut.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 4 — Yoklama (Attendance) — NEW
// ═══════════════════════════════════════════════════════════════════════════════
function AttendanceTab({ departments }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(todayStr())
  const [deptFilter, setDeptFilter] = useState('')

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['attendance', date, deptFilter],
    queryFn: () => api.get('/shifts/attendance', { params: { date, dept_id: deptFilter || undefined } }).then(r => r.data),
  })

  const checkinMut = useMutation({
    mutationFn: (personnelId) => api.post('/shifts/attendance/checkin', { personnel_id: personnelId, date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  })

  const checkoutMut = useMutation({
    mutationFn: (personnelId) => api.post('/shifts/attendance/checkout', { personnel_id: personnelId, date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  })

  const totalPresent = records.filter(r => r.check_in_time).length
  const totalLate = records.filter(r => r.is_late).length

  return (
    <div className="fade-up">
      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)}
          style={{ width: 'auto', padding: '5px 11px', fontSize: '12px' }} />
        <button className="btn btn-ghost btn-sm" onClick={() => setDate(todayStr())}>Bugun</button>
        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Bolumler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'TOPLAM', value: records.length, color: 'var(--text)' },
          { label: 'MEVCUT', value: totalPresent, color: 'var(--green)' },
          { label: 'GEC KALAN', value: totalLate, color: 'var(--red)' },
          { label: 'GELMEDI', value: records.length - totalPresent, color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '14px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Attendance table */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">YOKLAMA</div>
            <div className="panel-subtitle">{formatDate(date)}</div>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {isLoading ? (
            <div className="empty-state"><div className="empty-sub">Yukleniyor...</div></div>
          ) : records.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#128203;</div>
              <div className="empty-title">KAYIT YOK</div>
              <div className="empty-sub">Bu tarih icin yoklama kaydi bulunamadi</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Bolum</th>
                  <th>Giris</th>
                  <th>Cikis</th>
                  <th>Sure</th>
                  <th>Durum</th>
                  <th>Islem</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const dc = deptColor(r.dept_color)
                  return (
                    <tr key={r.personnel_id} style={r.is_late ? { background: 'rgba(231,76,60,.04)' } : undefined}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: r.gender === 'female' ? '#f472b6' : 'var(--blue)', fontSize: '11px' }}>
                            {r.gender === 'female' ? '\u2640' : '\u2642'}
                          </span>
                          <span>{r.full_name}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                          background: dc.bg, color: dc.text,
                          fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                        }}>{r.dept_name}</span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: r.check_in_time ? 'var(--green)' : 'var(--text3)' }}>
                        {r.check_in_time || '\u2014'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: r.check_out_time ? 'var(--blue)' : 'var(--text3)' }}>
                        {r.check_out_time || '\u2014'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>
                        {r.actual_hours ? `${r.actual_hours}s` : '\u2014'}
                      </td>
                      <td>
                        {r.is_late && <span className="badge badge-red">GEC</span>}
                        {r.check_in_time && !r.is_late && <span className="badge badge-green">ZAMANINDA</span>}
                        {!r.check_in_time && <span className="badge badge-gray">BEKLENIYOR</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {!r.check_in_time && (
                            <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }}
                              onClick={() => checkinMut.mutate(r.personnel_id)}
                              disabled={checkinMut.isPending}>
                              Giris Yap
                            </button>
                          )}
                          {r.check_in_time && !r.check_out_time && (
                            <button className="btn btn-sm" style={{ background: 'var(--blue)', color: '#fff' }}
                              onClick={() => checkoutMut.mutate(r.personnel_id)}
                              disabled={checkoutMut.isPending}>
                              Cikis Yap
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 5 — Departmanlar (Departments) — NEW
// ═══════════════════════════════════════════════════════════════════════════════
function DepartmentsTab() {
  const qc = useQueryClient()

  const [editDept, setEditDept] = useState(null) // null = closed, {} = new, {...} = edit
  const [deptForm, setDeptForm] = useState({ name: '', color_class: 'bg-blue-600' })
  const [assignModal, setAssignModal] = useState(false)
  const [assignForm, setAssignForm] = useState({ personnel_id: '', dept_id: '' })

  const { data: deptSummary = [] } = useQuery({
    queryKey: ['departments-summary'],
    queryFn: () => api.get('/shifts/departments/summary').then(r => r.data),
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
  })

  const createDept = useMutation({
    mutationFn: data => api.post('/shifts/departments', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] })
      qc.invalidateQueries({ queryKey: ['departments-summary'] })
      setEditDept(null)
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const updateDept = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/shifts/departments/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] })
      qc.invalidateQueries({ queryKey: ['departments-summary'] })
      setEditDept(null)
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const deleteDept = useMutation({
    mutationFn: (id) => api.delete(`/shifts/departments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] })
      qc.invalidateQueries({ queryKey: ['departments-summary'] })
    },
  })

  const assignMut = useMutation({
    mutationFn: data => api.post('/shifts/departments/assign', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments-summary'] })
      setAssignModal(false)
      setAssignForm({ personnel_id: '', dept_id: '' })
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const openNew = () => {
    setDeptForm({ name: '', color_class: 'bg-blue-600' })
    setEditDept({})
  }

  const openEditDept = (d) => {
    setDeptForm({ name: d.name, color_class: d.color_class || 'bg-blue-600' })
    setEditDept(d)
  }

  const maxCount = Math.max(...deptSummary.map(d => d.personnel_count || 0), 1)

  const COLOR_OPTIONS = [
    'bg-red-600', 'bg-green-600', 'bg-orange-500', 'bg-blue-600',
    'bg-yellow-500', 'bg-lime-500', 'bg-pink-500', 'bg-purple-600',
  ]

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setAssignModal(true)}>Personel Ata</button>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Yeni Bolum</button>
        </div>
      </div>

      {/* Department list */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">BOLUMLER</div>
            <div className="panel-subtitle">{deptSummary.length} BOLUM</div>
          </div>
        </div>
        <div className="panel-body">
          {deptSummary.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#127970;</div>
              <div className="empty-title">BOLUM YOK</div>
              <div className="empty-sub">Henuz bolum tanimlanmamis</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {deptSummary.map(d => {
                const dc = deptColor(d.color_class)
                const pct = ((d.personnel_count || 0) / maxCount) * 100
                return (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', background: 'var(--surface2)',
                    border: '1px solid var(--border)', borderRadius: '8px',
                  }}>
                    <div style={{ width: '100px', flexShrink: 0 }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                        background: dc.bg, color: dc.text,
                        fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 600,
                      }}>{d.name}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>
                          {d.personnel_count || 0} personel
                        </span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                          {d.male_count !== undefined && (<><span style={{ color: 'var(--blue)' }}>{'\u2642'}{d.male_count}</span>{' '}<span style={{ color: '#f472b6' }}>{'\u2640'}{d.female_count}</span></>)}
                        </span>
                      </div>
                      <div className="prog-bar">
                        <div className="prog-fill prog-blue" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditDept(d)}>Duzenle</button>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => { if (confirm(`${d.name} bolumunu silmek istediginizden emin misiniz?`)) deleteDept.mutate(d.id) }}>
                        Sil
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit/Create dept modal */}
      {editDept !== null && (
        <ModalOverlay onClose={() => setEditDept(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            {editDept.id ? 'BOLUM DUZENLE' : 'YENI BOLUM'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Bolum Adi</label>
              <input className="form-input" value={deptForm.name}
                onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Renk</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {COLOR_OPTIONS.map(c => {
                  const dc = deptColor(c)
                  return (
                    <button key={c} onClick={() => setDeptForm(p => ({ ...p, color_class: c }))}
                      style={{
                        width: '32px', height: '32px', borderRadius: '6px',
                        background: dc.bg, border: `2px solid ${deptForm.color_class === c ? dc.text : 'transparent'}`,
                        cursor: 'pointer',
                      }} />
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: !deptForm.name ? 0.5 : 1 }}
              disabled={!deptForm.name}
              onClick={() => {
                if (editDept.id) updateDept.mutate({ id: editDept.id, ...deptForm })
                else createDept.mutate(deptForm)
              }}>
              {editDept.id ? 'Guncelle' : 'Olustur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditDept(null)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {/* Assign personnel modal */}
      {assignModal && (
        <ModalOverlay onClose={() => setAssignModal(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            PERSONEL BOLUM ATAMASI
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Personel</label>
              <PersonnelSearch value={assignForm.personnel_id}
                onChange={v => setAssignForm(p => ({ ...p, personnel_id: v }))} />
            </div>
            <div>
              <label className="form-label">Bolum</label>
              <select className="form-select" value={assignForm.dept_id}
                onChange={e => setAssignForm(p => ({ ...p, dept_id: e.target.value }))}>
                <option value="">Bolum secin...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (!assignForm.personnel_id || !assignForm.dept_id) ? 0.5 : 1 }}
              disabled={!assignForm.personnel_id || !assignForm.dept_id || assignMut.isPending}
              onClick={() => assignMut.mutate({ personnel_id: parseInt(assignForm.personnel_id), dept_id: parseInt(assignForm.dept_id) })}>
              {assignMut.isPending ? 'Ataniyor...' : 'Ata'}
            </button>
            <button className="btn btn-ghost" onClick={() => setAssignModal(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 6 — Takas (Swap) — NEW
// ═══════════════════════════════════════════════════════════════════════════════
function SwapTab() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canApprove = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    requester_id: '', target_id: '',
    requester_date: '', target_date: '',
    reason: '',
  })

  const { data: swaps = [] } = useQuery({
    queryKey: ['swaps'],
    queryFn: () => api.get('/shifts/swaps').then(r => r.data),
  })

  const createSwap = useMutation({
    mutationFn: data => api.post('/shifts/swaps', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['swaps'] })
      setShowForm(false)
      setForm({ requester_id: '', target_id: '', requester_date: '', target_date: '', reason: '' })
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const approveMut = useMutation({
    mutationFn: (id) => api.patch(`/shifts/swaps/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['swaps'] }),
  })

  const rejectMut = useMutation({
    mutationFn: (id) => api.patch(`/shifts/swaps/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['swaps'] }),
  })

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Takas Talebi</button>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">VARDIYA TAKAS TALEPLERI</div>
            <div className="panel-subtitle">{swaps.length} TALEP</div>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {swaps.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#128260;</div>
              <div className="empty-title">TAKAS YOK</div>
              <div className="empty-sub">Henuz takas talebi yok</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Talep Eden</th>
                  <th>Tarih</th>
                  <th>Hedef Kisi</th>
                  <th>Tarih</th>
                  <th>Sebep</th>
                  <th>Durum</th>
                  {canApprove && <th>Islem</th>}
                </tr>
              </thead>
              <tbody>
                {swaps.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontSize: '12.5px' }}>{s.requester_name || `#${s.requester_id}`}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>
                      {s.requester_date ? formatDate(s.requester_date) : '\u2014'}
                    </td>
                    <td style={{ fontSize: '12.5px' }}>{s.target_name || `#${s.target_id}`}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>
                      {s.target_date ? formatDate(s.target_date) : '\u2014'}
                    </td>
                    <td style={{ color: 'var(--text2)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.reason || '\u2014'}
                    </td>
                    <td>
                      <span className={`badge ${SWAP_STATUS[s.status]?.badge || 'badge-gray'}`}>
                        {SWAP_STATUS[s.status]?.label || s.status}
                      </span>
                    </td>
                    {canApprove && (
                      <td>
                        {s.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }}
                              onClick={() => approveMut.mutate(s.id)}
                              disabled={approveMut.isPending}>Onayla</button>
                            <button className="btn btn-danger btn-sm"
                              onClick={() => rejectMut.mutate(s.id)}
                              disabled={rejectMut.isPending}>Reddet</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create swap modal */}
      {showForm && (
        <ModalOverlay onClose={() => setShowForm(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            YENI TAKAS TALEBI
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Talep Eden Personel</label>
              <PersonnelSearch value={form.requester_id}
                onChange={v => setForm(p => ({ ...p, requester_id: v }))}
                placeholder="Talep eden personeli ara..." />
            </div>
            <div>
              <label className="form-label">Talep Eden Tarih</label>
              <input type="date" className="form-input" value={form.requester_date}
                onChange={e => setForm(p => ({ ...p, requester_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Hedef Personel</label>
              <PersonnelSearch value={form.target_id}
                onChange={v => setForm(p => ({ ...p, target_id: v }))}
                placeholder="Hedef personeli ara..." />
            </div>
            <div>
              <label className="form-label">Hedef Tarih</label>
              <input type="date" className="form-input" value={form.target_date}
                onChange={e => setForm(p => ({ ...p, target_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Sebep</label>
              <textarea className="form-textarea" value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={2}
                style={{ minHeight: '60px' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{
              flex: 1,
              opacity: (!form.requester_id || !form.target_id || !form.requester_date || !form.target_date) ? 0.5 : 1
            }}
              disabled={!form.requester_id || !form.target_id || !form.requester_date || !form.target_date || createSwap.isPending}
              onClick={() => createSwap.mutate({
                requester_id: parseInt(form.requester_id),
                target_id: parseInt(form.target_id),
                requester_date: form.requester_date,
                target_date: form.target_date,
                reason: form.reason,
              })}>
              {createSwap.isPending ? 'Gonderiliyor...' : 'Gonder'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 7 — Ayarlar (Settings) — NEW
// ═══════════════════════════════════════════════════════════════════════════════
function SettingsTab({ departments, shiftDefs }) {
  const qc = useQueryClient()

  // Shift definitions CRUD
  const [defModal, setDefModal] = useState(null) // null=closed, {}=new, {...}=edit
  const [defForm, setDefForm] = useState({ name: '', start_hour: '', end_hour: '', color_class: 'bg-blue-400' })

  // Rotation
  const [rotForm, setRotForm] = useState({
    dept_id: '', personnel_ids: '', shift_def_ids: '',
    start_date: '', weeks: '4',
  })

  const createDef = useMutation({
    mutationFn: data => api.post('/shifts/definitions', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-defs'] }); setDefModal(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const updateDef = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/shifts/definitions/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-defs'] }); setDefModal(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const deleteDef = useMutation({
    mutationFn: (id) => api.delete(`/shifts/definitions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-defs'] }),
  })

  const applyRotation = useMutation({
    mutationFn: data => api.post('/shifts/schedule/rotation', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      alert('Rotasyon basariyla uygulandi.')
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const openNewDef = () => {
    setDefForm({ name: '', start_hour: '', end_hour: '', color_class: 'bg-blue-400' })
    setDefModal({})
  }

  const openEditDef = (d) => {
    setDefForm({ name: d.name, start_hour: d.start_hour?.toString() || '', end_hour: d.end_hour?.toString() || '', color_class: d.color_class || 'bg-blue-400' })
    setDefModal(d)
  }

  const DEF_COLORS = ['bg-blue-400', 'bg-orange-400', 'bg-indigo-600']

  return (
    <div className="fade-up">
      {/* ─── Shift Definitions ─── */}
      <div className="sect">
        <div className="sect-title">VARDIYA TANIMLARI</div>
        <div className="sect-line" />
      </div>

      <div className="panel" style={{ marginBottom: '28px' }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">VARDIYA TANIMLARI</div>
            <div className="panel-subtitle">{shiftDefs.length} TANIM</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openNewDef}>+ Yeni Tanim</button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {shiftDefs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#9881;</div>
              <div className="empty-title">TANIM YOK</div>
              <div className="empty-sub">Henuz vardiya tanimi yapilmamis</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Renk</th>
                  <th>Ad</th>
                  <th>Baslangic</th>
                  <th>Bitis</th>
                  <th>Islem</th>
                </tr>
              </thead>
              <tbody>
                {shiftDefs.map(s => {
                  const sc = shiftColor(s.color_class)
                  return (
                    <tr key={s.id}>
                      <td>
                        <span style={{
                          width: '16px', height: '16px', borderRadius: '4px',
                          background: sc.text, display: 'inline-block',
                        }} />
                      </td>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{s.start_hour}:00</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditDef(s)}>Duzenle</button>
                          <button className="btn btn-danger btn-sm"
                            onClick={() => { if (confirm(`${s.name} tanimini silmek istediginizden emin misiniz?`)) deleteDef.mutate(s.id) }}>
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── Rotation Template ─── */}
      <div className="sect">
        <div className="sect-title">ROTASYON SABLONU</div>
        <div className="sect-line" />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">ROTASYON UYGULA</div>
            <div className="panel-subtitle">OTOMATIK VARDIYA CIZELGESI</div>
          </div>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label className="form-label">Bolum</label>
              <select className="form-select" value={rotForm.dept_id}
                onChange={e => setRotForm(p => ({ ...p, dept_id: e.target.value }))}>
                <option value="">Bolum secin...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Baslangic Tarihi</label>
              <input type="date" className="form-input" value={rotForm.start_date}
                onChange={e => setRotForm(p => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Personel ID'leri (virgul ile)</label>
              <input className="form-input" value={rotForm.personnel_ids} placeholder="1,2,3,4..."
                onChange={e => setRotForm(p => ({ ...p, personnel_ids: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Vardiya Tanimlari (virgul ile ID)</label>
              <input className="form-input" value={rotForm.shift_def_ids} placeholder="1,2,3..."
                onChange={e => setRotForm(p => ({ ...p, shift_def_ids: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Hafta Sayisi</label>
              <input type="number" min="1" max="52" className="form-input" value={rotForm.weeks}
                onChange={e => setRotForm(p => ({ ...p, weeks: e.target.value }))} />
            </div>
          </div>

          {/* Available shift defs reference */}
          {shiftDefs.length > 0 && (
            <div style={{ marginTop: '14px', padding: '10px 12px', background: 'var(--surface2)', borderRadius: '7px', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>MEVCUT VARDIYA TANIMLARI</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {shiftDefs.map(s => {
                  const sc = shiftColor(s.color_class)
                  return (
                    <span key={s.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      padding: '3px 9px', borderRadius: '20px',
                      background: sc.bg, color: sc.text,
                      fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 600,
                    }}>
                      ID:{s.id} &mdash; {s.name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: '16px' }}>
            <button className="btn btn-primary"
              disabled={!rotForm.dept_id || !rotForm.start_date || !rotForm.personnel_ids || !rotForm.shift_def_ids || applyRotation.isPending}
              style={{ opacity: (!rotForm.dept_id || !rotForm.start_date || !rotForm.personnel_ids || !rotForm.shift_def_ids) ? 0.5 : 1 }}
              onClick={() => applyRotation.mutate({
                dept_id: parseInt(rotForm.dept_id),
                start_date: rotForm.start_date,
                weeks: parseInt(rotForm.weeks) || 4,
                personnel_ids: rotForm.personnel_ids.split(',').map(s => parseInt(s.trim())).filter(Boolean),
                shift_def_ids: rotForm.shift_def_ids.split(',').map(s => parseInt(s.trim())).filter(Boolean),
              })}>
              {applyRotation.isPending ? 'Uygulaniyor...' : 'Rotasyonu Uygula'}
            </button>
          </div>
        </div>
      </div>

      {/* Definition modal */}
      {defModal !== null && (
        <ModalOverlay onClose={() => setDefModal(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            {defModal.id ? 'VARDIYA TANIMINI DUZENLE' : 'YENI VARDIYA TANIMI'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Vardiya Adi</label>
              <input className="form-input" value={defForm.name}
                onChange={e => setDefForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Baslangic Saati</label>
                <input type="number" min="0" max="23" className="form-input" value={defForm.start_hour}
                  onChange={e => setDefForm(p => ({ ...p, start_hour: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Bitis Saati</label>
                <input type="number" min="0" max="24" className="form-input" value={defForm.end_hour}
                  onChange={e => setDefForm(p => ({ ...p, end_hour: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Renk</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {DEF_COLORS.map(c => {
                  const sc = shiftColor(c)
                  return (
                    <button key={c} onClick={() => setDefForm(p => ({ ...p, color_class: c }))}
                      style={{
                        width: '32px', height: '32px', borderRadius: '6px',
                        background: sc.bg, border: `2px solid ${defForm.color_class === c ? sc.text : 'transparent'}`,
                        cursor: 'pointer',
                      }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: sc.text, display: 'inline-block' }} />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (!defForm.name || !defForm.start_hour || !defForm.end_hour) ? 0.5 : 1 }}
              disabled={!defForm.name || !defForm.start_hour || !defForm.end_hour}
              onClick={() => {
                const payload = { name: defForm.name, start_hour: parseInt(defForm.start_hour), end_hour: parseInt(defForm.end_hour), color_class: defForm.color_class }
                if (defModal.id) updateDef.mutate({ id: defModal.id, ...payload })
                else createDef.mutate(payload)
              }}>
              {defModal.id ? 'Guncelle' : 'Olustur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setDefModal(null)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN — ShiftsPage
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'schedule',    label: 'CIZELGE' },
  { id: 'leave',       label: 'IZINLER' },
  { id: 'overtime',    label: 'MESAI' },
  { id: 'attendance',  label: 'YOKLAMA' },
  { id: 'departments', label: 'DEPARTMANLAR' },
  { id: 'swap',        label: 'TAKAS' },
  { id: 'settings',    label: 'AYARLAR' },
]

export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useState('schedule')
  const [selectedPersonnel, setSelectedPersonnel] = useState(null)

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
  })

  const { data: shiftDefs = [] } = useQuery({
    queryKey: ['shift-defs'],
    queryFn: () => api.get('/shifts/definitions').then(r => r.data),
  })

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      {/* Page header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: '28px', letterSpacing: '4px', color: 'var(--text)' }}>
          VARDIYA YONETIMI
        </h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
          PERSONEL CIZELGE &middot; IZIN &middot; MESAI &middot; YOKLAMA
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '2px', marginBottom: '20px',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`filter-chip ${activeTab === t.id ? 'active' : ''}`}
            style={{
              borderRadius: '7px 7px 0 0',
              borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'schedule'    && <ScheduleTab departments={departments} shiftDefs={shiftDefs} onPersonClick={setSelectedPersonnel} />}
      {activeTab === 'leave'       && <LeaveTab departments={departments} />}
      {activeTab === 'overtime'    && <OvertimeTab departments={departments} />}
      {activeTab === 'attendance'  && <AttendanceTab departments={departments} />}
      {activeTab === 'departments' && <DepartmentsTab />}
      {activeTab === 'swap'        && <SwapTab />}
      {activeTab === 'settings'    && <SettingsTab departments={departments} shiftDefs={shiftDefs} />}

      {/* Personnel detail slide-over */}
      {selectedPersonnel && (
        <PersonnelDetailPanel personnelId={selectedPersonnel} onClose={() => setSelectedPersonnel(null)} />
      )}
    </div>
  )
}
