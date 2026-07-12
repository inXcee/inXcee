import { buildFoyuRow, FOYU_LEGEND, FOYU_TOTAL_COLUMNS } from './puantajFoyu.js'
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

function countCodes(cells, codes) {
  return cells.filter(cell => codes.includes(cell?.code || '')).length
}

function closingIssueText(row, daysInMonth) {
  const cells = Array.from({ length: daysInMonth }, (_, i) => row.cells[i] || {})
  const scheduled = countCodes(cells, ['P'])
  const empty = cells.filter(cell => !(cell.code || '') && cell.status !== 'sunday').length
  const off = countCodes(cells, ['h'])
  const absent = countCodes(cells, ['Y'])
  const parts = []
  if (scheduled > 0) parts.push(`${scheduled} planlı`)
  if (empty > 0) parts.push(`${empty} boş`)
  if (off === 0) parts.push('OFF yok')
  if (absent > 0) parts.push(`${absent} devamsız`)
  return {
    scheduled,
    empty,
    off,
    absent,
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

export function buildFoyuRows(staffRows, daysByStaff, holidaySet) {
  return staffRows.map(staff => ({
    ...buildFoyuRow(staff, daysByStaff?.[staff.id] || [], holidaySet),
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

function addLegend(ws) {
  ws.addRow([])
  const title = ws.addRow(['KOD AÇIKLAMALARI'])
  title.height = 18
  ws.mergeCells(title.number, 1, title.number, 3)
  const titleCell = title.getCell(1)
  styleTitleCell(titleCell, COLORS.header)

  FOYU_LEGEND.forEach(([code, label]) => {
    const row = ws.addRow([code, label])
    row.getCell(1).fill = fill(codeHex(code))
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
  addLegend(ws)
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
  setupTitle(ws, `${context.companyName} - KAPANIŞ KONTROL`, `Dönem: ${context.monthLabel}   ·   Personel bazında puantaj riski`, 10)

  const issueRows = rows.map(row => ({ row, ...closingIssueText(row, context.daysInMonth) }))
  const blocking = issueRows.filter(item => item.status !== 'Hazır').length
  addMetric(ws, 1, 'HAZIR PERSONEL', rows.length - blocking, COLORS.green)
  addMetric(ws, 3, 'KONTROL', blocking, blocking ? COLORS.amber : COLORS.green)
  addMetric(ws, 5, 'PLANLI', issueRows.reduce((sum, item) => sum + item.scheduled, 0), COLORS.amber)
  addMetric(ws, 7, 'BOŞ', issueRows.reduce((sum, item) => sum + item.empty, 0), COLORS.red)

  const header = ws.getRow(CONTROL_HEADER_ROW)
  header.values = ['NO', 'PERSONEL', 'DEPARTMAN', 'ROL', 'P', 'BOŞ', 'h', 'Y', 'FM', 'DURUM / NOT']
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
      item.fmHours,
      item.issue,
    ]
    excelRow.eachCell({ includeEmpty: true }, (cell, colNo) => {
      if (colNo > 10) return
      cell.border = border
      cell.font = { size: 9, bold: colNo === 10 }
      cell.alignment = { horizontal: [2, 3, 4, 10].includes(colNo) ? 'left' : 'center', vertical: 'middle', wrapText: true }
      if (item.status === 'Kontrol') {
        cell.fill = colNo === 10 ? fill('FEF3C7') : cell.fill
        if (colNo === 10) cell.font = { size: 9, bold: true, color: { argb: argb(COLORS.amber) } }
      }
    })
  })

  ;[5, 24, 18, 14, 7, 7, 7, 7, 8, 34].forEach((width, idx) => { ws.getColumn(idx + 1).width = width })
  const lastRow = CONTROL_FIRST_ROW + Math.max(issueRows.length, 1) - 1
  ws.autoFilter = { from: { row: CONTROL_HEADER_ROW, column: 1 }, to: { row: lastRow, column: 10 } }
  ws.pageSetup.printTitlesRow = '1:7'
  ws.pageSetup.printArea = `A1:J${lastRow}`
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
        cell.fill = fill(codeHex(item.code))
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

export function buildPuantajFoyuWorkbook(ExcelJS, options) {
  const [y, m] = options.month.split('-').map(Number)
  const daysInMonth = options.daysInMonth || new Date(y, m, 0).getDate()
  const holidays = Array.isArray(options.holidays) ? options.holidays : []
  const monthHolidays = holidays.filter(holiday => holiday.date?.startsWith(options.month))
  const holidaySet = new Set(monthHolidays.map(holiday => holiday.date))
  const holidayNames = Object.fromEntries(monthHolidays.map(holiday => [holiday.date, holiday.name]))
  const rows = options.rows || buildFoyuRows(options.staffRows || [], options.daysByStaff || {}, holidaySet)
  const summaryRows = summarizeFoyuRows(rows)
  const deptName = options.deptName || 'Tüm Departmanlar'
  const companyName = options.companyName || 'YYS Kampüs'
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
      detail: detailName,
    },
    sheetInfo: {
      main: mainInfo,
      departments: departmentInfos,
      summary: summaryInfo,
      daily: dailyInfo,
      closing: closingInfo,
      detail: detailInfo,
    },
  }
}
