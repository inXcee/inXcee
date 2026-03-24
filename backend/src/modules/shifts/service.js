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
