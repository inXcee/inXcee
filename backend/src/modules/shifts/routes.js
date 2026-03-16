import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import {
  departmentsService, shiftDefinitionsService, scheduleService, bulkAssignService,
  personnelStatusService, createLeaveService, approveLeaveService, leaveListService,
  leaveBalanceService, createOvertimeService, overtimeListService, overtimeSummaryService,
  checkInService, checkOutService, attendanceListService, statisticsService, departmentSummaryService
} from './service.js'

export const shiftsRouter = Router()

const managerOrSupervisor = requireRole('campus_manager', 'shift_supervisor')
const allStaff = [requireAuth]

// Departments & definitions
shiftsRouter.get('/departments', ...allStaff, (req, res) => {
  res.json(departmentsService())
})

shiftsRouter.get('/departments/summary', ...allStaff, (req, res) => {
  res.json(departmentSummaryService())
})

shiftsRouter.get('/definitions', ...allStaff, (req, res) => {
  res.json(shiftDefinitionsService())
})

// Schedule
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

// Personnel status
shiftsRouter.get('/personnel', ...allStaff, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  res.json(personnelStatusService(date, req.query.dept_id || null))
})

// Leave requests
shiftsRouter.get('/leave/balance/:personnelId', ...allStaff, (req, res) => {
  res.json(leaveBalanceService(req.params.personnelId))
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

// Overtime
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

// Attendance
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

// Statistics
shiftsRouter.get('/statistics', ...allStaff, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  res.json(statisticsService(date))
})
