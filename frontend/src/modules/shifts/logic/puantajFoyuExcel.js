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

  return {
    workbook,
    rows,
    summaryRows,
    sheetNames: {
      main: mainName,
      departments: departmentInfos.map(info => info.sheetName),
      summary: summaryName,
    },
    sheetInfo: {
      main: mainInfo,
      departments: departmentInfos,
      summary: summaryInfo,
    },
  }
}
