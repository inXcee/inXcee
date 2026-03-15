import {
  getDepartments, getShiftDefinitions, getSchedule, bulkAssignShifts,
  getPersonnelWithShiftStatus, createLeaveRequest, approveLeaveRequest,
  getLeaveRequests, getLeaveBalance, createOvertime, getOvertimeRecords,
  getOvertimeSummary, createAttendanceLog, updateCheckout, getAttendanceLogs,
  getShiftStatistics, getDepartmentSummary
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

export function personnelStatusService(date, deptId) {
  return getPersonnelWithShiftStatus(date, deptId)
}

export function createLeaveService(data) {
  if (!data.personnel_id || !data.leave_type || !data.start_date || !data.end_date)
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

export function leaveBalanceService(personnelId) {
  const year = new Date().getFullYear()
  return getLeaveBalance(personnelId, year)
}

export function createOvertimeService(data, userId) {
  if (!data.personnel_id || !data.work_date || !data.hours)
    throw new Error('Zorunlu alanlar eksik')
  if (data.hours <= 0 || data.hours > 12) throw new Error('Mesai saati 0-12 arasında olmalı')
  return createOvertime({ ...data, approved_by: userId })
}

export function overtimeListService(filters) {
  return getOvertimeRecords(filters)
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
