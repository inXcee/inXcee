import { useState, useMemo, useEffect, Fragment } from 'react'
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
import { buildStaffGrid, computeWeekStats, parseScheduleSheet } from '../logic/schedule.js'
import { parseCampScheduleGrid } from '../logic/excelImport.js'

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
  const [excelPreview, setExcelPreview] = useState(null) // { matched, unmatched, entries } — basit şablon
  const [excelError, setExcelError] = useState('')
  // Akıllı import (KAMP ÇİZELGE formatı): dosya kendi tarihlerini/departmanlarını taşır
  const [campPayload, setCampPayload] = useState(null)   // parser çıktısı (kanonik)
  const [campReport, setCampReport] = useState(null)     // backend dryRun raporu
  const [campFileName, setCampFileName] = useState('')
  const [campExclude, setCampExclude] = useState([])     // içe aktarılmayacak departman adları
  const [campMappings, setCampMappings] = useState({})   // excelAdı → mevcut staffId (elle eşleştirme)
  const [mapPickName, setMapPickName] = useState('')      // elle eşleştirme: seçili excel adı
  const [dragShiftId, setDragShiftId] = useState(null)    // drag'deki shiftDefId
  const [dragOverCell, setDragOverCell] = useState(null)  // 'staffId-date' format
  // Izgara görünüm kontrolleri (departman bantları)
  const [collapsedDepts, setCollapsedDepts] = useState(() => new Set())
  const [gridSearch, setGridSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | leave | gaps | absent
  const [coverageMin, setCoverageMin] = useState(1)        // gün başına min kişi eşiği

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
  const staffGrid = useMemo(() => buildStaffGrid(rows, allStaff, deptFilter), [rows, allStaff, deptFilter])

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

  // Excel import submit (basit şablon — seçili haftaya yazar)
  const excelImport = useMutation({
    mutationFn: (entries) => api.post('/shifts/schedule', { entries }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setExcelModal(false); setExcelPreview(null) }
  })

  const withOptions = (payload) => ({ ...payload, excludeDepts: campExclude, mappings: campMappings })

  // Akıllı import — önizleme (dryRun): eksik personel/departman/vardiya raporu
  const campDryRun = useMutation({
    mutationFn: (payload) => api.post('/shifts/import?dryRun=1', withOptions(payload)).then(r => r.data),
    onSuccess: (report) => setCampReport(report),
    onError: (err) => setExcelError(err?.response?.data?.error || 'Önizleme alınamadı'),
  })

  // Akıllı import — uygula: eksikleri oluştur + çizelgeye işle
  const campCommit = useMutation({
    mutationFn: (payload) => api.post('/shifts/import', withOptions(payload)).then(r => r.data),
    onSuccess: (report) => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['staff-list-active'] })
      qc.invalidateQueries({ queryKey: ['import-batches'] })
      useToastStore.getState().addToast(
        `İçe aktarıldı: ${report.scheduleEntries} kayıt · ${report.staff.created.length} yeni personel · ${report.depts.created.length} yeni departman`, 'success')
      setExcelModal(false); setCampPayload(null); setCampReport(null); setCampFileName(''); setCampExclude([]); setCampMappings({})
    },
    onError: (err) => useToastStore.getState().addToast(err?.response?.data?.error || 'İçe aktarma başarısız', 'error'),
  })

  // İçe aktarım oturumları (geri-alma)
  const { data: importBatches = [] } = useQuery({
    queryKey: ['import-batches'],
    queryFn: () => api.get('/shifts/import/batches?limit=10').then(r => r.data),
    enabled: excelModal,
  })
  const undoBatch = useMutation({
    mutationFn: (id) => api.post(`/shifts/import/batches/${id}/undo`).then(r => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['staff-list-active'] })
      qc.invalidateQueries({ queryKey: ['import-batches'] })
      useToastStore.getState().addToast(`Geri alındı: ${res.scheduleDeleted} kayıt silindi, ${res.scheduleRestored} geri yüklendi, ${res.staffDeleted} personel silindi`, 'success')
    },
    onError: (err) => useToastStore.getState().addToast(err?.response?.data?.error || 'Geri alınamadı', 'error'),
  })

  // Departman seçimi / eşleştirme değişince önizlemeyi tazele
  const rePreview = () => { if (campPayload) campDryRun.mutate(campPayload) }
  const toggleDept = (name) => {
    setCampExclude(prev => prev.includes(name) ? prev.filter(d => d !== name) : [...prev, name])
  }
  const addMapping = (excelName, staffId) => {
    if (!excelName || !staffId) return
    setCampMappings(prev => ({ ...prev, [excelName]: parseInt(staffId) }))
    setMapPickName('')
  }
  const removeMapping = (excelName) => {
    setCampMappings(prev => { const n = { ...prev }; delete n[excelName]; return n })
  }

  // Excel file parse — önce akıllı (KAMP) formatı dene, olmazsa basit şablona düş.
  const handleExcelFile = async (file) => {
    setExcelError('')
    setExcelPreview(null)
    setCampPayload(null)
    setCampReport(null)
    setCampExclude([])
    setCampMappings({})
    setCampFileName(file.name || '')
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

      // 1) Akıllı format (dosya kendi tarihlerini + departman bantlarını taşır)
      const camp = parseCampScheduleGrid(rows)
      if (!camp.error) {
        setCampPayload(camp)
        campDryRun.mutate(camp)
        return
      }

      // 2) Basit şablon (isim + gün kodları, seçili haftaya yazılır)
      const result = parseScheduleSheet(rows, { allStaff, shiftDefs, weekDays })
      if (result.error) { setExcelError(`Dosya tanınamadı. ${camp.error}`); return }
      setExcelPreview({ matched: result.matched, unmatched: result.unmatched, entries: result.entries })
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
  const weekStats = useMemo(() => computeWeekStats(staffGrid, weekDays), [staffGrid, weekDays])

  // Departman bazlı istatistik (bant özeti + kapsama). Tam grid'den (filtreden bağımsız).
  const deptStats = useMemo(() => {
    const m = new Map()
    staffGrid.forEach(p => {
      const k = p.dept_name || 'Departmansız'
      if (!m.has(k)) m.set(k, { name: k, members: 0, male: 0, female: 0, perDay: weekDays.map(() => ({ work: 0, leave: 0, empty: 0 })) })
      const s = m.get(k); s.members++
      if (p.gender === 'female') s.female++; else if (p.gender === 'male') s.male++
      weekDays.forEach((d, i) => {
        const c = p.days[d]
        if (!c) s.perDay[i].empty++
        else if (c.status === 'on_leave') s.perDay[i].leave++
        else if (c.status === 'absent') s.perDay[i].empty++
        else s.perDay[i].work++
      })
    })
    return m
  }, [staffGrid, weekDays])

  // Arama + durum filtresi uygulanmış görünür liste
  const visibleGrid = useMemo(() => {
    const q = gridSearch.toLocaleLowerCase('tr').trim()
    return staffGrid.filter(p => {
      if (q && !(p.full_name || '').toLocaleLowerCase('tr').includes(q)) return false
      if (statusFilter === 'leave' && !weekDays.some(d => p.days[d]?.status === 'on_leave')) return false
      if (statusFilter === 'gaps' && !weekDays.some(d => !p.days[d])) return false
      if (statusFilter === 'absent' && !weekDays.some(d => p.days[d]?.status === 'absent')) return false
      return true
    })
  }, [staffGrid, gridSearch, statusFilter, weekDays])

  const toggleCollapse = (name) => setCollapsedDepts(prev => {
    const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n
  })
  const allDeptNames = useMemo(() => [...new Set(staffGrid.map(p => p.dept_name || 'Departmansız'))], [staffGrid])
  const allCollapsed = allDeptNames.length > 0 && allDeptNames.every(n => collapsedDepts.has(n))

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
      {/* ── Izgara araç çubuğu: arama / filtre / kapsama / katla ── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
        <input
          value={gridSearch} onChange={e => setGridSearch(e.target.value)}
          placeholder="🔍 Personel ara…"
          style={{ flex: '1 1 180px', minWidth: '140px', padding: '7px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '12px' }}
        />
        <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">Tümü</option>
          <option value="leave">Sadece izinli olanlar</option>
          <option value="gaps">Boş günü olanlar</option>
          <option value="absent">Devamsızlık olanlar</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text2)' }}>
          Min kişi/gün
          <input type="number" min="0" value={coverageMin} onChange={e => setCoverageMin(Math.max(0, +e.target.value || 0))}
            style={{ width: '52px', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '12px' }} />
        </label>
        {allDeptNames.length > 1 && (
          <button className="filter-chip" onClick={() => setCollapsedDepts(allCollapsed ? new Set() : new Set(allDeptNames))}>
            {allCollapsed ? '▾ Tümünü aç' : '▸ Tümünü katla'}
          </button>
        )}
        {(gridSearch || statusFilter !== 'all') && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{visibleGrid.length}/{staffGrid.length}</span>
        )}
      </div>
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
              {(() => {
                const totalCols = canEdit ? 9 : 8
                // Görünür listeyi departman gruplarına ayır (buildStaffGrid sırası korunur).
                const groups = []
                let cur = null
                visibleGrid.forEach(p => {
                  const k = p.dept_name || 'Departmansız'
                  if (!cur || cur.name !== k) { cur = { name: k, color: p.dept_color, people: [] }; groups.push(cur) }
                  cur.people.push(p)
                })
                if (visibleGrid.length === 0) return (
                  <tr><td colSpan={totalCols} style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '12px' }}>Eşleşen personel yok</td></tr>
                )
                let rowIdx = 0
                return groups.map(g => {
                  const st = deptStats.get(g.name)
                  const dc = deptColor(g.color)
                  const collapsed = collapsedDepts.has(g.name)
                  const bandTint = `color-mix(in srgb, ${dc.text || 'var(--text3)'} 12%, var(--surface2))`
                  return (
                    <Fragment key={g.name}>
                      {/* Departman bandı: başlık + cinsiyet + gün-bazlı kapsama (eşik altı kırmızı) */}
                      <tr onClick={() => toggleCollapse(g.name)} style={{ cursor: 'pointer' }}>
                        <td style={{
                          position: 'sticky', left: 0, zIndex: 6, padding: '8px 12px',
                          background: bandTint, borderTop: '2px solid var(--border)',
                          borderLeft: `4px solid ${dc.text || 'var(--border)'}`, borderRight: '2px solid var(--border)',
                        }}>
                          <span style={{ fontSize: '11px', color: dc.text || 'var(--text2)', marginRight: '6px' }}>{collapsed ? '▸' : '▾'}</span>
                          <span style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1.5px', color: dc.text || 'var(--text)', fontWeight: 700, textTransform: 'uppercase' }}>{g.name}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginLeft: '8px' }}>
                            {st?.members ?? g.people.length} kişi{st && (st.male || st.female) ? ` · ♂${st.male} ♀${st.female}` : ''}
                          </span>
                        </td>
                        {weekDays.map((d, i) => {
                          const pd = st?.perDay[i] || { work: 0, leave: 0, empty: 0 }
                          const low = pd.work < coverageMin
                          return (
                            <td key={d} style={{
                              textAlign: 'center', padding: '4px',
                              borderRight: i < 6 ? '1px solid var(--border)' : 'none', borderTop: '2px solid var(--border)',
                              background: low ? 'rgba(231,76,60,.16)' : bandTint,
                            }}>
                              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: low ? 'var(--red)' : 'var(--text)' }}>{pd.work}{low ? ' ⚠' : ''}</span>
                              {pd.leave > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--teal)', display: 'block' }}>{pd.leave}i</span>}
                            </td>
                          )
                        })}
                        {canEdit && <td style={{ borderTop: '2px solid var(--border)', background: bandTint }} />}
                      </tr>

                      {!collapsed && g.people.map((person) => {
                        const r = rowIdx++
                        const avatarColor = person.gender === 'female' ? { bg: 'rgba(244,114,182,.2)', text: '#f472b6' } : { bg: 'rgba(59,140,240,.2)', text: 'var(--blue)' }
                        return (
                  <tr key={person.id} style={{ borderTop: '1px solid var(--border)', background: r % 2 === 0 ? 'var(--bg)' : 'var(--surface)', borderLeft: `3px solid ${dc.bg || 'transparent'}` }}>
                    {/* Person cell */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 5,
                      background: r % 2 === 0 ? 'var(--bg)' : 'var(--surface)',
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
                          {person.position && (
                            <span style={{
                              fontSize: '9px', fontFamily: 'var(--mono)', letterSpacing: '.5px',
                              marginTop: '2px', display: 'block', color: 'var(--text3)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px',
                            }}>{person.position}</span>
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
                    </Fragment>
                  )
                })
              })()}
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
        <ModalOverlay onClose={() => { setExcelModal(false); setExcelPreview(null); setExcelError(''); setCampPayload(null); setCampReport(null); setCampFileName(''); setCampExclude([]); setCampMappings({}) }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            EXCEL AKTAR
          </h3>
          {campReport ? (
            // ── Akıllı import önizlemesi (KAMP ÇİZELGE formatı) ──
            (() => {
              const cr = campReport
              const wk = cr.weekDates?.length ? `${cr.weekDates[0]} → ${cr.weekDates[cr.weekDates.length - 1]}` : ''
              // Tam departman listesi (orijinal dosyadan) — dışlanınca bile seçenekte kalsın
              const allDeptStats = (() => {
                const m = new Map()
                for (const r of campPayload?.rows || []) {
                  const k = r.deptName || '— (departmansız)'
                  if (!m.has(k)) m.set(k, { name: k, staffCount: 0, cellCount: 0 })
                  const a = m.get(k); a.staffCount++; a.cellCount += r.cells?.length || 0
                }
                return [...m.values()]
              })()
              const Card = ({ n, label, color, bg }) => (
                <div style={{ flex: 1, minWidth: '90px', padding: '10px', background: bg, border: `1px solid ${color}33`, borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color }}>{n}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{label}</div>
                </div>
              )
              return (
                <>
                  <p style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--text)' }}>{campFileName}</strong> {wk && `· ${wk}`}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
                    Eksik personel, departman ve vardiya tanımları otomatik oluşturulacak, çizelge dosyadaki tarihlere işlenecek.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <Card n={cr.scheduleEntries} label="Çizelge kaydı" color="#6366f1" bg="rgba(99,102,241,.1)" />
                    <Card n={cr.staff.created.length} label="Yeni personel" color="#10b981" bg="rgba(16,185,129,.1)" />
                    <Card n={cr.staff.matched} label="Eşleşen personel" color="var(--text2)" bg="var(--surface2)" />
                    <Card n={cr.depts.created.length} label="Yeni departman" color="#f59e0b" bg="rgba(245,158,11,.1)" />
                    <Card n={cr.shiftDefs.created.length} label="Yeni vardiya" color="#06b6d4" bg="rgba(6,182,212,.1)" />
                    {cr.unrecognized.length > 0 && <Card n={cr.unrecognized.length} label="Anlaşılmayan" color="#ef4444" bg="rgba(239,68,68,.1)" />}
                  </div>

                  {/* Yeni vs üzerine-yazılacak kayıt dağılımı */}
                  {(cr.scheduleUpdated > 0 || cr.scheduleNew > 0) && (
                    <div style={{ marginBottom: '8px', fontSize: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#10b981' }}>● {cr.scheduleNew} yeni kayıt</span>
                      {cr.scheduleUpdated > 0 && (
                        <span style={{ color: '#f59e0b' }}>⚠ {cr.scheduleUpdated} mevcut kayıt güncellenecek (üzerine yazılır)</span>
                      )}
                    </div>
                  )}

                  {/* İzin entegrasyonu özeti */}
                  {cr.leaves?.created > 0 && (
                    <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--text2)' }}>
                      📋 <span style={{ color: '#a78bfa' }}>{cr.leaves.created} izin talebi</span> oluşturulacak (onaylı):
                      {cr.leaves.annualDays > 0 && ` ${cr.leaves.annualDays} gün yıllık (bakiyeden düşülür)`}
                      {cr.leaves.annualDays > 0 && cr.leaves.sickDays > 0 && ' ·'}
                      {cr.leaves.sickDays > 0 && ` ${cr.leaves.sickDays} gün rapor`}
                    </div>
                  )}

                  {/* Yazım/aksan farkıyla eşleşenler — kullanıcı doğrulasın */}
                  {cr.staff.fuzzyMatched?.length > 0 && (
                    <div style={{ marginBottom: '10px', padding: '8px 12px', background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.25)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600, marginBottom: '4px' }}>
                        Yazım/aksan farkıyla eşleşen ({cr.staff.fuzzyMatched.length}) — doğru kişiyse sorun yok:
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                        {cr.staff.fuzzyMatched.slice(0, 10).map(f => `${f.excelName} → ${f.matchedTo}`).join(' · ')}
                        {cr.staff.fuzzyMatched.length > 10 && ` … +${cr.staff.fuzzyMatched.length - 10}`}
                      </div>
                    </div>
                  )}

                  {/* Anomali / iş-kanunu uyarıları */}
                  {cr.anomalies?.warnings?.length > 0 && (() => {
                    const KIND_LABEL = {
                      no_weekly_off: 'Haftalık tatil yok', consecutive_work: '6+ ardışık çalışma',
                      consecutive_night: 'Ardışık gece', on_approved_leave: 'İzinliyken vardiya',
                      duplicate: 'Çift kayıt',
                    }
                    return (
                      <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', borderRadius: '6px' }}>
                        <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, marginBottom: '6px' }}>
                          ⚠ {cr.anomalies.warnings.length} uyarı (içe aktarmayı engellemez):
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          {Object.entries(cr.anomalies.counts || {}).map(([k, n]) => (
                            <span key={k} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>
                              {KIND_LABEL[k] || k}: {n}
                            </span>
                          ))}
                        </div>
                        <div style={{ maxHeight: '90px', overflowY: 'auto', fontSize: '10px', color: 'var(--text2)', lineHeight: 1.6 }}>
                          {cr.anomalies.warnings.slice(0, 25).map((w, i) => <div key={i}>• {w.message}</div>)}
                          {cr.anomalies.warnings.length > 25 && <div style={{ color: 'var(--text3)' }}>… +{cr.anomalies.warnings.length - 25} daha</div>}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Departman seçimi (işaretsiz = içe aktarılmaz) */}
                  {allDeptStats.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>Departman seçimi (işareti kaldırılan içe aktarılmaz):</div>
                      <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                          <tbody>
                            {allDeptStats.map(d => {
                              const excluded = campExclude.includes(d.name)
                              return (
                                <tr key={d.name} style={{ borderTop: '1px solid var(--border)', opacity: excluded ? 0.4 : 1 }}>
                                  <td style={{ padding: '5px 10px', width: '28px' }}>
                                    <input type="checkbox" checked={!excluded} onChange={() => toggleDept(d.name)} />
                                  </td>
                                  <td style={{ padding: '5px 10px', color: 'var(--text)', textDecoration: excluded ? 'line-through' : 'none' }}>{d.name}</td>
                                  <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text2)' }}>{d.staffCount} kişi</td>
                                  <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text2)' }}>{d.cellCount} kayıt</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Elle eşleştirme — bir excel adını mevcut personele bağla */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>
                      Elle eşleştirme {Object.keys(campMappings).length > 0 && `(${Object.keys(campMappings).length})`}: bir excel adını mevcut personele bağla (yeni oluşturulmaz)
                    </div>
                    {Object.entries(campMappings).map(([name, sid]) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '3px' }}>
                        <span style={{ color: '#818cf8' }}>{name} → #{sid}</span>
                        <button className="btn btn-ghost" style={{ fontSize: '10px', padding: '1px 6px' }} onClick={() => removeMapping(name)}>kaldır</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                      <select value={mapPickName} onChange={e => setMapPickName(e.target.value)}
                        style={{ flex: 1, padding: '5px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '11px' }}>
                        <option value="">Excel adı seç (oluşturulacaklardan)…</option>
                        {cr.staff.created.filter(s => !campMappings[s.name]).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                      <div style={{ flex: 1 }}>
                        <StaffSearch value="" onChange={sid => addMapping(mapPickName, sid)} placeholder={mapPickName ? 'Mevcut personel ara…' : 'Önce excel adı seç'} />
                      </div>
                    </div>
                  </div>

                  {/* Seçim/eşleştirme değişikliklerini uygula */}
                  {(campExclude.length > 0 || Object.keys(campMappings).length > 0) && (
                    <button className="btn btn-ghost" style={{ width: '100%', marginBottom: '12px', fontSize: '12px' }}
                      disabled={campDryRun.isPending}
                      onClick={rePreview}>
                      {campDryRun.isPending ? 'Güncelleniyor…' : '↻ Önizlemeyi güncelle (seçim/eşleştirmeyi uygula)'}
                    </button>
                  )}

                  {cr.depts.created.length > 0 && (
                    <div style={{ marginBottom: '10px', fontSize: '11px' }}>
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>Yeni departmanlar: </span>
                      <span style={{ color: 'var(--text2)' }}>{cr.depts.created.join(', ')}</span>
                    </div>
                  )}
                  {cr.shiftDefs.created.length > 0 && (
                    <div style={{ marginBottom: '10px', fontSize: '11px' }}>
                      <span style={{ color: '#06b6d4', fontWeight: 600 }}>Yeni vardiyalar: </span>
                      <span style={{ color: 'var(--text2)' }}>{cr.shiftDefs.created.map(s => s.name).join(', ')}</span>
                    </div>
                  )}
                  {cr.staff.created.length > 0 && (
                    <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '6px', padding: '8px 12px', background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.2)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>Oluşturulacak personel ({cr.staff.created.length}):</div>
                      <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{cr.staff.created.map(s => s.name).join(', ')}</div>
                    </div>
                  )}
                  {cr.staff.created.length > 0 && (cr.staff.genderGuessed > 0 || cr.staff.genderUnknown?.length > 0) && (
                    <div style={{ marginBottom: '10px', fontSize: '11px', color: 'var(--text2)' }}>
                      Cinsiyet: <span style={{ color: '#10b981' }}>{cr.staff.genderGuessed} otomatik tahmin</span>
                      {cr.staff.genderUnknown?.length > 0 && (
                        <> · <span style={{ color: '#f59e0b' }}>{cr.staff.genderUnknown.length} belirsiz</span> (personel kartından elle ayarlanır)</>
                      )}
                    </div>
                  )}
                  {cr.unrecognized.length > 0 && (
                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>Anlaşılmayan hücreler (atlanacak):</div>
                      <div style={{ fontSize: '10px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                        {cr.unrecognized.slice(0, 12).map(u => `${u.name} ${u.date}: "${u.raw}"`).join(' · ')}
                        {cr.unrecognized.length > 12 && ` … +${cr.unrecognized.length - 12}`}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" style={{ flex: 1 }}
                      disabled={campCommit.isPending}
                      onClick={() => campCommit.mutate(campPayload)}>
                      {campCommit.isPending ? 'Aktarılıyor…' : `İçe Aktar (${cr.scheduleEntries} kayıt)`}
                    </button>
                    <button className="btn btn-ghost" disabled={campCommit.isPending}
                      onClick={() => { setCampReport(null); setCampPayload(null); setCampFileName('') }}>Geri</button>
                  </div>
                </>
              )
            })()
          ) : campDryRun.isPending ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text2)', fontSize: '13px' }}>Dosya analiz ediliyor…</div>
          ) : !excelPreview ? (
            <>
              <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
                Excel dosyasını seçin. <strong style={{ color: 'var(--text)' }}>KAMP ALANI ÇİZELGE</strong> dosyaları otomatik tanınır
                (departman, isim, tarih ve vardiya saatleri kendiliğinden alınır). Basit şablonlarda ilk sütun isim,
                sonraki sütunlar günler; <strong>1/G</strong>=1.Vardiya, <strong>2/A</strong>=2.Vardiya, <strong>3/Ge</strong>=3.Vardiya, <strong>İ/izin</strong>=İzin.
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

              {/* Son içe aktarmalar — geri alma */}
              {importBatches.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>SON İÇE AKTARMALAR</div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    {importBatches.map(b => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {b.label} {b.undone_at && <span style={{ color: 'var(--text3)' }}>(geri alındı)</span>}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                            {b.created_at?.slice(0, 16).replace('T', ' ')} · {b.summary?.scheduleEntries ?? 0} kayıt · {b.summary?.staffCreated ?? 0} personel
                          </div>
                        </div>
                        {!b.undone_at && (
                          <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 10px', flexShrink: 0 }}
                            disabled={undoBatch.isPending}
                            onClick={async () => {
                              if (await confirmDialog({ title: 'Geri Al', body: `"${b.label}" içe aktarımı geri alınsın mı? Oluşturulan personel/departman silinir, üzerine yazılan kayıtlar eski haline döner.`, confirmLabel: 'Geri Al', danger: true })) {
                                undoBatch.mutate(b.id)
                              }
                            }}>↩ Geri Al</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
