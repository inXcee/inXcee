const FINAL_STATUSES = new Set(['worked', 'overtime', 'off', 'on_leave', 'absent'])

function parseMonth(month) {
  const [year, mon] = String(month || '').split('-').map(Number)
  const daysInMonth = Number.isFinite(year) && Number.isFinite(mon)
    ? new Date(year, mon, 0).getDate()
    : 0
  return { year, mon, daysInMonth }
}

function emptyCounts() {
  return {
    worked: 0,
    scheduled: 0,
    off: 0,
    leave: 0,
    absent: 0,
    absentWithoutReason: 0,
    empty: 0,
    overtimeHours: 0,
    holidayWorked: 0,
  }
}

function countEntry(acc, entry, { isSunday = false, isHoliday = false } = {}) {
  const status = entry?.status || (isSunday ? 'sunday' : 'no_record')
  if (status === 'worked' || status === 'overtime') {
    acc.worked += 1
    if (isHoliday) acc.holidayWorked += 1
  } else if (status === 'scheduled') acc.scheduled += 1
  else if (status === 'off') acc.off += 1
  else if (status === 'on_leave') acc.leave += 1
  else if (status === 'absent') {
    acc.absent += 1
    if (!String(entry?.absent_reason || '').trim()) acc.absentWithoutReason += 1
  }
  else if (!isSunday) acc.empty += 1
  acc.overtimeHours += Number(entry?.overtime_hours || 0)
  return acc
}

function labelIssues({ scheduled, empty, off, absent, absentWithoutReason }, { requireOff = true } = {}) {
  const labels = []
  if (scheduled > 0) labels.push(`${scheduled} planlı gün kapanmamış`)
  if (empty > 0) labels.push(`${empty} boş gün`)
  if (requireOff && off === 0) labels.push('haftalık izin yok')
  if (absentWithoutReason > 0) labels.push(`${absentWithoutReason} devamsız nedeni eksik`)
  if (absent > 0) labels.push(`${absent} devamsız`)
  return labels
}

function localIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function scopeForMonth(month, asOfDate, closingMode) {
  const safeAsOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(asOfDate || '')) ? String(asOfDate) : localIsoDate()
  const asOfMonth = safeAsOfDate.slice(0, 7)

  if (closingMode || month < asOfMonth) return { asOfDate: safeAsOfDate, dueThrough: `${month}-31`, allDue: true }
  if (month > asOfMonth) return { asOfDate: safeAsOfDate, dueThrough: null, allDue: false }
  return { asOfDate: safeAsOfDate, dueThrough: safeAsOfDate, allDue: false }
}

function buildScope({ staffRows, daysByStaff, baseDailyRows, includeDay }) {
  const totals = emptyCounts()
  const dailyRows = baseDailyRows.map(day => ({ ...day, ...emptyCounts() }))
  const scopedRows = dailyRows.filter(includeDay)
  const scopedDates = new Set(scopedRows.map(day => day.date))
  const requireOff = scopedRows.length > 0
  const staffIssues = []
  const scheduledCells = []
  const byStaffId = {}
  const dailyIssuesByDate = {}
  const dailyIssues = []

  staffRows.forEach(staff => {
    const counts = emptyCounts()
    const days = daysByStaff?.[staff.id] || []
    const byDate = new Map(days.map(entry => [entry.date, entry]))

    scopedRows.forEach(dayRow => {
      const entry = byDate.get(dayRow.date)
      const isSunday = dayRow.weekday === 0
      countEntry(counts, entry, { isSunday, isHoliday: dayRow.isHoliday })
      countEntry(dayRow, entry, { isSunday, isHoliday: dayRow.isHoliday })
      if (entry?.status === 'scheduled') scheduledCells.push({ staff, entry })
      const issues = dailyEntryIssues(staff, entry, dayRow)
      if (issues.length > 0) {
        if (!dailyIssuesByDate[dayRow.date]) dailyIssuesByDate[dayRow.date] = []
        dailyIssuesByDate[dayRow.date].push(...issues)
        dailyIssues.push(...issues)
      }
    })

    Object.keys(totals).forEach(key => { totals[key] += counts[key] || 0 })
    const issueLabels = labelIssues(counts, { requireOff })
    const missingOff = requireOff && counts.off === 0
    const issue = {
      staff,
      ...counts,
      missingOff,
      issueCount: issueLabels.length,
      issueLabels,
      ready: counts.scheduled === 0 && counts.empty === 0 && !missingOff && counts.absentWithoutReason === 0,
    }
    byStaffId[staff.id] = issue
    if (issue.issueCount > 0) staffIssues.push(issue)
  })

  const expectedCells = staffRows.length * scopedRows.filter(day => day.weekday !== 0).length
  const unresolvedCells = totals.scheduled + totals.empty
  const completionRate = expectedCells > 0
    ? Math.max(0, Math.round(((expectedCells - unresolvedCells) / expectedCells) * 100))
    : 100
  const missingOffStaff = staffIssues.filter(issue => issue.missingOff).length
  const missingAbsenceReasonStaff = staffIssues.filter(issue => issue.absentWithoutReason > 0).length
  const readyStaff = staffRows.length - staffIssues.filter(issue => (
    issue.scheduled > 0 || issue.empty > 0 || issue.missingOff || issue.absentWithoutReason > 0
  )).length

  return {
    totals,
    dailyRows,
    staffIssues: staffIssues.sort((a, b) => (
      (b.scheduled + b.empty + (b.missingOff ? 1 : 0)) - (a.scheduled + a.empty + (a.missingOff ? 1 : 0))
      || (a.staff.full_name || '').localeCompare(b.staff.full_name || '', 'tr')
    )),
    byStaffId,
    scheduledCells,
    dailyIssues,
    dailyIssuesByDate,
    missingOffStaff,
    missingAbsenceReasonStaff,
    readyStaff,
    expectedCells,
    unresolvedCells,
    completionRate,
    readyToClose: unresolvedCells === 0 && missingOffStaff === 0 && totals.absentWithoutReason === 0,
    finalStatusCount: staffRows.reduce((sum, staff) => (
      sum + (daysByStaff?.[staff.id] || []).filter(day => scopedDates.has(day.date) && FINAL_STATUSES.has(day.status)).length
    ), 0),
  }
}

function dailyEntryIssues(staff, entry, dayRow) {
  const issues = []
  const status = entry?.status || (dayRow.weekday === 0 ? 'sunday' : 'no_record')

  if (status === 'scheduled') {
    issues.push({
      type: 'scheduled',
      severity: 'warning',
      label: 'Planli gun kapanmamis',
      hint: 'P gunu N, izin, OFF veya Y olarak kapatilmali',
    })
  } else if (status === 'no_record') {
    issues.push({
      type: 'empty',
      severity: 'critical',
      label: 'Bos gun',
      hint: 'Bu personele gunluk puantaj kodu girilmeli',
    })
  } else if (status === 'absent' && !String(entry?.absent_reason || '').trim()) {
    issues.push({
      type: 'absence_reason',
      severity: 'critical',
      label: 'Devamsizlik nedeni eksik',
      hint: 'Y kaydina neden notu girilmeli',
    })
  }

  return issues.map(issue => ({
    ...issue,
    date: dayRow.date,
    staff: {
      id: staff.id,
      full_name: staff.full_name,
      dept_name: staff.dept_name || staff.dept || '',
      role_name: staff.role_name || staff.role || staff.position || '',
    },
    status,
    shift_name: entry?.shift_name || '',
    work_location_name: entry?.work_location_name || '',
    absent_reason: entry?.absent_reason || '',
  }))
}

export function buildPuantajControl({ staffRows = [], daysByStaff = {}, holidays = [], month, asOfDate, closingMode = false } = {}) {
  const { year, mon, daysInMonth } = parseMonth(month)
  const holidaySet = new Set((holidays || []).map(h => h.date).filter(Boolean))
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const scope = scopeForMonth(month, asOfDate, closingMode)
  const baseDailyRows = dayNumbers.map(day => {
    const date = `${month}-${String(day).padStart(2, '0')}`
    const isDue = scope.allDue || (scope.dueThrough !== null && date <= scope.dueThrough)
    return {
      date,
      day,
      weekday: new Date(year, mon - 1, day).getDay(),
      isHoliday: holidaySet.has(date),
      isDue,
      notDue: !isDue,
    }
  })
  const operational = buildScope({
    staffRows,
    daysByStaff,
    baseDailyRows,
    includeDay: day => day.isDue,
  })
  const closing = buildScope({
    staffRows,
    daysByStaff,
    baseDailyRows,
    includeDay: () => true,
  })
  const dueDayCount = baseDailyRows.filter(day => day.isDue).length
  const notDueDayCount = daysInMonth - dueDayCount

  return {
    month,
    asOfDate: scope.asOfDate,
    staffCount: staffRows.length,
    dayNumbers,
    dueDayCount,
    notDueDayCount,
    ...operational,
    readyToDate: operational.readyToClose,
    operationalCompletionRate: operational.completionRate,
    closingCompletionRate: closing.completionRate,
    readyToClose: closing.readyToClose,
    closing,
  }
}
