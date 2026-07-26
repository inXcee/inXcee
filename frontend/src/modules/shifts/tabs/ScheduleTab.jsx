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
  shiftColor, deptColor, ModalOverlay, StaffSearch,
  formatShiftHours, shiftHoursFrom, leaveCellMeta, leaveTypeLabel,
} from '../shared.jsx'
import { buildStaffGrid, computeWeekStats, parseQuickScheduleCode, cellToScheduleCode, cellToClipboardCode, buildScheduleWarnings, planCellPaste } from '../logic/schedule.js'
import { DailyView, WeekFillSheet, CellAssignSheet } from './scheduleSheets.jsx'
import LiveOccupancyBoard from './LiveOccupancyBoard.jsx'
import ScheduleImportModal from './ScheduleImportModal.jsx'
import CoverageBoard from './CoverageBoard.jsx'
import DayDetailBoard from './DayDetailBoard.jsx'
import { PayrollClosingModal, ScheduleTemplateModal } from './ScheduleControlModals.jsx'
import ScheduleShareModal from './ScheduleShareModal.jsx'

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
  const [dragShiftId, setDragShiftId] = useState(null)    // drag'deki shiftDefId
  const [dragOverCell, setDragOverCell] = useState(null)  // 'staffId-date' format
  // Izgara görünüm kontrolleri (departman bantları)
  const [collapsedDepts, setCollapsedDepts] = useState(() => new Set())
  const [gridSearch, setGridSearch] = useState('')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedCells, setSelectedCells] = useState(() => new Set())
  const [selectionAnchor, setSelectionAnchor] = useState(null)
  const [quickCode, setQuickCode] = useState('')
  const [cellClipboard, setCellClipboard] = useState('')
  const [dayDetail, setDayDetail] = useState(null)
  const [templateModal, setTemplateModal] = useState(false)
  const [closingModal, setClosingModal] = useState(false)
  const [shareModal, setShareModal] = useState(false)
  const [recentActions, setRecentActions] = useState([])
  const [activeCell, setActiveCell] = useState(null)
  const [editingCell, setEditingCell] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [dragSelect, setDragSelect] = useState(null)
  const [actionHistory, setActionHistory] = useState([])
  const [statusFilter, setStatusFilter] = useState('all') // all | leave | gaps | absent
  const [coverageMin, setCoverageMin] = useState(1)        // gün başına min kişi eşiği

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekEnd = weekDays[6]
  const DAY_LABELS = ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz']

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['schedule', weekStart],
    queryFn: () => api.get('/shifts/schedule', {
      params: { week: weekStart, week_end: weekEnd }
    }).then(r => r.data),
  })

  const { data: allStaff = [] } = useQuery({
    queryKey: ['staff-list-active'],
    queryFn: () => api.get('/shifts/staff', { params: { is_active: '1' } }).then(r => r.data),
  })

  const { data: workLocations = [] } = useQuery({
    queryKey: ['shift-work-locations'],
    queryFn: () => api.get('/shifts/work-locations').then(r => r.data),
  })

  const { data: staffRoles = [] } = useQuery({
    queryKey: ['shift-roles'],
    queryFn: () => api.get('/shifts/roles').then(r => r.data),
  })

  // Build stable weekly grid: merge schedule data with all staff in dept
  const staffGrid = useMemo(() => buildStaffGrid(rows, allStaff, ''), [rows, allStaff])

  // X5 — onaylı izin ezme gibi yazım uyarılarını toast ile göster (yanıttaki warnings)
  const showAssignWarnings = (res) => {
    const w = res?.data?.warnings || []
    if (w.length) useToastStore.getState().addToast(`⚠ ${w[0].message}${w.length > 1 ? ` (+${w.length - 1} uyarı)` : ''}`, 'error')
  }

  const assignCell = useMutation({
    mutationFn: ({ staffId, deptId, shiftDefId, workLocationId, date, status, leaveType, overrideLeave, overrideReason }) =>
      api.post('/shifts/schedule', {
        entries: [{
          staff_id: staffId,
          dept_id: deptId,
          shift_def_id: shiftDefId || null,
          work_location_id: workLocationId || null,
          work_date: date,
          status: status || 'scheduled',
          leave_type: (status === 'on_leave') ? (leaveType || null) : null,
        }],
        override_leave: overrideLeave === true,
        override_reason: overrideReason || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['shift-breakdown'] })
      qc.invalidateQueries({ queryKey: ['shift-coverage'] })
      setCellPopover(null)
      showAssignWarnings(res)
    },
    onError: (err) => {
      useToastStore.getState().addToast(err?.response?.data?.error || 'Vardiya atanamadı', 'error')
    },
  })

  const deleteShift = useMutation({
    mutationFn: ({ staffId, date }) => api.delete(`/shifts/schedule/${staffId}/${date}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['shift-breakdown'] })
      qc.invalidateQueries({ queryKey: ['shift-coverage'] })
      setCellPopover(null)
    }
  })

  const quickApply = useMutation({
    mutationFn: async ({ action, entries = [], deletions = [] }) => {
      if (action === 'delete') {
        await Promise.all(deletions.map(d => api.delete(`/shifts/schedule/${d.staffId}/${d.date}`)))
        return { count: deletions.length }
      }
      const res = await api.post('/shifts/schedule', { entries })
      return { count: entries.length, warnings: res?.data?.warnings || [] }
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['shift-breakdown'] })
      qc.invalidateQueries({ queryKey: ['shift-coverage'] })
      setQuickCode('')
      showAssignWarnings({ data: { warnings: data?.warnings } })
      const count = vars.action === 'delete' ? vars.deletions.length : vars.entries.length
      if (vars.undo) setActionHistory(prev => [{ ...vars.undo, id: Date.now(), count }, ...prev].slice(0, 8))
      setRecentActions(prev => [
        { id: Date.now(), label: vars.action === 'delete' ? 'Hücre silindi' : 'Hızlı kod uygulandı', count },
        ...prev,
      ].slice(0, 5))
      useToastStore.getState().addToast(`${count} hücre güncellendi`, 'success')
    },
    onError: (err) => {
      useToastStore.getState().addToast(err?.response?.data?.error || 'Hızlı işlem başarısız', 'error')
    },
  })

  const undoQuickApply = useMutation({
    mutationFn: async (undo) => {
      if (undo.deleteCells?.length) {
        await Promise.all(undo.deleteCells.map(d => api.delete(`/shifts/schedule/${d.staffId}/${d.date}`)))
      }
      if (undo.restoreEntries?.length) {
        await api.post('/shifts/schedule', { entries: undo.restoreEntries })
      }
      return undo
    },
    onSuccess: (undo) => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      setActionHistory(prev => prev.filter(a => a.id !== undo.id))
      useToastStore.getState().addToast(`${undo.count || 0} hücre geri alındı`, 'success')
    },
    onError: (err) => {
      useToastStore.getState().addToast(err?.response?.data?.error || 'Geri alma başarısız', 'error')
    },
  })

  const copyWeek = useMutation({
    mutationFn: () => api.post('/shifts/schedule/copy-week', { source_week: weekStart, target_week: addDays(weekStart, 7) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['shift-breakdown'] })
      qc.invalidateQueries({ queryKey: ['shift-coverage'] })
    }
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
            status: i === 6 ? 'off' : 'scheduled',
          })
        })
      })
      return api.post('/shifts/schedule', { entries })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['shift-breakdown'] })
      qc.invalidateQueries({ queryKey: ['shift-coverage'] })
      setAllFillModal(false)
      setAllFillDef('')
    }
  })


  // Fill one person's week (off günü = haftalık izin, 'off' status)
  const fillWeek = useMutation({
    mutationFn: ({ staffId, deptId, shiftDefId, offDayIdx }) => {
      const entries = weekDays.map((d, i) => ({
        staff_id: staffId, dept_id: deptId, work_date: d,
        shift_def_id: i === offDayIdx ? null : shiftDefId,
        status: i === offDayIdx ? 'off' : 'scheduled',
      }))
      return api.post('/shifts/schedule', { entries })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['shift-breakdown'] })
      qc.invalidateQueries({ queryKey: ['shift-coverage'] })
      setWeekFillPopover(null)
    }
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
            status: i === 6 ? 'off' : 'scheduled',
          })
        })
      })
      return api.post('/shifts/schedule', { entries })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['shift-breakdown'] })
      qc.invalidateQueries({ queryKey: ['shift-coverage'] })
      setBulkFillModal(false)
    }
  })

  const exportExcel = async () => {
    const { exportScheduleExcel } = await import('../logic/scheduleExcelExport.js')
    await exportScheduleExcel({
      weekStart,
      weekEnd,
      weekDays,
      staffGrid,
      visibleGrid,
      gridSearch,
      statusFilter,
      deptFilter,
      coverageMin,
      shiftDefs,
      workLocations,
      staffRoles,
    })
  }

  const openCellPopover = (e, person, date) => {
    if (!canEdit) return
    const existing = person.days[date]
    setCellPopover({
      staffId: person.id,
      deptId: person.dept_id,
      date,
      personName: person.full_name,
      deptName: person.dept_name,
      roleName: person.role_name,
      existing,
    })
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
        else if (c.status === 'on_leave' || c.status === 'off') s.perDay[i].leave++
        else if (c.status === 'absent') s.perDay[i].empty++
        else s.perDay[i].work++
      })
    })
    return m
  }, [staffGrid, weekDays])

  const roleStatsByDept = useMemo(() => {
    const byDept = new Map()
    staffGrid.forEach(person => {
      const deptName = person.dept_name || 'Departmansiz'
      const roleName = person.role_name || 'Rolsuz'
      if (!byDept.has(deptName)) byDept.set(deptName, new Map())
      const roleMap = byDept.get(deptName)
      if (!roleMap.has(roleName)) roleMap.set(roleName, { name: roleName, members: 0, work: 0 })
      const item = roleMap.get(roleName)
      item.members += 1
      weekDays.forEach(date => {
        const cell = person.days?.[date]
        if (['scheduled', 'worked', 'overtime'].includes(cell?.status)) item.work += 1
      })
    })
    const result = new Map()
    byDept.forEach((roleMap, deptName) => {
      result.set(deptName, [...roleMap.values()].sort((a, b) => b.members - a.members || a.name.localeCompare(b.name, 'tr')))
    })
    return result
  }, [staffGrid, weekDays])

  // Arama + durum filtresi uygulanmış görünür liste
  const selectedDepartment = useMemo(
    () => departments.find(d => String(d.id) === String(deptFilter)) || null,
    [departments, deptFilter]
  )

  const deptCards = useMemo(() => departments.map(d => {
    const st = deptStats.get(d.name)
    const perDay = st?.perDay || weekDays.map(() => ({ work: 0, leave: 0, empty: 0 }))
    return {
      id: String(d.id),
      name: d.name,
      color: d.color_class,
      members: st?.members ?? allStaff.filter(s => String(s.department_id) === String(d.id)).length,
      work: perDay.reduce((sum, day) => sum + day.work, 0),
      leave: perDay.reduce((sum, day) => sum + day.leave, 0),
      empty: perDay.reduce((sum, day) => sum + day.empty, 0),
      lowDays: perDay.filter(day => day.work < coverageMin).length,
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'tr')), [departments, deptStats, weekDays, coverageMin, allStaff])

  const visibleGrid = useMemo(() => {
    const q = gridSearch.toLocaleLowerCase('tr').trim()
    return staffGrid.filter(p => {
      if (deptFilter && String(p.dept_id) !== String(deptFilter)) return false
      const haystack = [p.full_name, p.dept_name, p.position, p.role_name].filter(Boolean).join(' ').toLocaleLowerCase('tr')
      if (q && !haystack.includes(q)) return false
      if (statusFilter === 'leave' && !weekDays.some(d => p.days[d]?.status === 'on_leave' || p.days[d]?.status === 'off')) return false
      if (statusFilter === 'gaps' && !weekDays.some(d => !p.days[d])) return false
      if (statusFilter === 'absent' && !weekDays.some(d => p.days[d]?.status === 'absent')) return false
      return true
    })
  }, [staffGrid, deptFilter, gridSearch, statusFilter, weekDays])

  const toggleCollapse = (name) => setCollapsedDepts(prev => {
    const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n
  })
  const allDeptNames = useMemo(() => [...new Set(staffGrid.map(p => p.dept_name || 'Departmansız'))], [staffGrid])
  const allCollapsed = allDeptNames.length > 0 && allDeptNames.every(n => collapsedDepts.has(n))

  const cellKey = (staffId, date) => `${staffId}|${date}`
  const selectedCellItems = useMemo(() => {
    const people = new Map(staffGrid.map(p => [String(p.id), p]))
    return [...selectedCells].map(key => {
      const [staffId, date] = key.split('|')
      const person = people.get(staffId)
      if (!person) return null
      return { key, person, date, cell: person.days?.[date] }
    }).filter(Boolean)
  }, [selectedCells, staffGrid])

  const scheduleWarnings = useMemo(
    () => buildScheduleWarnings(staffGrid, weekDays, { coverageMin }),
    [staffGrid, weekDays, coverageMin]
  )
  const warningSummary = useMemo(() => ({
    high: scheduleWarnings.filter(w => w.severity === 'high').length,
    medium: scheduleWarnings.filter(w => w.severity !== 'high').length,
    total: scheduleWarnings.length,
  }), [scheduleWarnings])

  const dayDetailData = useMemo(() => {
    if (!dayDetail) return null
    const rows = staffGrid.map(person => ({ person, cell: person.days?.[dayDetail] }))
    return {
      date: dayDetail,
      working: rows.filter(r => ['scheduled', 'worked', 'overtime'].includes(r.cell?.status)),
      leave: rows.filter(r => r.cell?.status === 'on_leave' || r.cell?.status === 'off'),
      absent: rows.filter(r => r.cell?.status === 'absent'),
      empty: rows.filter(r => !r.cell),
    }
  }, [dayDetail, staffGrid])

  useEffect(() => {
    setSelectedCells(new Set())
    setSelectionAnchor(null)
    setActiveCell(null)
    setEditingCell(null)
    setDragSelect(null)
  }, [weekStart, deptFilter, scheduleView])

  const activeCellKey = activeCell ? cellKey(activeCell.staffId, activeCell.date) : ''
  const editingCellKey = editingCell ? cellKey(editingCell.staffId, editingCell.date) : ''

  const scheduleEntryFromCell = (target) => target.cell ? {
    staff_id: target.person.id,
    dept_id: target.person.dept_id,
    shift_def_id: target.cell.shift_def_id || null,
    work_date: target.date,
    status: target.cell.status || 'scheduled',
    leave_type: target.cell.leave_type || null,
    absent_reason: target.cell.absent_reason || null,
    work_location_id: target.cell.work_location_id || null,
  } : null

  const undoForTargets = (label, targets, mode) => ({
    label,
    restoreEntries: targets.map(scheduleEntryFromCell).filter(Boolean),
    deleteCells: mode === 'assign'
      ? targets.filter(t => !t.cell).map(t => ({ staffId: t.person.id, date: t.date }))
      : [],
  })

  const moveActiveCell = (staffId, date, rowDelta, colDelta) => {
    const rowIdx = visibleGrid.findIndex(p => p.id === staffId)
    const colIdx = weekDays.indexOf(date)
    if (rowIdx < 0 || colIdx < 0) return
    const nextRow = Math.max(0, Math.min(visibleGrid.length - 1, rowIdx + rowDelta))
    const nextCol = Math.max(0, Math.min(weekDays.length - 1, colIdx + colDelta))
    const person = visibleGrid[nextRow]
    if (!person) return
    const next = { staffId: person.id, date: weekDays[nextCol] }
    setActiveCell(next)
    setSelectedCells(new Set([cellKey(next.staffId, next.date)]))
    setSelectionAnchor(next)
  }

  const startInlineEdit = (person, date, initial = null) => {
    const next = { staffId: person.id, date }
    setActiveCell(next)
    setSelectedCells(new Set([cellKey(person.id, date)]))
    setSelectionAnchor(next)
    setEditingCell(next)
    setEditDraft(initial ?? cellToScheduleCode(person.days?.[date], shiftDefs))
  }

  const commitInlineEdit = (person, date, value, nextMove = null) => {
    const target = { person, date, cell: person.days?.[date] }
    const parsed = parseQuickScheduleCode(value, shiftDefs)
    if (parsed.action === 'noop') {
      setEditingCell(null)
      if (nextMove) moveActiveCell(person.id, date, nextMove.row, nextMove.col)
      return
    }
    if (parsed.action === 'invalid') {
      useToastStore.getState().addToast(parsed.message || 'Kod anlaşılmadı', 'error')
      return
    }
    if (parsed.action === 'delete') {
      quickApply.mutate({
        action: 'delete',
        deletions: [{ staffId: person.id, date }],
        undo: undoForTargets('Hücre silme', [target], 'delete'),
      })
    } else {
      quickApply.mutate({
        action: 'assign',
        entries: [{
          staff_id: person.id,
          dept_id: person.dept_id,
          shift_def_id: parsed.shiftDefId,
          work_location_id: target.cell?.work_location_id || null,
          work_date: date,
          status: parsed.status,
          leave_type: parsed.status === 'on_leave' ? (parsed.leaveType || null) : null,
        }],
        undo: undoForTargets('Hücre düzenleme', [target], 'assign'),
      })
    }
    setEditingCell(null)
    if (nextMove) moveActiveCell(person.id, date, nextMove.row, nextMove.col)
  }

  const handleCellKeyDown = (event, person, date) => {
    if (!canEdit || editingCellKey) return
    if (event.key === 'Enter') {
      event.preventDefault()
      startInlineEdit(person, date)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      moveActiveCell(person.id, date, 0, event.shiftKey ? -1 : 1)
      return
    }
    if (event.key === 'ArrowRight') { event.preventDefault(); moveActiveCell(person.id, date, 0, 1); return }
    if (event.key === 'ArrowLeft') { event.preventDefault(); moveActiveCell(person.id, date, 0, -1); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); moveActiveCell(person.id, date, 1, 0); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveActiveCell(person.id, date, -1, 0); return }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      commitInlineEdit(person, date, 'sil')
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      startInlineEdit(person, date, event.key)
    }
  }

  const selectRectTo = (person, date, replace = true) => {
    const anchor = dragSelect?.anchor || selectionAnchor || { staffId: person.id, date }
    const staffIds = visibleGrid.map(p => p.id)
    const aRow = staffIds.indexOf(anchor.staffId)
    const bRow = staffIds.indexOf(person.id)
    const aCol = weekDays.indexOf(anchor.date)
    const bCol = weekDays.indexOf(date)
    if (aRow < 0 || bRow < 0 || aCol < 0 || bCol < 0) return
    const next = replace ? new Set() : new Set(selectedCells)
    const [r1, r2] = [Math.min(aRow, bRow), Math.max(aRow, bRow)]
    const [c1, c2] = [Math.min(aCol, bCol), Math.max(aCol, bCol)]
    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) next.add(cellKey(staffIds[r], weekDays[c]))
    }
    setSelectedCells(next)
  }

  const toggleCellSelection = (person, date, event) => {
    const key = cellKey(person.id, date)
    if (event?.shiftKey && selectionAnchor) {
      const staffIds = visibleGrid.map(p => p.id)
      const aRow = staffIds.indexOf(selectionAnchor.staffId)
      const bRow = staffIds.indexOf(person.id)
      const aCol = weekDays.indexOf(selectionAnchor.date)
      const bCol = weekDays.indexOf(date)
      if (aRow >= 0 && bRow >= 0 && aCol >= 0 && bCol >= 0) {
        const next = new Set(selectedCells)
        const [r1, r2] = [Math.min(aRow, bRow), Math.max(aRow, bRow)]
        const [c1, c2] = [Math.min(aCol, bCol), Math.max(aCol, bCol)]
        for (let r = r1; r <= r2; r += 1) {
          for (let c = c1; c <= c2; c += 1) next.add(cellKey(staffIds[r], weekDays[c]))
        }
        setSelectedCells(next)
        return
      }
    }
    setSelectedCells(prev => {
      const next = new Set(event?.ctrlKey || event?.metaKey || prev.has(key) ? prev : [])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setSelectionAnchor({ staffId: person.id, date })
  }

  const selectedOrToast = () => {
    if (selectedCellItems.length > 0) return selectedCellItems
    useToastStore.getState().addToast('Önce seçim modunda hücre seçin', 'error')
    return []
  }

  const applyQuickCode = (code = quickCode) => {
    const targets = selectedOrToast()
    if (!targets.length) return
    const parsed = parseQuickScheduleCode(code, shiftDefs)
    if (parsed.action === 'noop') return
    if (parsed.action === 'invalid') {
      useToastStore.getState().addToast(parsed.message || 'Kod anlaşılmadı', 'error')
      return
    }
    if (parsed.action === 'delete') {
      quickApply.mutate({
        action: 'delete',
        deletions: targets.map(t => ({ staffId: t.person.id, date: t.date })),
        undo: undoForTargets('Toplu silme', targets, 'delete'),
      })
      return
    }
    quickApply.mutate({
      action: 'assign',
      entries: targets.map(t => ({
        staff_id: t.person.id,
        dept_id: t.person.dept_id,
        shift_def_id: parsed.shiftDefId,
        work_location_id: t.cell?.work_location_id || null,
        work_date: t.date,
        status: parsed.status,
        leave_type: parsed.status === 'on_leave' ? (parsed.leaveType || null) : null,
      })),
      undo: undoForTargets('Toplu kod', targets, 'assign'),
    })
  }

  const buildSelectionText = () => {
    if (!selectedCellItems.length) return ''
    const rowOrder = visibleGrid.map(p => p.id)
    const items = [...selectedCellItems].sort((a, b) => {
      const ar = rowOrder.indexOf(a.person.id)
      const br = rowOrder.indexOf(b.person.id)
      if (ar !== br) return ar - br
      return weekDays.indexOf(a.date) - weekDays.indexOf(b.date)
    })
    const rowsByStaff = new Map()
    items.forEach(item => {
      if (!rowsByStaff.has(item.person.id)) rowsByStaff.set(item.person.id, new Map())
      rowsByStaff.get(item.person.id).set(item.date, cellToClipboardCode(item.cell, shiftDefs))
    })
    return [...rowsByStaff.entries()].map(([, byDate]) => {
      const cols = [...byDate.keys()].sort((a, b) => weekDays.indexOf(a) - weekDays.indexOf(b))
      return cols.map(d => byDate.get(d)).join('\t')
    }).join('\n')
  }

  const copySelectedCells = async () => {
    const text = buildSelectionText()
    if (!text) {
      selectedOrToast()
      return
    }
    setCellClipboard(text)
    try { await navigator.clipboard?.writeText?.(text) } catch { /* local clipboard fallback */ }
    useToastStore.getState().addToast(`${selectedCellItems.length} hücre vardiya ve lokasyonuyla kopyalandı`, 'success')
  }

  const cutSelectedCells = async () => {
    const targets = selectedOrToast()
    if (!targets.length) return
    await copySelectedCells()
    quickApply.mutate({
      action: 'delete',
      deletions: targets.map(t => ({ staffId: t.person.id, date: t.date })),
      undo: undoForTargets('Kes', targets, 'delete'),
    })
  }

  const pasteIntoSelection = async () => {
    const targets = selectedOrToast()
    if (!targets.length) return
    let text = cellClipboard
    try {
      const browserText = await navigator.clipboard?.readText?.()
      if (browserText) text = browserText
    } catch { /* local clipboard fallback */ }
    if (!text) {
      useToastStore.getState().addToast('Yapıştırılacak veri yok', 'error')
      return
    }

    // Tek değer + çok hücre → broadcast (doldur); aksi halde anchor'dan pozisyonel.
    const plan = planCellPaste({
      text,
      targets: targets.map(t => ({ staffId: t.person.id, date: t.date })),
      rowOrderIds: visibleGrid.map(p => p.id),
      weekDays,
      shiftDefs,
      workLocations,
    })
    if (plan.errors?.length) {
      const unique = [...new Set(plan.errors.map(error => error.message || `"${error.value}" anlaşılamadı`))]
      useToastStore.getState().addToast(`${unique[0]}${unique.length > 1 ? ` (+${unique.length - 1} hata)` : ''}`, 'error')
      return
    }
    if (plan.mode === 'none' || (!plan.assignments.length && !plan.deletions.length)) {
      useToastStore.getState().addToast('Yapıştırılan kodlar anlaşılmadı', 'error')
      return
    }

    const personById = new Map(visibleGrid.map(p => [p.id, p]))
    const cellOf = (staffId, date) => personById.get(staffId)?.days?.[date]
    const targetFor = (staffId, date) => ({ person: personById.get(staffId), date, cell: cellOf(staffId, date) })

    if (plan.assignments.length) {
      const entries = plan.assignments.map(a => ({
        staff_id: a.staffId,
        dept_id: personById.get(a.staffId)?.dept_id,
        shift_def_id: a.shiftDefId,
        work_location_id: a.locationSpecified
          ? a.workLocationId
          : (cellOf(a.staffId, a.date)?.work_location_id || null),
        work_date: a.date,
        status: a.status,
        leave_type: a.status === 'on_leave' ? (a.leaveType || null) : null,
      }))
      quickApply.mutate({
        action: 'assign',
        entries,
        undo: undoForTargets(plan.mode === 'broadcast' ? 'Doldur (yapıştır)' : 'Yapıştır', plan.assignments.map(a => targetFor(a.staffId, a.date)), 'assign'),
      })
    }
    if (plan.deletions.length) {
      quickApply.mutate({
        action: 'delete',
        deletions: plan.deletions,
        undo: undoForTargets('Yapıştır silme', plan.deletions.map(d => targetFor(d.staffId, d.date)), 'delete'),
      })
    }
  }

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

  useEffect(() => {
    if (!dragSelect) return
    const stop = () => setDragSelect(null)
    document.addEventListener('mouseup', stop)
    return () => document.removeEventListener('mouseup', stop)
  }, [dragSelect])

  useEffect(() => {
    if (!activeCell || editingCell) return
    const selector = `[data-schedule-cell="${cellKey(activeCell.staffId, activeCell.date)}"]`
    document.querySelector(selector)?.focus?.()
  }, [activeCell, editingCell])

  // Klavye kısayolları: Ctrl/Cmd + C/X/V (kopyala/kes/yapıştır). Input veya hücre-içi
  // düzenleme sırasında devre dışı; seçili hücre yoksa varsayılan davranışa dokunmaz.
  useEffect(() => {
    if (!canEdit || scheduleView !== 'weekly') return
    const handler = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (editingCell) return
      const tag = (e.target?.tagName || '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      if (!selectedCellItems.length) return
      const key = e.key.toLowerCase()
      if (key === 'c') { e.preventDefault(); copySelectedCells() }
      else if (key === 'x') { e.preventDefault(); cutSelectedCells() }
      else if (key === 'v') { e.preventDefault(); pasteIntoSelection() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [canEdit, scheduleView, editingCell, selectedCellItems, copySelectedCells, cutSelectedCells, pasteIntoSelection])

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
          <button
            className={`filter-chip${scheduleView === 'live' ? ' active' : ''}`}
            onClick={() => setScheduleView('live')}
            title="Şu an hangi noktada kim var, hangi lokal boş/eksik"
          >ŞU AN</button>
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
                  { group: 'TOPLU ISLEM' },
                  { label: 'Toplu Vardiya Doldur', action: () => { setBulkFillModal(true); setToolsOpen(false) } },
                  { label: 'Tüm Personeli Doldur', action: () => { setAllFillDef(shiftDefs[0]?.id?.toString() || ''); setAllFillModal(true); setToolsOpen(false) } },
                  { label: 'Haftayı Kopyala', action: async () => { if (await confirmDialog('Bu haftayı sonraki haftaya kopyalayalım mı?')) { copyWeek.mutate(); setToolsOpen(false) } } },
                  { group: 'EXCEL' },
                  { label: 'Excel Import', action: () => { setExcelModal(true); setToolsOpen(false) } },
                  { label: '⬇ Excel İndir (renkli)', action: () => { exportExcel(); setToolsOpen(false) } },
                  { label: '+ Çizelgeye Personel Ekle', action: () => { setAddPersonModal(true); setToolsOpen(false) } },
                  { group: 'PDF / GÖRSEL' },
                  { label: 'PDF / Yazdır (renkli)', action: () => { setShareModal(true); setToolsOpen(false) } },
                  { label: 'PNG Ekran Görseli', action: () => { setShareModal(true); setToolsOpen(false) } },
                  { group: 'SABLON / KONTROL' },
                  { label: 'Sablon Uygula', action: () => { setTemplateModal(true); setToolsOpen(false) } },
                  { label: 'Puantaj Kapanis Kontrolu', action: () => { setClosingModal(true); setToolsOpen(false) } },
                  { label: 'Secim Modunu Ac', action: () => { setSelectionMode(true); setToolsOpen(false) } },
                ].map((item) => item.group ? (
                  <div key={item.group} style={{
                    padding: '8px 16px 5px',
                    background: 'var(--surface2)',
                    borderBottom: '1px solid var(--border)',
                    fontFamily: 'var(--mono)',
                    fontSize: '9px',
                    letterSpacing: '1px',
                    color: 'var(--text3)',
                  }}>{item.group}</div>
                ) : (
                  <button key={item.label} onClick={item.action} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 16px', background: 'none', border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: '13px', color: 'var(--text2)',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >{item.label}</button>
                ))}
              </div>,
              document.body
            )}
          </div>
        )}
      </div>

      {scheduleView === 'weekly' && <CoverageBoard
        from={weekStart}
        to={weekEnd}
        weekDays={weekDays}
        onPersonClick={onPersonClick}
        canEdit={canEdit}
        departments={departments}
        shiftDefs={shiftDefs}
        roles={staffRoles}
        locations={workLocations}
      />}

      {scheduleView === 'weekly' && <DayDetailBoard key={weekDays[0] || 'current-week'} weekDays={weekDays} onPersonClick={onPersonClick} />}

      {scheduleView === 'weekly' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '8px',
          marginBottom: '10px',
        }}>
          <div
            onClick={() => { setDeptFilter(''); setCollapsedDepts(new Set()) }}
            style={{
              padding: '10px',
              borderRadius: '10px',
              border: `1px solid ${deptFilter ? 'var(--border)' : 'rgba(59,140,240,.6)'}`,
              background: deptFilter ? 'var(--surface)' : 'rgba(59,140,240,.12)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1.2px', color: deptFilter ? 'var(--text2)' : 'var(--blue)', fontWeight: 700 }}>TUM BOLUMLER</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{staffGrid.length} kisi</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '8px' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--green)' }}>C {weekStats.working}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--teal)' }}>I {weekStats.onLeave}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: weekStats.empty ? 'var(--red)' : 'var(--text3)' }}>B {weekStats.empty}</span>
            </div>
          </div>
          {deptCards.map(card => {
            const active = deptFilter === card.id
            const dc = deptColor(card.color)
            return (
              <div
                key={card.id}
                onClick={() => { setDeptFilter(active ? '' : card.id); setCollapsedDepts(new Set()) }}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: `1px solid ${active ? dc.text || 'var(--blue)' : 'var(--border)'}`,
                  background: active ? `color-mix(in srgb, ${dc.text || 'var(--blue)'} 14%, var(--surface))` : 'var(--surface)',
                  cursor: 'pointer',
                  boxShadow: active ? '0 0 0 1px rgba(255,255,255,.04) inset' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1.2px', color: active ? dc.text || 'var(--blue)' : 'var(--text)', fontWeight: 700, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', flexShrink: 0 }}>{card.members} kisi</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '8px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--green)' }}>C {card.work}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--teal)' }}>I {card.leave}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: card.empty ? 'var(--red)' : 'var(--text3)' }}>B {card.empty}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: card.lowDays ? 'var(--accent)' : 'var(--green)' }}>{card.lowDays} dusuk</span>
                </div>
                {canEdit && active && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={e => { e.stopPropagation(); setBulkDept(card.id); setBulkFillModal(true) }}
                    style={{ width: '100%', marginTop: '8px' }}
                  >
                    Bu bolumu doldur
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {scheduleView === 'weekly' && selectedDepartment && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '10px',
          padding: '8px 10px',
          borderRadius: '10px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text2)',
          fontSize: '12px',
        }}>
          <strong style={{ color: 'var(--text)' }}>{selectedDepartment.name}</strong>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
            Altta sadece bu bolumun personeli listeleniyor; ust kartlardan bolum degistirebilirsin.
          </span>
        </div>
      )}

      {scheduleView === 'weekly' && canEdit && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '10px',
          marginBottom: '10px',
        }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className={`filter-chip${selectionMode ? ' active' : ''}`} onClick={() => setSelectionMode(v => !v)}>Seçim</button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: selectedCellItems.length ? 'var(--accent)' : 'var(--text3)' }}>
                {selectedCellItems.length} hücre
              </span>
              <input
                value={quickCode}
                onChange={e => setQuickCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyQuickCode() }}
                placeholder="1 2 G · OFF I YIL RAP UCR ACIL · YOK sil"
                title="Vardiya: 1/2/G/A/Ge · İzin: I(genel) YIL(yıllık) RAP(raporlu) UCR(ücretsiz) ACIL DOGUM BABALIK EVLILIK VEFAT ALACAK · OFF(haftalık) YOK(devamsız) sil"
                style={{
                  flex: '1 1 170px',
                  minWidth: '160px',
                  padding: '7px 10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                }}
              />
              <button className="btn btn-primary btn-sm" disabled={quickApply.isPending} onClick={() => applyQuickCode()}>Uygula</button>
              <button className="btn btn-ghost btn-sm" title="Seçili hücreleri vardiya + lokasyon bilgisiyle kopyala (Ctrl+C). Excel'e de yapıştırılabilir." onClick={copySelectedCells}>Kopyala + Lokasyon</button>
              <button className="btn btn-ghost btn-sm" title="Kes: kopyala + sil (Ctrl+X)" disabled={quickApply.isPending} onClick={cutSelectedCells}>Kes</button>
              <button className="btn btn-ghost btn-sm" title={'Yapıştır (Ctrl+V). "1 @ İşçi Lokali" biçimi vardiya ve lokasyonu birlikte taşır; tek hücre çoklu seçime yayılır.'} disabled={quickApply.isPending} onClick={pasteIntoSelection}>Yapıştır</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedCells(new Set()); setSelectionAnchor(null) }}>Temizle</button>
              <button className="btn btn-ghost btn-sm" disabled={!actionHistory.length || undoQuickApply.isPending} onClick={() => actionHistory[0] && undoQuickApply.mutate(actionHistory[0])}>Geri al</button>
              {activeCell && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                  Aktif: {activeCell.date}
                </span>
              )}
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1px', color: 'var(--text)' }}>CANLI KONTROL</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: warningSummary.high ? 'var(--red)' : 'var(--green)' }}>{warningSummary.high} kritik</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)' }}>{warningSummary.medium} uyarı</span>
              {recentActions.length > 0 && (
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                  Son: {recentActions[0].label} ({recentActions[0].count})
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', maxHeight: '82px', overflowY: 'auto' }}>
              {scheduleWarnings.slice(0, 6).map((w, idx) => (
                <button
                  key={`${w.type}-${w.staffId || w.dept || idx}-${w.date || idx}`}
                  onClick={() => w.date && setDayDetail(w.date)}
                  style={{
                    textAlign: 'left',
                    padding: '7px 8px',
                    borderRadius: '8px',
                    border: `1px solid ${w.severity === 'high' ? 'rgba(231,76,60,.35)' : 'rgba(240,165,0,.35)'}`,
                    background: w.severity === 'high' ? 'rgba(231,76,60,.10)' : 'rgba(240,165,0,.10)',
                    color: 'var(--text2)',
                    cursor: w.date ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: w.severity === 'high' ? 'var(--red)' : 'var(--accent)' }}>{w.title}</div>
                  <div style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.message}</div>
                </button>
              ))}
              {scheduleWarnings.length === 0 && (
                <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--green)', padding: '8px' }}>
                  Çizelge kontrolleri temiz
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Shift palette (D&D) — sticky: uzun çizelgede aşağı kaydırınca üstte kalır ── */}
      {scheduleView === 'weekly' && canEdit && !('ontouchstart' in window) && (
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '12px',
          padding: '8px 12px', background: 'var(--surface2)',
          borderRadius: '8px', border: '1px solid var(--border)',
          alignItems: 'center', flexWrap: 'wrap',
          position: 'sticky', top: 0, zIndex: 15,
          boxShadow: '0 6px 16px rgba(0,0,0,.22)',
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
                {s.name} {formatShiftHours(s.start_hour, s.end_hour)}
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

      {/* View: ŞU AN — canlı lokasyon doluluğu */}
      {scheduleView === 'live' && (
        <LiveOccupancyBoard onPersonClick={onPersonClick} />
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
                  const dayStats = weekStats.perDay[i] || { working: [], leave: [], empty: [] }
                  return (
                    <th key={d} onClick={() => setDayDetail(d)} style={{
                      padding: '10px 8px', textAlign: 'center', minWidth: '110px',
                      borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                      background: isToday ? 'rgba(59,140,240,.1)' : sun ? 'rgba(240,165,0,.07)' : undefined,
                      borderBottom: isToday ? '2px solid var(--blue)' : sun ? '2px solid var(--accent)' : '2px solid var(--border)',
                      cursor: 'pointer',
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
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', marginTop: '2px', color: dayStats.empty.length ? 'var(--red)' : 'var(--text3)', fontWeight: 700 }}>
                        Bos {dayStats.empty.length}
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
                  const roleStats = roleStatsByDept.get(g.name) || []
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
                          {roleStats.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '5px' }}>
                              {roleStats.slice(0, 5).map(role => (
                                <span key={role.name} style={{
                                  fontFamily: 'var(--mono)',
                                  fontSize: '8px',
                                  color: dc.text || 'var(--text2)',
                                  background: 'rgba(255,255,255,.04)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '999px',
                                  padding: '1px 6px',
                                }}>
                                  {role.name} {role.members}k/{role.work}g
                                </span>
                              ))}
                            </div>
                          )}
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
                              {pd.empty > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--red)', display: 'block' }}>{pd.empty} bos</span>}
                            </td>
                          )
                        })}
                        {canEdit && <td style={{ borderTop: '2px solid var(--border)', background: bandTint }} />}
                      </tr>

                      {!collapsed && g.people.map((person) => {
                        const r = rowIdx++
                        const avatarColor = person.gender === 'female' ? { bg: 'rgba(244,114,182,.2)', text: '#f472b6' } : { bg: 'rgba(59,140,240,.2)', text: 'var(--blue)' }
                        const personWeek = weekDays.reduce((acc, date) => {
                          const cell = person.days?.[date]
                          if (!cell) acc.empty += 1
                          else if (cell.status === 'on_leave' || cell.status === 'off') acc.leave += 1
                          else if (cell.status === 'absent') acc.absent += 1
                          else acc.work += 1
                          return acc
                        }, { work: 0, leave: 0, absent: 0, empty: 0 })
                        return (
                  <tr key={person.id} style={{ borderTop: '1px solid var(--border)', background: r % 2 === 0 ? 'var(--bg)' : 'var(--surface)', borderLeft: `3px solid ${dc.bg || 'transparent'}` }}>
                    {/* Person cell */}
                    <td
                      onClick={() => onPersonClick?.(person.id)}
                      title="Personel detayini ac"
                      style={{
                      position: 'sticky', left: 0, zIndex: 5,
                      background: r % 2 === 0 ? 'var(--bg)' : 'var(--surface)',
                      borderRight: '2px solid var(--border)',
                      padding: '8px 12px',
                      cursor: 'pointer',
                    }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
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
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '5px' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--blue)', background: 'rgba(59,140,240,.10)', border: '1px solid rgba(59,140,240,.25)', borderRadius: '6px', padding: '1px 5px' }}>{person.role_name || 'Rolsuz'}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--green)', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.25)', borderRadius: '6px', padding: '1px 5px' }}>C {personWeek.work}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--teal)', background: 'rgba(20,184,166,.10)', border: '1px solid rgba(20,184,166,.25)', borderRadius: '6px', padding: '1px 5px' }}>I {personWeek.leave}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: personWeek.empty || personWeek.absent ? 'var(--red)' : 'var(--text3)', background: personWeek.empty || personWeek.absent ? 'rgba(231,76,60,.10)' : 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1px 5px' }}>B {personWeek.empty + personWeek.absent}</span>
                          </div>
                        </div>
                        <span style={{
                          marginLeft: 'auto',
                          flexShrink: 0,
                          fontFamily: 'var(--mono)',
                          fontSize: '8px',
                          color: 'var(--accent)',
                          border: '1px solid rgba(240,165,0,.35)',
                          borderRadius: '999px',
                          padding: '2px 6px',
                          background: 'rgba(240,165,0,.10)',
                        }}>
                          Detay
                        </span>
                      </div>
                    </td>

                    {/* Day cells */}
                    {weekDays.map((d, i) => {
                      const cell = person.days[d]
                      const segments = (cell?.segments || []).filter(segment => segment.status !== 'cancelled')
                      const sc = cell?.shift_color
                        ? shiftColor(cell.shift_color)
                        : segments[0]?.shift_color ? shiftColor(segments[0].shift_color) : null
                      const sun = isSunday(d)
                      const isToday = d === todayStr()
                      const isLeave = cell?.status === 'on_leave'
                      const isOff = cell?.status === 'off'
                      const isAbsent = cell?.status === 'absent'

                      let pillBg = 'transparent', pillColor = 'var(--text3)', pillLabel = null, pillSub = null
                      const key = cellKey(person.id, d)
                      const selected = selectedCells.has(key)
                      const active = activeCellKey === key
                      const editing = editingCellKey === key

                      if (cell) {
                        if (isOff) {
                          pillBg = 'rgba(167,139,250,.15)'; pillColor = 'var(--purple)'; pillLabel = '🌙 OFF'; pillSub = 'haftalık izin'
                        } else if (isLeave) {
                          const lc = leaveCellMeta(cell.leave_type)
                          pillBg = lc.bg; pillColor = lc.text; pillLabel = `${lc.emoji} ${lc.short}`; pillSub = leaveTypeLabel(cell.leave_type)
                        } else if (isAbsent) {
                          pillBg = 'rgba(231,76,60,.12)'; pillColor = 'var(--red)'; pillLabel = '✗ YOK'
                        } else if (segments.length) {
                          const first = segments[0]
                          pillBg = sc?.bg || 'var(--surface2)'; pillColor = sc?.text || 'var(--blue)'
                          pillLabel = `${first.start_time}-${first.end_time}`
                          const locationCount = new Set(segments.map(segment => segment.work_location_name).filter(Boolean)).size
                          pillSub = `${segments.length} parça${locationCount ? ` · ${locationCount} nokta` : ''}`
                        } else if (sc) {
                          pillBg = sc.bg; pillColor = sc.text
                          pillLabel = shiftHoursFrom(cell) || cell.shift_name
                          pillSub = cell.work_location_name || cell.shift_name || null
                        }
                      }

                      return (
                        <td key={d}
                          onMouseDown={e => {
                            if (!selectionMode || e.button !== 0) return
                            e.preventDefault()
                            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                              toggleCellSelection(person, d, e)
                              return
                            }
                            const next = { staffId: person.id, date: d }
                            setActiveCell(next)
                            setSelectionAnchor(next)
                            setSelectedCells(new Set([key]))
                            setDragSelect({ anchor: next })
                          }}
                          onMouseEnter={() => {
                            if (selectionMode && dragSelect) selectRectTo(person, d, true)
                          }}
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
                              assignCell.mutate({
                                staffId: person.id,
                                deptId: person.dept_id,
                                shiftDefId,
                                workLocationId: person.days?.[d]?.work_location_id || null,
                                date: d,
                                status: 'scheduled',
                              })
                            }
                          }}
                          style={{
                            padding: '6px 4px', textAlign: 'center',
                            borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                            background: active
                              ? 'rgba(59,140,240,.14)'
                              : selected
                              ? 'rgba(240,165,0,.18)'
                              : dragOverCell === `${person.id}-${d}`
                              ? 'rgba(240,165,0,.15)'
                              : isToday ? 'rgba(59,140,240,.04)' : sun ? 'rgba(240,165,0,.03)' : 'transparent',
                            transition: 'background .1s',
                            outline: editing ? '2px solid var(--green)' : active ? '2px solid var(--blue)' : selected ? '2px solid rgba(240,165,0,.75)' : dragOverCell === `${person.id}-${d}` ? '2px dashed rgba(240,165,0,.6)' : 'none',
                          }}>
                          <button
                            data-schedule-cell={key}
                            onClick={e => {
                              if (selectionMode) {
                                return
                              }
                              const next = { staffId: person.id, date: d }
                              setActiveCell(next)
                              setSelectedCells(new Set([key]))
                              setSelectionAnchor(next)
                            }}
                            onDoubleClick={e => openCellPopover(e, person, d)}
                            onKeyDown={e => handleCellKeyDown(e, person, d)}
                            disabled={!canEdit}
                            style={{
                              width: '100%', minHeight: pillLabel ? '62px' : '54px', padding: '6px 4px',
                              borderRadius: '8px', border: selected ? '1px solid rgba(240,165,0,.95)' : pillLabel ? 'none' : `1px dashed ${canEdit ? 'var(--border)' : 'transparent'}`,
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
                            {editing ? (
                              <input
                                autoFocus
                                value={editDraft}
                                onChange={e => setEditDraft(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                onKeyDown={e => {
                                  e.stopPropagation()
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    commitInlineEdit(person, d, editDraft, { row: 1, col: 0 })
                                  } else if (e.key === 'Tab') {
                                    e.preventDefault()
                                    commitInlineEdit(person, d, editDraft, { row: 0, col: e.shiftKey ? -1 : 1 })
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault()
                                    setEditingCell(null)
                                  }
                                }}
                                style={{
                                  width: 'calc(100% - 8px)',
                                  maxWidth: '78px',
                                  textAlign: 'center',
                                  padding: '5px 6px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--green)',
                                  background: 'var(--bg)',
                                  color: 'var(--text)',
                                  fontFamily: 'var(--mono)',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  outline: 'none',
                                }}
                              />
                            ) : pillLabel ? (
                              <>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.5px', color: pillColor, fontWeight: 700, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                                  {pillLabel}
                                </span>
                                {pillSub && (
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: pillColor, opacity: .78, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
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
          workLocations={workLocations}
          staffRoles={staffRoles}
          canOverrideLeave={user?.role === 'campus_manager'}
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

      {dayDetailData && (
        <ModalOverlay onClose={() => setDayDetail(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '6px' }}>
            GUN DETAYI
          </h3>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
            {formatDate(dayDetailData.date)} {shortDay(dayDetailData.date)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', marginBottom: '14px' }}>
            {[
              ['Calisan', dayDetailData.working.length, 'var(--green)'],
              ['Izin/OFF', dayDetailData.leave.length, 'var(--teal)'],
              ['Devamsiz', dayDetailData.absent.length, 'var(--red)'],
              ['Bos', dayDetailData.empty.length, 'var(--text3)'],
            ].map(([label, count, color]) => (
              <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color }}>{count}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
            {[
              ['Calisan', dayDetailData.working, 'var(--green)'],
              ['Izin / OFF', dayDetailData.leave, 'var(--teal)'],
              ['Devamsiz', dayDetailData.absent, 'var(--red)'],
              ['Bos', dayDetailData.empty, 'var(--text3)'],
            ].map(([title, rows, color]) => (
              <div key={title} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ padding: '8px 10px', background: 'var(--surface2)', fontFamily: 'var(--mono)', fontSize: '10px', color, fontWeight: 700 }}>
                  {title} · {rows.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {rows.slice(0, 30).map(({ person, cell }) => (
                    <button
                      key={`${title}-${person.id}`}
                      onClick={() => onPersonClick?.(person.id)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '8px 10px',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text2)',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.full_name}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color, textAlign: 'right' }}>
                        {cell ? `${shiftHoursFrom(cell) || cellToScheduleCode(cell, shiftDefs) || cell.shift_name || cell.status}${cell.work_location_name ? ` / ${cell.work_location_name}` : ''}` : '-'}
                      </span>
                    </button>
                  ))}
                  {rows.length === 0 && <div style={{ padding: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '10px' }}>Kayit yok</div>}
                </div>
              </div>
            ))}
          </div>
        </ModalOverlay>
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
                        {formatShiftHours(s.start_hour, s.end_hour)}
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
                      {formatShiftHours(s.start_hour, s.end_hour)}
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
      {excelModal && <ScheduleImportModal onClose={() => setExcelModal(false)} allStaff={allStaff} shiftDefs={shiftDefs} weekDays={weekDays} workLocations={workLocations} />}

      {shareModal && (
        <ScheduleShareModal
          onClose={() => setShareModal(false)}
          weekStart={weekStart}
          weekEnd={weekEnd}
          weekDays={weekDays}
          staffGrid={staffGrid}
          visibleGrid={visibleGrid}
          gridSearch={gridSearch}
          statusFilter={statusFilter}
          deptFilter={deptFilter}
          shiftDefs={shiftDefs}
        />
      )}

      {templateModal && (
        <ScheduleTemplateModal
          onClose={() => setTemplateModal(false)}
          departments={departments}
          shiftDefs={shiftDefs}
          allStaff={allStaff}
          weekStart={weekStart}
          deptFilter={deptFilter}
        />
      )}

      {closingModal && (
        <PayrollClosingModal
          onClose={() => setClosingModal(false)}
          allStaff={allStaff}
          deptFilter={deptFilter}
          coverageMin={coverageMin}
          defaultMonth={weekStart.slice(0, 7)}
        />
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
