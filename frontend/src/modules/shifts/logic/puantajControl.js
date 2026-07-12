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

function labelIssues({ scheduled, empty, off, absent, absentWithoutReason }) {
  const labels = []
  if (scheduled > 0) labels.push(`${scheduled} planlı gün kapanmamış`)
  if (empty > 0) labels.push(`${empty} boş gün`)
  if (off === 0) labels.push('haftalık izin yok')
  if (absentWithoutReason > 0) labels.push(`${absentWithoutReason} devamsız nedeni eksik`)
  if (absent > 0) labels.push(`${absent} devamsız`)
  return labels
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

export function buildPuantajControl({ staffRows = [], daysByStaff = {}, holidays = [], month } = {}) {
  const { year, mon, daysInMonth } = parseMonth(month)
  const holidaySet = new Set((holidays || []).map(h => h.date).filter(Boolean))
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const totals = emptyCounts()
  const dailyRows = dayNumbers.map(day => {
    const date = `${month}-${String(day).padStart(2, '0')}`
    return {
      date,
      day,
      weekday: new Date(year, mon - 1, day).getDay(),
      isHoliday: holidaySet.has(date),
      ...emptyCounts(),
    }
  })

  const staffIssues = []
  const scheduledCells = []
  const byStaffId = {}
  const dailyIssuesByDate = {}
  const dailyIssues = []

  staffRows.forEach(staff => {
    const counts = emptyCounts()
    const days = daysByStaff?.[staff.id] || []
    const byDate = new Map(days.map(entry => [entry.date, entry]))

    dailyRows.forEach(dayRow => {
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
    const issueLabels = labelIssues(counts)
    const issue = {
      staff,
      ...counts,
      issueCount: issueLabels.length,
      issueLabels,
      ready: counts.scheduled === 0 && counts.empty === 0 && counts.off > 0 && counts.absentWithoutReason === 0,
    }
    byStaffId[staff.id] = issue
    if (issue.issueCount > 0) staffIssues.push(issue)
  })

  const expectedCells = staffRows.length * dayNumbers.filter(day => new Date(year, mon - 1, day).getDay() !== 0).length
  const unresolvedCells = totals.scheduled + totals.empty
  const completionRate = expectedCells > 0
    ? Math.max(0, Math.round(((expectedCells - unresolvedCells) / expectedCells) * 100))
    : 100
  const missingOffStaff = staffIssues.filter(issue => issue.off === 0).length
  const missingAbsenceReasonStaff = staffIssues.filter(issue => issue.absentWithoutReason > 0).length
  const readyStaff = staffRows.length - staffIssues.filter(issue => (
    issue.scheduled > 0 || issue.empty > 0 || issue.off === 0 || issue.absentWithoutReason > 0
  )).length

  return {
    month,
    staffCount: staffRows.length,
    dayNumbers,
    totals,
    dailyRows,
    staffIssues: staffIssues.sort((a, b) => (
      (b.scheduled + b.empty + (b.off === 0 ? 1 : 0)) - (a.scheduled + a.empty + (a.off === 0 ? 1 : 0))
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
      sum + (daysByStaff?.[staff.id] || []).filter(day => FINAL_STATUSES.has(day.status)).length
    ), 0),
  }
}
