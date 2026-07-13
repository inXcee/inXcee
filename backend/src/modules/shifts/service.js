import {
  getDepartments, getShiftDefinitions, getSchedule, bulkAssignShifts, assignmentWarnings,
  getWorkLocations, createWorkLocation, updateWorkLocation, deleteWorkLocation,
  getStaffRoles, createStaffRole, updateStaffRole, deleteStaffRole, getScheduleBreakdown, getBreakdownAssignees,
  getStaffWithShiftStatus, createLeaveRequest, approveLeaveRequest,
  getLeaveRequests, getLeaveBalance, createOvertime, updateOvertime, deleteOvertime, getOvertimeRecords, upsertOvertimeDay,
  getOvertimeSummary, createAttendanceLog, updateCheckout, getAttendanceLogs, getPuantaj,
  getShiftStatistics, getDepartmentSummary,
  createDepartment, updateDepartment, deleteDepartment,
  createShiftDefinition, updateShiftDefinition, deleteShiftDefinition, getShiftCoverage,
  cancelLeaveRequest, createSwapRequest, getSwapRequests, approveSwapRequest, rejectSwapRequest,
  copyWeekSchedule, applyRotationTemplate, searchStaff, deleteScheduleEntry,
  listRotationTemplates, getRotationTemplate, createRotationTemplate, deleteRotationTemplate,
  listPeriodLocks, lockedPeriodsFor, lockPeriod, unlockPeriod,
  getPuantajPeriodApproval, upsertPuantajPeriodApproval,
  listPuantajDailyApprovals, upsertPuantajDailyApproval,
  insertPuantajApprovalEvent, listPuantajApprovalEvents,
  resetDailyApprovalsForDates, getPuantajDayIssueCounts, getPuantajApprovalOverview,
  listPuantajCodes, createPuantajCode, updatePuantajCode, getPuantajCode, deletePuantajCode,
  getStaffDetail,
  getStaffList, getStaffById, createStaff, updateStaff, deleteStaff,
  getStaffAssignments, createStaffAssignment, getStaffDataQualityRows,
  getStaffDayBreakdown, getPuantajDayRows, listDeductions
} from './queries.js'
import { getDB } from '../../shared/db/index.js'
import { sendPushToWorker } from '../../shared/notifications/push.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logger } from '../../shared/logger.js'

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

  // Worked days (worked + overtime) + haftalık izin (off — hafta tatili ücretlidir)
  const sch = db.prepare(`
    SELECT COALESCE(COUNT(CASE WHEN status IN ('worked','overtime') THEN 1 END), 0) as worked_days,
      COALESCE(COUNT(CASE WHEN status = 'off' THEN 1 END), 0) as off_days
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
    dailyRate * ((sch?.worked_days || 0) + (sch?.off_days || 0) + (lv?.paid_leave_days || 0)) +
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
  if (!/^\d{4}-\d{2}$/.test(period || '')) throw new Error('period YYYY-MM formatında olmalı')
  lockPeriod(period, userId, note)
}

export function unlockPeriodService(period) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) throw new Error('period YYYY-MM formatında olmalı')
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate || '') || !String(workDate).startsWith(`${period}-`)) {
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
  try {
    return createPuantajCode({
      code,
      label: data.label.trim(),
      colorHex: cleanCodeHex(data.color_hex),
      status,
      leaveType,
      sortOrder: data.sort_order,
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

export function bulkAssignService(entries, createdBy) {
  if (!entries?.length) throw new Error('Atama listesi boş')
  assertPeriodsUnlocked(entries.map(e => e.work_date))
  const warnings = assignmentWarnings(entries) // onaylı izin ezme uyarısı (bloklamaz)
  bulkAssignShifts(entries, createdBy)
  const approvalsReset = resetDailyApprovalsForDates(entries.map(e => e.work_date), createdBy)
  return { ok: true, warnings, approvalsReset }
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Görev başlangıcı YYYY-MM-DD formatında olmalı')
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
export function createLeaveService(data) {
  if (!data.staff_id || !data.leave_type || !data.start_date || !data.end_date)
    throw new Error('Zorunlu alanlar eksik')
  const start = new Date(data.start_date)
  const end = new Date(data.end_date)
  if (end < start) throw new Error('Bitiş tarihi başlangıçtan önce olamaz')
  const totalDays = Math.round((end - start) / 86400000) + 1
  // reason opsiyonel — named parameter eksikse better-sqlite3 hata verir
  return createLeaveRequest({ ...data, reason: data.reason ?? null, total_days: totalDays })
}

export function approveLeaveService(id, userId, status) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Geçersiz durum')
  approveLeaveRequest(id, userId, status)
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

// Faz 28 — puantaj hücresinden gün bazlı FM girişi (0 = kaydı sil)
export function overtimeDayService(data, userId) {
  if (!data?.staff_id || !data?.work_date) throw new Error('staff_id ve work_date gerekli')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.work_date)) throw new Error('work_date YYYY-MM-DD formatında olmalı')
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.start_date || '')) throw new Error('start_date YYYY-MM-DD formatında olmalı')
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

export function deleteScheduleService(staffId, workDate, userId) {
  assertPeriodsUnlocked([workDate])
  deleteScheduleEntry(staffId, workDate)
  resetDailyApprovalsForDates([workDate], userId)
}

export function staffDetailService(staffId) {
  return getStaffDetail(staffId)
}

export function puantajCsvService(month, deptId) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
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
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
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
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
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
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw Object.assign(new Error('month parametresi YYYY-MM formatında gereklidir'), { statusCode: 400 })
  }
  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${year}-${String(mon).padStart(2, '0')}-${lastDay}`
  const wdm = workDaysInMonth(year, mon)
  const db = getDB()

  const rows = getPuantaj(monthStart, monthEnd, deptId)

  const result = rows.map(row => {
    const salary = row.salary || 0
    const dailyRate = salary / 30
    const basePay = round2(dailyRate * (row.worked_days || 0))
    const overtimePay = round2((dailyRate / 8) * 1.5 * (row.overtime_hours || 0))
    const leavePay = round2(dailyRate * ((row.annual_leave_days || 0) + (row.emergency_leave_days || 0)))
    // Hafta tatili (off) ücretlidir — İş Kanunu m.46
    const weeklyOffPay = round2(dailyRate * (row.off_days || 0))
    const gross = round2(basePay + overtimePay + leavePay + weeklyOffPay)

    const ytdGrossPrev = getYtdGross(db, row.id, year, mon)
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

    return {
      ...row,
      daily_rate: round2(dailyRate),
      base_pay: basePay,
      overtime_pay: overtimePay,
      leave_pay: leavePay,
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
    exception_count: 0,
    source: 'shift_schedule',
  }
}
