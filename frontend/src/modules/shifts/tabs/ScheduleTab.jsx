import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../../shared/components/Skeleton.jsx'
import {
  getWeekStart, addDays, formatDate, shortDay, todayStr,
  shiftColor, deptColor, BottomSheet, ModalOverlay, StaffSearch,
} from '../shared.jsx'

// ─── Daily View ───────────────────────────────────────────────────────────────
function DailyView({ departments, date, onDateChange }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['personnel-daily', date],
    queryFn: () => api.get(`/shifts/personnel?date=${date}`).then(r => r.data),
    staleTime: 30000,
  })

  // Group by department, then by shift/status
  const deptGroups = useMemo(() => {
    const map = new Map()
    rows.forEach(row => {
      const deptName = row.dept_name || 'Departmansız'
      const deptColor = row.dept_color || 'gray'
      if (!map.has(deptName)) {
        map.set(deptName, { deptName, deptColor, shifts: new Map(), leave: [], absent: [] })
      }
      const g = map.get(deptName)
      if (row.leave_status === 'approved') {
        g.leave.push(row)
      } else if (row.shift_status === 'on_leave') {
        g.leave.push(row)
      } else if (row.shift_status === 'scheduled' || row.shift_status === 'overtime') {
        const shiftKey = row.shift_name || 'Bilinmiyor'
        if (!g.shifts.has(shiftKey)) {
          g.shifts.set(shiftKey, { name: shiftKey, start: row.start_hour, end: row.end_hour, color: row.shift_color, staff: [] })
        }
        g.shifts.get(shiftKey).staff.push(row)
      } else {
        g.absent.push(row)
      }
    })
    return Array.from(map.values())
  }, [rows])

  // shiftColor2: DailyView'a özel. Module-level shiftColor() uses different return format.
  const shiftColor2 = (cls) => {
    const map = { 'shift-blue': { bg: 'rgba(52,152,219,.18)', text: '#3498db' }, 'shift-teal': { bg: 'rgba(26,188,156,.18)', text: '#1abc9c' }, 'shift-amber': { bg: 'rgba(240,165,0,.18)', text: '#f0a500' }, 'shift-red': { bg: 'rgba(231,76,60,.18)', text: '#e74c3c' }, 'shift-purple': { bg: 'rgba(155,89,182,.18)', text: '#9b59b6' } }
    return map[cls] || { bg: 'var(--surface2)', text: 'var(--text2)' }
  }

  const deptColorMap = { 'dept-blue': 'var(--blue)', 'dept-teal': 'var(--teal)', 'dept-amber': 'var(--accent)', 'dept-red': 'var(--red)', 'dept-purple': '#9b59b6', 'dept-green': 'var(--green)' }

  return (
    <div>
      {/* Tarih seçici */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => onDateChange(addDays(date, -1))} style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>‹</button>
        <div style={{
          fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '2px', color: 'var(--text)',
          background: 'var(--surface2)', borderRadius: '10px', padding: '6px 20px',
        }}>
          {new Date(date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <button onClick={() => onDateChange(addDays(date, 1))} style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>›</button>
        {date !== (typeof todayStr === 'function' ? todayStr() : todayStr) && (
          <button onClick={() => onDateChange(typeof todayStr === 'function' ? todayStr() : todayStr)} style={{
            padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
            background: 'rgba(240,165,0,.15)', border: '1px solid rgba(240,165,0,.4)',
            cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--mono)',
          }}>Bugün</button>
        )}
      </div>

      {isLoading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '11px' }}>YÜKLENİYOR...</div>}

      {/* Dept cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {deptGroups.map(g => {
          const totalStaff = Array.from(g.shifts.values()).reduce((s, sh) => s + sh.staff.length, 0) + g.leave.length + g.absent.length
          const accentColor = deptColorMap[g.deptColor] || 'var(--accent)'
          return (
            <div key={g.deptName} style={{
              borderRadius: '14px', border: '1px solid var(--border)',
              background: 'var(--surface)', overflow: 'hidden',
            }}>
              {/* Card header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px',
                borderLeft: `4px solid ${accentColor}`,
                background: 'var(--surface2)',
              }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '2px', color: 'var(--text)', flex: 1 }}>
                  {g.deptName.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                  {totalStaff} kişi
                </div>
              </div>

              {/* Shift groups */}
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Array.from(g.shifts.values()).map(sh => {
                  const sc = shiftColor2(sh.color)
                  const pct = totalStaff > 0 ? (sh.staff.length / totalStaff) * 100 : 0
                  return (
                    <div key={sh.name}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '4px',
                          background: sc.bg, color: sc.text,
                          fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                        }}>{sh.name}</span>
                        {sh.start != null && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                            {sh.start}:00–{sh.end === 24 ? '00' : sh.end}:00
                          </span>
                        )}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', fontWeight: 600, marginLeft: 'auto' }}>
                          {sh.staff.length} kişi
                        </span>
                      </div>
                      <div style={{ height: '6px', borderRadius: '3px', background: 'var(--surface3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: sc.text, borderRadius: '3px', transition: 'width .3s' }} />
                      </div>
                    </div>
                  )
                })}

                {g.leave.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      background: 'rgba(26,188,156,.12)', color: 'var(--teal)',
                      fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                    }}>İZİNDE</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                      {g.leave.map(s => s.full_name).join(' · ')}
                    </span>
                  </div>
                )}

                {g.absent.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      background: 'var(--surface3)', color: 'var(--text3)',
                      fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                    }}>YOKTA</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', opacity: 0.7 }}>
                      {g.absent.map(s => s.full_name).join(' · ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekFillSheet({ weekFillPopover, setWeekFillPopover, shiftDefs, weekFillDef, setWeekFillDef, weekFillOffDay, setWeekFillOffDay, fillWeek, weekStart, weekEnd, formatDate, shiftColor }) {
  const [error, setError] = useState(null)

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') setWeekFillPopover(null) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [setWeekFillPopover])

  const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

  return (
    <BottomSheet onClose={() => setWeekFillPopover(null)}>
      <div style={{ padding: '0 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '1px' }}>📆 HAFTA DOLDUR</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {weekFillPopover.person.full_name} · {formatDate(weekStart)}–{formatDate(weekEnd)}
            </div>
          </div>
          <button onClick={() => setWeekFillPopover(null)} className="btn btn-ghost btn-sm">✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>VARDIYA SEÇ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {shiftDefs.map(s => {
              const active = weekFillDef === s.id.toString()
              const sc = shiftColor(s.color_class)
              return (
                <button key={s.id} onClick={() => setWeekFillDef(s.id.toString())}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: '8px', textAlign: 'left',
                    fontSize: '13px', cursor: 'pointer',
                    border: `2px solid ${active ? sc.text : 'var(--border)'}`,
                    background: active ? sc.bg : 'var(--surface2)',
                    color: active ? sc.text : 'var(--text2)',
                  }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .7 }}>
                    {s.start_hour}:00–{s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}
                  </span>
                  {active && <span style={{ float: 'right', fontSize: '10px' }}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>İZİN GÜNÜ</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {DAY_LABELS.map((lbl, i) => (
              <button key={i} onClick={() => setWeekFillOffDay(i)}
                style={{
                  flex: 1, padding: '8px 2px', borderRadius: '6px', cursor: 'pointer',
                  border: `2px solid ${weekFillOffDay === i ? 'var(--teal)' : 'var(--border)'}`,
                  background: weekFillOffDay === i ? 'rgba(26,188,156,.12)' : 'var(--surface2)',
                  color: weekFillOffDay === i ? 'var(--teal)' : 'var(--text3)',
                  fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600, textAlign: 'center',
                }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" style={{ width: '100%', opacity: !weekFillDef ? 0.5 : 1 }}
          disabled={!weekFillDef || fillWeek.isPending}
          onClick={() => {
            setError(null)
            fillWeek.mutate(
              { staffId: weekFillPopover.person.id, deptId: weekFillPopover.person.dept_id, shiftDefId: parseInt(weekFillDef), offDayIdx: weekFillOffDay },
              { onError: () => setError('Hafta doldurulamadı. Tekrar deneyin.') }
            )
          }}>
          {fillWeek.isPending ? 'Dolduruluyor...' : '6 Gün Doldur + 1 İzin'}
        </button>
        {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '8px' }}>{error}</div>}
      </div>
    </BottomSheet>
  )
}

function CellAssignSheet({ cellPopover, setCellPopover, shiftDefs, assignCell, deleteShift, formatDate, shortDay, shiftColor }) {
  const [error, setError] = useState(null)

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') setCellPopover(null) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [setCellPopover])

  return (
    <BottomSheet onClose={() => setCellPopover(null)}>
      <div style={{ padding: '0 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '1px' }}>📅 VARDIYA ATA</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {cellPopover.personName} · {formatDate(cellPopover.date)} {shortDay(cellPopover.date)}
            </div>
          </div>
          <button onClick={() => setCellPopover(null)} className="btn btn-ghost btn-sm">✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '4px' }}>VARDIYA SEÇ</div>
        {shiftDefs.map(s => {
          const isActive = cellPopover.existing?.shift_def_id === s.id && cellPopover.existing?.status !== 'on_leave'
          const sc = shiftColor(s.color_class)
          return (
            <button key={s.id}
              onClick={() => { setError(null); assignCell.mutate({ staffId: cellPopover.staffId, deptId: cellPopover.deptId, shiftDefId: s.id, date: cellPopover.date, status: 'scheduled' }, { onError: () => setError('Vardiya atanamadı. Tekrar deneyin.') }) }}
              disabled={assignCell.isPending}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '8px', textAlign: 'left',
                fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--sans)',
                border: `2px solid ${isActive ? sc.text : 'var(--border)'}`,
                background: isActive ? sc.bg : 'var(--surface2)',
                color: isActive ? sc.text : 'var(--text2)',
              }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .6 }}>
                {s.start_hour}:00–{s.end_hour === 24 ? '00' : s.end_hour}:00
              </span>
              {isActive && <span style={{ float: 'right', fontSize: '10px' }}>✓ Aktif</span>}
            </button>
          )
        })}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={() => { setError(null); assignCell.mutate({ staffId: cellPopover.staffId, deptId: cellPopover.deptId, shiftDefId: null, date: cellPopover.date, status: 'on_leave' }, { onError: () => setError('İşlem başarısız. Tekrar deneyin.') }) }}
            disabled={assignCell.isPending}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
              border: `2px solid ${cellPopover.existing?.status === 'on_leave' ? 'var(--teal)' : 'var(--border)'}`,
              background: cellPopover.existing?.status === 'on_leave' ? 'rgba(26,188,156,.12)' : 'var(--surface2)',
              color: cellPopover.existing?.status === 'on_leave' ? 'var(--teal)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
            }}>
            İZİN {cellPopover.existing?.status === 'on_leave' && '✓'}
          </button>
          {cellPopover.existing && (
            <button
              onClick={() => { setError(null); deleteShift.mutate({ staffId: cellPopover.staffId, date: cellPopover.date }, { onError: () => setError('Silme başarısız. Tekrar deneyin.') }) }}
              disabled={deleteShift.isPending}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
                border: '2px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
              }}>
              KALDIR
            </button>
          )}
        </div>
        {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '4px' }}>{error}</div>}
      </div>
    </BottomSheet>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 1 — Cizelge (Schedule) — HAFTA DOLDUR + PAZAR IZIN + PUANTAJ
// ═══════════════════════════════════════════════════════════════════════════════
export default function ScheduleTab({ departments, shiftDefs, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  const [deptFilter, setDeptFilter] = useState('')
  const [scheduleView, setScheduleView] = useState('weekly') // 'weekly' | 'daily'
  const [dailyDate, setDailyDate] = useState(todayStr())
  const [toolsOpen, setToolsOpen] = useState(false)
  const [toolsRect, setToolsRect] = useState(null)
  const [cellPopover, setCellPopover] = useState(null)
  const [weekFillPopover, setWeekFillPopover] = useState(null) // { person, rect }
  const [weekFillDef, setWeekFillDef] = useState('')
  const [weekFillOffDay, setWeekFillOffDay] = useState(6) // 0=Mon .. 6=Sun — default Sunday
  const [addPersonModal, setAddPersonModal] = useState(false)
  const [addPersonId, setAddPersonId] = useState('')
  const [bulkFillModal, setBulkFillModal] = useState(false)
  const [bulkDef, setBulkDef] = useState('')
  const [bulkDept, setBulkDept] = useState('')
  // All-staff fill
  const [allFillModal, setAllFillModal] = useState(false)
  const [allFillDef, setAllFillDef] = useState('')
  // Excel import
  const [excelModal, setExcelModal] = useState(false)
  const [excelPreview, setExcelPreview] = useState(null) // { matched, unmatched, entries }
  const [excelError, setExcelError] = useState('')
  const [dragShiftId, setDragShiftId] = useState(null)    // drag'deki shiftDefId
  const [dragOverCell, setDragOverCell] = useState(null)  // 'staffId-date' format

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekEnd = weekDays[6]
  const DAY_LABELS = ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz']

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['schedule', weekStart, deptFilter],
    queryFn: () => api.get('/shifts/schedule', {
      params: { week: weekStart, week_end: weekEnd, dept_id: deptFilter || undefined }
    }).then(r => r.data),
  })

  const { data: allStaff = [] } = useQuery({
    queryKey: ['staff-list-active'],
    queryFn: () => api.get('/shifts/staff', { params: { is_active: '1' } }).then(r => r.data),
  })

  // Build stable weekly grid: merge schedule data with all staff in dept
  const staffGrid = useMemo(() => {
    // First: index schedule rows by staff_id
    const schedMap = new Map()
    rows.forEach(r => {
      if (!schedMap.has(r.staff_id)) {
        schedMap.set(r.staff_id, {
          id: r.staff_id, full_name: r.full_name, gender: r.gender, position: r.position,
          dept_id: r.dept_id, dept_name: r.dept_name, dept_color: r.dept_color,
          days: {}
        })
      }
      schedMap.get(r.staff_id).days[r.work_date] = r
    })

    // Second: add all active staff (those NOT in schedule yet)
    const result = new Map(schedMap)
    allStaff.forEach(s => {
      if (deptFilter && s.department_id !== parseInt(deptFilter)) return
      if (!result.has(s.id)) {
        result.set(s.id, {
          id: s.id, full_name: s.full_name, gender: s.gender, position: s.position,
          dept_id: s.department_id, dept_name: s.dept_name, dept_color: s.dept_color,
          days: {}
        })
      }
    })

    // Sort by dept then name
    return Array.from(result.values()).sort((a, b) => {
      if (a.dept_name && b.dept_name && a.dept_name !== b.dept_name) return a.dept_name.localeCompare(b.dept_name, 'tr')
      return (a.full_name || '').localeCompare(b.full_name || '', 'tr')
    })
  }, [rows, allStaff, deptFilter])

  const assignCell = useMutation({
    mutationFn: ({ staffId, deptId, shiftDefId, date, status }) =>
      api.post('/shifts/schedule', {
        entries: [{ staff_id: staffId, dept_id: deptId, shift_def_id: shiftDefId || null, work_date: date, status: status || 'scheduled' }]
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setCellPopover(null) },
    onError: (err) => {
      useToastStore.getState().addToast(err?.response?.data?.error || 'Vardiya atanamadı', 'error')
    },
  })

  const deleteShift = useMutation({
    mutationFn: ({ staffId, date }) => api.delete(`/shifts/schedule/${staffId}/${date}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setCellPopover(null) }
  })

  const copyWeek = useMutation({
    mutationFn: () => api.post('/shifts/schedule/copy-week', { source_week: weekStart, target_week: addDays(weekStart, 7) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }) }
  })

  // Fill ALL active staff same shift, Sunday off
  const allFill = useMutation({
    mutationFn: ({ shiftDefId }) => {
      const entries = []
      allStaff.forEach(s => {
        weekDays.forEach((d, i) => {
          entries.push({
            staff_id: s.id,
            dept_id: s.department_id || null,
            work_date: d,
            shift_def_id: i === 6 ? null : parseInt(shiftDefId),
            status: i === 6 ? 'on_leave' : 'scheduled',
          })
        })
      })
      return api.post('/shifts/schedule', { entries })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setAllFillModal(false); setAllFillDef('') }
  })

  // Excel import submit
  const excelImport = useMutation({
    mutationFn: (entries) => api.post('/shifts/schedule', { entries }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setExcelModal(false); setExcelPreview(null) }
  })

  // Excel file parse
  const handleExcelFile = async (file) => {
    setExcelError('')
    setExcelPreview(null)
    try {
      const ExcelJS = (await import('exceljs')).default
      const buf = await file.arrayBuffer()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buf)
      const ws = wb.worksheets[0]
      if (!ws) { setExcelError('Boş dosya'); return }
      const rows = []
      ws.eachRow(row => {
        rows.push(row.values.slice(1).map(v => {
          if (v == null) return ''
          if (typeof v === 'object' && v.text != null) return v.text
          if (typeof v === 'object' && v.result != null) return v.result
          return v
        }))
      })
      if (!rows.length) { setExcelError('Bos dosya'); return }

      // Detect header row (first row with at least 3 cells)
      const headerIdx = rows.findIndex(r => r.filter(Boolean).length >= 3)
      if (headerIdx === -1) { setExcelError('Baslik satiri bulunamadi'); return }
      const headers = rows[headerIdx].map(h => String(h || '').toLowerCase().trim())

      // Name column: first column or one containing "ad" / "isim" / "soyad"
      const nameCol = headers.findIndex(h => h.includes('ad') || h.includes('isim') || h === '') || 0

      // Day column map
      const DAY_KEYS = [
        ['pzt', 'pazartesi', 'mon', 'monday'],
        ['sal', 'salı', 'tue', 'tuesday'],
        ['çar', 'çarşamba', 'wed', 'wednesday'],
        ['per', 'perşembe', 'thu', 'thursday'],
        ['cum', 'cuma', 'fri', 'friday'],
        ['cmt', 'cumartesi', 'sat', 'saturday'],
        ['paz', 'pazar', 'sun', 'sunday'],
      ]
      // Also match date headers like "23.03.2026" → use weekDays order
      const dayColMap = {} // dayIdx (0-6) → colIdx
      headers.forEach((h, ci) => {
        DAY_KEYS.forEach((keys, di) => {
          if (keys.some(k => h.startsWith(k))) dayColMap[di] = ci
        })
      })
      // If no named columns found, try to map by position (cols after name col)
      if (Object.keys(dayColMap).length === 0) {
        const startCol = nameCol + 1
        for (let di = 0; di < 7; di++) {
          if (startCol + di < headers.length) dayColMap[di] = startCol + di
        }
      }

      // Shift value → { shiftDefId, status }
      const parseCell = (val) => {
        if (!val && val !== 0) return null
        const v = String(val).toLowerCase().trim()
        if (!v || v === '-' || v === '') return null
        if (v === 'i' || v === 'İ' || v === 'izin' || v === 'tatil' || v === 'off') return { shiftDefId: null, status: 'on_leave' }
        if (v === '1' || v.startsWith('g') && !v.startsWith('ge')) return { shiftDefId: shiftDefs[0]?.id || null, status: 'scheduled' }
        if (v === '2' || v.startsWith('a')) return { shiftDefId: shiftDefs[1]?.id || null, status: 'scheduled' }
        if (v === '3' || v.startsWith('ge')) return { shiftDefId: shiftDefs[2]?.id || null, status: 'scheduled' }
        // Numeric: 1/2/3
        const n = parseInt(v)
        if (n >= 1 && n <= shiftDefs.length) return { shiftDefId: shiftDefs[n - 1]?.id || null, status: 'scheduled' }
        return null
      }

      // Build name → staff map (normalize: lowercase, trim, remove extra spaces)
      const normalize = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
      const staffByName = new Map(allStaff.map(s => [normalize(s.full_name), s]))

      const matched = [], unmatched = []
      const entries = []

      rows.slice(headerIdx + 1).forEach((row, ri) => {
        if (!row[nameCol]) return // skip empty rows
        const rawName = String(row[nameCol]).trim()
        if (!rawName) return
        const staff = staffByName.get(normalize(rawName))

        const dayEntries = []
        for (let di = 0; di < 7; di++) {
          const colIdx = dayColMap[di]
          if (colIdx === undefined) continue
          const parsed = parseCell(row[colIdx])
          if (!parsed) continue
          dayEntries.push({ dayIdx: di, date: weekDays[di], ...parsed })
        }

        if (!staff) {
          unmatched.push({ name: rawName, dayEntries })
        } else {
          matched.push({ staff, dayEntries })
          dayEntries.forEach(e => {
            entries.push({
              staff_id: staff.id,
              dept_id: staff.department_id || null,
              work_date: e.date,
              shift_def_id: e.shiftDefId,
              status: e.status,
            })
          })
        }
      })

      setExcelPreview({ matched, unmatched, entries })
    } catch (err) {
      setExcelError('Dosya okunamadi: ' + err.message)
    }
  }

  // Fill one person's week (with off-day as on_leave)
  const fillWeek = useMutation({
    mutationFn: ({ staffId, deptId, shiftDefId, offDayIdx }) => {
      const entries = weekDays.map((d, i) => ({
        staff_id: staffId, dept_id: deptId, work_date: d,
        shift_def_id: i === offDayIdx ? null : shiftDefId,
        status: i === offDayIdx ? 'on_leave' : 'scheduled',
      }))
      return api.post('/shifts/schedule', { entries })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setWeekFillPopover(null) }
  })

  // Bulk fill: all staff in a dept
  const bulkFill = useMutation({
    mutationFn: ({ deptId, shiftDefId }) => {
      const staff = allStaff.filter(s => s.department_id === parseInt(deptId))
      const entries = []
      staff.forEach(s => {
        weekDays.forEach((d, i) => {
          entries.push({
            staff_id: s.id, dept_id: parseInt(deptId), work_date: d,
            shift_def_id: i === 6 ? null : parseInt(shiftDefId), // Sunday off
            status: i === 6 ? 'on_leave' : 'scheduled',
          })
        })
      })
      return api.post('/shifts/schedule', { entries })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setBulkFillModal(false) }
  })

  const openCellPopover = (e, person, date) => {
    if (!canEdit) return
    const existing = person.days[date]
    setCellPopover({ staffId: person.id, deptId: person.dept_id, date, personName: person.full_name, existing })
  }

  const openWeekFill = (e, person) => {
    if (!canEdit) return
    setWeekFillDef(shiftDefs[0]?.id?.toString() || '')
    setWeekFillOffDay(6) // default Sunday
    setWeekFillPopover({ person })
  }

  const isSunday = (dateStr) => new Date(dateStr).getDay() === 0

  // Stats for this week
  const weekStats = useMemo(() => {
    let working = 0, onLeave = 0, empty = 0
    // Per-day breakdown
    const perDay = weekDays.map(d => {
      const dayWorking = []
      const dayLeave = []
      const dayEmpty = []
      staffGrid.forEach(p => {
        const cell = p.days[d]
        if (!cell) dayEmpty.push(p)
        else if (cell.status === 'on_leave') dayLeave.push(p)
        else dayWorking.push(p)
      })
      working += dayWorking.length
      onLeave += dayLeave.length
      empty += dayEmpty.length
      return { date: d, working: dayWorking, leave: dayLeave, empty: dayEmpty }
    })
    return { working, onLeave, empty, total: staffGrid.length, perDay }
  }, [staffGrid, weekDays])

  useEffect(() => {
    if (!toolsOpen) return
    const handler = (e) => {
      setToolsOpen(false)
      setToolsRect(null)
    }
    // setTimeout to skip the same click event that opened the dropdown
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [toolsOpen])

  return (
    <div className="fade-up">

      {/* ── Top control bar ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px',
        marginBottom: '20px',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '12px 16px',
      }}>
        {/* Hafta navigasyonu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>‹</button>
          <div style={{ textAlign: 'center', minWidth: '160px', background: 'var(--surface2)', borderRadius: '10px', padding: '4px 16px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '15px', letterSpacing: '1px', color: 'var(--text)' }}>
              {formatDate(weekStart)} — {formatDate(weekEnd)}
            </div>
          </div>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>›</button>
          <button onClick={() => setWeekStart(getWeekStart(new Date()))} style={{
            padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
            background: 'rgba(240,165,0,.15)', border: '1px solid rgba(240,165,0,.4)',
            cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--mono)',
          }}>Bugün</button>
        </div>

        {/* View toggle: HAFTALIK / GÜNLÜK */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className={`filter-chip${scheduleView === 'weekly' ? ' active' : ''}`}
            onClick={() => setScheduleView('weekly')}
          >HAFTALIK</button>
          <button
            className={`filter-chip${scheduleView === 'daily' ? ' active' : ''}`}
            onClick={() => { setScheduleView('daily'); setDailyDate(typeof todayStr === 'function' ? todayStr() : todayStr) }}
          >GÜNLÜK</button>
        </div>

        {/* Dept filter */}
        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '150px' }}>
          <option value="">Tüm Bölümler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {/* Araçlar dropdown */}
        {canEdit && (
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <button
              onClick={e => {
                if (toolsOpen) {
                  setToolsOpen(false); setToolsRect(null)
                } else {
                  setToolsRect(e.currentTarget.getBoundingClientRect())
                  setToolsOpen(true)
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)',
              }}
            >
              <span style={{ fontSize: '16px', letterSpacing: '-1px' }}>⋯</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>Araçlar</span>
              <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
            </button>

            {toolsOpen && toolsRect && createPortal(
              <div
                onMouseDown={e => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: toolsRect.bottom + 4,
                  right: window.innerWidth - toolsRect.right,
                  zIndex: 100,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,.3)',
                  minWidth: '200px',
                  overflow: 'hidden',
                }}
              >
                {[
                  { label: 'Toplu Vardiya Doldur', action: () => { setBulkFillModal(true); setToolsOpen(false) } },
                  { label: 'Tüm Personeli Doldur', action: () => { setAllFillDef(shiftDefs[0]?.id?.toString() || ''); setAllFillModal(true); setToolsOpen(false) } },
                  { label: 'Haftayı Kopyala', action: async () => { if (await confirmDialog('Bu haftayı sonraki haftaya kopyalayalım mı?')) { copyWeek.mutate(); setToolsOpen(false) } } },
                  { label: 'Excel Import', action: () => { setExcelModal(true); setExcelPreview(null); setExcelError(''); setToolsOpen(false) } },
                  { label: '+ Çizelgeye Personel Ekle', action: () => { setAddPersonModal(true); setToolsOpen(false) } },
                ].map(({ label, action }) => (
                  <button key={label} onClick={action} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 16px', background: 'none', border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: '13px', color: 'var(--text2)',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >{label}</button>
                ))}
              </div>,
              document.body
            )}
          </div>
        )}
      </div>

      {/* ── Shift palette (D&D) ── */}
      {scheduleView === 'weekly' && canEdit && !('ontouchstart' in window) && (
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '12px',
          padding: '8px 12px', background: 'var(--surface2)',
          borderRadius: '8px', border: '1px solid var(--border)',
          alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginRight: '4px' }}>
            SÜRÜKLE:
          </span>
          {shiftDefs.map(s => {
            const sc = shiftColor(s.color_class)
            return (
              <div
                key={s.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('shiftDefId', String(s.id))
                  setDragShiftId(s.id)
                }}
                onDragEnd={() => setDragShiftId(null)}
                style={{
                  padding: '5px 12px', borderRadius: '6px',
                  background: sc.bg, color: sc.text,
                  fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700,
                  cursor: 'grab', userSelect: 'none',
                  border: `1px solid ${sc.text}33`,
                }}
              >
                {s.name} {s.start_hour}–{s.end_hour === 24 ? '00' : s.end_hour}
              </div>
            )
          })}
          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('shiftDefId', 'delete'); setDragShiftId('delete') }}
            onDragEnd={() => setDragShiftId(null)}
            style={{
              padding: '5px 12px', borderRadius: '6px',
              background: 'rgba(231,76,60,.12)', color: 'var(--red)',
              fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700,
              cursor: 'grab', userSelect: 'none',
              border: '1px solid rgba(231,76,60,.3)',
            }}
          >
            ✕ Sil
          </div>
        </div>
      )}

      {/* View: GÜNLÜK */}
      {scheduleView === 'daily' && (
        <DailyView
          departments={departments}
          date={dailyDate}
          onDateChange={setDailyDate}
        />
      )}

      {/* View: HAFTALIK */}
      {scheduleView === 'weekly' && (
      <>
      {/* ── Schedule grid ── */}
      {isLoading ? (
        <SkeletonTable rows={6} cols={8} />
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,.15)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            {/* Header row */}
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 10,
                  background: 'var(--surface2)', borderRight: '2px solid var(--border)',
                  padding: '12px 16px', minWidth: '180px', textAlign: 'left',
                  borderBottom: '2px solid var(--border)',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '2px', color: 'var(--text3)' }}>
                    PERSONEL · {weekStats.total}
                  </div>
                </th>
                {weekDays.map((d, i) => {
                  const sun = isSunday(d)
                  const isToday = d === todayStr()
                  return (
                    <th key={d} style={{
                      padding: '10px 8px', textAlign: 'center', minWidth: '110px',
                      borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                      background: isToday ? 'rgba(59,140,240,.1)' : sun ? 'rgba(240,165,0,.07)' : undefined,
                      borderBottom: isToday ? '2px solid var(--blue)' : sun ? '2px solid var(--accent)' : '2px solid var(--border)',
                    }}>
                      <div style={{
                        fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px',
                        color: isToday ? 'var(--blue)' : sun ? 'var(--accent)' : 'var(--text)',
                      }}>{DAY_LABELS[i]}</div>
                      <div style={{
                        fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '2px',
                        color: isToday ? 'var(--blue)' : sun ? 'var(--accent)' : 'var(--text3)',
                      }}>{formatDate(d)}</div>
                      {/* Day stats mini */}
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '4px' }}>
                        <span style={{ fontSize: '9px', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>
                          {weekStats.perDay[i]?.working.length || 0}✓
                        </span>
                        {weekStats.perDay[i]?.leave.length > 0 && (
                          <span style={{ fontSize: '9px', fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>
                            {weekStats.perDay[i].leave.length}İ
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
                {canEdit && <th style={{ width: '60px', background: 'var(--surface2)' }} />}
              </tr>
            </thead>
            <tbody>
              {staffGrid.map((person, rowIdx) => {
                const dc = deptColor(person.dept_color)
                const avatarColor = person.gender === 'female' ? { bg: 'rgba(244,114,182,.2)', text: '#f472b6' } : { bg: 'rgba(59,140,240,.2)', text: 'var(--blue)' }
                return (
                  <tr key={person.id} style={{ borderTop: '1px solid var(--border)', background: rowIdx % 2 === 0 ? 'var(--bg)' : 'var(--surface)', borderLeft: `3px solid ${dc.bg || 'transparent'}` }}>
                    {/* Person cell */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 5,
                      background: rowIdx % 2 === 0 ? 'var(--bg)' : 'var(--surface)',
                      borderRight: '2px solid var(--border)',
                      padding: '8px 12px',
                    }}>
                      <div
                        onClick={() => onPersonClick?.(person.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                      >
                        {/* Avatar */}
                        <div style={{
                          width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                          background: avatarColor.bg, color: avatarColor.text,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--display)', fontSize: '14px', fontWeight: 700,
                        }}>
                          {person.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '13px', fontWeight: 600, color: 'var(--text)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px',
                          }}>{person.full_name}</div>
                          {person.dept_name && (
                            <span style={{
                              fontSize: '9px', fontFamily: 'var(--mono)', letterSpacing: '.5px',
                              padding: '1px 5px', borderRadius: '4px', marginTop: '2px', display: 'inline-block',
                              background: dc.bg, color: dc.text,
                            }}>{person.dept_name}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Day cells */}
                    {weekDays.map((d, i) => {
                      const cell = person.days[d]
                      const sc = cell?.shift_color ? shiftColor(cell.shift_color) : null
                      const sun = isSunday(d)
                      const isToday = d === todayStr()
                      const isLeave = cell?.status === 'on_leave'
                      const isAbsent = cell?.status === 'absent'

                      let pillBg = 'transparent', pillColor = 'var(--text3)', pillLabel = null, pillSub = null

                      if (cell) {
                        if (isLeave) {
                          pillBg = 'rgba(26,188,156,.15)'; pillColor = 'var(--teal)'; pillLabel = '🏖 İZİN'
                        } else if (isAbsent) {
                          pillBg = 'rgba(231,76,60,.12)'; pillColor = 'var(--red)'; pillLabel = '✗ YOK'
                        } else if (sc) {
                          pillBg = sc.bg; pillColor = sc.text
                          pillLabel = cell.shift_name
                          pillSub = `${cell.shift_start || ''}–${cell.shift_end === 24 ? '00' : cell.shift_end || ''}${cell.shift_start ? ':00' : ''}`
                        }
                      }

                      return (
                        <td key={d}
                          onDragOver={e => {
                            if (!canEdit || !dragShiftId || 'ontouchstart' in window) return
                            if (assignCell.isPending) return
                            e.preventDefault()
                            setDragOverCell(`${person.id}-${d}`)
                          }}
                          onDragLeave={() => setDragOverCell(null)}
                          onDrop={e => {
                            e.preventDefault()
                            setDragOverCell(null)
                            if (!canEdit || assignCell.isPending) return
                            const rawId = e.dataTransfer.getData('shiftDefId')
                            setDragShiftId(null)
                            if (rawId === 'delete') {
                              deleteShift.mutate({ staffId: person.id, date: d })
                            } else {
                              const shiftDefId = parseInt(rawId)
                              assignCell.mutate({ staffId: person.id, deptId: person.dept_id, shiftDefId, date: d, status: 'scheduled' })
                            }
                          }}
                          style={{
                            padding: '6px 4px', textAlign: 'center',
                            borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                            background: dragOverCell === `${person.id}-${d}`
                              ? 'rgba(240,165,0,.15)'
                              : isToday ? 'rgba(59,140,240,.04)' : sun ? 'rgba(240,165,0,.03)' : 'transparent',
                            transition: 'background .1s',
                            outline: dragOverCell === `${person.id}-${d}` ? '2px dashed rgba(240,165,0,.6)' : 'none',
                          }}>
                          <button
                            onClick={e => openCellPopover(e, person, d)}
                            disabled={!canEdit}
                            style={{
                              width: '100%', minHeight: pillLabel ? '58px' : '54px', padding: '6px 4px',
                              borderRadius: '8px', border: pillLabel ? 'none' : `1px dashed ${canEdit ? 'var(--border)' : 'transparent'}`,
                              cursor: canEdit ? 'pointer' : 'default',
                              background: pillBg,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                              transition: 'filter .15s, transform .1s',
                            }}
                            onMouseEnter={e => {
                              if (canEdit) {
                                e.currentTarget.style.filter = 'brightness(1.15)'
                                if (!pillLabel) e.currentTarget.style.borderStyle = 'solid'
                              }
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.filter = 'none'
                              if (!pillLabel) e.currentTarget.style.borderStyle = 'dashed'
                            }}
                          >
                            {pillLabel ? (
                              <>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.5px', color: pillColor, fontWeight: 700 }}>
                                  {pillLabel}
                                </span>
                                {pillSub && (
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: pillColor, opacity: .7 }}>
                                    {pillSub}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: '18px', color: 'var(--border)', opacity: canEdit ? 0.3 : 0 }}>+</span>
                            )}
                          </button>
                        </td>
                      )
                    })}

                    {/* Week fill button */}
                    {canEdit && (
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button
                          onClick={e => openWeekFill(e, person)}
                          title="Haftayı doldur"
                          style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: 'var(--surface2)', border: '1px solid var(--border)',
                            cursor: 'pointer', fontSize: '14px', color: 'var(--text3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >↓</button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {staffGrid.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} style={{ padding: '60px', textAlign: 'center' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>📅</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '2px', color: 'var(--text2)' }}>PERSONEL YOK</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>Departman seçin veya personel ekleyin</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {/* Cell panel — vardiya/izin atama */}
      {cellPopover && (
        <CellAssignSheet
          cellPopover={cellPopover}
          setCellPopover={setCellPopover}
          shiftDefs={shiftDefs}
          assignCell={assignCell}
          deleteShift={deleteShift}
          formatDate={formatDate}
          shortDay={shortDay}
          shiftColor={shiftColor}
        />
      )}

      {/* Week fill panel */}
      {weekFillPopover && (
        <WeekFillSheet
          weekFillPopover={weekFillPopover}
          setWeekFillPopover={setWeekFillPopover}
          shiftDefs={shiftDefs}
          weekFillDef={weekFillDef}
          setWeekFillDef={setWeekFillDef}
          weekFillOffDay={weekFillOffDay}
          setWeekFillOffDay={setWeekFillOffDay}
          fillWeek={fillWeek}
          weekStart={weekStart}
          weekEnd={weekEnd}
          formatDate={formatDate}
          shiftColor={shiftColor}
        />
      )}

      {/* Bulk fill modal — entire dept */}
      {bulkFillModal && (
        <ModalOverlay onClose={() => setBulkFillModal(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '12px' }}>TOPLU DOLDUR</h3>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '14px' }}>
            Secilen departmandaki tum personeli ayni vardiyayla doldurur. Pazar izinli.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label className="form-label">Departman</label>
              <select className="form-select" value={bulkDept} onChange={e => setBulkDept(e.target.value)}>
                <option value="">Sec...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Vardiya</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {shiftDefs.map(s => {
                  const active = bulkDef === s.id.toString()
                  const sc = shiftColor(s.color_class)
                  return (
                    <button key={s.id} onClick={() => setBulkDef(s.id.toString())}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '6px',
                        textAlign: 'left', fontSize: '12px', cursor: 'pointer',
                        border: `2px solid ${active ? sc.text : 'var(--border)'}`,
                        background: active ? sc.bg : 'var(--surface2)',
                        color: active ? sc.text : 'var(--text2)',
                      }}>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .7 }}>
                        {s.start_hour}:00&ndash;{s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (!bulkDept || !bulkDef) ? 0.5 : 1 }}
              disabled={!bulkDept || !bulkDef || bulkFill.isPending}
              onClick={() => bulkFill.mutate({ deptId: bulkDept, shiftDefId: bulkDef })}>
              {bulkFill.isPending ? 'Dolduruluyor...' : 'Tum Departmani Doldur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setBulkFillModal(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {/* All-staff fill modal */}
      {allFillModal && (
        <ModalOverlay onClose={() => { setAllFillModal(false); setAllFillDef('') }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            TUM PERSONELI DOLDUR
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
            Bu haftanın tüm günlerini seçili vardiyayla doldurur. Pazar günü otomatik izin olarak işaretlenir.
          </p>
          <div style={{ marginBottom: '16px' }}>
            <label className="form-label">Vardiya Seç</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {shiftDefs.map(s => {
                const active = allFillDef === s.id.toString()
                const sc = shiftColor(s.color_class)
                return (
                  <button key={s.id} onClick={() => setAllFillDef(s.id.toString())}
                    style={{
                      padding: '10px 18px', borderRadius: '8px', fontFamily: 'var(--display)',
                      fontSize: '13px', letterSpacing: '1px', cursor: 'pointer',
                      border: `2px solid ${active ? sc.text : 'var(--border)'}`,
                      background: active ? sc.bg : 'var(--surface2)',
                      color: active ? sc.text : 'var(--text2)',
                    }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .7 }}>
                      {s.start_hour}:00&ndash;{s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: !allFillDef ? 0.5 : 1 }}
              disabled={!allFillDef || allFill.isPending}
              onClick={() => allFill.mutate({ shiftDefId: allFillDef })}>
              {allFill.isPending ? 'Dolduruluyor...' : `Tum Personeli Doldur (${allStaff.length} kişi)`}
            </button>
            <button className="btn btn-ghost" onClick={() => { setAllFillModal(false); setAllFillDef('') }}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {/* Excel import modal */}
      {excelModal && (
        <ModalOverlay onClose={() => { setExcelModal(false); setExcelPreview(null); setExcelError('') }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            EXCEL AKTAR
          </h3>
          {!excelPreview ? (
            <>
              <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
                Excel dosyasını seçin. İlk sütun isim, sonraki sütunlar günler (Pt, Sa, Ca, Pe, Cu, Ct, Pz veya Mon–Sun).
                Hücre değerleri: <strong>1/G</strong>=1.Vardiya, <strong>2/A</strong>=2.Vardiya, <strong>3/Ge</strong>=3.Vardiya, <strong>İ/izin</strong>=İzin, boş=atla.
              </p>
              {excelError && (
                <div style={{ padding: '10px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: '6px', color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>
                  {excelError}
                </div>
              )}
              <input type="file" accept=".xlsx,.xls,.csv"
                style={{ display: 'block', width: '100%', padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', cursor: 'pointer', marginBottom: '16px' }}
                onChange={e => { if (e.target.files[0]) handleExcelFile(e.target.files[0]) }}
              />
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => { setExcelModal(false); setExcelError('') }}>Iptal</button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1, padding: '10px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>{excelPreview.matched}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Eşleşen</div>
                </div>
                <div style={{ flex: 1, padding: '10px', background: excelPreview.unmatched.length ? 'rgba(239,68,68,.1)' : 'var(--surface2)', border: `1px solid ${excelPreview.unmatched.length ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: excelPreview.unmatched.length ? '#ef4444' : 'var(--text2)' }}>{excelPreview.unmatched.length}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Eşleşmeyen</div>
                </div>
                <div style={{ flex: 1, padding: '10px', background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.3)', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#6366f1' }}>{excelPreview.entries.length}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Kayıt</div>
                </div>
              </div>
              {excelPreview.unmatched.length > 0 && (
                <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '4px', fontWeight: 600 }}>Eşleşmeyen isimler:</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{excelPreview.unmatched.join(', ')}</div>
                </div>
              )}
              <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text2)' }}>İsim</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Pt</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Sa</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Ca</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Pe</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Cu</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Ct</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Pz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(
                      excelPreview.entries.reduce((acc, e) => {
                        const s = allStaff.find(x => x.id === e.staff_id)
                        const name = s?.full_name || `#${e.staff_id}`
                        if (!acc[name]) acc[name] = {}
                        const dayIdx = weekDays.indexOf(e.work_date)
                        if (dayIdx >= 0) acc[name][dayIdx] = e
                        return acc
                      }, {})
                    ).map(([name, days]) => (
                      <tr key={name} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--text)', fontWeight: 500 }}>{name}</td>
                        {[0,1,2,3,4,5,6].map(i => {
                          const e = days[i]
                          if (!e) return <td key={i} style={{ padding: '5px 10px', textAlign: 'center', color: 'var(--text3)' }}>—</td>
                          if (e.status === 'on_leave') return <td key={i} style={{ padding: '5px 10px', textAlign: 'center', color: '#f59e0b', fontWeight: 600 }}>İ</td>
                          const def = shiftDefs.find(d => d.id === e.shift_def_id)
                          const sc = shiftColor(def?.color_class)
                          return <td key={i} style={{ padding: '5px 10px', textAlign: 'center', color: sc.text, fontWeight: 600 }}>{def?.name || e.shift_def_id}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" style={{ flex: 1 }}
                  disabled={excelImport.isPending || excelPreview.entries.length === 0}
                  onClick={() => excelImport.mutate(excelPreview.entries)}>
                  {excelImport.isPending ? 'Aktarılıyor...' : `İce Aktar (${excelPreview.entries.length} kayıt)`}
                </button>
                <button className="btn btn-ghost" onClick={() => { setExcelPreview(null); setExcelError('') }}>Geri</button>
                <button className="btn btn-ghost" onClick={() => { setExcelModal(false); setExcelPreview(null); setExcelError('') }}>Kapat</button>
              </div>
            </>
          )}
        </ModalOverlay>
      )}

      {/* Add person to schedule */}
      {addPersonModal && (
        <ModalOverlay onClose={() => { setAddPersonModal(false); setAddPersonId('') }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            CIZELGEYE PERSONEL EKLE
          </h3>
          <div style={{ marginBottom: '14px' }}>
            <label className="form-label">Personel Ara</label>
            <StaffSearch value={addPersonId} onChange={v => setAddPersonId(v)} placeholder="Ad, TC veya telefon ile ara..." />
          </div>
          {addPersonId && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', marginBottom: '10px' }}>
              Personel secildi (ID: {addPersonId})
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: !addPersonId ? 0.5 : 1 }}
              disabled={!addPersonId}
              onClick={() => {
                const s = allStaff.find(x => x.id === parseInt(addPersonId))
                if (s) {
                  setAddPersonModal(false); setAddPersonId('')
                  // directly fill their week
                  setWeekFillDef(shiftDefs[0]?.id?.toString() || '')
                  setWeekFillOffDay(6)
                  setWeekFillPopover({ person: { id: s.id, full_name: s.full_name, dept_id: s.department_id, dept_name: s.dept_name } })
                }
              }}>
              Hafta Doldur
            </button>
            <button className="btn btn-ghost" onClick={() => { setAddPersonModal(false); setAddPersonId('') }}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
