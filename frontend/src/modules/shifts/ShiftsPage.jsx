import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { useDebounce } from '../../shared/hooks/useDebounce.js'
import { useSavedFilters, SavedFiltersBar } from '../../shared/hooks/useSavedFilters.jsx'
import { SkeletonTable, SkeletonGrid } from '../../shared/components/Skeleton.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import {
  getWeekStart, addDays, formatDate, shortDay, todayStr,
  shiftColor, deptColor,
  BottomSheet, ModalOverlay, StaffSearch,
} from './shared.jsx'
import LeaveTab from './tabs/LeaveTab.jsx'
import OvertimeTab from './tabs/OvertimeTab.jsx'
import DepartmentsTab from './tabs/DepartmentsTab.jsx'
import SwapTab from './tabs/SwapTab.jsx'
import SettingsTab from './tabs/SettingsTab.jsx'
import StaffTab from './tabs/StaffTab.jsx'
import StaffDetailPanel from './StaffDetailPanel.jsx'

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
function ScheduleTab({ departments, shiftDefs, onPersonClick }) {
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
                const sc = SHIFT_COLORS[s.color_class] || SHIFT_COLORS.blue
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
                          const sc = SHIFT_COLORS[def?.color_class] || SHIFT_COLORS.blue
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

// ═══════════════════════════════════════════════════════════════════════════════
//  PuantajTab — Professional Payroll / Monthly Timesheet
// ═══════════════════════════════════════════════════════════════════════════════
const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || 'YYS Kampüs'

function PuantajSummaryView({ filtered, formatMoney }) {
  const byDept = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const key = r.dept_name || 'Departmansız'
      if (!map[key]) map[key] = { name: key, staff: 0, worked: 0, absent: 0, overtime: 0, leave: 0, gross: 0, net: 0, employer: 0 }
      const d = map[key]
      d.staff++
      d.worked += r.worked_days || 0
      d.absent += r.absent_days || 0
      d.overtime += r.overtime_hours || 0
      d.leave += r.leave_days || 0
      d.gross += r.gross || 0
      d.net += r.net || 0
      d.employer += r.employer_total_cost || 0
    })
    return Object.values(map)
  }, [filtered])

  if (byDept.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon">🏢</div>
      <div className="empty-title">KAYIT YOK</div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
      {byDept.map(d => (
        <div key={d.name} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px' }}>{d.name}</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: '4px' }}>{d.staff} kişi</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            {[
              ['Çalışılan', `${d.worked} gün`, 'var(--green)'],
              ['Devamsız', `${d.absent} gün`, 'var(--red)'],
              ['Mesai', `${d.overtime}s`, 'var(--accent)'],
              ['İzin', `${d.leave} gün`, 'var(--purple)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: 'var(--surface2)', borderRadius: '6px', padding: '6px 8px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '14px', color, marginTop: '2px' }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: 'var(--text3)' }}>Brüt Toplam</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: '600' }}>{formatMoney(d.gross)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--text3)' }}>Net Toplam</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: '700', color: 'var(--green)' }}>{formatMoney(d.net)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span style={{ color: 'var(--text3)' }}>İşveren Maliyeti</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{formatMoney(d.employer)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PuantajCalendarView({ filtered, month, y, m, isLoading }) {
  const [dayData, setDayData] = useState({}) // staffId → days array

  const daysInMonth = new Date(y, m, 0).getDate()
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const loadedIds = useRef(new Set())

  // When calendar view loads, lazy-fetch day breakdowns for all staff
  useEffect(() => {
    filtered.forEach(r => {
      if (loadedIds.current.has(r.id)) return
      loadedIds.current.add(r.id)
      api.get(`/shifts/puantaj/${r.id}/days`, { params: { month } })
        .then(res => setDayData(prev => ({ ...prev, [r.id]: res.data })))
        .catch(() => { loadedIds.current.delete(r.id) }) // allow retry on error
    })
  }, [filtered, month])

  const STATUS_COLORS = {
    worked: { bg: 'var(--green)', text: '#fff' },
    absent: { bg: 'transparent', text: 'var(--red)' },
    on_leave: { bg: 'rgba(167,139,250,.2)', text: 'var(--purple)' },
    overtime: { bg: 'rgba(240,165,0,.2)', text: 'var(--accent)' },
    scheduled: { bg: 'var(--surface3)', text: 'var(--text3)' },
    sunday: { bg: 'transparent', text: 'var(--border)' },
    no_record: { bg: 'transparent', text: 'transparent' },
  }

  const STATUS_SYMBOL = { worked: '▓', absent: '✗', on_leave: 'İ', overtime: 'M', scheduled: '·', sunday: '', no_record: '' }

  // Sunday indices (day of week for day 1)
  const sundayDays = new Set(dayNumbers.filter(d => new Date(y, m - 1, d).getDay() === 0))

  if (isLoading) return <SkeletonTable rows={6} cols={32} />

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '10px', width: 'max-content' }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 2, minWidth: '140px', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              PERSONEL
            </th>
            {dayNumbers.map(d => (
              <th key={d} style={{
                width: '24px', textAlign: 'center', padding: '4px 0',
                borderBottom: '1px solid var(--border)',
                color: sundayDays.has(d) ? 'var(--accent)' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: '9px',
              }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => {
            const days = dayData[r.id] || []
            const dayMap = {}
            days.forEach(d => { dayMap[d.date.split('-')[2]] = d })

            return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', padding: '4px 8px', fontWeight: '500', zIndex: 1 }}>
                  <div>{r.full_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{r.dept_name}</div>
                </td>
                {dayNumbers.map(d => {
                  const dayStr = String(d).padStart(2, '0')
                  const entry = dayMap[dayStr]
                  const status = entry?.status || (sundayDays.has(d) ? 'sunday' : 'no_record')
                  const c = STATUS_COLORS[status] || STATUS_COLORS.no_record
                  const sym = STATUS_SYMBOL[status] || ''
                  return (
                    <td key={d} title={entry?.shift_name || entry?.leave_type || status}
                      style={{
                        width: '24px', textAlign: 'center', padding: '2px 0',
                        background: c.bg, color: c.text,
                        fontSize: status === 'worked' ? '11px' : '12px',
                      }}>
                      {sym}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PuantajListView({ filtered, totals, isLoading, month, monthLabel, showEmployer, sortBy, setSortBy, formatMoney, onRowClick }) {
  const SORTS = [{ id: 'name', label: 'AD' }, { id: 'worked', label: 'ÇALIŞTI' }, { id: 'absent', label: 'DEVAMSIZ' }, { id: 'net', label: 'NET' }]

  if (isLoading) return <SkeletonTable rows={8} cols={5} />
  if (filtered.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon">📋</div>
      <div className="empty-title">KAYIT YOK</div>
      <div className="empty-desc">Bu ay için puantaj verisi bulunamadı.</div>
    </div>
  )

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">PUANTAJ TABLOSU</div>
          <div className="panel-subtitle">{filtered.length} personel · {monthLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {SORTS.map(s => (
            <button key={s.id} className={`filter-chip ${sortBy === s.id ? 'active' : ''}`}
              onClick={() => setSortBy(s.id)} style={{ fontSize: '9px', padding: '3px 8px' }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: '11px' }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 2, minWidth: '140px' }}>AD SOYAD</th>
              <th>DEPT</th>
              <th style={{ textAlign: 'center' }}>DEVAM %</th>
              <th style={{ textAlign: 'center', color: 'var(--green)' }}>İŞ</th>
              <th style={{ textAlign: 'center', color: 'var(--purple)' }}>İZİN TÜRÜ</th>
              <th style={{ textAlign: 'center', color: 'var(--red)' }}>YOK</th>
              <th style={{ textAlign: 'center', color: 'var(--accent)' }}>MESAİ</th>
              <th style={{ textAlign: 'right' }}>BRÜT</th>
              <th style={{ textAlign: 'right' }}>KESİNTİ</th>
              <th style={{ textAlign: 'right', color: 'var(--green)' }}>NET</th>
              {showEmployer && <th style={{ textAlign: 'right', color: 'var(--teal)' }}>İŞVEREN MAL.</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} onClick={() => onRowClick(r)}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', fontWeight: '600', zIndex: 1 }}>
                  {r.full_name}
                  {r.position && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>{r.position}</div>}
                </td>
                <td>
                  <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    {r.dept_name || '—'}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--surface3)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, r.attend_rate || 0)}%`, height: '100%', background: (r.attend_rate || 0) >= 80 ? 'var(--green)' : (r.attend_rate || 0) >= 50 ? 'var(--accent)' : 'var(--red)' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>%{r.attend_rate || 0}</span>
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{r.worked_days || 0}</td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {(r.annual_leave_days || 0) > 0 && <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(59,130,246,.15)', color: 'var(--blue)' }}>Y:{r.annual_leave_days}</span>}
                    {(r.sick_leave_days || 0) > 0 && <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}>H:{r.sick_leave_days}</span>}
                    {(r.emergency_leave_days || 0) > 0 && <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(234,179,8,.15)', color: 'var(--accent)' }}>A:{r.emergency_leave_days}</span>}
                    {(r.annual_leave_days || 0) === 0 && (r.sick_leave_days || 0) === 0 && (r.emergency_leave_days || 0) === 0 && <span style={{ color: 'var(--text3)', fontSize: '10px' }}>—</span>}
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{r.absent_days || 0}</td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{r.overtime_hours ? `${r.overtime_hours}s` : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px' }}>{formatMoney(r.gross)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--red)' }}
                  title={r.total_deductions ? `SGK: ${r.ssi_worker} ₺ | GV: ${r.income_tax} ₺ | DV: ${r.stamp_tax} ₺` : ''}>
                  {formatMoney(r.total_deductions)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: '700', color: 'var(--green)' }}>{formatMoney(r.net)}</td>
                {showEmployer && <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--teal)' }}>{formatMoney(r.employer_total_cost)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: '700', borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
              <td colSpan={showEmployer ? 10 : 9} style={{ paddingLeft: '12px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>
                TOPLAM — {filtered.length} kişi
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: '700' }}>{formatMoney(totals.net)}</td>
              {showEmployer && <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{formatMoney(totals.employer_total_cost)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function BordroSlip({ row, month, monthLabel }) {
  const [y] = month.split('-').map(Number)
  const maskTc = (tc) => tc ? `${tc.slice(0,3)}*****${tc.slice(-3)}` : '—'
  const fmt = (v) => v ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' ₺' : '0,00 ₺'

  return (
    <div className="bordro-slip">
      <div className="bordro-header">
        <div style={{ fontWeight: '700', fontSize: '14px' }}>{COMPANY_NAME}</div>
        <div style={{ textAlign: 'center', fontWeight: '700', fontSize: '14px' }}>ÜCRET BORDROSU</div>
        <div style={{ textAlign: 'right', fontSize: '12px' }}>Dönem: {monthLabel}</div>
      </div>
      <div className="bordro-divider" />
      <div className="bordro-info">
        <div><span>Ad Soyad:</span> <strong>{row.full_name?.toUpperCase()}</strong></div>
        <div><span>Sicil:</span> <strong>#{row.id}</strong></div>
        <div><span>Departman:</span> <strong>{(row.dept_name || '—').toUpperCase()}</strong></div>
        <div><span>TC:</span> <strong>{maskTc(row.tc_no)}</strong></div>
      </div>
      <div className="bordro-divider" />
      <div className="bordro-row">
        <span>DEVAM:</span>
        <span>İş Günü {row.work_days_in_month} │ Çalıştı {row.worked_days || 0} │ İzin {row.leave_days || 0} │ Devamsız {row.absent_days || 0}</span>
      </div>
      <div className="bordro-divider" />
      <div className="bordro-section-title">ÜCRET BİLEŞENLERİ</div>
      <div className="bordro-line"><span>Temel Ücret ({row.worked_days || 0} × {fmt(row.daily_rate)})</span><span>{fmt(row.base_pay)}</span></div>
      <div className="bordro-line"><span>Ücretli İzin ({(row.annual_leave_days || 0) + (row.emergency_leave_days || 0)} × {fmt(row.daily_rate)})</span><span>{fmt(row.leave_pay)}</span></div>
      <div className="bordro-line"><span>Fazla Mesai ({row.overtime_hours || 0}s × 1.5)</span><span>{fmt(row.overtime_pay)}</span></div>
      <div className="bordro-line bordro-total"><span>BRÜT TOPLAM</span><span>{fmt(row.gross)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-section-title">KESİNTİLER</div>
      <div className="bordro-line"><span>SGK İşçi (%14)</span><span>−{fmt(row.ssi_worker)}</span></div>
      <div className="bordro-line"><span>İşsizlik İşçi (%1)</span><span>−{fmt(row.unemployment_worker)}</span></div>
      <div className="bordro-line"><span>Gelir Vergisi</span><span>−{fmt(row.income_tax)}</span></div>
      <div className="bordro-line"><span>Damga Vergisi (%0.759)</span><span>−{fmt(row.stamp_tax)}</span></div>
      <div className="bordro-line bordro-total"><span>TOPLAM KESİNTİ</span><span>−{fmt(row.total_deductions)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-line bordro-net"><span>NET ELE GEÇEN:</span><span>{fmt(row.net)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-line" style={{ fontSize: '10px' }}>
        <span>İşveren SGK (%20.5): {fmt(row.ssi_employer)} │ İşveren İşsizlik: {fmt(row.unemployment_employer)}</span>
      </div>
      <div className="bordro-line bordro-total"><span>TOPLAM İŞVEREN MALİYETİ:</span><span>{fmt(row.employer_total_cost)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-footer">
        <span>İmza: _______________</span>
        <span>Tarih: ___/___/{y}</span>
      </div>
    </div>
  )
}

function BordroDetailSheet({ row, month, monthLabel, formatMoney, onClose }) {
  const [tab, setTab] = useState('hesap') // 'hesap' | 'gun' | 'ytd'

  const { data: days = [], isFetching: daysLoading } = useQuery({
    queryKey: ['puantaj-days', row.id, month],
    queryFn: () => api.get(`/shifts/puantaj/${row.id}/days`, { params: { month } }).then(r => r.data),
    enabled: tab === 'gun',
  })

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const TABS = [['hesap', '💰 HESAP'], ['gun', '📅 GÜN DÖKÜMÜ'], ['ytd', '📈 YIL']]

  const [y, m] = month.split('-').map(Number)

  // Mini calendar grid helpers
  const firstDow = new Date(y, m - 1, 1).getDay() // 0=Sun
  const startPad = firstDow === 0 ? 6 : firstDow - 1 // make Mon=0

  const DAY_STATUS_STYLE = {
    worked:    { bg: 'var(--green)',            color: '#fff' },
    absent:    { bg: 'rgba(239,68,68,.15)',     color: 'var(--red)' },
    on_leave:  { bg: 'rgba(167,139,250,.15)',   color: 'var(--purple)' },
    overtime:  { bg: 'rgba(240,165,0,.15)',     color: 'var(--accent)' },
    scheduled: { bg: 'var(--surface3)',         color: 'var(--text3)' },
    sunday:    { bg: 'transparent',            color: 'var(--border)' },
    no_record: { bg: 'transparent',            color: 'transparent' },
  }

  return (
    <BottomSheet onClose={onClose}>
      {/* Dept color band */}
      <div style={{ height: '3px', background: 'var(--accent)', flexShrink: 0 }} />

      {/* Header */}
      <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '1px' }}>{row.full_name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {row.position || '—'} · {row.dept_name || '—'} · {monthLabel}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginTop: '12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              flex: 1, padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.5px',
              color: tab === id ? 'var(--accent)' : 'var(--text3)',
              borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {/* HESAP PUSULASI */}
        {tab === 'hesap' && (
          <div>
            {/* Pay components */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>ÜCRET BİLEŞENLERİ</div>
              {[
                ['Temel Ücret', formatMoney(row.base_pay)],
                ['Ücretli İzin', formatMoney(row.leave_pay)],
                ['Fazla Mesai', formatMoney(row.overtime_pay)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: '700', fontSize: '13px' }}>
                <span>BRÜT TOPLAM</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{formatMoney(row.gross)}</span>
              </div>
            </div>

            {/* Deductions */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>KESİNTİLER</div>
              {[
                ['SGK İşçi (%14)', formatMoney(row.ssi_worker)],
                ['İşsizlik İşçi (%1)', formatMoney(row.unemployment_worker)],
                ['Gelir Vergisi', formatMoney(row.income_tax)],
                ['Damga Vergisi (%0.759)', formatMoney(row.stamp_tax)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>−{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '12px', color: 'var(--text3)' }}>
                <span>TOPLAM KESİNTİ</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>−{formatMoney(row.total_deductions)}</span>
              </div>
            </div>

            {/* Net */}
            <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px', color: 'var(--text3)' }}>NET ELE GEÇEN</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: '22px', color: 'var(--green)', letterSpacing: '1px' }}>{formatMoney(row.net)}</span>
            </div>

            {/* Employer cost */}
            <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>İŞVEREN MALİYETİ</div>
              {[
                ['SGK İşveren (%20.5)', formatMoney(row.ssi_employer)],
                ['İşsizlik İşveren (%2)', formatMoney(row.unemployment_employer)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
                  <span style={{ color: 'var(--text3)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '12px', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
                <span>TOPLAM İŞVEREN MALİYETİ</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{formatMoney(row.employer_total_cost)}</span>
              </div>
            </div>

            {/* Print button */}
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => window.print()} style={{ fontSize: '11px' }}>
                🖨 Bordro Fişi Yazdır
              </button>
            </div>

            {/* Hidden print slip */}
            <BordroSlip row={row} month={month} monthLabel={monthLabel} />
          </div>
        )}

        {/* GÜN DÖKÜMÜ */}
        {tab === 'gun' && (
          <div>
            {daysLoading ? (
              <SkeletonGrid count={7} minWidth={40} />
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                  {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', padding: '2px 0' }}>{d}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                  {Array.from({ length: startPad }, (_, i) => <div key={`pad-${i}`} />)}
                  {days.map((d, i) => {
                    if (d.status === 'sunday') return <div key={i} style={{ aspectRatio: '1', borderRadius: '4px' }} />
                    const s = DAY_STATUS_STYLE[d.status] || DAY_STATUS_STYLE.no_record
                    const dayNum = parseInt(d.date.split('-')[2])
                    return (
                      <div key={i} title={d.shift_name || d.leave_type || d.status}
                        style={{ aspectRatio: '1', borderRadius: '4px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontFamily: 'var(--mono)', color: s.color, border: '1px solid var(--border)' }}>
                        {dayNum}
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[['worked','Çalıştı','var(--green)'],['absent','Devamsız','var(--red)'],['on_leave','İzin','var(--purple)'],['overtime','Mesai','var(--accent)']].map(([s,label,color]) => (
                    <span key={s} style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text3)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, display: 'inline-block' }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* YIL BAZLARI */}
        {tab === 'ytd' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>YILBAŞINDAN BU AYA</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Kümülatif Brüt</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: '700' }}>{formatMoney(row.ytd_gross)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Kümülatif Vergi</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{formatMoney(row.ytd_tax)}</span>
              </div>
            </div>
            {/* Tax bracket bar */}
            <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '10px' }}>GELİR VERGİSİ DİLİMİ</div>
              {[
                [110_000, '%15'],
                [230_000, '%20'],
                [870_000, '%27'],
                [3_000_000, '%35'],
                [Infinity, '%40'],
              ].map(([limit, rate], i) => {
                const prev = [0, 110_000, 230_000, 870_000, 3_000_000][i]
                const ytd = row.ytd_gross || 0
                const inBracket = ytd > prev
                const current = ytd > prev && ytd <= (limit === Infinity ? Number.MAX_SAFE_INTEGER : limit)
                return (
                  <div key={rate} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', width: '28px', color: current ? 'var(--accent)' : 'var(--text3)' }}>{rate}</span>
                    <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--surface3)', overflow: 'hidden' }}>
                      {inBracket && (
                        <div style={{
                          height: '100%', borderRadius: '3px',
                          background: current ? 'var(--accent)' : 'var(--green)',
                          width: current ? `${Math.min(100, ((ytd - prev) / (Math.min(limit === Infinity ? ytd : limit, ytd) - prev || 1)) * 100)}%` : '100%',
                        }} />
                      )}
                    </div>
                    {current && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--accent)' }}>← şu an</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

function PuantajTab({ departments }) {
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [deptFilter, setDeptFilter] = useState('')
  const [search, setSearch] = useState('')
  const debouncedPuantajSearch = useDebounce(search, 250)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'calendar' | 'summary'
  const [showEmployer, setShowEmployer] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null) // row object for bordro detail
  const [sortBy, setSortBy] = useState('name')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['puantaj', month, deptFilter],
    queryFn: () => {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      return api.get('/shifts/puantaj', { params }).then(r => r.data)
    },
  })

  const [y, m] = month.split('-').map(Number)

  const formatMoney = (val) => {
    if (val == null || val === 0) return '—'
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val) + ' ₺'
  }

  const filtered = useMemo(() => {
    let list = rows
    if (debouncedPuantajSearch) {
      const q = debouncedPuantajSearch.toLowerCase()
      list = list.filter(r => r.full_name?.toLowerCase().includes(q) || r.dept_name?.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'worked') return (b.worked_days || 0) - (a.worked_days || 0)
      if (sortBy === 'absent') return (b.absent_days || 0) - (a.absent_days || 0)
      if (sortBy === 'net') return (b.net || 0) - (a.net || 0)
      return (a.full_name || '').localeCompare(b.full_name || '', 'tr')
    })
  }, [rows, debouncedPuantajSearch, sortBy])

  const totals = useMemo(() => filtered.reduce((acc, r) => ({
    worked: acc.worked + (r.worked_days || 0),
    leave: acc.leave + (r.leave_days || 0),
    absent: acc.absent + (r.absent_days || 0),
    overtime_hours: acc.overtime_hours + (r.overtime_hours || 0),
    gross: acc.gross + (r.gross || 0),
    net: acc.net + (r.net || 0),
    employer_total_cost: acc.employer_total_cost + (r.employer_total_cost || 0),
  }), { worked: 0, leave: 0, absent: 0, overtime_hours: 0, gross: 0, net: 0, employer_total_cost: 0 }),
  [filtered])

  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase()

  const prevMonth = () => {
    const d = new Date(y, m - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const d = new Date(y, m, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const downloadCsv = async () => {
    try {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      const res = await api.get('/shifts/puantaj/export/csv', { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `puantaj-${month}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      // CSV download error — intentionally no console.log per project rules
    }
  }

  return (
    <div className="fade-up">
      {/* Top bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <button className="btn btn-ghost btn-sm" onClick={prevMonth}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '1px' }}>{monthLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={nextMonth}>→</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)}>Bu Ay</button>

        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '150px', fontSize: '11px', padding: '5px 11px' }}>
          <option value="">Tüm Departmanlar</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input className="form-input" placeholder="Ara..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '150px', fontSize: '11px', padding: '5px 11px' }} />

        {/* View mode */}
        <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)' }}>
          {[['list','📋 LİSTE'],['calendar','📅 TAKVİM'],['summary','🏢 ÖZET']].map(([id, label]) => (
            <button key={id} onClick={() => setViewMode(id)}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontFamily: 'var(--mono)',
                letterSpacing: '0.5px', border: 'none', cursor: 'pointer',
                background: viewMode === id ? 'var(--accent)' : 'transparent',
                color: viewMode === id ? '#000' : 'var(--text3)',
              }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowEmployer(v => !v)}
            style={{ fontSize: '10px' }}>
            💼 {showEmployer ? 'Maliyet Gizle' : 'Maliyet Göster'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={downloadCsv} style={{ fontSize: '10px' }}>
            ⬇ CSV İndir
          </button>
        </div>
      </div>

      {/* Mode content */}
      {viewMode === 'list' && (
        <PuantajListView
          filtered={filtered} totals={totals} isLoading={isLoading}
          month={month} monthLabel={monthLabel}
          showEmployer={showEmployer} sortBy={sortBy} setSortBy={setSortBy}
          formatMoney={formatMoney} onRowClick={setSelectedRow}
        />
      )}
      {viewMode === 'calendar' && (
        <PuantajCalendarView filtered={filtered} month={month} y={y} m={m} isLoading={isLoading} />
      )}
      {viewMode === 'summary' && (
        <PuantajSummaryView filtered={filtered} formatMoney={formatMoney} />
      )}

      {/* Bordro detail bottom sheet */}
      {selectedRow && (
        <BordroDetailSheet
          row={selectedRow} month={month} monthLabel={monthLabel}
          formatMoney={formatMoney}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN — ShiftsPage
// ═══════════════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { id: 'schedule',    icon: '📅', label: 'Çizelge' },
  { id: 'staff',       icon: '👥', label: 'Personel' },
  { id: 'leave',       icon: '🏖️', label: 'İzinler' },
  { id: 'overtime',    icon: '⏰', label: 'Mesai' },
  { id: 'puantaj',     icon: '📊', label: 'Puantaj' },
  { id: 'departments', icon: '🏢', label: 'Bölümler' },
  { id: 'settings',    icon: '⚙️', label: 'Ayarlar' },
]

export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useUrlParamState('tab', 'schedule')
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [navExpanded, setNavExpanded] = useState(false)

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
  })

  const { data: shiftDefs = [] } = useQuery({
    queryKey: ['shift-defs'],
    queryFn: () => api.get('/shifts/definitions').then(r => r.data),
  })

  const { data: pendingLeaves = [] } = useQuery({
    queryKey: ['leaves', 'badge'],
    queryFn: () => api.get('/shifts/leave?status=pending').then(r => r.data),
    staleTime: 60000,
  })
  const pendingLeaveCount = pendingLeaves.length

  const handlePersonClick = useCallback((id) => {
    setSelectedStaff(id)
  }, [])

  const activeNav = NAV_ITEMS.find(n => n.id === activeTab)

  return (
    <div className="fade-up" style={{ display: 'flex', height: '100%', margin: '-32px -40px', minHeight: 'calc(100vh - 60px)', position: 'relative' }}>

      {/* ── Left navigation sidebar ── */}
      <nav style={{
        width: navExpanded ? '180px' : '64px',
        flexShrink: 0,
        background: 'linear-gradient(180deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 95%, var(--accent)) 100%)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width .2s ease',
        overflow: 'hidden',
        zIndex: 20,
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        height: '100vh',
      }}>
        {/* Logo / toggle */}
        <button
          onClick={() => setNavExpanded(p => !p)}
          style={{
            padding: '18px 0', width: '100%',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: navExpanded ? 'flex-start' : 'center',
            paddingLeft: navExpanded ? '20px' : 0,
            borderBottom: '1px solid var(--border)',
            gap: '10px',
          }}
          title="Menüyü genişlet"
        >
          <span style={{ fontSize: '20px', flexShrink: 0 }}>⚡</span>
          {navExpanded && (
            <span style={{ fontFamily: 'var(--display)', fontSize: '11px', letterSpacing: '2px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
              VARDİYA
            </span>
          )}
        </button>

        {/* Nav items */}
        <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const active = activeTab === item.id
            const badge = item.id === 'leave' && pendingLeaveCount > 0 ? pendingLeaveCount : 0
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  width: '100%', padding: '12px 0',
                  paddingLeft: navExpanded ? '16px' : 0,
                  background: active ? 'rgba(240,165,0,.18)' : 'none',
                  border: 'none',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                  boxShadow: active ? 'inset 0 0 0 1px rgba(240,165,0,.3)' : 'none',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: navExpanded ? 'flex-start' : 'center',
                  gap: '10px',
                  transition: 'all .15s',
                  position: 'relative',
                }}
                title={item.label}
              >
                {/* İkon + collapsed badge (küçük nokta) */}
                <span style={{ fontSize: '18px', flexShrink: 0, filter: active ? 'drop-shadow(0 0 6px var(--accent))' : 'none', position: 'relative' }}>
                  {item.icon}
                  {badge > 0 && !navExpanded && (
                    <span style={{
                      position: 'absolute', top: '-2px', right: '-4px',
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: 'var(--red)', border: '1px solid var(--bg)',
                    }} />
                  )}
                </span>
                {navExpanded && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
                    color: active ? 'var(--accent)' : 'var(--text2)',
                    fontWeight: active ? 700 : 400,
                    whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {item.label.toUpperCase()}
                  </span>
                )}
                {/* Genişletilmiş badge (sayı) */}
                {badge > 0 && navExpanded && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                    background: 'var(--red)', color: '#fff',
                    borderRadius: '999px', padding: '1px 5px',
                    marginRight: '8px', flexShrink: 0,
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px' }}>
            {new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' })}
          </div>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Sticky top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          background: 'color-mix(in srgb, var(--bg) 80%, transparent)',
          backdropFilter: 'blur(12px)',
          borderBottom: '2px solid var(--accent)',
          padding: '0 28px',
          display: 'flex', alignItems: 'center', gap: '12px',
          minHeight: '56px',
          boxShadow: '0 1px 0 var(--border), 0 4px 16px rgba(0,0,0,.15)',
        }}>
          <span style={{ fontSize: '22px' }}>{activeNav?.icon}</span>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '3px', color: 'var(--text)' }}>
              {activeNav?.label?.toUpperCase() || 'VARDİYA'}<HelpHint topic="shifts" title="VARDİYA YÖNETİMİ" />
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '1px' }}>
              VARDİYA YÖNETİM SİSTEMİ
            </div>
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {activeTab === 'schedule'    && <ScheduleTab departments={departments} shiftDefs={shiftDefs} onPersonClick={handlePersonClick} />}
          {activeTab === 'staff'       && <StaffTab departments={departments} onPersonClick={handlePersonClick} />}
          {activeTab === 'leave'       && <LeaveTab departments={departments} onPersonClick={handlePersonClick} />}
          {activeTab === 'overtime'    && <OvertimeTab departments={departments} onPersonClick={handlePersonClick} />}
          {activeTab === 'puantaj'     && <PuantajTab departments={departments} onPersonClick={handlePersonClick} />}
          {activeTab === 'departments' && <DepartmentsTab />}
          {activeTab === 'swap'        && <SwapTab />}
          {activeTab === 'settings'    && <SettingsTab departments={departments} shiftDefs={shiftDefs} />}
        </div>
      </div>

      {/* Staff detail side panel */}
      {selectedStaff && (
        <StaffDetailPanel staffId={selectedStaff} onClose={() => setSelectedStaff(null)} />
      )}
    </div>
  )
}
