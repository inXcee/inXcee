import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { paginate } from '../../shared/paginate.js'
import {
  departmentsService, shiftDefinitionsService, scheduleService, bulkAssignService,
  staffStatusService, createLeaveService, approveLeaveService, leaveListService,
  leaveBalanceService, createOvertimeService, updateOvertimeService, deleteOvertimeService, overtimeListService, overtimeSummaryService, puantajService,
  checkInService, checkOutService, attendanceListService, statisticsService, departmentSummaryService,
  createDepartmentService, updateDepartmentService, deleteDepartmentService, assignDeptService,
  createShiftDefService, updateShiftDefService, deleteShiftDefService,
  cancelLeaveService, createSwapService, swapListService, approveSwapService, rejectSwapService,
  copyWeekService, rotationService, searchStaffService, deleteScheduleService,
  staffDetailService,
  staffListService, staffGetService, staffCreateService, staffUpdateService, staffDeleteService,
  puantajCsvService, staffDayBreakdownService
} from './service.js'
import {
  checkConflicts, listHolidays, createHoliday, updateHoliday, deleteHoliday,
  getPayrollExport, getCombinedAbsences,
  listDeductions, createDeduction, deleteDeduction, getPayrollDetailed,
} from './queries.js'
import { logAudit } from '../../shared/audit.js'

export const shiftsRouter = Router()

const managerOrSupervisor = requireRole('campus_manager', 'shift_supervisor')
const allStaff = [requireAuth]

// ── Staff CRUD — Personel bilgileri (maaş, TC, adres) sadece yönetim rollerine ──
shiftsRouter.get('/staff', ...managerOrSupervisor, (req, res) => {
  if (req.query.page || req.query.limit) {
    const { page, limit, offset } = paginate(req)
    const db = getDB()
    const total = db.prepare('SELECT COUNT(*) as c FROM staff').get().c
    const data = staffListService({ ...req.query, _limit: limit, _offset: offset })
    return res.json({ data, total, page, limit })
  }
  res.json(staffListService(req.query))
})

shiftsRouter.get('/staff/search', ...managerOrSupervisor, (req, res) => {
  res.json(searchStaffService(req.query.q))
})

shiftsRouter.get('/staff/:id', ...managerOrSupervisor, (req, res) => {
  try {
    res.json(staffGetService(req.params.id))
  } catch (e) {
    res.status(404).json({ error: e.message })
  }
})

shiftsRouter.get('/staff/:id/detail', ...allStaff, (req, res) => {
  try {
    res.json(staffDetailService(req.params.id))
  } catch (e) {
    res.status(404).json({ error: e.message })
  }
})

shiftsRouter.post('/staff', ...managerOrSupervisor, (req, res) => {
  try {
    const id = staffCreateService(req.body)
    res.status(201).json({ id })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

shiftsRouter.put('/staff/:id', ...managerOrSupervisor, (req, res) => {
  try {
    staffUpdateService(req.params.id, req.body)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

shiftsRouter.delete('/staff/:id', ...managerOrSupervisor, (req, res) => {
  try {
    staffDeleteService(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ── Departments & definitions ──
shiftsRouter.get('/departments', ...allStaff, (req, res) => {
  res.json(departmentsService())
})

shiftsRouter.get('/departments/summary', ...allStaff, (req, res) => {
  res.json(departmentSummaryService())
})

shiftsRouter.get('/definitions', ...allStaff, (req, res) => {
  res.json(shiftDefinitionsService())
})

// ── Schedule ──
shiftsRouter.get('/schedule', ...allStaff, (req, res) => {
  const { week, week_end, dept_id } = req.query
  if (!week) return res.status(400).json({ error: 'week parametresi gerekli (YYYY-MM-DD)' })
  const weekStart = week
  const weekEnd = week_end || (() => {
    const d = new Date(week)
    d.setDate(d.getDate() + 6)
    return d.toISOString().split('T')[0]
  })()
  res.json(scheduleService(weekStart, weekEnd, dept_id || null))
})

shiftsRouter.post('/schedule', ...managerOrSupervisor, (req, res) => {
  try {
    bulkAssignService(req.body.entries, req.user.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ── H4 V1: Çakışma kontrol ──
shiftsRouter.post('/schedule/check-conflicts', ...managerOrSupervisor, (req, res) => {
  try {
    const conflicts = checkConflicts(req.body?.entries || [])
    res.json({ conflicts, has_conflicts: conflicts.length > 0 })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── H4 V3: Resmi tatil tablosu ──
shiftsRouter.get('/holidays', ...allStaff, (req, res) => {
  try { res.json(listHolidays({ year: req.query.year })) }
  catch (e) { console.error('[holidays/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

shiftsRouter.post('/holidays', ...managerOrSupervisor, (req, res) => {
  try {
    if (!req.body?.date || !req.body?.name) return res.status(400).json({ error: 'date ve name gerekli' })
    const id = createHoliday(req.body)
    logAudit(req.user.id, 'holiday_create', 'shifts', id, `${req.body.date} ${req.body.name}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.put('/holidays/:id', ...managerOrSupervisor, (req, res) => {
  try { updateHoliday(+req.params.id, req.body); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/holidays/:id', ...managerOrSupervisor, (req, res) => {
  try { deleteHoliday(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── H4 V7: Bordro export ──
shiftsRouter.get('/payroll-export', ...managerOrSupervisor, (req, res) => {
  try {
    const ym = req.query.month || new Date().toISOString().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ error: 'month YYYY-MM formatında olmalı' })
    res.json({ month: ym, rows: getPayrollExport(ym) })
  } catch (e) { console.error('[payroll]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── H8 B3: Kesinti CRUD ──
shiftsRouter.get('/deductions', ...managerOrSupervisor, (req, res) => {
  try {
    res.json(listDeductions({
      period: req.query.period,
      staffId: req.query.staff_id ? +req.query.staff_id : null,
    }))
  } catch (e) { console.error('[deductions/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

shiftsRouter.post('/deductions', ...managerOrSupervisor, (req, res) => {
  try {
    const { staff_id, period, kind, amount } = req.body || {}
    if (!staff_id || !period || !kind || amount == null) {
      return res.status(400).json({ error: 'staff_id, period, kind, amount gerekli' })
    }
    if (!['damage', 'discipline', 'late', 'advance', 'tax', 'other'].includes(kind)) {
      return res.status(400).json({ error: 'Geçersiz kind' })
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ error: 'period YYYY-MM formatında olmalı' })
    }
    const id = createDeduction(req.body, req.user.id)
    logAudit(req.user.id, 'deduction_create', 'payroll', id, `${kind} ${amount}₺ ${period}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/deductions/:id', ...managerOrSupervisor, (req, res) => {
  try { deleteDeduction(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── H8 — Detaylı bordro (B1 vardiya→gün, B2 mesai+çarpan, B3 kesinti, B5 SGK gün) ──
shiftsRouter.get('/payroll-detailed', ...managerOrSupervisor, (req, res) => {
  try {
    const ym = req.query.month || new Date().toISOString().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ error: 'month YYYY-MM formatında olmalı' })
    res.json({ month: ym, rows: getPayrollDetailed(ym) })
  } catch (e) { console.error('[payroll-detailed]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── H4 V8: Birleşik devamsızlık ──
shiftsRouter.get('/combined-absences', ...managerOrSupervisor, (req, res) => {
  try {
    res.json(getCombinedAbsences({
      startDate: req.query.start,
      endDate: req.query.end,
    }))
  } catch (e) { console.error('[combined-absences]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Personnel status (now staff) ──
shiftsRouter.get('/personnel', ...allStaff, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  res.json(staffStatusService(date, req.query.dept_id || null))
})

// ── Leave requests ──
shiftsRouter.get('/leave/balance/:staffId', ...allStaff, (req, res) => {
  res.json(leaveBalanceService(req.params.staffId))
})

shiftsRouter.get('/leave', ...allStaff, (req, res) => {
  res.json(leaveListService(req.query))
})

shiftsRouter.post('/leave', ...allStaff, (req, res) => {
  try {
    const id = createLeaveService(req.body)
    res.status(201).json({ id })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

shiftsRouter.patch('/leave/:id', ...managerOrSupervisor, (req, res) => {
  try {
    approveLeaveService(req.params.id, req.user.id, req.body.status)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ── Overtime ──
shiftsRouter.get('/overtime/summary', ...allStaff, (req, res) => {
  const month = req.query.month || new Date().toISOString().substring(0, 7)
  res.json(overtimeSummaryService(month))
})

shiftsRouter.get('/overtime', ...allStaff, (req, res) => {
  res.json(overtimeListService(req.query))
})

shiftsRouter.post('/overtime', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createOvertimeService(req.body, req.user.id)
    res.status(201).json({ id })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

shiftsRouter.put('/overtime/:id', ...managerOrSupervisor, (req, res) => {
  try {
    updateOvertimeService(req.params.id, req.body)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/overtime/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteOvertimeService(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Attendance ──
shiftsRouter.get('/attendance', ...allStaff, (req, res) => {
  res.json(attendanceListService(req.query))
})

shiftsRouter.post('/attendance/checkin', ...allStaff, (req, res) => {
  try {
    const id = checkInService(req.body)
    res.status(201).json({ id })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

shiftsRouter.post('/attendance/checkout', ...allStaff, (req, res) => {
  try {
    checkOutService(req.body.log_id)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ── Puantaj (Timesheet) ──
shiftsRouter.get('/puantaj', ...allStaff, (req, res) => {
  try {
    const { month, dept_id } = req.query
    if (!month) return res.status(400).json({ error: 'month parametresi YYYY-MM formatında gereklidir' })
    res.json(puantajService(month, dept_id || null))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

// ── Puantaj CSV Export (must be before /:staffId routes) ──
shiftsRouter.get('/puantaj/export/csv', ...allStaff, (req, res) => {
  try {
    const { month, dept_id } = req.query
    if (!month) return res.status(400).json({ error: 'month parametresi YYYY-MM formatında gereklidir' })
    const csv = puantajCsvService(month, dept_id || null)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="puantaj-${month}.csv"`)
    res.send(csv)
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

// ── Puantaj day breakdown (after CSV route to avoid staffId='export') ──
shiftsRouter.get('/puantaj/:staffId/days', ...allStaff, (req, res) => {
  try {
    res.json(staffDayBreakdownService(req.params.staffId, req.query.month))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

// ── Statistics ──
shiftsRouter.get('/statistics', ...allStaff, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  res.json(statisticsService(date))
})

// ── Department CRUD ──
shiftsRouter.post('/departments', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createDepartmentService(req.body)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.put('/departments/:id', ...managerOrSupervisor, (req, res) => {
  try {
    updateDepartmentService(req.params.id, req.body)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/departments/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteDepartmentService(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.post('/departments/assign', ...managerOrSupervisor, (req, res) => {
  try {
    assignDeptService(req.body.staff_id, req.body.dept_id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Shift definition CRUD ──
shiftsRouter.post('/definitions', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createShiftDefService(req.body)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.put('/definitions/:id', ...managerOrSupervisor, (req, res) => {
  try {
    updateShiftDefService(req.params.id, req.body)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/definitions/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteShiftDefService(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Leave cancel ──
shiftsRouter.delete('/leave/:id', ...managerOrSupervisor, (req, res) => {
  try {
    cancelLeaveService(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Swap requests ──
shiftsRouter.get('/swaps', ...allStaff, (req, res) => {
  res.json(swapListService(req.query))
})

shiftsRouter.post('/swaps', ...allStaff, (req, res) => {
  try {
    const id = createSwapService(req.body)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.patch('/swaps/:id/approve', ...managerOrSupervisor, (req, res) => {
  try {
    approveSwapService(req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.patch('/swaps/:id/reject', ...managerOrSupervisor, (req, res) => {
  try {
    rejectSwapService(req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Copy week ──
shiftsRouter.post('/schedule/copy-week', ...managerOrSupervisor, (req, res) => {
  try {
    const count = copyWeekService(req.body.source_week, req.body.target_week, req.user.id)
    res.json({ ok: true, copied: count })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Rotation template ──
shiftsRouter.post('/schedule/rotation', ...managerOrSupervisor, (req, res) => {
  try {
    const count = rotationService(req.body, req.user.id)
    res.json({ ok: true, assigned: count })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Delete schedule entry ──
shiftsRouter.delete('/schedule/:staffId/:date', ...managerOrSupervisor, (req, res) => {
  try {
    deleteScheduleService(req.params.staffId, req.params.date)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
