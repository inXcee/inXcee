import { buildFoyuRow, buildFoyuCodeIndex, buildFoyuLegend, FOYU_TOTAL_COLUMNS } from './puantajFoyu.js'
import { codeHex } from './shiftColors.js'
import {
  COLORS,
  argb,
  border,
  colLetter,
  fill,
  quoteSheet,
  setupSheet,
  setupTitle,
  styleHeaderRow,
  addMetric,
} from './excelKit.js'

const SIGNATURE_LABELS = ['DÜZENLEYEN', 'KONTROL EDEN', 'ONAYLAYAN']
const FIRST_DATA_ROW = 4
const SUMMARY_HEADER_ROW = 7
const SUMMARY_FIRST_ROW = 8
const CONTROL_HEADER_ROW = 7
const CONTROL_FIRST_ROW = 8

const STATUS_LABELS = {
  worked: 'Çalıştı',
  overtime: 'Çalıştı + FM',
  scheduled: 'Planlı',
  off: 'Hafta tatili',
  on_leave: 'İzin',
  absent: 'Devamsız',
  sunday: 'Pazar',
  no_record: 'Boş',
}

const APPROVAL_LABELS = {
  draft: 'Taslak',
  submitted: 'Kontrolde',
  approved: 'Onaylandi',
  returned: 'Geri dondu',
  locked: 'Kilitli',
  missing: 'Eksik',
  pending: 'Bekliyor',
}

const APPROVAL_COLORS = {
  draft: COLORS.gray,
  submitted: COLORS.amber,
  approved: COLORS.green,
  returned: COLORS.red,
  locked: COLORS.teal,
  missing: COLORS.gray,
  pending: COLORS.amber,
}

function cleanSheetName(value) {
  const cleaned = String(value || 'Sayfa')
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'Sayfa').slice(0, 31)
}

export function uniqueSheetName(value, usedNames = new Set()) {
  const base = cleanSheetName(value)
  let candidate = base
  let n = 2
  while (usedNames.has(candidate.toLocaleLowerCase('tr-TR'))) {
    const suffix = ` (${n})`
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    n += 1
  }
  usedNames.add(candidate.toLocaleLowerCase('tr-TR'))
  return candidate
}

function dateForDay(month, dayNo) {
  return `${month}-${String(dayNo).padStart(2, '0')}`
}

function deptNameForRow(row) {
  return row.dept || row.dept_name || 'Departmansız'
}

function formatHour(value) {
  if (value == null || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  const hour = Math.floor(n) % 24
  const minute = Math.round((n - Math.floor(n)) * 60)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function formatShiftCell(cell) {
  if (!cell?.shiftName && cell?.startHour == null) return ''
  const hours = cell.startHour != null ? `${formatHour(cell.startHour)}-${formatHour(cell.endHour)}` : ''
  return [cell.shiftName, hours].filter(Boolean).join(' ')
}

function dayCellRange(mainInfo, dayNo) {
  const col = 3 + dayNo
  return `${quoteSheet(mainInfo.sheetName)}!$${colLetter(col)}$${mainInfo.firstDataRow}:$${colLetter(col)}$${mainInfo.lastDataRow}`
}

function formulaResult(formula, result) {
  return { formula, result }
}

function approvalLabel(status) {
  return APPROVAL_LABELS[status] || status || 'Eksik'
}

function approvalColor(status) {
  return APPROVAL_COLORS[status] || COLORS.gray
}

function approvalTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeApproval(approval, month, y, m, daysInMonth) {
  const periodApproval = approval?.period_approval || {
    period: month,
    status: 'draft',
    note: '',
  }
  const dailyByDate = new Map((approval?.daily_approvals || []).map(row => [row.work_date, row]))
  const dailyApprovals = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1
    const workDate = `${month}-${String(day).padStart(2, '0')}`
    const weekday = new Date(y, m - 1, day).getDay()
    return {
      period: month,
      work_date: workDate,
      day,
      weekday,
      is_weekend: weekday === 0 || weekday === 6,
      status: 'missing',
      note: '',
      ...(dailyByDate.get(workDate) || {}),
    }
  })
  return {
    period_approval: periodApproval,
    daily_approvals: dailyApprovals,
    events: Array.isArray(approval?.events) ? approval.events : [],
  }
}

function summarizeApproval(approval) {
  const counts = approval.daily_approvals.reduce((acc, row) => {
    const status = row.status || 'missing'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, { missing: 0, pending: 0, approved: 0, returned: 0 })
  return {
    ...counts,
    totalDays: approval.daily_approvals.length,
    periodStatus: approval.period_approval?.status || 'draft',
    periodStatusLabel: approvalLabel(approval.period_approval?.status || 'draft'),
  }
}

function countCodes(cells, codes) {
  return cells.filter(cell => codes.includes(cell?.code || '')).length
}

function closingIssueText(row, daysInMonth) {
  const cells = Array.from({ length: daysInMonth }, (_, i) => row.cells[i] || {})
  const scheduled = countCodes(cells, ['P'])
  const empty = cells.filter(cell => !(cell.code || '') && cell.status !== 'sunday').length
  const off = countCodes(cells, ['h'])
  const absent = countCodes(cells, ['Y'])
  const absentWithoutReason = cells.filter(cell => (cell.code || '') === 'Y' && !String(cell.absentReason || '').trim()).length
  const parts = []
  if (scheduled > 0) parts.push(`${scheduled} planlı`)
  if (empty > 0) parts.push(`${empty} boş`)
  if (off === 0) parts.push('OFF yok')
  if (absentWithoutReason > 0) parts.push(`${absentWithoutReason} devamsız nedeni eksik`)
  if (absent > 0) parts.push(`${absent} devamsız`)
  return {
    scheduled,
    empty,
    off,
    absent,
    absentWithoutReason,
    fmHours: row.totals?.fmHours || 0,
    status: parts.length ? 'Kontrol' : 'Hazır',
    issue: parts.join(' · ') || 'Kapanışa hazır',
  }
}

function detailRows(rows, daysInMonth) {
  return rows.flatMap(row => (
    Array.from({ length: daysInMonth }, (_, i) => {
      const cell = row.cells[i]
      if (!cell || (!cell.code && !cell.workLocationName && !cell.shiftName && !cell.overtimeHours && !cell.absentReason)) return null
      return {
        date: cell.date,
        name: row.name,
        dept: row.dept,
        role: row.role || cell.roleName || '',
        code: cell.code || '',
        status: STATUS_LABELS[cell.status] || cell.status || '',
        shift: formatShiftCell(cell),
        location: cell.workLocationName || '',
        overtimeHours: cell.overtimeHours || '',
        absentReason: cell.absentReason || '',
      }
    }).filter(Boolean)
  ))
}

export function buildFoyuRows(staffRows, daysByStaff, holidaySet, codeIndex) {
  return staffRows.map(staff => ({
    ...buildFoyuRow(staff, daysByStaff?.[staff.id] || [], holidaySet, codeIndex),
    deptId: staff.department_id || staff.dept_id || null,
    position: staff.position || '',
  }))
}

function emptyTotals() {
  return FOYU_TOTAL_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {})
}

export function summarizeFoyuRows(rows) {
  const groups = new Map()
  rows.forEach(row => {
    const dept = deptNameForRow(row)
    if (!groups.has(dept)) groups.set(dept, { dept, staffCount: 0, totals: emptyTotals(), rows: [] })
    const group = groups.get(dept)
    group.staffCount += 1
    group.rows.push(row)
    FOYU_TOTAL_COLUMNS.forEach(col => {
      group.totals[col.key] += Number(row.totals?.[col.key] || 0)
    })
  })
  return [...groups.values()].sort((a, b) => a.dept.localeCompare(b.dept, 'tr'))
}

function styleTitleCell(cell, hex = COLORS.ink) {
  cell.fill = fill(hex)
  cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cell.border = border
}

function addHeaderRow(ws, context) {
  const { daysInMonth, holidaySet, holidayNames, month, y, m } = context
  const header = ws.getRow(3)
  header.values = [
    'NO',
    'ADI SOYADI',
    'DEPARTMAN',
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...FOYU_TOTAL_COLUMNS.map(c => c.label),
  ]
  styleHeaderRow(header)
  header.eachCell((cell, colNo) => {
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
    const dayNo = colNo - 3
    if (dayNo >= 1 && dayNo <= daysInMonth) {
      const date = dateForDay(month, dayNo)
      if (holidaySet.has(date)) {
        cell.fill = fill(COLORS.red)
        cell.note = holidayNames[date]
      } else if (new Date(y, m - 1, dayNo).getDay() === 0) {
        cell.fill = fill(COLORS.amber)
      }
    }
  })
  header.height = 20
}

function addDataRows(ws, rows, context) {
  const { daysInMonth, month, y, m, totalColStart } = context
  rows.forEach((row, idx) => {
    const excelRow = ws.addRow([
      idx + 1,
      row.name,
      row.dept,
      ...Array.from({ length: daysInMonth }, (_, i) => row.cells[i]?.code || ''),
      ...FOYU_TOTAL_COLUMNS.map(col => row.totals[col.key] || ''),
    ])
    excelRow.height = 16
    excelRow.eachCell({ includeEmpty: true }, (cell, colNo) => {
      if (colNo > context.lastCol) return
      cell.border = border
      cell.font = { size: 8 }
      cell.alignment = { horizontal: colNo === 2 || colNo === 3 ? 'left' : 'center', vertical: 'middle' }
      const dayNo = colNo - 3
      if (dayNo >= 1 && dayNo <= daysInMonth) {
        const dayCell = row.cells[dayNo - 1]
        if (dayCell?.hex) {
          cell.fill = fill(dayCell.hex)
          cell.font = { size: 8, bold: true, color: { argb: 'FFFFFFFF' } }
        } else if (new Date(y, m - 1, dayNo).getDay() === 0) {
          cell.fill = fill('FDF3E0')
        }
        const noteParts = [
          dayCell?.date,
          dayCell?.status ? (STATUS_LABELS[dayCell.status] || dayCell.status) : '',
          formatShiftCell(dayCell),
          dayCell?.workLocationName ? `Nokta: ${dayCell.workLocationName}` : '',
          dayCell?.overtimeHours ? `FM: ${dayCell.overtimeHours}s` : '',
          dayCell?.absentReason ? `Neden: ${dayCell.absentReason}` : '',
        ].filter(Boolean)
        if (noteParts.length > 1) cell.note = noteParts.join('\n')
      } else if (colNo >= totalColStart) {
        cell.font = { size: 8, bold: true }
        cell.numFmt = FOYU_TOTAL_COLUMNS[colNo - totalColStart]?.key === 'fmHours' ? '#,##0.0' : '#,##0'
      }
      if (dayNo >= 1 && context.holidaySet.has(dateForDay(month, dayNo))) {
        cell.border = {
          ...border,
          top: { style: 'thin', color: { argb: argb(COLORS.red) } },
          bottom: { style: 'thin', color: { argb: argb(COLORS.red) } },
        }
      }
    })
  })
}

// Kod → hex: kayıt varsa oradan, yoksa eski sabitler
function hexForCode(code, context) {
  return context?.hexByCode?.[code] || codeHex(code)
}

function addLegend(ws, context) {
  ws.addRow([])
  const title = ws.addRow(['KOD AÇIKLAMALARI'])
  title.height = 18
  ws.mergeCells(title.number, 1, title.number, 3)
  const titleCell = title.getCell(1)
  styleTitleCell(titleCell, COLORS.header)

  ;(context?.legendRows || buildFoyuLegend(null)).forEach(([code, label]) => {
    const row = ws.addRow([code, label])
    row.getCell(1).fill = fill(hexForCode(code, context))
    row.getCell(1).font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } }
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(1).border = border
    row.getCell(2).font = { size: 8 }
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }
  })
}

function signatureRanges(lastCol) {
  return SIGNATURE_LABELS.map((label, idx) => {
    const start = Math.floor((idx * lastCol) / SIGNATURE_LABELS.length) + 1
    const end = Math.floor(((idx + 1) * lastCol) / SIGNATURE_LABELS.length)
    return { label, start, end: Math.max(start, end) }
  })
}

function addSignatureBlocks(ws, lastCol) {
  ws.addRow([])
  ws.addRow([])
  const signRowIdx = ws.rowCount + 1
  signatureRanges(lastCol).forEach(({ label, start, end }) => {
    ws.mergeCells(signRowIdx, start, signRowIdx, end)
    const cell = ws.getCell(signRowIdx, start)
    cell.value = `${label}\n\nAd Soyad:\n\nİmza:`
    cell.font = { size: 9, bold: true, color: { argb: argb(COLORS.ink) } }
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    cell.fill = fill(COLORS.surface)
    cell.border = border
  })
  ws.getRow(signRowIdx).height = 72
  return signRowIdx
}

function setFoyuWidths(ws, daysInMonth, totalColStart) {
  ws.getColumn(1).width = 4
  ws.getColumn(2).width = 24
  ws.getColumn(3).width = 17
  for (let i = 0; i < daysInMonth; i += 1) ws.getColumn(4 + i).width = 3.6
  FOYU_TOTAL_COLUMNS.forEach((col, i) => {
    ws.getColumn(totalColStart + i).width = col.key === 'fmHours' ? 7 : 4.7
  })
}

function addFoyuSheet(workbook, sheetName, rows, context, tabHex = COLORS.purple) {
  const { daysInMonth, monthLabel, companyName, deptName } = context
  const lastCol = 3 + daysInMonth + FOYU_TOTAL_COLUMNS.length
  const totalColStart = 4 + daysInMonth
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 3, showGridLines: false }],
  })
  setupSheet(ws, tabHex)
  setupTitle(ws, `${companyName} - AYLIK PUANTAJ CETVELİ`, `Dönem: ${monthLabel}   ·   Departman: ${deptName}   ·   ${rows.length} personel`, lastCol)

  const sheetContext = { ...context, totalColStart, lastCol }
  addHeaderRow(ws, sheetContext)
  addDataRows(ws, rows, sheetContext)
  addLegend(ws, sheetContext)
  const signatureRow = addSignatureBlocks(ws, lastCol)
  setFoyuWidths(ws, daysInMonth, totalColStart)

  const lastDataRow = Math.max(FIRST_DATA_ROW, FIRST_DATA_ROW + rows.length - 1)
  ws.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: Math.max(3, lastDataRow), column: lastCol },
  }
  ws.pageSetup.printTitlesRow = '1:3'
  ws.pageSetup.printArea = `A1:${colLetter(lastCol)}${signatureRow}`
  ws.headerFooter.oddFooter = `&L${monthLabel}&R${sheetName} - Sayfa &P / &N`

  return { ws, sheetName, firstDataRow: FIRST_DATA_ROW, lastDataRow, lastCol, totalColStart, signatureRow }
}

function mainRange(sheetName, col, firstDataRow, lastDataRow) {
  return `${quoteSheet(sheetName)}!$${colLetter(col)}$${firstDataRow}:$${colLetter(col)}$${lastDataRow}`
}

function formulaCell(formula, result) {
  return { formula, result }
}

function addSummarySheet(workbook, sheetName, rows, summaryRows, context, mainInfo) {
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: SUMMARY_HEADER_ROW, showGridLines: false }],
  })
  setupSheet(ws, COLORS.green)
  setupTitle(ws, `${context.companyName} - PUANTAJ ÖZETİ`, `Dönem: ${context.monthLabel}   ·   ${rows.length} personel   ·   ${summaryRows.length} departman`, 12)

  const totalWorked = rows.reduce((sum, row) => sum + Number(row.totals.worked || 0), 0)
  const totalLeave = rows.reduce((sum, row) => (
    sum + Number(row.totals.annual || 0) + Number(row.totals.sick || 0) + Number(row.totals.unpaid || 0) + Number(row.totals.otherLeave || 0)
  ), 0)
  const totalFm = rows.reduce((sum, row) => sum + Number(row.totals.fmHours || 0), 0)
  addMetric(ws, 1, 'PERSONEL', rows.length, COLORS.blue)
  addMetric(ws, 3, 'ÇALIŞILAN GÜN', totalWorked, COLORS.green)
  addMetric(ws, 5, 'İZİN / RAPOR', totalLeave, COLORS.amber)
  addMetric(ws, 7, 'FAZLA MESAİ', totalFm, COLORS.purple)

  if (context.approvalStats) {
    addMetric(ws, 9, 'ONAYLI GUN', `${context.approvalStats.approved || 0}/${context.approvalStats.totalDays || 0}`, COLORS.green)
    addMetric(ws, 11, 'ONAY DURUMU', context.approvalStats.periodStatusLabel, approvalColor(context.approvalStats.periodStatus))
  }

  const header = ws.getRow(SUMMARY_HEADER_ROW)
  header.values = ['DEPARTMAN', 'PERSONEL', ...FOYU_TOTAL_COLUMNS.map(c => c.label)]
  styleHeaderRow(header)

  const deptColRange = mainRange(mainInfo.sheetName, 3, mainInfo.firstDataRow, mainInfo.lastDataRow)
  const summaryLastRow = SUMMARY_FIRST_ROW + summaryRows.length
  summaryRows.forEach((summary, idx) => {
    const rowNo = SUMMARY_FIRST_ROW + idx
    const row = ws.getRow(rowNo)
    row.getCell(1).value = summary.dept
    row.getCell(2).value = formulaCell(`COUNTIF(${deptColRange},$A${rowNo})`, summary.staffCount)
    FOYU_TOTAL_COLUMNS.forEach((col, totalIdx) => {
      const sourceCol = mainInfo.totalColStart + totalIdx
      const sourceRange = mainRange(mainInfo.sheetName, sourceCol, mainInfo.firstDataRow, mainInfo.lastDataRow)
      row.getCell(3 + totalIdx).value = formulaCell(`SUMIF(${deptColRange},$A${rowNo},${sourceRange})`, summary.totals[col.key])
    })
  })

  const totalRow = ws.getRow(summaryLastRow)
  totalRow.getCell(1).value = 'GENEL TOPLAM'
  totalRow.getCell(2).value = summaryRows.length
    ? formulaCell(`SUM(B${SUMMARY_FIRST_ROW}:B${summaryLastRow - 1})`, rows.length)
    : rows.length
  FOYU_TOTAL_COLUMNS.forEach((col, idx) => {
    const result = summaryRows.reduce((sum, summary) => sum + Number(summary.totals[col.key] || 0), 0)
    const letter = colLetter(3 + idx)
    totalRow.getCell(3 + idx).value = summaryRows.length
      ? formulaCell(`SUM(${letter}${SUMMARY_FIRST_ROW}:${letter}${summaryLastRow - 1})`, result)
      : result
  })

  for (let rowNo = SUMMARY_FIRST_ROW; rowNo <= summaryLastRow; rowNo += 1) {
    const row = ws.getRow(rowNo)
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      if (colNo > 2 + FOYU_TOTAL_COLUMNS.length) return
      cell.border = border
      cell.font = { size: 9, bold: rowNo === summaryLastRow }
      cell.alignment = { horizontal: colNo === 1 ? 'left' : 'center', vertical: 'middle' }
      if (rowNo === summaryLastRow) cell.fill = fill(COLORS.surface)
      if (colNo >= 2) cell.numFmt = FOYU_TOTAL_COLUMNS[colNo - 3]?.key === 'fmHours' ? '#,##0.0' : '#,##0'
    })
  }

  ws.getColumn(1).width = 24
  ws.getColumn(2).width = 10
  FOYU_TOTAL_COLUMNS.forEach((col, idx) => {
    ws.getColumn(3 + idx).width = col.key === 'fmHours' ? 10 : 7
  })
  ws.autoFilter = {
    from: { row: SUMMARY_HEADER_ROW, column: 1 },
    to: { row: summaryLastRow, column: 2 + FOYU_TOTAL_COLUMNS.length },
  }
  ws.pageSetup.printTitlesRow = '1:7'
  ws.pageSetup.printArea = `A1:${colLetter(2 + FOYU_TOTAL_COLUMNS.length)}${summaryLastRow}`

  return { ws, sheetName, firstRow: SUMMARY_FIRST_ROW, lastRow: summaryLastRow }
}

function addDailyControlSheet(workbook, sheetName, rows, context, mainInfo) {
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: CONTROL_HEADER_ROW, showGridLines: false }],
  })
  setupSheet(ws, COLORS.blue)
  setupTitle(ws, `${context.companyName} - GÜNLÜK KAPANIŞ`, `Dönem: ${context.monthLabel}   ·   Gün bazında plan/puantaj kontrolü`, 9)

  const plannedTotal = rows.reduce((sum, row) => sum + countCodes(row.cells, ['P']), 0)
  const emptyTotal = rows.reduce((sum, row) => sum + closingIssueText(row, context.daysInMonth).empty, 0)
  const absentTotal = rows.reduce((sum, row) => sum + countCodes(row.cells, ['Y']), 0)
  addMetric(ws, 1, 'PLANLI KALAN', plannedTotal, plannedTotal ? COLORS.amber : COLORS.green)
  addMetric(ws, 3, 'BOŞ GÜN', emptyTotal, emptyTotal ? COLORS.red : COLORS.green)
  addMetric(ws, 5, 'DEVAMSIZ', absentTotal, absentTotal ? COLORS.red : COLORS.gray)
  addMetric(ws, 7, 'PERSONEL', rows.length, COLORS.blue)

  const header = ws.getRow(CONTROL_HEADER_ROW)
  header.values = ['TARİH', 'GÜN', 'N', 'P', 'h', 'İZİN', 'Y', 'BOŞ', 'DURUM']
  styleHeaderRow(header)

  for (let day = 1; day <= context.daysInMonth; day += 1) {
    const rowNo = CONTROL_FIRST_ROW + day - 1
    const date = `${context.month}-${String(day).padStart(2, '0')}`
    const weekday = new Date(context.y, context.m - 1, day).toLocaleDateString('tr-TR', { weekday: 'short' })
    const range = dayCellRange(mainInfo, day)
    const sourceCells = rows.map(row => row.cells[day - 1] || {})
    const worked = countCodes(sourceCells, ['N'])
    const planned = countCodes(sourceCells, ['P'])
    const off = countCodes(sourceCells, ['h'])
    const leave = countCodes(sourceCells, ['yi', 'r', 'üi', 'i'])
    const absent = countCodes(sourceCells, ['Y'])
    const empty = sourceCells.filter(cell => !(cell.code || '') && cell.status !== 'sunday').length
    const row = ws.getRow(rowNo)
    row.getCell(1).value = date
    row.getCell(2).value = weekday
    row.getCell(3).value = formulaResult(`COUNTIF(${range},"N")`, worked)
    row.getCell(4).value = formulaResult(`COUNTIF(${range},"P")`, planned)
    row.getCell(5).value = formulaResult(`COUNTIF(${range},"h")`, off)
    row.getCell(6).value = formulaResult(`COUNTIF(${range},"yi")+COUNTIF(${range},"r")+COUNTIF(${range},"üi")+COUNTIF(${range},"i")`, leave)
    row.getCell(7).value = formulaResult(`COUNTIF(${range},"Y")`, absent)
    row.getCell(8).value = empty
    row.getCell(9).value = planned + empty > 0 ? 'Kontrol' : 'Hazır'
  }

  for (let rowNo = CONTROL_FIRST_ROW; rowNo < CONTROL_FIRST_ROW + context.daysInMonth; rowNo += 1) {
    const row = ws.getRow(rowNo)
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      if (colNo > 9) return
      cell.border = border
      cell.font = { size: 9, bold: colNo === 9 }
      cell.alignment = { horizontal: colNo <= 2 ? 'left' : 'center', vertical: 'middle' }
      if (cell.value === 'Kontrol') {
        cell.fill = fill('FEF3C7')
        cell.font = { size: 9, bold: true, color: { argb: argb(COLORS.amber) } }
      }
      if (cell.value === 'Hazır') {
        cell.fill = fill('DCFCE7')
        cell.font = { size: 9, bold: true, color: { argb: argb(COLORS.green) } }
      }
    })
  }

  ;[12, 8, 7, 7, 7, 8, 7, 8, 11].forEach((width, idx) => { ws.getColumn(idx + 1).width = width })
  const lastRow = CONTROL_FIRST_ROW + Math.max(context.daysInMonth, 1) - 1
  ws.autoFilter = { from: { row: CONTROL_HEADER_ROW, column: 1 }, to: { row: lastRow, column: 9 } }
  ws.pageSetup.printTitlesRow = '1:7'
  ws.pageSetup.printArea = `A1:I${lastRow}`
  return { ws, sheetName, firstRow: CONTROL_FIRST_ROW, lastRow }
}

function addClosingControlSheet(workbook, sheetName, rows, context) {
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: CONTROL_HEADER_ROW, showGridLines: false }],
  })
  setupSheet(ws, COLORS.amber)
  setupTitle(ws, `${context.companyName} - KAPANIŞ KONTROL`, `Dönem: ${context.monthLabel}   ·   Personel bazında puantaj riski`, 11)

  const issueRows = rows.map(row => ({ row, ...closingIssueText(row, context.daysInMonth) }))
  const blocking = issueRows.filter(item => item.status !== 'Hazır').length
  addMetric(ws, 1, 'HAZIR PERSONEL', rows.length - blocking, COLORS.green)
  addMetric(ws, 3, 'KONTROL', blocking, blocking ? COLORS.amber : COLORS.green)
  addMetric(ws, 5, 'PLANLI', issueRows.reduce((sum, item) => sum + item.scheduled, 0), COLORS.amber)
  addMetric(ws, 7, 'BOŞ', issueRows.reduce((sum, item) => sum + item.empty, 0), COLORS.red)

  const header = ws.getRow(CONTROL_HEADER_ROW)
  header.values = ['NO', 'PERSONEL', 'DEPARTMAN', 'ROL', 'P', 'BOŞ', 'h', 'Y', 'Y NOTSUZ', 'FM', 'DURUM / NOT']
  styleHeaderRow(header)

  issueRows.forEach((item, idx) => {
    const rowNo = CONTROL_FIRST_ROW + idx
    const excelRow = ws.getRow(rowNo)
    excelRow.values = [
      idx + 1,
      item.row.name,
      item.row.dept,
      item.row.role || item.row.position || '',
      item.scheduled,
      item.empty,
      item.off,
      item.absent,
      item.absentWithoutReason,
      item.fmHours,
      item.issue,
    ]
    excelRow.eachCell({ includeEmpty: true }, (cell, colNo) => {
      if (colNo > 11) return
      cell.border = border
      cell.font = { size: 9, bold: colNo === 11 }
      cell.alignment = { horizontal: [2, 3, 4, 11].includes(colNo) ? 'left' : 'center', vertical: 'middle', wrapText: true }
      if (item.status === 'Kontrol') {
        cell.fill = colNo === 11 ? fill('FEF3C7') : cell.fill
        if (colNo === 11) cell.font = { size: 9, bold: true, color: { argb: argb(COLORS.amber) } }
      }
    })
  })

  ;[5, 24, 18, 14, 7, 7, 7, 7, 9, 8, 34].forEach((width, idx) => { ws.getColumn(idx + 1).width = width })
  const lastRow = CONTROL_FIRST_ROW + Math.max(issueRows.length, 1) - 1
  ws.autoFilter = { from: { row: CONTROL_HEADER_ROW, column: 1 }, to: { row: lastRow, column: 11 } }
  ws.pageSetup.printTitlesRow = '1:7'
  ws.pageSetup.printArea = `A1:K${lastRow}`
  return { ws, sheetName, firstRow: CONTROL_FIRST_ROW, lastRow }
}

function addDetailSheet(workbook, sheetName, rows, context) {
  const dataRows = detailRows(rows, context.daysInMonth)
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: CONTROL_HEADER_ROW, showGridLines: false }],
  })
  setupSheet(ws, COLORS.teal)
  setupTitle(ws, `${context.companyName} - VARDİYA DETAY`, `Dönem: ${context.monthLabel}   ·   Puantaj hücrelerinin vardiya ve nokta dökümü`, 10)
  addMetric(ws, 1, 'DETAY SATIRI', dataRows.length, COLORS.teal)
  addMetric(ws, 3, 'NOKTALI KAYIT', dataRows.filter(row => row.location).length, COLORS.blue)
  addMetric(ws, 5, 'FM SATIRI', dataRows.filter(row => row.overtimeHours).length, COLORS.amber)
  addMetric(ws, 7, 'DEVAMSIZ NOT', dataRows.filter(row => row.absentReason).length, COLORS.red)

  const header = ws.getRow(CONTROL_HEADER_ROW)
  header.values = ['TARİH', 'PERSONEL', 'DEPARTMAN', 'ROL', 'KOD', 'DURUM', 'VARDİYA / SAAT', 'ÇALIŞMA NOKTASI', 'FM', 'NOT']
  styleHeaderRow(header)

  dataRows.forEach((item, idx) => {
    const row = ws.getRow(CONTROL_FIRST_ROW + idx)
    row.values = [
      item.date,
      item.name,
      item.dept,
      item.role,
      item.code,
      item.status,
      item.shift,
      item.location,
      item.overtimeHours,
      item.absentReason,
    ]
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      if (colNo > 10) return
      cell.border = border
      cell.font = { size: 8, bold: colNo === 5 }
      cell.alignment = { horizontal: [1, 5, 9].includes(colNo) ? 'center' : 'left', vertical: 'middle', wrapText: true }
      if (colNo === 5 && item.code) {
        cell.fill = fill(hexForCode(item.code, context))
        cell.font = { size: 8, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
  })

  ;[12, 24, 18, 14, 6, 12, 18, 22, 7, 28].forEach((width, idx) => { ws.getColumn(idx + 1).width = width })
  const lastRow = CONTROL_FIRST_ROW + Math.max(dataRows.length, 1) - 1
  ws.autoFilter = { from: { row: CONTROL_HEADER_ROW, column: 1 }, to: { row: lastRow, column: 10 } }
  ws.pageSetup.printTitlesRow = '1:7'
  ws.pageSetup.printArea = `A1:J${lastRow}`
  return { ws, sheetName, firstRow: CONTROL_FIRST_ROW, lastRow }
}

function addApprovalSheet(workbook, sheetName, rows, context, mainInfo) {
  const approval = context.approval
  const stats = context.approvalStats
  const period = approval.period_approval || {}
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: CONTROL_HEADER_ROW, showGridLines: false }],
  })
  setupSheet(ws, COLORS.purple)
  setupTitle(ws, `${context.companyName} - PUANTAJ ONAY TAKIBI`, `Donem: ${context.monthLabel}   -   Aylik onay, gunluk kontrol ve islem gecmisi`, 12)

  addMetric(ws, 1, 'AY DURUMU', stats.periodStatusLabel, approvalColor(stats.periodStatus))
  addMetric(ws, 3, 'ONAYLI GUN', `${stats.approved || 0}/${stats.totalDays || 0}`, COLORS.green)
  addMetric(ws, 5, 'BEKLEYEN', stats.pending || 0, (stats.pending || 0) ? COLORS.amber : COLORS.gray)
  addMetric(ws, 7, 'GERI DONEN', stats.returned || 0, (stats.returned || 0) ? COLORS.red : COLORS.gray)
  addMetric(ws, 9, 'EKSIK', stats.missing || 0, (stats.missing || 0) ? COLORS.amber : COLORS.green)
  addMetric(ws, 11, 'PERSONEL', rows.length, COLORS.blue)

  const periodHeader = ws.getRow(CONTROL_HEADER_ROW)
  periodHeader.values = ['AY DURUMU', 'NOT', 'GONDEREN', 'GONDERIM', 'ONAYLAYAN', 'ONAY', 'GERI GONDEREN', 'GERI DONUS', 'KILITLEYEN', 'KILIT', 'DEPARTMAN', 'KAPSAM']
  styleHeaderRow(periodHeader)
  const periodRow = ws.getRow(CONTROL_FIRST_ROW)
  periodRow.values = [
    approvalLabel(period.status || 'draft'),
    period.note || '',
    period.submitted_by_name || '',
    approvalTime(period.submitted_at),
    period.approved_by_name || '',
    approvalTime(period.approved_at),
    period.returned_by_name || '',
    approvalTime(period.returned_at),
    period.locked_by_name || '',
    approvalTime(period.locked_at),
    period.dept_name || '',
    period.dept_scope || 'all',
  ]
  periodRow.eachCell({ includeEmpty: true }, (cell, colNo) => {
    if (colNo > 12) return
    cell.border = border
    cell.font = { size: 9, bold: colNo === 1 }
    cell.alignment = { horizontal: [2, 3, 5, 7, 9, 11, 12].includes(colNo) ? 'left' : 'center', vertical: 'middle', wrapText: true }
    if (colNo === 1) {
      cell.fill = fill(approvalColor(period.status || 'draft'))
      cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
    }
  })

  const dailyHeaderRow = CONTROL_FIRST_ROW + 3
  const dailyFirstRow = dailyHeaderRow + 1
  const dailyHeader = ws.getRow(dailyHeaderRow)
  dailyHeader.values = ['TARIH', 'GUN', 'ONAY', 'GONDEREN', 'ONAYLAYAN', 'NOT', 'N', 'P', 'BOS', 'Y NOTSUZ', 'PUANTAJ', 'AKSIYON']
  styleHeaderRow(dailyHeader)

  approval.daily_approvals.forEach((item, idx) => {
    const rowNo = dailyFirstRow + idx
    const day = Number(String(item.work_date).slice(8, 10))
    const sourceCells = rows.map(row => row.cells[day - 1] || {})
    const range = dayCellRange(mainInfo, day)
    const worked = countCodes(sourceCells, ['N'])
    const planned = countCodes(sourceCells, ['P'])
    const empty = sourceCells.filter(cell => !(cell.code || '') && cell.status !== 'sunday').length
    const absentWithoutReason = sourceCells.filter(cell => (cell.code || '') === 'Y' && !String(cell.absentReason || '').trim()).length
    const puantajStatus = planned + empty + absentWithoutReason > 0 ? 'Kontrol' : 'Hazir'
    const action = item.status === 'approved'
      ? 'Tamam'
      : item.status === 'returned'
        ? 'Duzeltme bekliyor'
        : item.status === 'pending'
          ? 'Mudur onayi bekliyor'
          : 'Kontrole gonder'
    const row = ws.getRow(rowNo)
    row.values = [
      item.work_date,
      new Date(context.y, context.m - 1, day).toLocaleDateString('tr-TR', { weekday: 'short' }),
      approvalLabel(item.status || 'missing'),
      item.submitted_by_name || '',
      item.approved_by_name || '',
      item.note || '',
      formulaResult(`COUNTIF(${range},"N")`, worked),
      formulaResult(`COUNTIF(${range},"P")`, planned),
      empty,
      absentWithoutReason,
      puantajStatus,
      action,
    ]
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      if (colNo > 12) return
      cell.border = border
      cell.font = { size: 8, bold: [3, 11, 12].includes(colNo) }
      cell.alignment = { horizontal: [1, 2, 3, 7, 8, 9, 10, 11].includes(colNo) ? 'center' : 'left', vertical: 'middle', wrapText: true }
      if (colNo === 3) {
        cell.fill = fill(approvalColor(item.status || 'missing'))
        cell.font = { size: 8, bold: true, color: { argb: 'FFFFFFFF' } }
      }
      if (colNo === 11 && puantajStatus === 'Kontrol') {
        cell.fill = fill('FEF3C7')
        cell.font = { size: 8, bold: true, color: { argb: argb(COLORS.amber) } }
      }
      if (colNo === 11 && puantajStatus === 'Hazir') {
        cell.fill = fill('DCFCE7')
        cell.font = { size: 8, bold: true, color: { argb: argb(COLORS.green) } }
      }
    })
  })

  const eventsTitleRow = dailyFirstRow + context.daysInMonth + 2
  ws.mergeCells(eventsTitleRow, 1, eventsTitleRow, 12)
  const eventsTitle = ws.getCell(eventsTitleRow, 1)
  eventsTitle.value = 'ISLEM GECMISI'
  styleTitleCell(eventsTitle, COLORS.header)

  const eventsHeaderRow = eventsTitleRow + 1
  const eventsHeader = ws.getRow(eventsHeaderRow)
  eventsHeader.values = ['ZAMAN', 'KAPSAM', 'TARIH / DONEM', 'ISLEM', 'DURUM', 'KULLANICI', 'NOT']
  styleHeaderRow(eventsHeader)

  approval.events.forEach((event, idx) => {
    const row = ws.getRow(eventsHeaderRow + 1 + idx)
    row.values = [
      approvalTime(event.created_at),
      event.scope || '',
      event.work_date || event.period || '',
      event.action || '',
      approvalLabel(event.status || ''),
      event.user_name || '',
      event.note || '',
    ]
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      if (colNo > 7) return
      cell.border = border
      cell.font = { size: 8, bold: colNo === 5 }
      cell.alignment = { horizontal: [1, 2, 3, 4, 5].includes(colNo) ? 'center' : 'left', vertical: 'middle', wrapText: true }
      if (colNo === 5 && event.status) {
        cell.fill = fill(approvalColor(event.status))
        cell.font = { size: 8, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
  })

  ;[13, 8, 12, 18, 18, 28, 7, 7, 7, 9, 11, 20].forEach((width, idx) => { ws.getColumn(idx + 1).width = width })
  const dailyLastRow = dailyFirstRow + Math.max(context.daysInMonth, 1) - 1
  const lastRow = eventsHeaderRow + Math.max(approval.events.length, 1)
  ws.autoFilter = { from: { row: dailyHeaderRow, column: 1 }, to: { row: dailyLastRow, column: 12 } }
  ws.pageSetup.printTitlesRow = '1:7'
  ws.pageSetup.printArea = `A1:L${lastRow}`
  return { ws, sheetName, firstRow: dailyFirstRow, lastRow, eventsHeaderRow }
}

export function buildPuantajFoyuWorkbook(ExcelJS, options) {
  const [y, m] = options.month.split('-').map(Number)
  const daysInMonth = options.daysInMonth || new Date(y, m, 0).getDate()
  const holidays = Array.isArray(options.holidays) ? options.holidays : []
  const monthHolidays = holidays.filter(holiday => holiday.date?.startsWith(options.month))
  const holidaySet = new Set(monthHolidays.map(holiday => holiday.date))
  const holidayNames = Object.fromEntries(monthHolidays.map(holiday => [holiday.date, holiday.name]))
  const codeIndex = buildFoyuCodeIndex(options.codes)
  const legendRows = buildFoyuLegend(options.codes)
  const hexByCode = Object.fromEntries(Object.values(codeIndex).map(meta => [meta.code, meta.hex]))
  const rows = options.rows || buildFoyuRows(options.staffRows || [], options.daysByStaff || {}, holidaySet, codeIndex)
  const summaryRows = summarizeFoyuRows(rows)
  const deptName = options.deptName || 'Tüm Departmanlar'
  const companyName = options.companyName || 'YYS Kampüs'
  const approval = normalizeApproval(options.approval, options.month, y, m, daysInMonth)
  const approvalStats = summarizeApproval(approval)
  const usedNames = new Set()

  const workbook = new ExcelJS.Workbook()
  workbook.creator = companyName
  workbook.created = new Date()
  workbook.modified = new Date()

  const context = {
    y,
    m,
    month: options.month,
    monthLabel: options.monthLabel || options.month,
    daysInMonth,
    holidaySet,
    holidayNames,
    companyName,
    approval,
    approvalStats,
    legendRows,
    hexByCode,
  }

  const mainName = uniqueSheetName('Puantaj', usedNames)
  const mainInfo = addFoyuSheet(workbook, mainName, rows, { ...context, deptName }, COLORS.purple)
  const departmentInfos = summaryRows.map(summary => {
    const sheetName = uniqueSheetName(summary.dept, usedNames)
    return addFoyuSheet(workbook, sheetName, summary.rows, { ...context, deptName: summary.dept }, COLORS.teal)
  })
  const summaryName = uniqueSheetName('Özet', usedNames)
  const summaryInfo = addSummarySheet(workbook, summaryName, rows, summaryRows, context, mainInfo)
  const dailyName = uniqueSheetName('Günlük Kontrol', usedNames)
  const dailyInfo = addDailyControlSheet(workbook, dailyName, rows, context, mainInfo)
  const closingName = uniqueSheetName('Kapanış Kontrol', usedNames)
  const closingInfo = addClosingControlSheet(workbook, closingName, rows, context)
  const approvalName = uniqueSheetName('Onay Takibi', usedNames)
  const approvalInfo = addApprovalSheet(workbook, approvalName, rows, context, mainInfo)
  const detailName = uniqueSheetName('Vardiya Detay', usedNames)
  const detailInfo = addDetailSheet(workbook, detailName, rows, context)

  return {
    workbook,
    rows,
    summaryRows,
    sheetNames: {
      main: mainName,
      departments: departmentInfos.map(info => info.sheetName),
      summary: summaryName,
      daily: dailyName,
      closing: closingName,
      approval: approvalName,
      detail: detailName,
    },
    sheetInfo: {
      main: mainInfo,
      departments: departmentInfos,
      summary: summaryInfo,
      daily: dailyInfo,
      closing: closingInfo,
      approval: approvalInfo,
      detail: detailInfo,
    },
  }
}
