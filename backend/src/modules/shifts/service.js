import {
  getDepartments, getShiftDefinitions, getSchedule, bulkAssignShifts, assignmentWarnings,
  getScheduleEntry, getScheduleSegment, listScheduleSegments,
  createScheduleSegment, updateScheduleSegment, deleteScheduleSegment,
  getWorkLocations, createWorkLocation, updateWorkLocation, deleteWorkLocation,
  getStaffRoles, createStaffRole, updateStaffRole, deleteStaffRole, getScheduleBreakdown, getBreakdownAssignees,
  getStaffWithShiftStatus, createLeaveRequest, getLeaveRequest, approveLeaveRequest,
  getLeaveRequests, getLeaveBalance, addRequestDocuments, listRequestDocuments, getRequestDocument, deleteRequestDocument,
  createOvertime, updateOvertime, deleteOvertime, getOvertimeRecords, upsertOvertimeDay,
  createOvertimeRequest, createOvertimeRequestFromAttendanceException,
  getOvertimeRequest, getOvertimeRequests, reviewOvertimeRequest,
  getOvertimeSummary, createAttendanceLog, updateCheckout, getAttendanceLogs, getPuantaj,
  getShiftStatistics, getDepartmentSummary,
  createDepartment, updateDepartment, deleteDepartment,
  createShiftDefinition, updateShiftDefinition, deleteShiftDefinition, getShiftCoverage,
  getCoverageRules, createCoverageRule, updateCoverageRule, deleteCoverageRule, getScheduleCandidates,
  cancelLeaveRequest, createSwapRequest, getSwapRequests, acceptSwapRequest, approveSwapRequest, rejectSwapRequest,
  copyWeekSchedule, applyRotationTemplate, searchStaff, deleteScheduleEntry,
  listRotationTemplates, getRotationTemplate, createRotationTemplate, deleteRotationTemplate,
  listPeriodLocks, lockedPeriodsFor, lockPeriod, unlockPeriod,
  getPuantajPeriodApproval, upsertPuantajPeriodApproval,
  listPuantajDailyApprovals, upsertPuantajDailyApproval,
  insertPuantajApprovalEvent, listPuantajApprovalEvents,
  resetDailyApprovalsForDates, getPuantajDayIssueCounts, getPuantajApprovalOverview,
  listPuantajCodes, createPuantajCode, updatePuantajCode, getPuantajCode, deletePuantajCode,
  getStaffDetail,
  getStaffList, getStaffDirectoryMetrics, getStaffById, createStaff, updateStaff, deleteStaff,
  getStaffAssignments, createStaffAssignment, getStaffDataQualityRows,
  getStaffDayBreakdown, getPuantajDayRows, listDeductions,
  findAttendanceIdentity, insertAttendanceEvent, listAttendanceEvents,
  listStationAttendanceSourceEvents, getAttendanceCandidateStaffIds,
  getAttendanceReconciliationContext, findAttendanceReconciliation,
  insertAttendanceReconciliation, markScheduleWorkedFromAttendance,
  resolveStaleAttendanceExceptions, upsertAttendanceException,
  listAttendanceExceptions, getAttendanceException, updateAttendanceExceptionStatus,
  getAttendanceMonthSummary, getOperationsDashboardData, getPuantajClosingPackageData
} from './queries.js'
import { getDB } from '../../shared/db/index.js'
import { computeAnnualEntitlement } from './leave-entitlement.js'
import { sendPushToWorker } from '../../shared/notifications/push.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logger } from '../../shared/logger.js'
import { isIsoDate, isIsoMonth } from '../../shared/validation/date.js'
import { createHash } from 'node:crypto'

// ── Tax helpers (2026 ücret gelirleri tarifesi — GİB) ──
const TAX_BRACKETS = [
  { limit: 190_000,   rate: 0.15 },
  { limit: 400_000,   rate: 0.20 },
  { limit: 1_500_000, rate: 0.27 },
  { limit: 5_300_000, rate: 0.35 },
  { limit: Infinity,  rate: 0.40 },
]

function round2(x) {
  return Math.round(x * 100) / 100
}

export function getYtdGross(db, staffId, year, month) {
  // month is 1-based. Returns gross from Jan 1 to (month-01) exclusive.
  // Must mirror puantajService pay logic: only 'worked'/'overtime' days + annual/emergency leave are paid.
  if (month <= 1) return 0
  const janStart = `${year}-01-01`
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`

  const staff = db.prepare('SELECT salary FROM staff WHERE id = ?').get(staffId)
  const salary = staff?.salary || 0
  if (salary === 0) return 0

  const dailyRate = salary / 30

  // Worked days (worked + overtime) + haftalık izin (off — hafta tatili ücretlidir)
  const sch = db.prepare(`
    SELECT COALESCE(COUNT(CASE WHEN status IN ('worked','overtime') THEN 1 END), 0) as worked_days,
      COALESCE(COUNT(CASE WHEN status = 'off' THEN 1 END), 0) as off_days
    FROM shift_schedule
    WHERE staff_id = ? AND work_date >= ? AND work_date < ?
  `).get(staffId, janStart, monthStart)

  // Paid leave units are driven by the configured puantaj code effects.
  const lv = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN ss.status='on_leave' AND COALESCE(pc.is_paid,0)=1 THEN
      CASE WHEN COALESCE(ss.leave_hours,0)>0
        THEN (ss.leave_hours/8.0)*COALESCE(pc.hour_multiplier,0)
        ELSE COALESCE(pc.day_multiplier,0)
      END ELSE 0 END),0) as paid_leave_units
    FROM shift_schedule ss
    LEFT JOIN puantaj_codes pc ON pc.id=COALESCE(ss.puantaj_code_id, (
      SELECT fallback_pc.id FROM puantaj_codes fallback_pc
      WHERE fallback_pc.is_active=1 AND fallback_pc.status=ss.status
        AND (ss.status!='on_leave' OR fallback_pc.leave_type=ss.leave_type)
      ORDER BY fallback_pc.is_builtin DESC, fallback_pc.sort_order, fallback_pc.id LIMIT 1
    ))
    WHERE ss.staff_id=? AND ss.work_date>=? AND ss.work_date<?
  `).get(staffId, janStart, monthStart)

  const ot = db.prepare(`
    SELECT COALESCE(SUM(hours), 0) as hours
    FROM overtime_records
    WHERE staff_id = ? AND work_date >= ? AND work_date < ?
  `).get(staffId, janStart, monthStart)

  return (
    dailyRate * ((sch?.worked_days || 0) + (sch?.off_days || 0) + (lv?.paid_leave_units || 0)) +
    (dailyRate / 8) * 1.5 * (ot?.hours || 0)
  )
}

// getYtdGross'un toplu hali — tüm personelin yıl başından ay başına (exclusive)
// YTD brütünü 4 sabit sorguyla hesaplar (personel başına sorgu çalıştırmaz).
// Sorgular getYtdGross'un birebir GROUP BY staff_id'li karşılıkları — ikisi
// aynı sonucu vermek ZORUNDA (bkz. ytd-bulk.test.js eşdeğerlik testi).
// Dönüş: Map<staffId, ytdGross> (maaşsız/aktivitesiz personel map'te yer almaz → 0 kabul edilir)
export function getYtdGrossBulk(db, year, month) {
  const map = new Map()
  if (month <= 1) return map
  const janStart = `${year}-01-01`
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`

  const salaries = new Map(db.prepare('SELECT id, salary FROM staff').all().map(r => [r.id, r.salary || 0]))

  const schRows = db.prepare(`
    SELECT staff_id,
      COALESCE(COUNT(CASE WHEN status IN ('worked','overtime') THEN 1 END), 0) as worked_days,
      COALESCE(COUNT(CASE WHEN status = 'off' THEN 1 END), 0) as off_days
    FROM shift_schedule
    WHERE work_date >= ? AND work_date < ?
    GROUP BY staff_id
  `).all(janStart, monthStart)

  const lvRows = db.prepare(`
    SELECT ss.staff_id,
      COALESCE(SUM(CASE WHEN ss.status='on_leave' AND COALESCE(pc.is_paid,0)=1 THEN
        CASE WHEN COALESCE(ss.leave_hours,0)>0
          THEN (ss.leave_hours/8.0)*COALESCE(pc.hour_multiplier,0)
          ELSE COALESCE(pc.day_multiplier,0)
        END ELSE 0 END),0) as paid_leave_units
    FROM shift_schedule ss
    LEFT JOIN puantaj_codes pc ON pc.id=COALESCE(ss.puantaj_code_id, (
      SELECT fallback_pc.id FROM puantaj_codes fallback_pc
      WHERE fallback_pc.is_active=1 AND fallback_pc.status=ss.status
        AND (ss.status!='on_leave' OR fallback_pc.leave_type=ss.leave_type)
      ORDER BY fallback_pc.is_builtin DESC, fallback_pc.sort_order, fallback_pc.id LIMIT 1
    ))
    WHERE ss.work_date>=? AND ss.work_date<?
    GROUP BY ss.staff_id
  `).all(janStart, monthStart)

  const otRows = db.prepare(`
    SELECT staff_id, COALESCE(SUM(hours), 0) as hours
    FROM overtime_records
    WHERE work_date >= ? AND work_date < ?
    GROUP BY staff_id
  `).all(janStart, monthStart)

  const schMap = new Map(schRows.map(r => [r.staff_id, r]))
  const lvMap = new Map(lvRows.map(r => [r.staff_id, r.paid_leave_units || 0]))
  const otMap = new Map(otRows.map(r => [r.staff_id, r.hours || 0]))

  for (const [id, salary] of salaries) {
    if (salary === 0) continue
    const sch = schMap.get(id)
    const units = (sch?.worked_days || 0) + (sch?.off_days || 0) + (lvMap.get(id) || 0)
    const hours = otMap.get(id) || 0
    if (units === 0 && hours === 0) continue
    const dailyRate = salary / 30
    map.set(id, dailyRate * units + (dailyRate / 8) * 1.5 * hours)
  }
  return map
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

export function workLocationsService(filters = {}) {
  return getWorkLocations({ includeInactive: filters.all === '1' || filters.includeInactive === true })
}

export function createWorkLocationService(data) {
  if (!data?.name?.trim()) throw new Error('Çalışma noktası adı zorunlu')
  return createWorkLocation({
    name: data.name.trim(),
    dept_id: data.dept_id || null,
    site: data.site?.trim() || null,
    color_class: data.color_class || 'blue',
    sort_order: data.sort_order ?? 0,
    is_active: data.is_active,
  })
}

export function updateWorkLocationService(id, data) {
  updateWorkLocation(id, data)
}

export function deleteWorkLocationService(id) {
  deleteWorkLocation(id)
}

export function staffRolesService(filters = {}) {
  return getStaffRoles({ includeInactive: filters.all === '1' || filters.includeInactive === true })
}

export function createStaffRoleService(data) {
  if (!data?.name?.trim()) throw new Error('Rol adı zorunlu')
  return createStaffRole({
    name: data.name.trim(),
    sort_order: data.sort_order ?? 0,
    is_active: data.is_active,
    expected_dept_id: data.expected_dept_id || null,
  })
}

export function updateStaffRoleService(id, data) {
  updateStaffRole(id, data)
}

export function deleteStaffRoleService(id) {
  deleteStaffRole(id)
}

export function scheduleService(weekStart, weekEnd, deptId) {
  return getSchedule(weekStart, weekEnd, deptId)
}

export function scheduleBreakdownService({ from, to } = {}) {
  if (!from || !to) throw Object.assign(new Error('from ve to gerekli'), { statusCode: 400 })
  return getScheduleBreakdown(from, to)
}

export function breakdownAssigneesService({ date, dimension, value } = {}) {
  if (!date || !dimension) throw Object.assign(new Error('date ve dimension gerekli'), { statusCode: 400 })
  if (!['site', 'location', 'role'].includes(dimension)) {
    throw Object.assign(new Error('gecersiz dimension'), { statusCode: 400 })
  }
  return { date, dimension, value: value ?? '', assignees: getBreakdownAssignees({ date, dimension, value: value ?? '' }) }
}

// ── Faz 31: Dönem kilidi guard ──
// Verilen tarihlerin ait olduğu aylardan biri kilitliyse 423 (Locked) fırlatır.
export function assertPeriodsUnlocked(dates) {
  const periods = [...new Set(dates.filter(Boolean).map(d => String(d).slice(0, 7)))]
  const locked = lockedPeriodsFor(periods)
  if (locked.length) {
    throw Object.assign(
      new Error(`${locked.join(', ')} dönemi kilitli — puantaj değiştirilemez. Önce müdür kilidi açmalı.`),
      { statusCode: 423 }
    )
  }
}

export function periodLocksService() {
  return listPeriodLocks()
}

export function lockPeriodService(period, userId, note) {
  if (!isIsoMonth(period)) throw new Error('period YYYY-MM formatında olmalı')
  lockPeriod(period, userId, note)
}

export function unlockPeriodService(period) {
  if (!isIsoMonth(period)) throw new Error('period YYYY-MM formatında olmalı')
  unlockPeriod(period)
}

function puantajApprovalScope(deptId) {
  if (deptId == null || deptId === '') return { deptId: null, deptScope: 'all' }
  const parsed = Number(deptId)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw Object.assign(new Error('dept_id sayisal olmalidir'), { statusCode: 400 })
  }
  return { deptId: parsed, deptScope: `dept:${parsed}` }
}

function validatePuantajPeriod(period) {
  parsePuantajMonth(period)
  return period
}

function validatePuantajWorkDate(period, workDate) {
  if (!isIsoDate(workDate) || !String(workDate).startsWith(`${period}-`)) {
    throw Object.assign(new Error('work_date secilen ay icinde YYYY-MM-DD formatinda olmalidir'), { statusCode: 400 })
  }
  const day = Number(String(workDate).slice(8, 10))
  const { lastDay } = parsePuantajMonth(period)
  if (!Number.isInteger(day) || day < 1 || day > lastDay) {
    throw Object.assign(new Error('work_date secilen ay icinde olmalidir'), { statusCode: 400 })
  }
  return workDate
}

function requirePuantajManager(user) {
  if (user?.role !== 'campus_manager') {
    throw Object.assign(new Error('Bu islem icin mudur yetkisi gerekir'), { statusCode: 403 })
  }
}

function buildPuantajApprovalDays(period, existingRows) {
  const { year, mon, lastDay } = parsePuantajMonth(period)
  const byDate = new Map(existingRows.map(row => [row.work_date, row]))
  return Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1
    const workDate = `${period}-${String(day).padStart(2, '0')}`
    const weekday = new Date(year, mon - 1, day).getDay()
    const row = byDate.get(workDate) || {
      period,
      work_date: workDate,
      day,
      weekday,
      is_weekend: weekday === 0 || weekday === 6,
      status: 'missing',
      note: null,
    }
    return { ...row, day, weekday, is_weekend: weekday === 0 || weekday === 6 }
  })
}

function buildPuantajLockAudit(period, deptId, deptScope) {
  const { year, mon, monthStart, monthEnd, lastDay } = parsePuantajMonth(period)
  const staffRows = getPuantaj(monthStart, monthEnd, deptId)
  const dayRows = getPuantajDayRows(monthStart, monthEnd, deptId)
  const daysByStaff = new Map()
  dayRows.forEach(row => {
    if (!daysByStaff.has(row.staff_id)) daysByStaff.set(row.staff_id, new Map())
    daysByStaff.get(row.staff_id).set(row.date, row)
  })

  const totals = { scheduled: 0, empty: 0, absentWithoutReason: 0, missingOffStaff: 0 }
  staffRows.forEach(staff => {
    let off = 0
    const staffDays = daysByStaff.get(staff.id) || new Map()
    for (let day = 1; day <= lastDay; day += 1) {
      const date = `${period}-${String(day).padStart(2, '0')}`
      const weekday = new Date(year, mon - 1, day).getDay()
      const entry = staffDays.get(date)
      if (!entry) {
        if (weekday !== 0) totals.empty += 1
        continue
      }
      if (entry.status === 'scheduled') totals.scheduled += 1
      if (entry.status === 'off') off += 1
      if (entry.status === 'absent' && !String(entry.absent_reason || '').trim()) totals.absentWithoutReason += 1
    }
    if (off === 0) totals.missingOffStaff += 1
  })

  const periodApproval = getPuantajPeriodApproval(period, deptScope)
  const dailyApprovals = buildPuantajApprovalDays(period, listPuantajDailyApprovals(period, deptScope))
  const approvedDays = dailyApprovals.filter(row => row.status === 'approved').length
  const returnedDays = dailyApprovals.filter(row => row.status === 'returned').length
  const pendingDays = dailyApprovals.filter(row => row.status === 'pending').length
  const missingDays = dailyApprovals.length - approvedDays - returnedDays - pendingDays

  return {
    staffCount: staffRows.length,
    totalDays: lastDay,
    periodStatus: periodApproval?.status || 'draft',
    approvedDays,
    returnedDays,
    pendingDays,
    missingDays,
    totals,
  }
}

function assertPuantajReadyToLock(period, scope) {
  const audit = buildPuantajLockAudit(period, scope.deptId, scope.deptScope)
  const problems = []
  if (!['submitted', 'approved', 'locked'].includes(audit.periodStatus)) problems.push('ay kontrole gonderilmemis')
  if (audit.approvedDays !== audit.totalDays) problems.push(`${audit.totalDays - audit.approvedDays} gun onaysiz`)
  if (audit.returnedDays > 0) problems.push(`${audit.returnedDays} gun geri donmus`)
  if (audit.pendingDays > 0) problems.push(`${audit.pendingDays} gun beklemede`)
  if (audit.missingDays > 0) problems.push(`${audit.missingDays} gun eksik`)
  if (audit.totals.scheduled > 0) problems.push(`${audit.totals.scheduled} planli gun kapanmamis`)
  if (audit.totals.empty > 0) problems.push(`${audit.totals.empty} bos gun var`)
  if (audit.totals.absentWithoutReason > 0) problems.push(`${audit.totals.absentWithoutReason} devamsizlik nedeni eksik`)
  if (audit.totals.missingOffStaff > 0) problems.push(`${audit.totals.missingOffStaff} personelde OFF yok`)
  if (problems.length > 0) {
    throw Object.assign(
      new Error(`Puantaj kilitlenemez: ${problems.join(', ')}`),
      { statusCode: 409, details: audit }
    )
  }
  return audit
}

export function puantajApprovalService({ month, deptId } = {}) {
  const period = validatePuantajPeriod(month)
  const scope = puantajApprovalScope(deptId)
  const dailyRows = listPuantajDailyApprovals(period, scope.deptScope)
  return {
    period,
    dept_id: scope.deptId,
    dept_scope: scope.deptScope,
    period_approval: getPuantajPeriodApproval(period, scope.deptScope) || {
      period,
      dept_scope: scope.deptScope,
      dept_id: scope.deptId,
      status: 'draft',
      note: null,
    },
    daily_approvals: buildPuantajApprovalDays(period, dailyRows),
    events: listPuantajApprovalEvents(period, scope.deptScope, 80),
  }
}

// Onay akışı bildirimi — hata akışı bozmasın (try/catch), SSE+push createNotification üzerinden.
function notifyPuantajApproval({ message, targetRole, period, deptScope }) {
  try {
    createNotification({
      message,
      severity: 'info',
      module: 'shifts',
      target_role: targetRole,
      dedup_key: `puantaj:${period}:${deptScope}:${message}`,
    })
  } catch (e) {
    logger.warn('[Puantaj] bildirim gonderilemedi:', e.message)
  }
}

function puantajScopeLabel(deptId) {
  if (deptId == null) return 'tum departmanlar'
  const dept = getDB().prepare('SELECT name FROM departments WHERE id = ?').get(deptId)
  return dept?.name || `departman #${deptId}`
}

// ── Puantaj kod kayıt sistemi ──
const HEX_RE = /^[0-9a-fA-F]{6}$/

function cleanCodeHex(value, fallback = '64748B') {
  const hex = String(value || '').replace('#', '').trim().toUpperCase()
  return HEX_RE.test(hex) ? hex : fallback
}

function boundedCodeNumber(value, fallback, min, max, label) {
  const number = value == null || value === '' ? fallback : Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw Object.assign(new Error(`${label} ${min}-${max} arasinda olmali`), { statusCode: 400 })
  }
  return number
}

function codeEffectFields(data = {}, existing = {}) {
  const overtimeEffect = data.overtime_effect ?? existing.overtime_effect ?? 'none'
  if (!['none', 'eligible', 'blocks'].includes(overtimeEffect)) {
    throw Object.assign(new Error('Gecersiz mesai etkisi'), { statusCode: 400 })
  }
  return {
    is_paid: data.is_paid == null ? Number(existing.is_paid || 0) : (data.is_paid ? 1 : 0),
    sgk_day_factor: boundedCodeNumber(data.sgk_day_factor, Number(existing.sgk_day_factor || 0), 0, 1, 'SGK gun katsayisi'),
    day_multiplier: boundedCodeNumber(data.day_multiplier, Number(existing.day_multiplier || 0), 0, 3, 'Gun katsayisi'),
    hour_multiplier: boundedCodeNumber(data.hour_multiplier, Number(existing.hour_multiplier || 0), 0, 5, 'Saat katsayisi'),
    overtime_effect: overtimeEffect,
    requires_document: data.requires_document == null ? Number(existing.requires_document || 0) : (data.requires_document ? 1 : 0),
    requires_reason: data.requires_reason == null ? Number(existing.requires_reason || 0) : (data.requires_reason ? 1 : 0),
  }
}

export function puantajCodesService(filters = {}) {
  return listPuantajCodes({ includeInactive: filters.all === '1' || filters.includeInactive === true })
}

export function createPuantajCodeService(data = {}) {
  const code = String(data.code || '').trim().toLocaleUpperCase('tr')
  if (!code || code.length > 4) throw Object.assign(new Error('Kod 1-4 karakter olmalı'), { statusCode: 400 })
  if (!data.label?.trim()) throw Object.assign(new Error('Kod etiketi zorunlu'), { statusCode: 400 })
  const status = data.status || 'on_leave'
  if (!['worked', 'off', 'on_leave', 'absent', 'scheduled'].includes(status)) {
    throw Object.assign(new Error('Geçersiz durum'), { statusCode: 400 })
  }
  // İzin kodlarında leave_type otomatik türetilir (küçük harf slug) — kod bazlı ayrım için benzersiz olmalı
  const leaveType = status === 'on_leave'
    ? String(data.leave_type || code).trim().toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9_]/g, '_')
    : null
  const effects = codeEffectFields(data)
  try {
    return createPuantajCode({
      code,
      label: data.label.trim(),
      colorHex: cleanCodeHex(data.color_hex),
      status,
      leaveType,
      sortOrder: data.sort_order,
      isPaid: effects.is_paid,
      sgkDayFactor: effects.sgk_day_factor,
      dayMultiplier: effects.day_multiplier,
      hourMultiplier: effects.hour_multiplier,
      overtimeEffect: effects.overtime_effect,
      requiresDocument: effects.requires_document,
      requiresReason: effects.requires_reason,
    })
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      throw Object.assign(new Error(`'${code}' kodu zaten var`), { statusCode: 400 })
    }
    throw e
  }
}

export function updatePuantajCodeService(id, data = {}) {
  const existing = getPuantajCode(id)
  if (!existing) throw Object.assign(new Error('Kod bulunamadı'), { statusCode: 404 })
  const fields = {}
  if (data.label !== undefined) {
    if (!String(data.label).trim()) throw Object.assign(new Error('Kod etiketi boş olamaz'), { statusCode: 400 })
    fields.label = String(data.label).trim()
  }
  if (data.color_hex !== undefined) fields.color_hex = cleanCodeHex(data.color_hex, existing.color_hex)
  if (data.sort_order !== undefined) fields.sort_order = Number(data.sort_order) || 0
  if (data.is_active !== undefined) {
    if (existing.is_builtin && !data.is_active) {
      throw Object.assign(new Error('Yerleşik kod pasifleştirilemez'), { statusCode: 400 })
    }
    fields.is_active = data.is_active ? 1 : 0
  }
  if (data.code !== undefined && !existing.is_builtin) {
    const code = String(data.code).trim().toLocaleUpperCase('tr')
    if (!code || code.length > 4) throw Object.assign(new Error('Kod 1-4 karakter olmalı'), { statusCode: 400 })
    fields.code = code
  }
  Object.assign(fields, codeEffectFields(data, existing))
  updatePuantajCode(id, fields)
  return getPuantajCode(id)
}

export function deletePuantajCodeService(id) {
  const existing = getPuantajCode(id)
  if (!existing) throw Object.assign(new Error('Kod bulunamadı'), { statusCode: 404 })
  if (existing.is_builtin) throw Object.assign(new Error('Yerleşik kod silinemez — rengini ve etiketini değiştirebilirsiniz'), { statusCode: 400 })
  deletePuantajCode(id)
}

// Departman onay matrisi — müdürün tek ekranda tüm scope'ları görmesi için.
export function puantajApprovalOverviewService({ month } = {}) {
  const period = validatePuantajPeriod(month)
  const { year, mon, monthStart, monthEnd, lastDay } = parsePuantajMonth(period)
  const raw = getPuantajApprovalOverview(period, monthStart, monthEnd)

  let nonSundayDays = 0
  for (let day = 1; day <= lastDay; day += 1) {
    if (new Date(year, mon - 1, day).getDay() !== 0) nonSundayDays += 1
  }

  const periodByScope = new Map(raw.periodRows.map(row => [row.dept_scope, row]))
  const lastEventByScope = new Map(raw.lastEvents.map(row => [row.dept_scope, row.last_event_at]))
  const issueByDept = new Map(raw.issueCounts.map(row => [row.dept_id, row]))
  const dailyByScope = new Map()
  raw.dailyCounts.forEach(row => {
    if (!dailyByScope.has(row.dept_scope)) dailyByScope.set(row.dept_scope, {})
    dailyByScope.get(row.dept_scope)[row.status] = row.n
  })

  const scopeSummary = (deptScope, staffCount, deptId) => {
    const daily = dailyByScope.get(deptScope) || {}
    const approved = daily.approved || 0
    const issue = deptId != null ? (issueByDept.get(deptId) || {}) : null
    const expected = deptId != null ? staffCount * nonSundayDays : null
    return {
      period_status: periodByScope.get(deptScope)?.status || 'draft',
      submitted_by_name: periodByScope.get(deptScope)?.submitted_by_name || null,
      approved_days: approved,
      pending_days: daily.pending || 0,
      returned_days: daily.returned || 0,
      missing_days: lastDay - approved - (daily.pending || 0) - (daily.returned || 0),
      last_event_at: lastEventByScope.get(deptScope) || null,
      issues: deptId != null ? {
        scheduled: issue.scheduled || 0,
        absent_no_reason: issue.absent_no_reason || 0,
        empty: Math.max(0, expected - (issue.filled_days || 0)),
      } : null,
    }
  }

  return {
    period,
    total_days: lastDay,
    all: scopeSummary('all', null, null),
    departments: raw.departments.map(dept => ({
      dept_id: dept.id,
      name: dept.name,
      color_class: dept.color_class,
      staff_count: dept.staff_count,
      ...scopeSummary(`dept:${dept.id}`, dept.staff_count, dept.id),
    })),
  }
}

export function submitPuantajPeriodService({ period, dept_id, note } = {}, user = {}) {
  const cleanPeriod = validatePuantajPeriod(period)
  const scope = puantajApprovalScope(dept_id)
  const row = upsertPuantajPeriodApproval({
    period: cleanPeriod,
    deptScope: scope.deptScope,
    deptId: scope.deptId,
    status: 'submitted',
    note,
    userId: user.id,
    action: 'submit',
  })
  insertPuantajApprovalEvent({
    scope: 'period',
    period: cleanPeriod,
    deptScope: scope.deptScope,
    deptId: scope.deptId,
    action: 'submit',
    status: 'submitted',
    note,
    userId: user.id,
  })
  notifyPuantajApproval({
    message: `📋 Puantaj kontrole gönderildi: ${cleanPeriod} (${puantajScopeLabel(scope.deptId)})${user.full_name ? ` — ${user.full_name}` : ''}`,
    targetRole: 'campus_manager',
    period: cleanPeriod,
    deptScope: scope.deptScope,
  })
  return row
}

// Gün onaylanmadan önce o günün verisi sağlam olmalı; sorun varsa 409.
// force=true (müdür) ile geçilebilir — zorla onay event notuna işlenir.
function assertPuantajDayApprovable(period, workDate, deptId) {
  const counts = getPuantajDayIssueCounts(workDate, deptId) || {}
  const { year, mon } = parsePuantajMonth(period)
  const day = Number(String(workDate).slice(8, 10))
  const isSunday = new Date(year, mon - 1, day).getDay() === 0
  const problems = []
  if ((counts.scheduled || 0) > 0) problems.push(`${counts.scheduled} planli gun kapanmamis`)
  if (!isSunday && (counts.empty || 0) > 0) problems.push(`${counts.empty} personelde bos gun`)
  if ((counts.absent_no_reason || 0) > 0) problems.push(`${counts.absent_no_reason} devamsizlik nedeni eksik`)
  if ((counts.required_reason_missing || 0) > 0) problems.push(`${counts.required_reason_missing} kayitta zorunlu gerekce eksik`)
  if ((counts.required_document_missing || 0) > 0) problems.push(`${counts.required_document_missing} kayitta zorunlu belge eksik`)
  if ((counts.pending_overtime_requests || 0) > 0) problems.push(`${counts.pending_overtime_requests} mesai talebi bekliyor`)
  if ((counts.pending_leave_requests || 0) > 0) problems.push(`${counts.pending_leave_requests} izin talebi bekliyor`)
  if (problems.length > 0) {
    throw Object.assign(
      new Error(`Gun onaylanamaz: ${problems.join(', ')}`),
      { statusCode: 409, details: { work_date: workDate, problems, counts } }
    )
  }
}

export function updatePuantajDayApprovalService({ period, work_date, dept_id, status, note, force } = {}, user = {}) {
  const cleanPeriod = validatePuantajPeriod(period)
  const cleanDate = validatePuantajWorkDate(cleanPeriod, work_date)
  const allowed = new Set(['pending', 'approved', 'returned'])
  if (!allowed.has(status)) {
    throw Object.assign(new Error('status pending, approved veya returned olmalidir'), { statusCode: 400 })
  }
  if (['approved', 'returned'].includes(status)) requirePuantajManager(user)
  const scope = puantajApprovalScope(dept_id)
  const forced = force === true && status === 'approved'
  if (status === 'approved' && !forced) assertPuantajDayApprovable(cleanPeriod, cleanDate, scope.deptId)
  const row = upsertPuantajDailyApproval({
    period: cleanPeriod,
    workDate: cleanDate,
    deptScope: scope.deptScope,
    deptId: scope.deptId,
    status,
    note,
    userId: user.id,
  })
  insertPuantajApprovalEvent({
    scope: 'day',
    period: cleanPeriod,
    workDate: cleanDate,
    deptScope: scope.deptScope,
    deptId: scope.deptId,
    action: status,
    status,
    note: forced ? [note, 'zorla onaylandi'].filter(Boolean).join(' — ') : note,
    userId: user.id,
  })
  if (status === 'returned') {
    notifyPuantajApproval({
      message: `↩️ Puantaj günü geri gönderildi: ${cleanDate} (${puantajScopeLabel(scope.deptId)})${note ? ` — ${note}` : ''}`,
      targetRole: 'shift_supervisor',
      period: cleanPeriod,
      deptScope: scope.deptScope,
    })
  }
  return row
}

export function updatePuantajPeriodApprovalService({ period, dept_id, action, note } = {}, user = {}) {
  requirePuantajManager(user)
  const cleanPeriod = validatePuantajPeriod(period)
  const scope = puantajApprovalScope(dept_id)
  const actionMap = {
    approve: 'approved',
    return: 'returned',
    lock: 'locked',
    reopen: 'draft',
  }
  const status = actionMap[action]
  if (!status) throw Object.assign(new Error('action approve, return, lock veya reopen olmalidir'), { statusCode: 400 })
  if (action === 'approve') {
    const current = getPuantajPeriodApproval(cleanPeriod, scope.deptScope)
    if ((current?.status || 'draft') !== 'submitted') {
      throw Object.assign(new Error('Onay için önce dönemi gönderin (submitted olmalı).'), { statusCode: 409 })
    }
  }
  if (['lock', 'reopen'].includes(action) && scope.deptId != null) {
    throw Object.assign(new Error('Ay kilidi tum kapsam icin yapilir; departman filtresini kaldirin'), { statusCode: 400 })
  }

  if (action === 'lock') {
    assertPuantajReadyToLock(cleanPeriod, scope)
    lockPeriod(cleanPeriod, user.id, note || 'Puantaj onaylanip kilitlendi')
  }
  if (action === 'reopen') unlockPeriod(cleanPeriod)

  const row = upsertPuantajPeriodApproval({
    period: cleanPeriod,
    deptScope: scope.deptScope,
    deptId: scope.deptId,
    status,
    note,
    userId: user.id,
    action,
  })
  insertPuantajApprovalEvent({
    scope: 'period',
    period: cleanPeriod,
    deptScope: scope.deptScope,
    deptId: scope.deptId,
    action,
    status,
    note,
    userId: user.id,
  })
  const actionMessages = {
    approve: `✅ Puantaj onaylandı: ${cleanPeriod} (${puantajScopeLabel(scope.deptId)})`,
    return: `↩️ Puantaj geri gönderildi: ${cleanPeriod} (${puantajScopeLabel(scope.deptId)})${note ? ` — ${note}` : ''}`,
    lock: `🔒 Puantaj onaylanıp kilitlendi: ${cleanPeriod}`,
  }
  if (actionMessages[action]) {
    notifyPuantajApproval({
      message: actionMessages[action],
      targetRole: 'shift_supervisor',
      period: cleanPeriod,
      deptScope: scope.deptScope,
    })
  }
  return row
}

function assertLeaveAssignmentAllowed(warnings, user, overrideLeave, overrideReason) {
  if (!warnings.length) return
  if (!overrideLeave) {
    throw Object.assign(new Error('Onayli izin gunune vardiya atanamaz. Mudur gerekceyle istisna verebilir.'), {
      statusCode: 409,
      details: { warnings, override_required: true },
    })
  }
  if (user?.role !== 'campus_manager') {
    throw Object.assign(new Error('Izin uzerine vardiya istisnasini sadece mudur verebilir.'), { statusCode: 403 })
  }
  if (String(overrideReason || '').trim().length < 5) {
    throw Object.assign(new Error('Izin istisnasi icin en az 5 karakter gerekce gerekli.'), { statusCode: 400 })
  }
}

export function bulkAssignService(entries, user, options = {}) {
  if (!entries?.length) throw new Error('Atama listesi boş')
  assertPeriodsUnlocked(entries.map(e => e.work_date))
  const warnings = assignmentWarnings(entries)
  assertLeaveAssignmentAllowed(warnings, user, options.overrideLeave, options.overrideReason)
  const rows = bulkAssignShifts(entries, user?.id)
  const approvalsReset = resetDailyApprovalsForDates(entries.map(e => e.work_date), user?.id)
  return {
    ok: true,
    rows,
    warnings,
    approvalsReset,
    leaveOverride: warnings.length > 0 ? {
      approved_by: user?.id,
      reason: String(options.overrideReason || '').trim(),
    } : null,
  }
}

function normalizeClock(value, field) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw Object.assign(new Error(`${field} HH:MM formatinda olmali`), { statusCode: 400 })
  }
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`
}

function clockRanges(start, end) {
  const toMinutes = value => {
    const [hour, minute] = value.split(':').map(Number)
    return hour * 60 + minute
  }
  const startMin = toMinutes(start)
  const endMin = toMinutes(end)
  if (endMin > startMin) return [[startMin, endMin]]
  return [[startMin, 1440], [0, endMin]]
}

function clocksOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return clockRanges(leftStart, leftEnd).some(left => (
    clockRanges(rightStart, rightEnd).some(right => left[0] < right[1] && right[0] < left[1])
  ))
}

function normalizeSegmentInput(data, existing = null) {
  const shiftDefId = data.shift_def_id === undefined ? existing?.shift_def_id : (Number(data.shift_def_id) || null)
  const shiftDef = shiftDefId ? getShiftDefinitions().find(item => Number(item.id) === Number(shiftDefId)) : null
  const startTime = normalizeClock(data.start_time ?? existing?.start_time ?? shiftDef?.start_hour, 'Baslangic saati')
  const endTime = normalizeClock(data.end_time ?? existing?.end_time ?? shiftDef?.end_hour, 'Bitis saati')
  if (startTime === endTime) throw Object.assign(new Error('Vardiya parcasi baslangic ve bitis saati ayni olamaz'), { statusCode: 400 })
  const breakMinutes = Number(data.break_minutes ?? existing?.break_minutes ?? 0)
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 480) {
    throw Object.assign(new Error('Mola 0-480 dakika arasinda olmali'), { statusCode: 400 })
  }
  return {
    shift_def_id: shiftDefId,
    role_id: data.role_id === undefined ? (existing?.role_id || null) : (Number(data.role_id) || null),
    work_location_id: data.work_location_id === undefined ? (existing?.work_location_id || null) : (Number(data.work_location_id) || null),
    start_time: startTime,
    end_time: endTime,
    break_minutes: breakMinutes,
    actual_start: data.actual_start === undefined ? existing?.actual_start : (data.actual_start || null),
    actual_end: data.actual_end === undefined ? existing?.actual_end : (data.actual_end || null),
    note: data.note === undefined ? existing?.note : (String(data.note || '').trim() || null),
    status: data.status || existing?.status || 'planned',
  }
}

function assertNoSegmentOverlap(scheduleId, segment, excludeId = null) {
  const overlap = listScheduleSegments(scheduleId).find(item => (
    item.status !== 'cancelled'
    && Number(item.id) !== Number(excludeId)
    && clocksOverlap(segment.start_time, segment.end_time, item.start_time, item.end_time)
  ))
  if (overlap) {
    throw Object.assign(new Error(`${overlap.start_time}-${overlap.end_time} parcasiyla saat cakismasi var`), {
      statusCode: 409,
      details: { conflicting_segment: overlap },
    })
  }
}

export function scheduleSegmentsService(staffId, workDate) {
  const schedule = getScheduleEntry(staffId, workDate)
  return { schedule, segments: schedule ? listScheduleSegments(schedule.id) : [] }
}

export function createScheduleSegmentService(data, user) {
  if (!data?.staff_id || !data?.work_date) throw new Error('Personel ve tarih gerekli')
  assertPeriodsUnlocked([data.work_date])
  let schedule = getScheduleEntry(data.staff_id, data.work_date)
  const assignment = [{
    staff_id: Number(data.staff_id),
    dept_id: data.dept_id || schedule?.effective_dept_id || null,
    shift_def_id: data.shift_def_id || schedule?.shift_def_id || null,
    work_location_id: data.work_location_id || schedule?.work_location_id || null,
    work_date: data.work_date,
    status: 'scheduled',
  }]
  const warnings = assignmentWarnings(assignment)
  assertLeaveAssignmentAllowed(warnings, user, data.override_leave, data.override_reason)
  if (!schedule || !['scheduled', 'worked', 'overtime'].includes(schedule.status)) {
    bulkAssignShifts(assignment, user?.id)
    schedule = getScheduleEntry(data.staff_id, data.work_date)
  }
  const segment = normalizeSegmentInput(data)
  assertNoSegmentOverlap(schedule.id, segment)
  const row = createScheduleSegment({ ...segment, schedule_id: schedule.id }, user?.id)
  resetDailyApprovalsForDates([data.work_date], user?.id)
  return { row, warnings }
}

export function updateScheduleSegmentService(id, data, user) {
  const existing = getScheduleSegment(id)
  if (!existing) throw Object.assign(new Error('Vardiya parcasi bulunamadi'), { statusCode: 404 })
  assertPeriodsUnlocked([existing.work_date])
  const segment = normalizeSegmentInput(data, existing)
  assertNoSegmentOverlap(existing.schedule_id, segment, id)
  const row = updateScheduleSegment(id, segment)
  resetDailyApprovalsForDates([existing.work_date], user?.id)
  return row
}

export function deleteScheduleSegmentService(id, user) {
  const existing = getScheduleSegment(id)
  if (!existing) throw Object.assign(new Error('Vardiya parcasi bulunamadi'), { statusCode: 404 })
  assertPeriodsUnlocked([existing.work_date])
  deleteScheduleSegment(id)
  resetDailyApprovalsForDates([existing.work_date], user?.id)
}

export function staffStatusService(date, deptId) {
  return getStaffWithShiftStatus(date, deptId)
}

// ── Staff CRUD ──
export function staffListService(filters) {
  const rows = getStaffList(filters)
  if (!['1', 1, true, 'true'].includes(filters?.directory)) return rows
  const metrics = new Map(getStaffDirectoryMetrics(rows.map(row => row.id)).map(row => [Number(row.staff_id), row]))
  return rows.map(row => {
    const summary = metrics.get(Number(row.id)) || {}
    const riskCount = [
      summary.missing_documents,
      summary.expired_documents,
      summary.overdue_followups,
      summary.open_attendance_exceptions,
      summary.expired_certificates,
      summary.open_onboarding,
      summary.open_offboarding,
      !row.department_id ? 1 : 0,
      !row.role_id ? 1 : 0,
      !row.primary_work_location_id ? 1 : 0,
    ].reduce((total, value) => total + (Number(value || 0) > 0 ? 1 : 0), 0)
    const entitlement = computeAnnualEntitlement({ hireDate: summary.hire_date, birthDate: summary.birth_date })
    const annualRemaining = entitlement.has_started
      ? Math.max(0, entitlement.entitled_days - Number(summary.annual_used || 0))
      : 0
    return {
      ...row,
      ...summary,
      risk_count: riskCount,
      equipment_count: Number(summary.active_inventory || 0)
        + Number(summary.active_kkd || 0)
        + Number(summary.active_uniform || 0),
      annual_leave_remaining: annualRemaining,
      annual_leave_entitled: entitlement.entitled_days,
      annual_leave_started: entitlement.has_started,
    }
  })
}

export function staffGetService(id) {
  const staff = getStaffById(id)
  if (!staff) throw new Error('Personel bulunamadı')
  return staff
}

function todayLocal() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function normalizeOptionalId(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('Görev alanlarında geçersiz kimlik')
  return parsed
}

function validateAssignmentDate(value) {
  if (!isIsoDate(value)) throw new Error('Görev başlangıcı geçerli bir YYYY-MM-DD tarihi olmalı')
  return value
}

export function staffCreateService(data, userId) {
  if (!data.full_name) throw new Error('Ad soyad zorunlu')
  const effectiveFrom = validateAssignmentDate(data.assignment_effective_from || data.hire_date || todayLocal())
  const createWithAssignment = getDB().transaction(() => {
    const id = createStaff(data)
    createStaffAssignment({
      staff_id: id,
      department_id: normalizeOptionalId(data.department_id) ?? null,
      role_id: normalizeOptionalId(data.role_id) ?? null,
      work_location_id: normalizeOptionalId(data.primary_work_location_id) ?? null,
      effective_from: effectiveFrom,
      note: data.assignment_note || 'Personel kaydı oluşturuldu',
      created_by: userId,
    })
    return id
  })
  return createWithAssignment()
}

export function staffUpdateService(id, data, userId) {
  const current = getStaffById(id)
  if (!current) throw new Error('Personel bulunamadı')

  const effectiveFrom = validateAssignmentDate(data.assignment_effective_from || todayLocal())
  const departmentId = data.department_id !== undefined ? normalizeOptionalId(data.department_id) : current.department_id
  const roleId = data.role_id !== undefined ? normalizeOptionalId(data.role_id) : current.role_id
  const workLocationId = data.primary_work_location_id !== undefined
    ? normalizeOptionalId(data.primary_work_location_id)
    : current.primary_work_location_id
  const assignmentChanged = Number(departmentId || 0) !== Number(current.department_id || 0)
    || Number(roleId || 0) !== Number(current.role_id || 0)
    || Number(workLocationId || 0) !== Number(current.primary_work_location_id || 0)

  const updateWithAssignment = getDB().transaction(() => {
    const staffPatch = { ...data }
    delete staffPatch.primary_work_location_id
    delete staffPatch.assignment_effective_from
    delete staffPatch.assignment_note
    if (effectiveFrom > todayLocal()) {
      delete staffPatch.department_id
      delete staffPatch.role_id
    }
    updateStaff(id, staffPatch)
    if (assignmentChanged) {
      createStaffAssignment({
        staff_id: Number(id),
        department_id: departmentId,
        role_id: roleId,
        work_location_id: workLocationId,
        effective_from: effectiveFrom,
        note: data.assignment_note || 'Personel görevi güncellendi',
        created_by: userId,
      })
    }
  })
  updateWithAssignment()
}

export function staffAssignmentsService(staffId) {
  if (!getStaffById(staffId)) throw new Error('Personel bulunamadı')
  return getStaffAssignments(staffId)
}

export function createStaffAssignmentService(staffId, data, userId) {
  const current = getStaffById(staffId)
  if (!current) throw new Error('Personel bulunamadı')
  const effectiveFrom = validateAssignmentDate(data.effective_from)
  return createStaffAssignment({
    staff_id: Number(staffId),
    department_id: normalizeOptionalId(data.department_id) ?? null,
    role_id: normalizeOptionalId(data.role_id) ?? null,
    work_location_id: normalizeOptionalId(data.work_location_id) ?? null,
    effective_from: effectiveFrom,
    note: data.note?.trim() || null,
    created_by: userId,
  })
}

function normalizeStaffIds(values) {
  if (!Array.isArray(values)) throw new Error('Personel listesi zorunlu')
  const ids = [...new Set(values.map(Number).filter(value => Number.isInteger(value) && value > 0))]
  if (ids.length === 0) throw new Error('En az bir personel seçilmeli')
  if (ids.length > 200) throw new Error('Tek işlemde en fazla 200 personel güncellenebilir')
  return ids
}

export function bulkStaffAssignmentService(data, userId) {
  const staffIds = normalizeStaffIds(data.staff_ids)
  const hasDepartment = Object.prototype.hasOwnProperty.call(data, 'department_id')
  const hasLocation = Object.prototype.hasOwnProperty.call(data, 'work_location_id')
  if (!hasDepartment && !hasLocation) throw new Error('Departman veya çalışma lokasyonu seçilmeli')
  const effectiveFrom = validateAssignmentDate(data.effective_from || todayLocal())
  const departmentId = hasDepartment ? normalizeOptionalId(data.department_id) : undefined
  const workLocationId = hasLocation ? normalizeOptionalId(data.work_location_id) : undefined

  const save = getDB().transaction(() => staffIds.map(staffId => {
    const current = getStaffById(staffId)
    if (!current) throw new Error(`Personel bulunamadı: ${staffId}`)
    createStaffAssignment({
      staff_id: staffId,
      department_id: hasDepartment ? departmentId : current.department_id,
      role_id: current.role_id,
      work_location_id: hasLocation ? workLocationId : current.primary_work_location_id,
      effective_from: effectiveFrom,
      note: data.note?.trim() || 'Toplu personel ataması',
      created_by: userId,
    })
    return staffId
  }))
  return { updated: save(), effective_from: effectiveFrom }
}

export function bulkStaffDeactivateService(data) {
  const staffIds = normalizeStaffIds(data.staff_ids)
  const save = getDB().transaction(() => {
    for (const staffId of staffIds) {
      if (!getStaffById(staffId)) throw new Error(`Personel bulunamadı: ${staffId}`)
      deleteStaff(staffId)
    }
    return staffIds
  })
  return { updated: save() }
}

export function staffDataQualityService() {
  const issueCounts = {}
  const staffRows = getStaffDataQualityRows()
  const rows = staffRows.map(staff => {
    const issues = []
    const add = (code, label, severity = 'warning') => {
      issues.push({ code, label, severity })
      issueCounts[code] = (issueCounts[code] || 0) + 1
    }

    if (staff.is_active) {
      if (!staff.department_id) add('missing_department', 'Departman tanımlı değil', 'critical')
      if (!staff.role_id) add('missing_role', 'Rol tanımlı değil')
      if (!staff.primary_work_location_id || staff.primary_work_location_active === 0) {
        add('missing_work_location', 'Aktif ana çalışma noktası tanımlı değil')
      }
      if (!Number(staff.salary || 0)) add('missing_salary', 'Maaş bilgisi eksik')
      if (!String(staff.iban || '').trim()) add('missing_iban', 'IBAN bilgisi eksik')
      if (staff.expected_dept_id && Number(staff.expected_dept_id) !== Number(staff.department_id)) {
        add('role_department_mismatch', `${staff.role_name} rolü ${staff.expected_dept_name} departmanına bağlı`, 'critical')
      }
      if (staff.primary_work_location_dept_id && Number(staff.primary_work_location_dept_id) !== Number(staff.department_id)) {
        add('location_department_mismatch', 'Ana çalışma noktası farklı departmana bağlı', 'critical')
      }
    } else if (staff.future_schedule_count > 0) {
      add('inactive_with_schedule', `${staff.future_schedule_count} gelecek vardiyası olan pasif personel`, 'critical')
    }
    return { ...staff, issues }
  }).filter(staff => staff.issues.length > 0)

  return {
    summary: {
      checked_staff: staffRows.length,
      staff_with_issues: rows.length,
      issue_total: rows.reduce((sum, staff) => sum + staff.issues.length, 0),
      by_code: issueCounts,
    },
    rows,
  }
}

export function staffDeleteService(id) {
  deleteStaff(id)
}

export function searchStaffService(term) {
  return searchStaff(term || '')
}

// ── Leave ──
function requestDateRange(startDate, endDate) {
  const dates = []
  for (let date = startDate; date <= endDate; date = addIsoDays(date, 1)) dates.push(date)
  return dates
}

function puantajCodeForLeaveType(leaveType) {
  return listPuantajCodes({ includeInactive: true }).find(code => code.status === 'on_leave' && code.leave_type === leaveType)
}

export function createLeaveService(data, userId) {
  if (!data.staff_id || !data.leave_type || !data.start_date || !data.end_date)
    throw new Error('Zorunlu alanlar eksik')
  const start = new Date(data.start_date)
  const end = new Date(data.end_date)
  if (end < start) throw new Error('Bitiş tarihi başlangıçtan önce olamaz')
  const totalDays = Math.round((end - start) / 86400000) + 1
  const leaveHours = data.leave_hours == null || data.leave_hours === '' ? null : Number(data.leave_hours)
  if (leaveHours != null && (!Number.isFinite(leaveHours) || leaveHours <= 0 || leaveHours > 8)) {
    throw Object.assign(new Error('Saatlik izin 0-8 saat arasinda olmali'), { statusCode: 400 })
  }
  if (leaveHours != null && totalDays !== 1) {
    throw Object.assign(new Error('Saatlik izin yalniz tek gun icin girilebilir'), { statusCode: 400 })
  }
  // reason opsiyonel — named parameter eksikse better-sqlite3 hata verir
  return createLeaveRequest({
    ...data,
    leave_hours: leaveHours,
    reason: data.reason?.trim() || null,
    requested_by: userId || null,
    total_days: totalDays,
  })
}

export function approveLeaveService(id, user, status, options = {}) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Geçersiz durum')
  const request = getLeaveRequest(id)
  if (!request) throw Object.assign(new Error('Izin talebi bulunamadi'), { statusCode: 404 })
  if (status === 'approved') {
    assertPeriodsUnlocked(requestDateRange(request.start_date, request.end_date))
    const code = puantajCodeForLeaveType(request.leave_type)
    const documents = listRequestDocuments({ leaveRequestId: request.id })
    if (code?.requires_document && documents.length === 0) {
      throw Object.assign(new Error(`${code.label} onayi icin belge zorunlu`), {
        statusCode: 409,
        details: { document_required: true, code: code.code },
      })
    }
    if (code?.requires_reason && String(request.reason || '').trim().length < 3) {
      throw Object.assign(new Error(`${code.label} onayi icin gerekce zorunlu`), { statusCode: 409 })
    }
  }
  const row = approveLeaveRequest(id, user?.id, status, {
    note: options.review_note,
    expectedVersion: options.expected_version,
  })
  resetDailyApprovalsForDates(requestDateRange(request.start_date, request.end_date), user?.id)
  // AVS kioska push (personel telefonda abone olduysa) — opsiyonel, ana akışı bozma
  try {
    const r = getDB().prepare('SELECT staff_id FROM leave_requests WHERE id=?').get(id)
    if (r?.staff_id) {
      sendPushToWorker(r.staff_id, {
        title: status === 'approved' ? 'İzniniz onaylandı' : 'İzniniz reddedildi',
        body: status === 'approved' ? 'İzin talebiniz onaylandı.' : 'İzin talebiniz reddedildi.',
        tag: 'leave',
        url: '/avs-kiosk',
      }).catch(() => {})
    }
  } catch { /* push opsiyonel */ }
  return row
}

export function leaveListService(filters) {
  return getLeaveRequests(filters)
}

export function leaveBalanceService(staffId) {
  const year = new Date().getFullYear()
  return getLeaveBalance(staffId, year)
}

function uploadedDocumentRows(files = []) {
  return files.map(file => ({
    file_url: `/uploads/${file.filename}`,
    file_name: file.originalname,
    mime_type: file.mimetype,
    file_size: file.size || null,
  }))
}

export function requestDocumentsService(type, id) {
  if (type === 'leave') return listRequestDocuments({ leaveRequestId: Number(id) })
  if (type === 'overtime') return listRequestDocuments({ overtimeRequestId: Number(id) })
  if (type === 'schedule') return listRequestDocuments({ scheduleId: Number(id) })
  throw Object.assign(new Error('Gecersiz belge turu'), { statusCode: 400 })
}

export function addRequestDocumentsService(type, id, files, userId) {
  if (!files?.length) throw Object.assign(new Error('En az bir belge secilmeli'), { statusCode: 400 })
  const target = {
    leaveRequestId: type === 'leave' ? Number(id) : null,
    overtimeRequestId: type === 'overtime' ? Number(id) : null,
    scheduleId: type === 'schedule' ? Number(id) : null,
  }
  if (!Object.values(target).some(Boolean)) throw Object.assign(new Error('Gecersiz belge turu'), { statusCode: 400 })
  if (type === 'leave' && !getLeaveRequest(id)) throw Object.assign(new Error('Izin talebi bulunamadi'), { statusCode: 404 })
  if (type === 'overtime' && !getOvertimeRequest(id)) throw Object.assign(new Error('Mesai talebi bulunamadi'), { statusCode: 404 })
  addRequestDocuments({ ...target, files: uploadedDocumentRows(files), uploadedBy: userId })
  return requestDocumentsService(type, id)
}

export function deleteRequestDocumentService(id) {
  const document = getRequestDocument(id)
  if (!document) throw Object.assign(new Error('Belge bulunamadi'), { statusCode: 404 })
  deleteRequestDocument(id)
  return document
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

function optionalClock(value, field) {
  return value ? normalizeClock(value, field) : null
}

export function createOvertimeRequestService(data, user = {}) {
  return createOvertimeRequest(normalizeOvertimeRequestInput(data, user))
}

function normalizeOvertimeRequestInput(data, user = {}) {
  const staffId = Number(data.staff_id)
  const workDate = String(data.work_date || '')
  const requestedHours = Number(data.requested_hours ?? data.hours)
  const actualHours = data.actual_hours == null || data.actual_hours === '' ? null : Number(data.actual_hours)
  const reason = String(data.reason || '').trim()
  if (!staffId || !isIsoDate(workDate)) {
    throw Object.assign(new Error('Personel ve tarih zorunlu'), { statusCode: 400 })
  }
  if (!Number.isFinite(requestedHours) || requestedHours <= 0 || requestedHours > 12) {
    throw Object.assign(new Error('Mesai saati 0-12 arasinda olmali'), { statusCode: 400 })
  }
  if (actualHours != null && (!Number.isFinite(actualHours) || actualHours < 0 || actualHours > 12)) {
    throw Object.assign(new Error('Gerceklesen mesai 0-12 saat arasinda olmali'), { statusCode: 400 })
  }
  if (reason.length < 3) throw Object.assign(new Error('Mesai gerekcesi zorunlu'), { statusCode: 400 })
  if (!!data.planned_start !== !!data.planned_end) {
    throw Object.assign(new Error('Planlanan baslangic ve bitis birlikte girilmeli'), { statusCode: 400 })
  }
  if (!!data.actual_start !== !!data.actual_end) {
    throw Object.assign(new Error('Gerceklesen baslangic ve bitis birlikte girilmeli'), { statusCode: 400 })
  }
  const compensationType = data.compensation_type || 'pay'
  if (!['pay', 'time_off'].includes(compensationType)) throw Object.assign(new Error('Gecersiz mesai karsiligi'), { statusCode: 400 })
  assertPeriodsUnlocked([workDate])
  return {
    staff_id: staffId,
    work_date: workDate,
    planned_start: optionalClock(data.planned_start, 'Planlanan baslangic'),
    planned_end: optionalClock(data.planned_end, 'Planlanan bitis'),
    actual_start: optionalClock(data.actual_start, 'Gerceklesen baslangic'),
    actual_end: optionalClock(data.actual_end, 'Gerceklesen bitis'),
    requested_hours: requestedHours,
    actual_hours: actualHours,
    reason,
    compensation_type: compensationType,
    requested_by: user.id || null,
  }
}

function attendanceClock(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function createOvertimeRequestFromAttendanceExceptionService(id, data = {}, user = {}) {
  const exception = getAttendanceException(id)
  if (!exception) throw Object.assign(new Error('Istisna kaydi bulunamadi'), { statusCode: 404 })
  if (exception.exception_type !== 'overtime_candidate') {
    throw Object.assign(new Error('Yalnizca mesai adayi kaydi talebe donusturulebilir'), { statusCode: 400 })
  }
  if (exception.status !== 'open' || exception.overtime_request_id) {
    throw Object.assign(new Error('Mesai adayi daha once islenmis'), { statusCode: 409 })
  }

  const candidateMinutes = Number(exception.overtime_candidate_minutes || 0)
  if (!exception.staff_id || candidateMinutes <= 0) {
    throw Object.assign(new Error('Mesai adayinin personel veya sure bilgisi eksik'), { statusCode: 400 })
  }
  const candidateHours = round2(candidateMinutes / 60)
  const actualStart = attendanceClock(exception.planned_end)
  const actualEnd = attendanceClock(exception.actual_check_out)
  const requestData = normalizeOvertimeRequestInput({
    ...data,
    staff_id: exception.staff_id,
    work_date: exception.work_date,
    requested_hours: data.requested_hours ?? candidateHours,
    actual_hours: data.actual_hours ?? data.requested_hours ?? candidateHours,
    actual_start: data.actual_start ?? actualStart,
    actual_end: data.actual_end ?? actualEnd,
    reason: data.reason || `Kart uzlastirma: ${candidateMinutes} dakika fazla calisma`,
  }, user)

  return createOvertimeRequestFromAttendanceException(Number(id), requestData, user.id)
}

export function overtimeRequestsService(filters) {
  return getOvertimeRequests(filters)
}

export function reviewOvertimeRequestService(id, data, user = {}) {
  const request = getOvertimeRequest(id)
  if (!request) throw Object.assign(new Error('Mesai talebi bulunamadi'), { statusCode: 404 })
  const status = data.status
  if (!['approved', 'rejected', 'returned'].includes(status)) {
    throw Object.assign(new Error('Gecersiz mesai talep durumu'), { statusCode: 400 })
  }
  if (['rejected', 'returned'].includes(status) && String(data.review_note || '').trim().length < 3) {
    throw Object.assign(new Error('Iade veya ret gerekcesi zorunlu'), { statusCode: 400 })
  }
  const actualHours = data.actual_hours == null || data.actual_hours === ''
    ? (request.actual_hours ?? request.requested_hours)
    : Number(data.actual_hours)
  if (!Number.isFinite(actualHours) || actualHours < 0 || actualHours > 12) {
    throw Object.assign(new Error('Gerceklesen mesai 0-12 saat arasinda olmali'), { statusCode: 400 })
  }
  assertPeriodsUnlocked([request.work_date])
  const row = reviewOvertimeRequest(id, {
    ...data,
    status,
    actual_hours: actualHours,
    actual_start: optionalClock(data.actual_start, 'Gerceklesen baslangic'),
    actual_end: optionalClock(data.actual_end, 'Gerceklesen bitis'),
    review_note: String(data.review_note || '').trim() || null,
  }, user.id)
  resetDailyApprovalsForDates([request.work_date], user.id)
  return row
}

// Faz 28 — puantaj hücresinden gün bazlı FM girişi (0 = kaydı sil)
export function overtimeDayService(data, userId) {
  if (!data?.staff_id || !data?.work_date) throw new Error('staff_id ve work_date gerekli')
  if (!isIsoDate(data.work_date)) throw new Error('work_date YYYY-MM-DD formatında olmalı')
  const hours = Number(data.hours)
  if (!Number.isFinite(hours) || hours < 0 || hours > 12) throw new Error('Mesai saati 0-12 arasında olmalı')
  assertPeriodsUnlocked([data.work_date])
  upsertOvertimeDay(data.staff_id, data.work_date, hours, userId)
  resetDailyApprovalsForDates([data.work_date], userId)
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

const ATTENDANCE_TOLERANCE_MINUTES = 15
const ATTENDANCE_OVERTIME_MINUTES = 30
const ATTENDANCE_MAX_RANGE_DAYS = 31

function turkeyDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

function turkeyWorkDate(value = new Date()) {
  const parts = turkeyDateParts(value)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function addIsoDays(date, days) {
  const parsed = new Date(`${date}T12:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function validateAttendanceDate(value, field = 'date') {
  if (!isIsoDate(value)) {
    throw Object.assign(new Error(`${field} YYYY-MM-DD formatında olmalı`), { statusCode: 400 })
  }
  const parsed = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw Object.assign(new Error(`${field} geçerli bir tarih olmalı`), { statusCode: 400 })
  }
  return value
}

function normalizeAttendanceTimestamp(value) {
  const parsed = value ? new Date(value) : new Date()
  if (Number.isNaN(parsed.getTime())) {
    throw Object.assign(new Error('occurred_at geçerli bir tarih-saat olmalı'), { statusCode: 400 })
  }
  if (parsed.getTime() > Date.now() + 5 * 60 * 1000) {
    throw Object.assign(new Error('Gelecek zamanlı okutma kabul edilmez'), { statusCode: 400 })
  }
  return parsed.toISOString()
}

function attendanceEventKey(data) {
  if (data.external_event_id) return `${data.source}:${String(data.external_event_id).trim()}`
  return createHash('sha256').update(JSON.stringify([
    data.source, data.device_id || '', data.staff_id || 0, data.card_id || 0,
    data.event_type, data.occurred_at,
  ])).digest('hex')
}

export function attendanceEventService(data = {}) {
  const eventType = data.event_type === 'entry' ? 'check_in'
    : data.event_type === 'exit' ? 'check_out'
      : data.event_type
  if (!['check_in', 'check_out', 'scan'].includes(eventType)) {
    throw Object.assign(new Error('event_type check_in, check_out veya scan olmalı'), { statusCode: 400 })
  }
  const occurredAt = normalizeAttendanceTimestamp(data.occurred_at)
  const source = String(data.source || 'kiosk').trim().slice(0, 50) || 'kiosk'
  const deviceId = String(data.device_id || '').trim().slice(0, 100) || null
  const identity = findAttendanceIdentity({
    staffId: data.staff_id ? Number(data.staff_id) : null,
    cardId: data.card_id ? Number(data.card_id) : null,
    cardCode: data.card_code?.trim(),
    nfcUid: data.nfc_uid?.trim(),
  })
  const rawPayload = data.raw_payload == null
    ? null
    : JSON.stringify(data.raw_payload).slice(0, 20000)
  const event = {
    external_event_id: data.external_event_id == null ? null : String(data.external_event_id).trim().slice(0, 200),
    staff_id: identity?.staff_id || null,
    card_id: identity?.card_id || (data.card_id ? Number(data.card_id) : null),
    event_type: eventType,
    occurred_at: occurredAt,
    work_date: turkeyWorkDate(occurredAt),
    source,
    device_id: deviceId,
    match_status: identity ? 'matched' : 'unmatched',
    match_detail: identity ? `matched_via:${identity.matched_via}` : 'Personel veya aktif erişim kartı eşleşmedi',
    raw_payload: rawPayload,
  }
  event.event_key = attendanceEventKey(event)
  const saved = insertAttendanceEvent(event)
  if (!identity) {
    upsertAttendanceException({
      staff_id: null,
      work_date: event.work_date,
      shift_schedule_id: null,
      reconciliation_id: null,
      source_event_id: saved.id,
      exception_type: 'unmatched_event',
      severity: 'critical',
      message: 'Okutma personel veya aktif kartla eşleşmedi',
      details_json: JSON.stringify({ source, device_id: deviceId, event_id: saved.id }),
    })
  }
  return saved
}

export function attendanceEventsService(filters = {}) {
  if (filters.from) validateAttendanceDate(filters.from, 'from')
  if (filters.to) validateAttendanceDate(filters.to, 'to')
  return listAttendanceEvents(filters)
}

function importStationAttendanceEvents(from, to) {
  let inserted = 0
  const rows = listStationAttendanceSourceEvents(from, to)
  rows.forEach(row => {
    const occurredAt = new Date(`${String(row.scanned_at).replace(' ', 'T')}Z`).toISOString()
    const workDate = turkeyWorkDate(occurredAt)
    if (workDate < from || workDate > to) return
    const event = attendanceEventService({
      external_event_id: row.id,
      staff_id: row.staff_id,
      card_id: row.card_id,
      event_type: row.event_type,
      occurred_at: occurredAt,
      source: 'access_station',
      device_id: row.station_id ? `station:${row.station_id}` : 'station:unknown',
      raw_payload: {
        access_event_id: row.id,
        station_name: row.station_name,
        station_type: row.station_type,
        location: row.location,
        raw_uid: row.raw_uid,
      },
    })
    if (event.inserted) inserted += 1
  })
  return inserted
}

function plannedAttendanceWindow(workDate, startHour, endHour) {
  const start = new Date(`${workDate}T${String(startHour).padStart(2, '0')}:00:00+03:00`)
  let endDate = workDate
  if (Number(endHour) <= Number(startHour)) endDate = addIsoDays(workDate, 1)
  const end = new Date(`${endDate}T${String(endHour).padStart(2, '0')}:00:00+03:00`)
  return { start, end }
}

function minutesBetween(later, earlier) {
  return Math.round((later.getTime() - earlier.getTime()) / 60000)
}

function attendanceException(type, message, severity = 'warning', details = {}) {
  return { type, message, severity, details }
}

function reconcileAttendanceDecision(context) {
  const { schedule, leave, periodLock, dailyApproval, events, latestReconciliation } = context
  const latestWasAutomatic = schedule?.status === 'worked'
    && latestReconciliation?.new_status === 'worked'
    && latestReconciliation?.result_status === 'matched'
  const oldStatus = latestWasAutomatic ? (latestReconciliation.old_status || 'scheduled') : (schedule?.status || null)
  const base = {
    oldStatus,
    newStatus: schedule?.status || null,
    resultStatus: 'skipped',
    reasonCode: null,
    checkInEvent: null,
    checkOutEvent: null,
    plannedStart: null,
    plannedEnd: null,
    actualCheckIn: null,
    actualCheckOut: null,
    workedMinutes: null,
    overtimeCandidateMinutes: 0,
    shouldMarkWorked: false,
    exceptions: [],
  }

  if (periodLock) return { ...base, reasonCode: 'period_locked' }
  if (leave || schedule?.status === 'on_leave') return { ...base, reasonCode: 'approved_leave' }
  if (dailyApproval) return { ...base, reasonCode: 'approved_day' }
  if (!schedule) {
    if (!events.length) return { ...base, reasonCode: 'no_schedule' }
    return {
      ...base,
      resultStatus: 'unplanned',
      reasonCode: 'unplanned_attendance',
      exceptions: [attendanceException('unplanned_attendance', 'Planlı vardiya olmadan kart hareketi var', 'critical', { event_ids: events.map(e => e.id) })],
    }
  }
  if (!['scheduled', 'worked'].includes(schedule.status) || (schedule.status === 'worked' && !latestWasAutomatic)) {
    return { ...base, reasonCode: 'manual_final_status' }
  }
  if (!events.length) {
    return {
      ...base,
      resultStatus: 'no_events',
      reasonCode: 'missing_scan',
      exceptions: [attendanceException('missing_scan', 'Planlı vardiya için kart okutması bulunamadı', 'critical')],
    }
  }
  if (events.length === 1) {
    return {
      ...base,
      resultStatus: 'exception',
      reasonCode: 'single_scan',
      exceptions: [attendanceException('single_scan', 'Yalnızca bir kart okutması var', 'critical', { event_id: events[0].id })],
    }
  }
  if (schedule.start_hour == null || schedule.end_hour == null) {
    return {
      ...base,
      resultStatus: 'exception',
      reasonCode: 'missing_shift_definition',
      exceptions: [attendanceException('missing_shift_definition', 'Planlı vardiyanın saat tanımı bulunamadı', 'critical')],
    }
  }

  const checkInEvent = events.find(event => ['check_in', 'scan'].includes(event.event_type))
  const checkOutEvent = [...events].reverse().find(event => (
    ['check_out', 'scan'].includes(event.event_type)
    && (!checkInEvent || new Date(event.occurred_at) > new Date(checkInEvent.occurred_at))
  ))
  if (!checkInEvent || !checkOutEvent) {
    return {
      ...base,
      resultStatus: 'exception',
      reasonCode: 'invalid_sequence',
      exceptions: [attendanceException('invalid_sequence', 'Giriş-çıkış okutma sırası eşleştirilemedi', 'critical', { event_ids: events.map(e => e.id) })],
    }
  }

  const actualIn = new Date(checkInEvent.occurred_at)
  const actualOut = new Date(checkOutEvent.occurred_at)
  const planned = plannedAttendanceWindow(schedule.work_date, schedule.start_hour, schedule.end_hour)
  const workedMinutes = minutesBetween(actualOut, actualIn)
  const lateMinutes = minutesBetween(actualIn, planned.start)
  const earlyMinutes = minutesBetween(planned.end, actualOut)
  const overtimeMinutes = Math.max(0, minutesBetween(actualOut, planned.end))
  const exceptions = []

  if (actualIn < new Date(planned.start.getTime() - 2 * 60 * 60000)
    || actualOut > new Date(planned.end.getTime() + 8 * 60 * 60000)) {
    exceptions.push(attendanceException('outside_shift', 'Vardiya saatlerinin çok dışında kart hareketi var', 'critical', { late_minutes: lateMinutes, overtime_minutes: overtimeMinutes }))
  } else {
    if (lateMinutes > ATTENDANCE_TOLERANCE_MINUTES) {
      exceptions.push(attendanceException('late_arrival', `${lateMinutes} dakika geç giriş`, 'warning', { late_minutes: lateMinutes }))
    }
    if (earlyMinutes > ATTENDANCE_TOLERANCE_MINUTES) {
      exceptions.push(attendanceException('early_departure', `${earlyMinutes} dakika erken çıkış`, 'warning', { early_minutes: earlyMinutes }))
    }
  }

  const blockingException = exceptions.some(item => item.type !== 'overtime_candidate')
  if (!blockingException && overtimeMinutes > ATTENDANCE_OVERTIME_MINUTES) {
    exceptions.push(attendanceException('overtime_candidate', `${overtimeMinutes} dakika mesai adayı`, 'info', { overtime_minutes: overtimeMinutes }))
  }
  return {
    ...base,
    newStatus: blockingException ? schedule.status : 'worked',
    resultStatus: blockingException ? 'exception' : 'matched',
    reasonCode: blockingException ? exceptions[0].type : (overtimeMinutes > ATTENDANCE_OVERTIME_MINUTES ? 'overtime_candidate' : 'matched'),
    checkInEvent,
    checkOutEvent,
    plannedStart: planned.start.toISOString(),
    plannedEnd: planned.end.toISOString(),
    actualCheckIn: actualIn.toISOString(),
    actualCheckOut: actualOut.toISOString(),
    workedMinutes,
    overtimeCandidateMinutes: overtimeMinutes > ATTENDANCE_OVERTIME_MINUTES ? overtimeMinutes : 0,
    shouldMarkWorked: !blockingException && schedule.status === 'scheduled',
    exceptions,
  }
}

function reconciliationFingerprint(staffId, workDate, context, decision) {
  return createHash('sha256').update(JSON.stringify({
    staffId,
    workDate,
    scheduleId: context.schedule?.id || null,
    oldStatus: decision.oldStatus,
    eventIds: context.events.map(event => event.id),
    leaveId: context.leave?.id || null,
    lock: Boolean(context.periodLock),
    approvalId: context.dailyApproval?.id || null,
  })).digest('hex')
}

function reconcileAttendanceDayForStaff(staffId, workDate, userId, runSource) {
  const db = getDB()
  return db.transaction(() => {
    const context = getAttendanceReconciliationContext(staffId, workDate)
    if (!context.staff) return { staff_id: staffId, work_date: workDate, skipped: true, reason_code: 'staff_not_found' }
    const decision = reconcileAttendanceDecision(context)
    const fingerprint = reconciliationFingerprint(staffId, workDate, context, decision)
    const existing = findAttendanceReconciliation(fingerprint)
    if (existing) return { ...existing, idempotent: true }

    if (decision.shouldMarkWorked) {
      markScheduleWorkedFromAttendance(context.schedule.id)
      resetDailyApprovalsForDates([workDate], userId)
    }
    const reconciliationId = insertAttendanceReconciliation({
      fingerprint,
      staff_id: staffId,
      work_date: workDate,
      shift_schedule_id: context.schedule?.id || null,
      check_in_event_id: decision.checkInEvent?.id || null,
      check_out_event_id: decision.checkOutEvent?.id || null,
      source_event_ids: JSON.stringify(context.events.map(event => event.id)),
      old_status: decision.oldStatus,
      new_status: decision.newStatus,
      result_status: decision.resultStatus,
      reason_code: decision.reasonCode,
      planned_start: decision.plannedStart,
      planned_end: decision.plannedEnd,
      actual_check_in: decision.actualCheckIn,
      actual_check_out: decision.actualCheckOut,
      worked_minutes: decision.workedMinutes,
      overtime_candidate_minutes: decision.overtimeCandidateMinutes,
      run_source: runSource,
      reconciled_by: userId || null,
    })
    const activeTypes = decision.exceptions.map(item => item.type)
    if (!['period_locked', 'approved_day'].includes(decision.reasonCode)) {
      resolveStaleAttendanceExceptions({ staffId, workDate, activeTypes, userId })
    }
    decision.exceptions.forEach(item => upsertAttendanceException({
      staff_id: staffId,
      work_date: workDate,
      shift_schedule_id: context.schedule?.id || null,
      reconciliation_id: reconciliationId,
      source_event_id: item.details.event_id || null,
      exception_type: item.type,
      severity: item.severity,
      message: item.message,
      details_json: JSON.stringify(item.details),
    }))
    return {
      id: reconciliationId,
      staff_id: staffId,
      work_date: workDate,
      result_status: decision.resultStatus,
      reason_code: decision.reasonCode,
      old_status: decision.oldStatus,
      new_status: decision.newStatus,
      exception_count: decision.exceptions.length,
      overtime_candidate_minutes: decision.overtimeCandidateMinutes,
      idempotent: false,
    }
  })()
}

export function reconcileAttendanceService(data = {}, userId = null, runSource = 'manual') {
  const from = validateAttendanceDate(data.date || data.from || turkeyWorkDate(), data.date ? 'date' : 'from')
  const to = validateAttendanceDate(data.date || data.to || from, data.date ? 'date' : 'to')
  if (to < from) throw Object.assign(new Error('to, from tarihinden önce olamaz'), { statusCode: 400 })
  const dates = []
  for (let date = from; date <= to; date = addIsoDays(date, 1)) {
    dates.push(date)
    if (dates.length > ATTENDANCE_MAX_RANGE_DAYS) {
      throw Object.assign(new Error(`Tek seferde en fazla ${ATTENDANCE_MAX_RANGE_DAYS} gün uzlaştırılabilir`), { statusCode: 400 })
    }
  }
  const staffId = data.staff_id ? Number(data.staff_id) : null
  if (data.staff_id && (!Number.isInteger(staffId) || staffId <= 0)) {
    throw Object.assign(new Error('staff_id sayısal olmalı'), { statusCode: 400 })
  }
  const importedEvents = importStationAttendanceEvents(from, to)
  const today = turkeyWorkDate()
  const results = []
  let notDue = 0
  dates.forEach(workDate => {
    if (workDate > today) { notDue += 1; return }
    const candidateIds = getAttendanceCandidateStaffIds(workDate, staffId)
    candidateIds.forEach(candidateId => {
      results.push(reconcileAttendanceDayForStaff(candidateId, workDate, userId, runSource))
    })
  })
  return {
    from,
    to,
    imported_events: importedEvents,
    processed: results.length,
    changed: results.filter(row => !row.idempotent && row.old_status !== row.new_status).length,
    matched: results.filter(row => row.result_status === 'matched').length,
    exceptions: results.filter(row => ['exception', 'no_events', 'unplanned'].includes(row.result_status)).length,
    skipped: results.filter(row => row.result_status === 'skipped').length,
    idempotent: results.filter(row => row.idempotent).length,
    not_due_days: notDue,
    results,
  }
}

export function attendanceExceptionsService(filters = {}) {
  if (filters.from) validateAttendanceDate(filters.from, 'from')
  if (filters.to) validateAttendanceDate(filters.to, 'to')
  const rows = listAttendanceExceptions({ ...filters, status: filters.status || 'open' })
  return {
    rows,
    summary: rows.reduce((acc, row) => {
      acc.total += 1
      acc.by_type[row.exception_type] = (acc.by_type[row.exception_type] || 0) + 1
      acc.by_severity[row.severity] = (acc.by_severity[row.severity] || 0) + 1
      return acc
    }, { total: 0, by_type: {}, by_severity: {} }),
  }
}

export function updateAttendanceExceptionService(id, data, userId) {
  const existing = getAttendanceException(id)
  if (!existing) throw Object.assign(new Error('İstisna kaydı bulunamadı'), { statusCode: 404 })
  if (!['resolved', 'ignored'].includes(data.status)) {
    throw Object.assign(new Error('status resolved veya ignored olmalı'), { statusCode: 400 })
  }
  if (data.status === 'ignored' && !String(data.note || '').trim()) {
    throw Object.assign(new Error('Yoksayma işlemi için açıklama zorunlu'), { statusCode: 400 })
  }
  return updateAttendanceExceptionStatus(id, data.status, String(data.note || '').trim() || null, userId)
}

export function checkInService(data) {
  const id = createAttendanceLog(data)
  const event = attendanceEventService({
    external_event_id: `attendance-log:${id}:in`,
    staff_id: data.staff_id,
    event_type: 'check_in',
    occurred_at: new Date().toISOString(),
    source: data.source || 'legacy_attendance',
    device_id: data.device_id || null,
    raw_payload: { attendance_log_id: id, shift_schedule_id: data.shift_schedule_id || null },
  })
  return { id, event_id: event.id }
}

export function checkOutService(logId, data = {}, userId = null) {
  const log = updateCheckout(logId)
  const event = attendanceEventService({
    external_event_id: `attendance-log:${logId}:out`,
    staff_id: log.staff_id,
    event_type: 'check_out',
    occurred_at: new Date().toISOString(),
    source: data.source || 'legacy_attendance',
    device_id: data.device_id || null,
    raw_payload: { attendance_log_id: Number(logId), shift_schedule_id: log.shift_schedule_id || null },
  })
  const reconciliation = reconcileAttendanceService({ date: event.work_date, staff_id: log.staff_id }, userId, 'event')
  return { event_id: event.id, reconciliation }
}

export function attendanceListService(filters) {
  return getAttendanceLogs(filters)
}

export function statisticsService(date) {
  return getShiftStatistics(date)
}

function operationAttendanceState(row, selectedDate, asOfDate) {
  if (row.status === 'on_leave') return 'on_leave'
  if (row.status === 'off') return 'off'
  if (row.status === 'absent') return 'absent'
  if (row.status === 'worked' || row.status === 'overtime') return 'worked'
  if (selectedDate > asOfDate) return 'not_due'
  if (Number(row.open_exception_count || 0) > 0) return 'review'
  if (row.reconciliation_status === 'matched') return 'matched'
  if (Number(row.event_count || 0) === 0) return 'pending_scan'
  return 'scanned'
}

function operationConsecutiveRisks(rows, asOfDate, limit = 6) {
  const byStaff = new Map()
  rows.filter(row => row.work_date <= asOfDate).forEach(row => {
    if (!byStaff.has(row.staff_id)) byStaff.set(row.staff_id, [])
    byStaff.get(row.staff_id).push(row)
  })
  const risks = []
  byStaff.forEach(staffRows => {
    let current = 0
    let maximum = 0
    let currentStart = null
    let maximumStart = null
    let maximumEnd = null
    let previousDate = null
    staffRows.forEach(row => {
      const currentTime = new Date(`${row.work_date}T12:00:00Z`).getTime()
      const previousTime = previousDate ? new Date(`${previousDate}T12:00:00Z`).getTime() : null
      const adjacent = previousTime != null && currentTime - previousTime === 86400000
      if (!adjacent) {
        current = 0
        currentStart = row.work_date
      }
      current += 1
      if (current > maximum) {
        maximum = current
        maximumStart = currentStart
        maximumEnd = row.work_date
      }
      previousDate = row.work_date
    })
    if (maximum > limit) {
      const first = staffRows[0]
      risks.push({
        type: 'consecutive_work',
        severity: maximum >= 10 ? 'critical' : 'warning',
        staff_id: first.staff_id,
        full_name: first.full_name,
        dept_name: first.dept_name,
        value: maximum,
        start_date: maximumStart,
        end_date: maximumEnd,
        message: `${maximum} gun araliksiz calisma`,
      })
    }
  })
  return risks.sort((a, b) => b.value - a.value)
}

function operationDutyManagers(roster) {
  const managementTerms = ['amir', 'sorumlu', 'mudur', 'müdür', 'sef', 'şef', 'supervisor']
  return roster.filter(row => {
    const title = `${row.role_name || ''} ${row.position || ''}`.toLocaleLowerCase('tr-TR')
    return managementTerms.some(term => title.includes(term))
  }).map(row => ({
    staff_id: row.staff_id,
    full_name: row.full_name,
    role_name: row.role_name,
    dept_name: row.dept_name,
    shift_name: row.shift_name,
    start_hour: row.start_hour,
    end_hour: row.end_hour,
  }))
}

function operationActionQueue({
  roster, unassignedStaff, unplannedEvents, coverageRows, dailyExceptions,
  pendingLeaves, pendingOvertime, selectedDate, asOfDate,
}) {
  const actions = []
  const exceptionKeys = new Set()
  dailyExceptions.forEach(row => {
    exceptionKeys.add(`${row.staff_id || 0}:${row.exception_type}`)
    actions.push({
      key: `exception:${row.id}`,
      category: 'card',
      type: row.exception_type,
      severity: row.severity || 'warning',
      staff_id: row.staff_id || null,
      full_name: row.full_name || null,
      dept_name: row.dept_name || null,
      title: row.full_name || 'Eslesmeyen kart olayi',
      detail: row.message,
      exception_id: row.id,
      overtime_candidate_minutes: Number(row.overtime_candidate_minutes || 0),
      planned_start: row.planned_start || null,
      planned_end: row.planned_end || null,
      actual_check_in: row.actual_check_in || null,
      actual_check_out: row.actual_check_out || null,
      can_resolve: true,
    })
  })

  coverageRows.filter(row => Number(row.missing || 0) > 0).forEach(row => {
    const missing = Number(row.missing || 0)
    actions.push({
      key: `coverage:${row.rule_id}:${row.work_date}`,
      category: 'coverage',
      type: 'coverage_gap',
      severity: missing >= 2 ? 'critical' : 'warning',
      staff_id: null,
      full_name: null,
      dept_name: row.dept_name || null,
      title: row.name,
      detail: `${missing} kisi eksik · ${row.assigned}/${row.min_staff} personel`,
      can_resolve: false,
    })
  })

  roster.forEach(row => {
    if (row.status === 'absent') {
      actions.push({
        key: `absent:${row.schedule_id}`,
        category: 'attendance',
        type: 'absent',
        severity: 'critical',
        staff_id: row.staff_id,
        full_name: row.full_name,
        dept_name: row.dept_name || null,
        title: row.full_name,
        detail: row.absent_reason || 'Devamsizlik kaydi kontrol edilmeli',
        can_resolve: false,
      })
    }
    if (row.attendance_state === 'pending_scan' && !exceptionKeys.has(`${row.staff_id}:missing_scan`)) {
      actions.push({
        key: `pending-scan:${row.schedule_id}`,
        category: 'card',
        type: 'missing_scan',
        severity: 'warning',
        staff_id: row.staff_id,
        full_name: row.full_name,
        dept_name: row.dept_name || null,
        title: row.full_name,
        detail: `${row.shift_name || 'Planli vardiya'} icin kart okutma bulunamadi`,
        can_resolve: false,
      })
    }
  })

  unassignedStaff.forEach(row => {
    const hasEvents = Number(row.event_count || 0) > 0
    actions.push({
      key: `unassigned:${row.staff_id}`,
      category: hasEvents ? 'card' : 'schedule',
      type: hasEvents ? 'unplanned_attendance' : 'missing_schedule',
      severity: hasEvents ? 'critical' : (selectedDate > asOfDate ? 'info' : 'warning'),
      staff_id: row.staff_id,
      full_name: row.full_name,
      dept_name: row.dept_name || null,
      title: row.full_name,
      detail: hasEvents
        ? `${Number(row.event_count)} kart olayi var, vardiya plani yok`
        : 'Aktif personel icin gunluk vardiya girilmemis',
      can_resolve: false,
    })
  })

  unplannedEvents.filter(row => !row.staff_id).forEach(row => {
    actions.push({
      key: `unmatched-event:${row.id}`,
      category: 'card',
      type: 'unmatched_event',
      severity: 'critical',
      staff_id: null,
      full_name: null,
      dept_name: null,
      title: row.card_code ? `Kart ${row.card_code}` : 'Tanimlanamayan kart',
      detail: `${row.occurred_at} · ${row.source || 'bilinmeyen kaynak'}`,
      event_id: row.id,
      can_resolve: false,
    })
  })

  pendingLeaves.forEach(row => actions.push({
    key: `leave:${row.id}`,
    category: 'request',
    type: 'pending_leave',
    severity: 'info',
    staff_id: row.staff_id,
    full_name: row.full_name,
    dept_name: row.dept_name || null,
    title: row.full_name,
    detail: `${row.start_date} - ${row.end_date} izin talebi bekliyor`,
    request_id: row.id,
    can_resolve: false,
  }))
  pendingOvertime.forEach(row => actions.push({
    key: `overtime:${row.id}`,
    category: 'request',
    type: 'pending_overtime',
    severity: 'info',
    staff_id: row.staff_id,
    full_name: row.full_name,
    dept_name: row.dept_name || null,
    title: row.full_name,
    detail: `${row.work_date} · ${Number(row.requested_hours || 0)} saat mesai talebi`,
    request_id: row.id,
    can_resolve: false,
  }))

  const severityOrder = { critical: 0, warning: 1, info: 2 }
  return actions.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
    || String(a.category).localeCompare(String(b.category), 'tr')
    || String(a.title).localeCompare(String(b.title), 'tr'))
}

export function operationsDashboardService({ date, month, deptId } = {}) {
  const selectedDate = validateAttendanceDate(date || todayLocal(), 'date')
  const selectedMonth = month || selectedDate.slice(0, 7)
  const { monthStart, monthEnd, lastDay } = parsePuantajMonth(selectedMonth)
  if (!selectedDate.startsWith(`${selectedMonth}-`)) {
    throw Object.assign(new Error('date secilen month icinde olmali'), { statusCode: 400 })
  }
  const parsedDeptId = deptId == null || deptId === '' ? null : Number(deptId)
  if (parsedDeptId != null && (!Number.isInteger(parsedDeptId) || parsedDeptId <= 0)) {
    throw Object.assign(new Error('dept_id sayisal olmali'), { statusCode: 400 })
  }

  const raw = getOperationsDashboardData({
    date: selectedDate,
    monthStart,
    monthEnd,
    deptId: parsedDeptId,
  })
  const asOfDate = todayLocal()
  const roster = raw.roster.map(row => ({
    ...row,
    attendance_state: operationAttendanceState(row, selectedDate, asOfDate),
  }))
  const unassignedStaff = raw.unassignedStaff.map(row => ({
    ...row,
    attendance_state: Number(row.event_count || 0) > 0 ? 'unplanned_scan' : 'unassigned',
  }))
  const dailyExceptions = listAttendanceExceptions({
    status: 'open', from: selectedDate, to: selectedDate,
    ...(parsedDeptId ? { dept_id: parsedDeptId } : {}),
  })
  const payroll = puantajService(selectedMonth, parsedDeptId)
  const coverage = getShiftCoverage(monthStart, monthEnd)
  const rulesById = new Map(coverage.rules.map(rule => [Number(rule.id), rule]))
  const coverageRows = coverage.rule_counts
    .filter(row => row.work_date === selectedDate)
    .map(row => ({ ...rulesById.get(Number(row.rule_id)), ...row }))
    .filter(row => !parsedDeptId || Number(row.dept_id) === parsedDeptId)
    .sort((a, b) => b.missing - a.missing || String(a.name).localeCompare(String(b.name), 'tr'))
  const coverageMissingByDate = new Map()
  coverage.rule_counts.forEach(row => {
    const rule = rulesById.get(Number(row.rule_id))
    if (parsedDeptId && Number(rule?.dept_id) !== parsedDeptId) return
    coverageMissingByDate.set(row.work_date, (coverageMissingByDate.get(row.work_date) || 0) + Number(row.missing || 0))
  })
  const trendByDate = new Map(raw.trends.map(row => [row.date, row]))
  const trends = Array.from({ length: lastDay }, (_, index) => {
    const workDate = `${selectedMonth}-${String(index + 1).padStart(2, '0')}`
    return {
      date: workDate,
      scheduled: 0,
      worked: 0,
      on_leave: 0,
      absent: 0,
      off: 0,
      overtime_hours: 0,
      open_exceptions: 0,
      ...(trendByDate.get(workDate) || {}),
      coverage_missing: coverageMissingByDate.get(workDate) || 0,
      not_due: workDate > asOfDate,
    }
  })

  const costByDepartment = new Map()
  payroll.forEach(row => {
    const name = row.dept_name || 'Departmansiz'
    const current = costByDepartment.get(name) || {
      gross: 0, employer_total_cost: 0, overtime_hours: 0, leave_days: 0, absent_days: 0,
    }
    current.gross += Number(row.gross || 0)
    current.employer_total_cost += Number(row.employer_total_cost || 0)
    current.overtime_hours += Number(row.overtime_hours || 0)
    current.leave_days += Number(row.leave_days || 0)
    current.absent_days += Number(row.absent_days || 0)
    costByDepartment.set(name, current)
  })
  const breakdowns = {
    departments: raw.breakdowns.filter(row => row.dimension === 'department').map(row => ({
      ...row,
      ...(costByDepartment.get(row.name) || {}),
    })),
    roles: raw.breakdowns.filter(row => row.dimension === 'role'),
    locations: raw.breakdowns.filter(row => row.dimension === 'location'),
  }

  const highOvertime = payroll.filter(row => Number(row.overtime_hours || 0) >= 30).map(row => ({
    type: 'high_overtime',
    severity: Number(row.overtime_hours || 0) >= 45 ? 'critical' : 'warning',
    staff_id: row.id,
    full_name: row.full_name,
    dept_name: row.dept_name,
    value: Number(row.overtime_hours || 0),
    message: `${Number(row.overtime_hours || 0)} saat aylik mesai`,
  }))
  const missingDocuments = payroll.filter(row => Number(row.missing_required_documents || 0) > 0).map(row => ({
    type: 'missing_document',
    severity: 'critical',
    staff_id: row.id,
    full_name: row.full_name,
    dept_name: row.dept_name,
    value: Number(row.missing_required_documents || 0),
    message: `${Number(row.missing_required_documents || 0)} zorunlu belge eksik`,
  }))
  const leaveBalanceRisks = raw.lowLeaveBalances.map(row => ({
    type: 'low_leave_balance',
    severity: Number(row.remaining) <= 0 ? 'critical' : 'warning',
    ...row,
    value: Number(row.remaining),
    message: `${Number(row.remaining)} gun yillik izin kaldi`,
  }))
  const endingLeaveRisks = raw.endingLeaves.map(row => ({
    type: 'ending_report',
    severity: 'info',
    ...row,
    value: row.end_date,
    message: `Rapor ${row.end_date} tarihinde bitiyor`,
  }))
  const risks = [
    ...missingDocuments,
    ...operationConsecutiveRisks(raw.streakRows, asOfDate),
    ...highOvertime,
    ...leaveBalanceRisks,
    ...endingLeaveRisks,
  ]
  const actions = operationActionQueue({
    roster,
    unassignedStaff,
    unplannedEvents: raw.unplannedEvents,
    coverageRows,
    dailyExceptions,
    pendingLeaves: raw.pendingLeaves,
    pendingOvertime: raw.pendingOvertime,
    selectedDate,
    asOfDate,
  })
  const actionSummary = actions.reduce((summary, row) => {
    summary.by_category[row.category] = (summary.by_category[row.category] || 0) + 1
    summary.by_severity[row.severity] = (summary.by_severity[row.severity] || 0) + 1
    return summary
  }, { total: actions.length, by_category: {}, by_severity: {} })

  const metrics = {
    active_staff: Number(raw.activeStaff || 0),
    scheduled: roster.filter(row => ['scheduled', 'worked', 'overtime'].includes(row.status)).length,
    worked: roster.filter(row => ['worked', 'overtime'].includes(row.status)).length,
    on_leave: roster.filter(row => row.status === 'on_leave').length,
    absent: roster.filter(row => row.status === 'absent').length,
    pending_scan: roster.filter(row => row.attendance_state === 'pending_scan').length,
    open_exceptions: dailyExceptions.length,
    unassigned_staff: unassignedStaff.length,
    unplanned_scans: unassignedStaff.filter(row => Number(row.event_count || 0) > 0).length
      + raw.unplannedEvents.filter(row => !row.staff_id).length,
    action_required: actions.length,
    critical_actions: Number(actionSummary.by_severity.critical || 0),
    coverage_missing: coverageRows.reduce((sum, row) => sum + Number(row.missing || 0), 0),
    pending_leave_requests: raw.pendingLeaves.length,
    pending_overtime_requests: raw.pendingOvertime.length,
    overtime_hours_month: payroll.reduce((sum, row) => sum + Number(row.overtime_hours || 0), 0),
    employer_cost_month: payroll.reduce((sum, row) => sum + Number(row.employer_total_cost || 0), 0),
  }

  return {
    date: selectedDate,
    month: selectedMonth,
    as_of_date: asOfDate,
    dept_id: parsedDeptId,
    metrics,
    roster,
    unassigned_staff: unassignedStaff,
    unplanned_events: raw.unplannedEvents,
    attendance_exceptions: dailyExceptions,
    actions,
    action_summary: actionSummary,
    coverage: coverageRows,
    trends,
    breakdowns,
    risks,
    duty_managers: operationDutyManagers(roster),
    pending: {
      leaves: raw.pendingLeaves,
      overtime: raw.pendingOvertime,
    },
  }
}

export function puantajClosingPackageService(month, deptId) {
  const { monthStart, monthEnd } = parsePuantajMonth(month)
  const parsedDeptId = deptId == null || deptId === '' ? null : Number(deptId)
  if (parsedDeptId != null && (!Number.isInteger(parsedDeptId) || parsedDeptId <= 0)) {
    throw Object.assign(new Error('dept_id sayisal olmali'), { statusCode: 400 })
  }
  const packageRows = getPuantajClosingPackageData({ monthStart, monthEnd, deptId: parsedDeptId })
  const payroll = puantajService(month, parsedDeptId)
  return {
    period: month,
    generated_at: new Date().toISOString(),
    dept_id: parsedDeptId,
    approval: puantajApprovalService({ month, deptId: parsedDeptId }),
    leave_requests: packageRows.leaveRequests,
    overtime_requests: packageRows.overtimeRequests,
    attendance_events: packageRows.attendanceEvents,
    attendance_exceptions: packageRows.attendanceExceptions,
    documents: packageRows.documents,
    accounting: payroll.map(row => ({
      staff_id: row.id,
      tc_no: row.tc_no || '',
      full_name: row.full_name,
      dept_name: row.dept_name || '',
      iban: row.iban || '',
      worked_days: Number(row.worked_days || 0),
      paid_leave_units: Number(row.paid_leave_units || 0),
      absent_days: Number(row.absent_days || 0),
      overtime_hours: Number(row.overtime_hours || 0),
      sgk_day_units: Number(row.sgk_day_units || 0),
      gross: Number(row.gross || 0),
      total_deductions: Number(row.total_deductions || 0),
      net: Number(row.net || 0),
      employer_total_cost: Number(row.employer_total_cost || 0),
    })),
    summary: {
      staff_count: payroll.length,
      gross: round2(payroll.reduce((sum, row) => sum + Number(row.gross || 0), 0)),
      net: round2(payroll.reduce((sum, row) => sum + Number(row.net || 0), 0)),
      employer_total_cost: round2(payroll.reduce((sum, row) => sum + Number(row.employer_total_cost || 0), 0)),
      leave_requests: packageRows.leaveRequests.length,
      overtime_requests: packageRows.overtimeRequests.length,
      attendance_events: packageRows.attendanceEvents.length,
      attendance_exceptions: packageRows.attendanceExceptions.length,
      documents: packageRows.documents.length,
    },
  }
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

export function assignDeptService(staffId, deptId, userId, effectiveFrom = todayLocal()) {
  const current = getStaffById(staffId)
  if (!current) throw new Error('Personel bulunamadı')
  createStaffAssignment({
    staff_id: Number(staffId),
    department_id: normalizeOptionalId(deptId) ?? null,
    role_id: current.role_id,
    work_location_id: current.primary_work_location_id,
    effective_from: validateAssignmentDate(effectiveFrom),
    note: 'Departman toplu atama ile güncellendi',
    created_by: userId,
  })
}

export function createShiftDefService(data) {
  if (!data.name || data.start_hour === undefined || data.end_hour === undefined || !data.color_class)
    throw new Error('Tüm alanlar gerekli')
  return createShiftDefinition(data.name, data.start_hour, data.end_hour, data.color_class, data.min_staff)
}

// Kapsama panosu (X4): tarih aralığında vardiya×gün gerçekleşen vs hedef
export function coverageService({ from, to } = {}) {
  if (!from || !to) throw Object.assign(new Error('from ve to gerekli'), { statusCode: 400 })
  return getShiftCoverage(from, to)
}

function normalizeCoverageRule(data, existing = null) {
  const days = data.days_of_week ?? existing?.days_of_week ?? '1,2,3,4,5,6,7'
  const normalizedDays = [...new Set(String(days).split(',').map(Number).filter(day => day >= 1 && day <= 7))].sort((a, b) => a - b)
  if (!normalizedDays.length) throw Object.assign(new Error('En az bir aktif gun secilmeli'), { statusCode: 400 })
  const minStaff = Number(data.min_staff ?? existing?.min_staff ?? 1)
  if (!Number.isInteger(minStaff) || minStaff < 0 || minStaff > 999) {
    throw Object.assign(new Error('Kadro hedefi 0-999 arasinda olmali'), { statusCode: 400 })
  }
  return {
    name: String(data.name ?? existing?.name ?? '').trim(),
    dept_id: data.dept_id === undefined ? existing?.dept_id : (Number(data.dept_id) || null),
    role_id: data.role_id === undefined ? existing?.role_id : (Number(data.role_id) || null),
    work_location_id: data.work_location_id === undefined ? existing?.work_location_id : (Number(data.work_location_id) || null),
    shift_def_id: data.shift_def_id === undefined ? existing?.shift_def_id : (Number(data.shift_def_id) || null),
    start_time: normalizeClock(data.start_time ?? existing?.start_time, 'Kapsama baslangici'),
    end_time: normalizeClock(data.end_time ?? existing?.end_time, 'Kapsama bitisi'),
    min_staff: minStaff,
    days_of_week: normalizedDays.join(','),
    is_active: data.is_active === undefined ? (existing?.is_active ?? 1) : (data.is_active ? 1 : 0),
  }
}

export function coverageRulesService({ includeInactive = false } = {}) {
  return getCoverageRules({ includeInactive })
}

export function createCoverageRuleService(data, user) {
  const rule = normalizeCoverageRule(data)
  if (!rule.name) throw Object.assign(new Error('Kapsama kurali adi gerekli'), { statusCode: 400 })
  return createCoverageRule(rule, user?.id)
}

export function updateCoverageRuleService(id, data) {
  const existing = getCoverageRules({ includeInactive: true }).find(row => Number(row.id) === Number(id))
  if (!existing) throw Object.assign(new Error('Kapsama kurali bulunamadi'), { statusCode: 404 })
  return updateCoverageRule(id, normalizeCoverageRule(data, existing))
}

export function deleteCoverageRuleService(id) {
  deleteCoverageRule(id)
}

export function scheduleCandidatesService(filters = {}) {
  if (!isIsoDate(filters.date)) {
    throw Object.assign(new Error('date YYYY-MM-DD formatinda olmali'), { statusCode: 400 })
  }
  const segment = filters.segment_id ? getScheduleSegment(filters.segment_id) : null
  const result = getScheduleCandidates({
    date: filters.date,
    deptId: filters.dept_id || segment?.dept_id || null,
    roleId: filters.role_id || segment?.role_id || null,
    workLocationId: filters.work_location_id || segment?.work_location_id || null,
    shiftDefId: filters.shift_def_id || segment?.shift_def_id || null,
    startTime: filters.start_time || segment?.start_time || null,
    endTime: filters.end_time || segment?.end_time || null,
    excludeStaffId: filters.exclude_staff_id || segment?.staff_id || null,
  })
  return {
    date: filters.date,
    target: {
      segment_id: segment?.id || null,
      role_id: filters.role_id || segment?.role_id || null,
      work_location_id: filters.work_location_id || segment?.work_location_id || null,
      start_time: filters.start_time || segment?.start_time || null,
      end_time: filters.end_time || segment?.end_time || null,
    },
    candidates: result,
  }
}

export function updateShiftDefService(id, data) {
  updateShiftDefinition(id, data)
}

export function deleteShiftDefService(id) {
  deleteShiftDefinition(id)
}

export function cancelLeaveService(id, userId) {
  const request = getLeaveRequest(id)
  if (!request) throw Object.assign(new Error('Izin talebi bulunamadi'), { statusCode: 404 })
  assertPeriodsUnlocked(requestDateRange(request.start_date, request.end_date))
  cancelLeaveRequest(id)
  resetDailyApprovalsForDates(requestDateRange(request.start_date, request.end_date), userId)
}

export function createSwapService(data) {
  if (!data.requester_id || !data.target_id || !data.swap_date)
    throw new Error('Zorunlu alanlar eksik')
  if (Number(data.requester_id) === Number(data.target_id)) throw new Error('Ayni personel kendi vardiyasiyla takas yapamaz')
  if ((data.requester_segment_id && !data.target_segment_id) || (!data.requester_segment_id && data.target_segment_id)) {
    throw new Error('Parcali takasta iki vardiya parcasi da secilmeli')
  }
  if (data.requester_segment_id) {
    const requesterSegment = getScheduleSegment(data.requester_segment_id)
    const targetSegment = getScheduleSegment(data.target_segment_id)
    if (!requesterSegment || !targetSegment) throw new Error('Takas vardiya parcasi bulunamadi')
    if (Number(requesterSegment.staff_id) !== Number(data.requester_id)
      || Number(targetSegment.staff_id) !== Number(data.target_id)
      || requesterSegment.work_date !== data.swap_date
      || targetSegment.work_date !== data.swap_date) {
      throw new Error('Takas parcasi personel veya tarih ile uyusmuyor')
    }
  }
  return createSwapRequest(data)
}

export function swapListService(filters) {
  return getSwapRequests(filters)
}

export function acceptSwapService(id, targetId) {
  if (!targetId) throw new Error('Hedef personel gerekli')
  return acceptSwapRequest(id, targetId)
}

export function approveSwapService(id, userId) {
  const row = approveSwapRequest(id, userId)
  resetDailyApprovalsForDates([row.swap_date], userId)
  return row
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

// ── Faz 30: İsimli rotasyon şablonları + kural uyarıları ──

function addDaysIso(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// Desenden gün girişleri üretir. stagger=true → her personel desene bir sonraki
// pozisyondan başlar (vardiyalar gün bazında dönüşümlü kapanır).
export function buildRotationEntries(pattern, staffIds, startDate, days, stagger = false) {
  const entries = []
  staffIds.forEach((sid, idx) => {
    const offset = stagger ? idx % pattern.length : 0
    for (let d = 0; d < days; d++) {
      const item = pattern[(d + offset) % pattern.length]
      entries.push({
        staff_id: sid,
        work_date: addDaysIso(startDate, d),
        shift_def_id: item.shift_def_id || null,
        status: item.shift_def_id ? 'scheduled' : 'off',
      })
    }
  })
  return entries
}

// İş kuralı uyarıları: art arda çalışma limiti (İK m.63 pratik: 6 gün) ve
// iki vardiya arası minimum dinlenme (11 saat).
export function rotationWarnings(entries, shiftDefsById, staffNames = {}, { maxConsecutive = 6, minRestHours = 11 } = {}) {
  const warnings = []
  const byStaff = {}
  entries.forEach(e => { (byStaff[e.staff_id] = byStaff[e.staff_id] || []).push(e) })

  const isNextDay = (a, b) => addDaysIso(a, 1) === b

  Object.entries(byStaff).forEach(([sid, list]) => {
    const name = staffNames[sid] || `#${sid}`
    const sorted = [...list].sort((a, b) => a.work_date.localeCompare(b.work_date))

    let streak = 0
    let streakStart = null
    let prev = null
    const closeStreak = (endDate) => {
      if (streak > maxConsecutive) {
        warnings.push({
          type: 'consecutive', staff_id: Number(sid), date: streakStart,
          message: `${name}: ${streakStart} – ${endDate} arası ${streak} gün kesintisiz çalışma (limit ${maxConsecutive})`,
        })
      }
      streak = 0
      streakStart = null
    }

    sorted.forEach(e => {
      const working = e.status === 'scheduled'
      const adjacent = prev && isNextDay(prev.work_date, e.work_date)

      if (working) {
        if (streak > 0 && adjacent && prev.status === 'scheduled') streak++
        else { closeStreak(prev?.work_date); streak = 1; streakStart = e.work_date }
      } else if (streak > 0) {
        closeStreak(prev?.work_date)
      }

      if (adjacent && prev.status === 'scheduled' && working && prev.shift_def_id && e.shift_def_id) {
        const prevDef = shiftDefsById[prev.shift_def_id]
        const nextDef = shiftDefsById[e.shift_def_id]
        if (prevDef?.end_hour != null && nextDef?.start_hour != null) {
          const prevEndAbs = prevDef.end_hour > prevDef.start_hour ? prevDef.end_hour : prevDef.end_hour + 24
          const rest = (24 + nextDef.start_hour) - prevEndAbs
          if (rest < minRestHours) {
            warnings.push({
              type: 'rest', staff_id: Number(sid), date: e.work_date,
              message: `${name}: ${e.work_date} — ${prevDef.name} sonrası ${nextDef.name} arasında ${rest} saat dinlenme (min ${minRestHours})`,
            })
          }
        }
      }
      prev = e
    })
    closeStreak(prev?.work_date)
  })
  return warnings
}

export function rotationTemplatesService() {
  return listRotationTemplates().map(t => ({
    id: t.id, name: t.name, created_at: t.created_at,
    pattern: JSON.parse(t.pattern_json),
  }))
}

function validateRotationPattern(pattern) {
  if (!Array.isArray(pattern) || pattern.length === 0 || pattern.length > 31)
    throw new Error('Desen 1-31 gün arasında olmalı')
  const db = getDB()
  const validIds = new Set(db.prepare('SELECT id FROM shift_definitions').all().map(r => r.id))
  pattern.forEach(item => {
    if (item.shift_def_id != null && !validIds.has(item.shift_def_id))
      throw new Error(`Geçersiz vardiya tanımı: ${item.shift_def_id}`)
  })
}

export function createRotationTemplateService(data, userId) {
  if (!data?.name?.trim()) throw new Error('Şablon adı gerekli')
  validateRotationPattern(data.pattern)
  return createRotationTemplate(data.name.trim(), JSON.stringify(data.pattern), userId)
}

export function deleteRotationTemplateService(id) {
  deleteRotationTemplate(id)
}

function resolveRotationInput(body) {
  let pattern = body.pattern
  if (body.template_id) {
    const tpl = getRotationTemplate(body.template_id)
    if (!tpl) throw new Error('Şablon bulunamadı')
    pattern = JSON.parse(tpl.pattern_json)
  }
  validateRotationPattern(pattern)
  const staffIds = (body.staff_ids || []).map(Number).filter(Boolean)
  if (staffIds.length === 0) throw new Error('Personel seçilmedi')
  if (!isIsoDate(body.start_date)) throw new Error('start_date YYYY-MM-DD formatında olmalı')
  const weeks = Math.min(Math.max(parseInt(body.weeks) || 1, 1), 8)
  return { pattern, staffIds, startDate: body.start_date, days: weeks * 7, stagger: !!body.stagger }
}

function rotationContext(staffIds) {
  const db = getDB()
  const ph = staffIds.map(() => '?').join(',')
  const staffRows = db.prepare(`SELECT id, full_name, department_id FROM staff WHERE id IN (${ph})`).all(...staffIds)
  const shiftDefs = db.prepare('SELECT id, name, start_hour, end_hour FROM shift_definitions').all()
  return {
    staffNames: Object.fromEntries(staffRows.map(s => [s.id, s.full_name])),
    deptByStaff: Object.fromEntries(staffRows.map(s => [s.id, s.department_id])),
    shiftDefsById: Object.fromEntries(shiftDefs.map(s => [s.id, s])),
  }
}

export function rotationPreviewService(body) {
  const { pattern, staffIds, startDate, days, stagger } = resolveRotationInput(body)
  const entries = buildRotationEntries(pattern, staffIds, startDate, days, stagger)
  const { staffNames, shiftDefsById } = rotationContext(staffIds)
  const warnings = rotationWarnings(entries, shiftDefsById, staffNames)
  const perStaff = staffIds.map(sid => {
    const list = entries.filter(e => e.staff_id === sid)
    return {
      staff_id: sid,
      name: staffNames[sid] || `#${sid}`,
      scheduled: list.filter(e => e.status === 'scheduled').length,
      off: list.filter(e => e.status === 'off').length,
    }
  })
  return {
    total_entries: entries.length,
    days,
    end_date: addDaysIso(startDate, days - 1),
    per_staff: perStaff,
    warnings,
  }
}

export function rotationApplyService(body, userId) {
  const { pattern, staffIds, startDate, days, stagger } = resolveRotationInput(body)
  const entries = buildRotationEntries(pattern, staffIds, startDate, days, stagger)
  const { staffNames, deptByStaff, shiftDefsById } = rotationContext(staffIds)
  const warnings = rotationWarnings(entries, shiftDefsById, staffNames)
  assertPeriodsUnlocked(entries.map(e => e.work_date))
  bulkAssignShifts(entries.map(e => ({
    ...e,
    dept_id: deptByStaff[e.staff_id] || null,
  })), userId)
  resetDailyApprovalsForDates(entries.map(e => e.work_date), userId)
  return { count: entries.length, warnings }
}

export function deleteScheduleService(staffId, workDate, userId, expectedVersion = null) {
  assertPeriodsUnlocked([workDate])
  deleteScheduleEntry(staffId, workDate, expectedVersion)
  resetDailyApprovalsForDates([workDate], userId)
}

export function staffDetailService(staffId) {
  return getStaffDetail(staffId)
}

export function puantajCsvService(month, deptId) {
  if (!isIsoMonth(month)) {
    throw Object.assign(new Error('month parametresi YYYY-MM formatında gereklidir'), { statusCode: 400 })
  }
  const rows = puantajService(month, deptId)

  const headers = [
    'TC No', 'Ad Soyad', 'Departman',
    'İş Günü', 'Çalıştı', 'Hafta Tatili', 'İzin(Yıllık)', 'İzin(Acil)', 'İzin(Hastalık)', 'İzin(Diğer)',
    'Devamsız', 'Mesai(s)',
    'Brüt', 'SGK İşçi', 'İşsizlik İşçi', 'Gelir Vergisi', 'Damga Vergisi', 'Net',
    'İşveren SGK', 'İşveren İşsizlik', 'Toplam Maliyet',
  ]

  const escape = (v) => {
    const s = v == null ? '—' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lines = [
    '\uFEFF' + headers.join(','),
    ...rows.map(r => [
      r.tc_no || '—',
      r.full_name,
      r.dept_name || '—',
      r.work_days_in_month,
      r.worked_days,
      r.off_days,
      r.annual_leave_days,
      r.emergency_leave_days,
      r.sick_leave_days,
      r.other_leave_days,
      r.absent_days,
      r.overtime_hours,
      r.gross,
      r.ssi_worker,
      r.unemployment_worker,
      r.income_tax,
      r.stamp_tax,
      r.net,
      r.ssi_employer,
      r.unemployment_employer,
      r.employer_total_cost,
    ].map(escape).join(',')),
  ]

  return lines.join('\r\n')
}

// L2 — Banka toplu ödeme dosyası (CSV, noktalı virgül ayraçlı, BOM'lu).
// Dönem net maaşı (yasal + özel kesintiler düşülmüş) + IBAN. Net ≤ 0 satırlar atlanır;
// IBAN'ı boş personel dosyada "IBAN EKSIK" ile görünür kalır ki muhasebe fark etsin.
export function bankTransferCsvService(month) {
  const rows = puantajService(month)
  const db = getDB()
  const dedRows = db.prepare(
    'SELECT staff_id, COALESCE(SUM(amount),0) as total FROM payroll_deductions WHERE period = ? GROUP BY staff_id'
  ).all(month)
  const dedMap = Object.fromEntries(dedRows.map(d => [d.staff_id, d.total]))
  const ibanMap = Object.fromEntries(db.prepare('SELECT id, iban FROM staff').all().map(s => [s.id, s.iban]))

  const escape = (v) => {
    const s = v == null ? '' : String(v)
    return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = ['﻿' + ['Sira', 'Ad Soyad', 'TC No', 'IBAN', 'Tutar (TL)', 'Aciklama'].join(';')]
  let sira = 0
  rows.forEach(r => {
    const netPayable = round2(r.net - (dedMap[r.id] || 0))
    if (netPayable <= 0) return
    sira += 1
    lines.push([
      sira,
      escape(r.full_name),
      escape(r.tc_no || ''),
      escape(ibanMap[r.id] || 'IBAN EKSIK'),
      netPayable.toFixed(2).replace('.', ','),
      escape(`${month} maas odemesi`),
    ].join(';'))
  })
  return lines.join('\r\n')
}

// L1 — Kişi bazlı bordro verisi (PDF için): puantaj satırı + dönem özel kesintileri.
// Yasal kesintiler (SGK/işsizlik/GV/damga) puantajService'te hesaplanır; burada
// payroll_deductions kayıtları (avans, hasar, disiplin…) net'ten ayrıca düşülür.
export function payslipService(staffId, month) {
  const id = Number(staffId)
  if (!id || isNaN(id)) {
    throw Object.assign(new Error('staffId sayısal olmalıdır'), { statusCode: 400 })
  }
  const row = puantajService(month).find(r => r.id === id)
  if (!row) {
    throw Object.assign(new Error('Personel bulunamadı'), { statusCode: 404 })
  }
  const deductionItems = listDeductions({ period: month, staffId: id })
  const otherDeductions = round2(deductionItems.reduce((s, d) => s + (d.amount || 0), 0))
  return {
    ...row,
    deduction_items: deductionItems,
    other_deductions: otherDeductions,
    net_payable: round2(row.net - otherDeductions),
  }
}

function parsePuantajMonth(month) {
  if (!isIsoMonth(month)) {
    throw Object.assign(new Error('month parametresi YYYY-MM formatÄ±nda gereklidir'), { statusCode: 400 })
  }
  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${year}-${String(mon).padStart(2, '0')}-${lastDay}`
  return { year, mon, monthStart, monthEnd, lastDay }
}

function dayEntryFromRow(row, date, dow) {
  const entry = { date, day_of_week: dow, status: row.status }
  if (row.schedule_id) entry.schedule_id = row.schedule_id
  if (row.row_version != null) entry.row_version = row.row_version
  if (row.puantaj_code_id) entry.puantaj_code_id = row.puantaj_code_id
  if (row.puantaj_code) entry.puantaj_code = row.puantaj_code
  if (row.puantaj_code_label) entry.puantaj_code_label = row.puantaj_code_label
  if (row.requires_document != null) entry.requires_document = row.requires_document
  if (row.requires_reason != null) entry.requires_reason = row.requires_reason
  if (row.dept_id != null) entry.dept_id = row.dept_id
  if (row.shift_def_id) entry.shift_def_id = row.shift_def_id
  if (row.shift_name) {
    entry.shift_name = row.shift_name
    entry.start_hour = row.start_hour
    entry.end_hour = row.end_hour
  }
  if (row.work_location_id) entry.work_location_id = row.work_location_id
  if (row.work_location_name) entry.work_location_name = row.work_location_name
  if (row.work_location_color) entry.work_location_color = row.work_location_color
  if (row.role_id) entry.role_id = row.role_id
  if (row.role_name) entry.role_name = row.role_name
  if (row.leave_type) entry.leave_type = row.leave_type
  if (row.overtime_hours) entry.overtime_hours = row.overtime_hours
  if (row.absent_reason) entry.absent_reason = row.absent_reason
  if (row.leave_hours != null) entry.leave_hours = row.leave_hours
  if (row.detail_note) entry.detail_note = row.detail_note
  if (row.attachment_url) entry.attachment_url = row.attachment_url
  if (row.attachment_name) entry.attachment_name = row.attachment_name
  if (row.attachment_mime) entry.attachment_mime = row.attachment_mime
  if (row.document_count != null) entry.document_count = row.document_count
  if (row.attendance_source) entry.attendance_source = row.attendance_source
  if (row.reconciliation_status) entry.reconciliation_status = row.reconciliation_status
  if (row.reconciliation_reason) entry.reconciliation_reason = row.reconciliation_reason
  if (row.actual_check_in) entry.actual_check_in = row.actual_check_in
  if (row.actual_check_out) entry.actual_check_out = row.actual_check_out
  if (row.attendance_worked_minutes != null) entry.attendance_worked_minutes = row.attendance_worked_minutes
  if (row.overtime_candidate_minutes) entry.overtime_candidate_minutes = row.overtime_candidate_minutes
  if (row.attendance_exception_count != null) entry.attendance_exception_count = row.attendance_exception_count
  return entry
}

function buildMonthDays(rows, year, mon, lastDay) {
  const dbMap = {}
  rows.forEach(r => { dbMap[r.date] = r })
  const result = []
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dow = new Date(year, mon - 1, d).getDay()
    const row = dbMap[date]
    if (row) {
      result.push(dayEntryFromRow(row, date, dow))
    } else {
      result.push({ date, day_of_week: dow, status: dow === 0 ? 'sunday' : 'no_record' })
    }
  }
  return result
}

export function puantajDaysService(month, deptId) {
  const { year, mon, monthStart, monthEnd, lastDay } = parsePuantajMonth(month)
  const staffRows = getPuantaj(monthStart, monthEnd, deptId)
  const dayRows = getPuantajDayRows(monthStart, monthEnd, deptId)
  const rowsByStaff = {}
  dayRows.forEach(row => {
    if (!rowsByStaff[row.staff_id]) rowsByStaff[row.staff_id] = []
    rowsByStaff[row.staff_id].push(row)
  })
  const days = {}
  staffRows.forEach(staff => {
    days[staff.id] = buildMonthDays(rowsByStaff[staff.id] || [], year, mon, lastDay)
  })
  return { month, days }
}

export function staffDayBreakdownService(staffId, month) {
  if (!staffId || isNaN(Number(staffId))) {
    throw Object.assign(new Error('staffId sayÄ±sal olmalÄ±dÄ±r'), { statusCode: 400 })
  }
  const { year, mon, monthStart, monthEnd, lastDay } = parsePuantajMonth(month)
  const dbRows = getStaffDayBreakdown(Number(staffId), monthStart, monthEnd)
  return buildMonthDays(dbRows, year, mon, lastDay)
}

function staffDayBreakdownServiceLegacy(staffId, month) {
  if (!isIsoMonth(month)) {
    throw Object.assign(new Error('month parametresi YYYY-MM formatında gereklidir'), { statusCode: 400 })
  }
  if (!staffId || isNaN(Number(staffId))) {
    throw Object.assign(new Error('staffId sayısal olmalıdır'), { statusCode: 400 })
  }
  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${year}-${String(mon).padStart(2, '0')}-${lastDay}`

  // DB records for days that have schedule entries
  const dbRows = getStaffDayBreakdown(Number(staffId), monthStart, monthEnd)
  const dbMap = {}
  dbRows.forEach(r => { dbMap[r.date] = r })

  // Build full month array
  const result = []
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dow = new Date(year, mon - 1, d).getDay() // 0=Sunday
    const row = dbMap[date]
    if (!row && dow === 0) {
      result.push({ date, day_of_week: 0, status: 'sunday' })
      continue
    }
    if (!row) {
      result.push({ date, day_of_week: dow, status: 'no_record' })
      continue
    }
    const entry = { date, day_of_week: dow, status: row.status }
    if (row.schedule_id) entry.schedule_id = row.schedule_id
    if (row.dept_id) entry.dept_id = row.dept_id
    if (row.shift_def_id) entry.shift_def_id = row.shift_def_id
    if (row.shift_name) { entry.shift_name = row.shift_name; entry.start_hour = row.start_hour; entry.end_hour = row.end_hour }
    if (row.leave_type) entry.leave_type = row.leave_type
    if (row.overtime_hours) entry.overtime_hours = row.overtime_hours
    if (row.absent_reason) entry.absent_reason = row.absent_reason
    if (row.leave_hours != null) entry.leave_hours = row.leave_hours
    if (row.detail_note) entry.detail_note = row.detail_note
    if (row.attachment_url) entry.attachment_url = row.attachment_url
    if (row.attachment_name) entry.attachment_name = row.attachment_name
    if (row.attachment_mime) entry.attachment_mime = row.attachment_mime
    result.push(entry)
  }
  return result
}

export function puantajService(month, deptId, { includeMeta = false } = {}) {
  if (!isIsoMonth(month)) {
    throw Object.assign(new Error('month parametresi YYYY-MM formatında gereklidir'), { statusCode: 400 })
  }
  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${year}-${String(mon).padStart(2, '0')}-${lastDay}`
  const wdm = workDaysInMonth(year, mon)
  const db = getDB()

  const rows = getPuantaj(monthStart, monthEnd, deptId)
  const ytdMap = getYtdGrossBulk(db, year, mon)
  const attendanceByStaff = new Map(
    getAttendanceMonthSummary(monthStart, monthEnd, deptId).map(row => [Number(row.staff_id), row])
  )

  const result = rows.map(row => {
    const salary = row.salary || 0
    const dailyRate = salary / 30
    const basePay = round2(dailyRate * (row.worked_days || 0))
    const overtimePay = round2((dailyRate / 8) * 1.5 * (row.overtime_hours || 0))
    const leavePay = round2(dailyRate * (row.paid_leave_units || 0))
    // Hafta tatili (off) ücretlidir — İş Kanunu m.46
    const weeklyOffPay = round2(dailyRate * (row.off_days || 0))
    const gross = round2(basePay + overtimePay + leavePay + weeklyOffPay)

    const ytdGrossPrev = ytdMap.get(row.id) || 0
    const ytdGross = round2(ytdGrossPrev + gross)

    const ssiWorker = round2(gross * 0.14)
    const unemploymentWorker = round2(gross * 0.01)
    const incomeTax = round2(calcTax(ytdGross) - calcTax(ytdGrossPrev))
    const stampTax = round2(gross * 0.00759)
    const totalDeductions = round2(ssiWorker + unemploymentWorker + incomeTax + stampTax)
    const net = round2(gross - totalDeductions)

    const ssiEmployer = round2(gross * 0.205)
    const unemploymentEmployer = round2(gross * 0.02)
    const employerTotalCost = round2(gross + ssiEmployer + unemploymentEmployer)

    const attendRate = wdm > 0 ? Math.round(((row.worked_days || 0) / wdm) * 100) : 0
    const attendance = attendanceByStaff.get(Number(row.id)) || {}

    return {
      ...row,
      attendance_reconciled_days: Number(attendance.reconciled_days || 0),
      attendance_matched_days: Number(attendance.matched_days || 0),
      attendance_exception_days: Number(attendance.exception_days || 0),
      attendance_open_exception_count: Number(attendance.open_exception_count || 0),
      attendance_overtime_candidate_minutes: Number(attendance.overtime_candidate_minutes || 0),
      daily_rate: round2(dailyRate),
      base_pay: basePay,
      overtime_pay: overtimePay,
      leave_pay: leavePay,
      paid_leave_units: round2(row.paid_leave_units || 0),
      sgk_day_units: round2(row.sgk_day_units || 0),
      missing_required_documents: Number(row.missing_required_documents || 0),
      weekly_off_pay: weeklyOffPay,
      gross,
      ssi_worker: ssiWorker,
      unemployment_worker: unemploymentWorker,
      income_tax: incomeTax,
      stamp_tax: stampTax,
      total_deductions: totalDeductions,
      net,
      ssi_employer: ssiEmployer,
      unemployment_employer: unemploymentEmployer,
      employer_total_cost: employerTotalCost,
      attend_rate: attendRate,
      work_days_in_month: wdm,
      ytd_gross: ytdGross,
      ytd_tax: round2(calcTax(ytdGross)),
    }
  })
  if (!includeMeta) return result

  const asOfDate = todayLocal()
  const asOfMonth = asOfDate.slice(0, 7)
  const notDue = month < asOfMonth ? 0 : month > asOfMonth ? lastDay : Math.max(0, lastDay - Number(asOfDate.slice(8, 10)))
  return {
    rows: result,
    as_of_date: asOfDate,
    not_due: notDue,
    exception_count: result.reduce((sum, row) => sum + row.attendance_open_exception_count, 0),
    source: 'shift_schedule',
    sources: ['shift_schedule', 'attendance_reconciliation'],
  }
}
