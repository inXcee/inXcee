import {
  getDepartments, getShiftDefinitions, getSchedule, bulkAssignShifts,
  getStaffWithShiftStatus, createLeaveRequest, approveLeaveRequest,
  getLeaveRequests, getLeaveBalance, createOvertime, updateOvertime, deleteOvertime, getOvertimeRecords,
  getOvertimeSummary, createAttendanceLog, updateCheckout, getAttendanceLogs, getPuantaj,
  getShiftStatistics, getDepartmentSummary,
  createDepartment, updateDepartment, deleteDepartment, assignStaffDepartment,
  createShiftDefinition, updateShiftDefinition, deleteShiftDefinition,
  cancelLeaveRequest, createSwapRequest, getSwapRequests, approveSwapRequest, rejectSwapRequest,
  copyWeekSchedule, applyRotationTemplate, searchStaff, deleteScheduleEntry,
  getStaffDetail,
  getStaffList, getStaffById, createStaff, updateStaff, deleteStaff
} from './queries.js'
import { getDB } from '../../shared/db/index.js'

// ── Tax helpers (2024 brackets — update annually per GIB tebliği) ──
// TODO: Her yıl GİB tebliğine göre güncelle
const TAX_BRACKETS = [
  { limit: 110_000,   rate: 0.15 },
  { limit: 230_000,   rate: 0.20 },
  { limit: 870_000,   rate: 0.27 },
  { limit: 3_000_000, rate: 0.35 },
  { limit: Infinity,  rate: 0.40 },
]

function round2(x) {
  return Math.round(x * 100) / 100
}

function getYtdGross(db, staffId, year, month) {
  // month is 1-based. Returns gross from Jan 1 to (month-01) exclusive.
  // Must mirror puantajService pay logic: only 'worked'/'overtime' days + annual/emergency leave are paid.
  if (month <= 1) return 0
  const janStart = `${year}-01-01`
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`

  const staff = db.prepare('SELECT salary FROM staff WHERE id = ?').get(staffId)
  const salary = staff?.salary || 0
  if (salary === 0) return 0

  const dailyRate = salary / 30

  // Worked days (worked + overtime statuses only — on_leave excluded here)
  const sch = db.prepare(`
    SELECT COALESCE(COUNT(CASE WHEN status IN ('worked','overtime') THEN 1 END), 0) as worked_days
    FROM shift_schedule
    WHERE staff_id = ? AND work_date >= ? AND work_date < ?
  `).get(staffId, janStart, monthStart)

  // Paid leave days: only annual + emergency (matching puantajService leave_pay rule)
  const lv = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN leave_type IN ('annual','emergency') THEN total_days ELSE 0 END), 0) as paid_leave_days
    FROM leave_requests
    WHERE staff_id = ? AND status = 'approved'
      AND start_date >= ? AND start_date < ?
  `).get(staffId, janStart, monthStart)

  const ot = db.prepare(`
    SELECT COALESCE(SUM(hours), 0) as hours
    FROM overtime_records
    WHERE staff_id = ? AND work_date >= ? AND work_date < ?
  `).get(staffId, janStart, monthStart)

  return (
    dailyRate * ((sch?.worked_days || 0) + (lv?.paid_leave_days || 0)) +
    (dailyRate / 8) * 1.5 * (ot?.hours || 0)
  )
}

export function calcTax(ytdGross) {
  let tax = 0
  let prev = 0
  for (const { limit, rate } of TAX_BRACKETS) {
    if (ytdGross <= prev) break
    const slice = Math.min(ytdGross, limit) - prev
    tax += slice * rate
    prev = limit
  }
  return round2(tax)
}

// Non-Sunday days — excludes only Sundays.
// Turkish İş Kanunu allows 6-day work weeks; Saturdays may be worked.
// Used for monthly payroll proration (attend_rate calculation).
export function workDaysInMonth(year, month) {
  const days = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) count++
  }
  return count
}

export function departmentsService() {
  return getDepartments()
}

export function shiftDefinitionsService() {
  return getShiftDefinitions()
}

export function scheduleService(weekStart, weekEnd, deptId) {
  return getSchedule(weekStart, weekEnd, deptId)
}

export function bulkAssignService(entries, createdBy) {
  if (!entries?.length) throw new Error('Atama listesi boş')
  bulkAssignShifts(entries, createdBy)
}

export function staffStatusService(date, deptId) {
  return getStaffWithShiftStatus(date, deptId)
}

// ── Staff CRUD ──
export function staffListService(filters) {
  return getStaffList(filters)
}

export function staffGetService(id) {
  const staff = getStaffById(id)
  if (!staff) throw new Error('Personel bulunamadı')
  return staff
}

export function staffCreateService(data) {
  if (!data.full_name) throw new Error('Ad soyad zorunlu')
  return createStaff(data)
}

export function staffUpdateService(id, data) {
  updateStaff(id, data)
}

export function staffDeleteService(id) {
  deleteStaff(id)
}

export function searchStaffService(term) {
  return searchStaff(term || '')
}

// ── Leave ──
export function createLeaveService(data) {
  if (!data.staff_id || !data.leave_type || !data.start_date || !data.end_date)
    throw new Error('Zorunlu alanlar eksik')
  const start = new Date(data.start_date)
  const end = new Date(data.end_date)
  if (end < start) throw new Error('Bitiş tarihi başlangıçtan önce olamaz')
  const totalDays = Math.round((end - start) / 86400000) + 1
  return createLeaveRequest({ ...data, total_days: totalDays })
}

export function approveLeaveService(id, userId, status) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Geçersiz durum')
  approveLeaveRequest(id, userId, status)
}

export function leaveListService(filters) {
  return getLeaveRequests(filters)
}

export function leaveBalanceService(staffId) {
  const year = new Date().getFullYear()
  return getLeaveBalance(staffId, year)
}

export function createOvertimeService(data, userId) {
  if (!data.staff_id || !data.work_date || !data.hours)
    throw new Error('Zorunlu alanlar eksik')
  if (data.hours <= 0 || data.hours > 12) throw new Error('Mesai saati 0-12 arasında olmalı')
  return createOvertime({ ...data, approved_by: userId })
}

export function overtimeListService(filters) {
  return getOvertimeRecords(filters)
}

export function updateOvertimeService(id, data) {
  if (data.hours !== undefined && (data.hours <= 0 || data.hours > 12))
    throw new Error('Mesai saati 0-12 arasında olmalı')
  updateOvertime(id, data)
}

export function deleteOvertimeService(id) {
  deleteOvertime(id)
}

export function overtimeSummaryService(month) {
  return getOvertimeSummary(month)
}

export function checkInService(data) {
  return createAttendanceLog(data)
}

export function checkOutService(logId) {
  updateCheckout(logId)
}

export function attendanceListService(filters) {
  return getAttendanceLogs(filters)
}

export function statisticsService(date) {
  return getShiftStatistics(date)
}

export function departmentSummaryService() {
  return getDepartmentSummary()
}

export function createDepartmentService(data) {
  if (!data.name || !data.color_class) throw new Error('Departman adı ve renk gerekli')
  return createDepartment(data.name, data.color_class, data.description)
}

export function updateDepartmentService(id, data) {
  updateDepartment(id, data)
}

export function deleteDepartmentService(id) {
  deleteDepartment(id)
}

export function assignDeptService(staffId, deptId) {
  assignStaffDepartment(staffId, deptId)
}

export function createShiftDefService(data) {
  if (!data.name || data.start_hour === undefined || data.end_hour === undefined || !data.color_class)
    throw new Error('Tüm alanlar gerekli')
  return createShiftDefinition(data.name, data.start_hour, data.end_hour, data.color_class)
}

export function updateShiftDefService(id, data) {
  updateShiftDefinition(id, data)
}

export function deleteShiftDefService(id) {
  deleteShiftDefinition(id)
}

export function cancelLeaveService(id) {
  cancelLeaveRequest(id)
}

export function createSwapService(data) {
  if (!data.requester_id || !data.target_id || !data.swap_date)
    throw new Error('Zorunlu alanlar eksik')
  return createSwapRequest(data)
}

export function swapListService(filters) {
  return getSwapRequests(filters)
}

export function approveSwapService(id, userId) {
  approveSwapRequest(id, userId)
}

export function rejectSwapService(id, userId) {
  rejectSwapRequest(id, userId)
}

export function copyWeekService(sourceWeek, targetWeek, userId) {
  if (!sourceWeek || !targetWeek) throw new Error('Kaynak ve hedef hafta gerekli')
  return copyWeekSchedule(sourceWeek, targetWeek, userId)
}

export function rotationService(data, userId) {
  if (!data.staff_ids?.length || !data.shift_def_ids?.length || !data.start_date || !data.weeks)
    throw new Error('Zorunlu alanlar eksik')
  return applyRotationTemplate(data.staff_ids, data.dept_id, data.shift_def_ids, data.start_date, data.weeks, userId)
}

export function deleteScheduleService(staffId, workDate) {
  deleteScheduleEntry(staffId, workDate)
}

export function staffDetailService(staffId) {
  return getStaffDetail(staffId)
}

export function puantajService(month, deptId) {
  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${year}-${String(mon).padStart(2, '0')}-${lastDay}`
  return getPuantaj(monthStart, monthEnd, deptId)
}
