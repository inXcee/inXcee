import {
  buildPayrollClosingCheck,
  buildScheduleWarnings,
  cellToScheduleCode,
  computeWeekStats,
} from './schedule.js'
import {
  formatDate,
  formatShiftHours,
  leaveCellMeta,
  leaveTypeLabel,
  shiftHoursFrom,
} from '../shared.jsx'

const DAY_LABELS = ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz']

const TAILWIND_HEX = {
  'bg-blue-400': '60A5FA',
  'bg-blue-500': '3B82F6',
  'bg-blue-600': '2563EB',
  'bg-green-400': '4ADE80',
  'bg-green-500': '22C55E',
  'bg-green-600': '16A34A',
  'bg-red-500': 'EF4444',
  'bg-red-600': 'DC2626',
  'bg-amber-500': 'F59E0B',
  'bg-yellow-500': 'EAB308',
  'bg-orange-400': 'FB923C',
  'bg-orange-500': 'F97316',
  'bg-purple-500': 'A855F7',
  'bg-purple-600': '9333EA',
  'bg-pink-500': 'EC4899',
  'bg-teal-500': '14B8A6',
  'bg-cyan-500': '06B6D4',
  'bg-indigo-500': '6366F1',
  'bg-indigo-600': '4F46E5',
  'bg-lime-500': '84CC16',
}

const STATUS_FILL = { off: '8B5CF6', on_leave: '14B8A6', absent: 'DC2626', empty: 'F1F5F9' }

const COLORS = {
  ink: '0F172A',
  header: '334155',
  surface: 'F8FAFC',
  muted: 'E2E8F0',
  blue: '3B82F6',
  green: '22C55E',
  amber: 'F59E0B',
  red: 'EF4444',
  purple: '8B5CF6',
  teal: '14B8A6',
  gray: '94A3B8',
}

const border = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
}

const argb = hex => `FF${String(hex || COLORS.gray).replace('#', '').toUpperCase()}`
const fill = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } })

function colLetter(col) {
  let value = ''
  let n = col
  while (n > 0) {
    const m = (n - 1) % 26
    value = String.fromCharCode(65 + m) + value
    n = Math.floor((n - 1) / 26)
  }
  return value
}

function quoteSheet(sheetName) {
  return `'${String(sheetName).replaceAll("'", "''")}'`
}

function sheetRange(sheetName, range) {
  return `${quoteSheet(sheetName)}!${range}`
}

function quickWorkFormula(range) {
  return `COUNTIFS(${range},"<>",${range},"<>OFF",${range},"<>I",${range},"<>YOK",${range},"<>sil")`
}

function quickRestFormula(range) {
  return `COUNTIF(${range},"OFF")+COUNTIF(${range},"I")`
}

function quickAbsentFormula(range) {
  return `COUNTIF(${range},"YOK")`
}

function quickEmptyFormula(range) {
  return `COUNTBLANK(${range})+COUNTIF(${range},"sil")`
}

function riskFormulaForRow(rowNo, workCol, restCol, absentCol, emptyCol) {
  return `IF(${emptyCol}${rowNo}>0,"Bos var",IF(${absentCol}${rowNo}>0,"YOK var",IF(AND(${workCol}${rowNo}>0,${restCol}${rowNo}=0),"OFF eksik","OK")))`
}

function isWorking(cell) {
  return ['scheduled', 'worked', 'overtime'].includes(cell?.status)
}

function isRest(cell) {
  return cell?.status === 'off' || cell?.status === 'on_leave'
}

function cellHex(cell) {
  if (!cell) return STATUS_FILL.empty
  if (cell.status === 'on_leave') return leaveCellMeta(cell.leave_type).hex
  if (STATUS_FILL[cell.status]) return STATUS_FILL[cell.status]
  return (cell.shift_color && TAILWIND_HEX[cell.shift_color]) || COLORS.gray
}

function statusLabel(cell) {
  if (!cell) return 'Bos'
  if (cell.status === 'off') return 'OFF'
  if (cell.status === 'on_leave') return `Izin - ${leaveTypeLabel(cell.leave_type)}`
  if (cell.status === 'absent') return cell.absent_reason ? `YOK - ${cell.absent_reason}` : 'YOK'
  if (cell.status === 'overtime') return 'Mesai'
  if (cell.status === 'worked') return 'Calisti'
  return 'Planli'
}

function displayForCell(cell) {
  if (!cell) return ''
  if (cell.status === 'off') return 'OFF\nHaftalik izin'
  if (cell.status === 'on_leave') return `Izin - ${leaveTypeLabel(cell.leave_type)}`
  if (cell.status === 'absent') return cell.absent_reason ? `YOK\n${cell.absent_reason}` : 'YOK'
  return cell.shift_name ? `${cell.shift_name}\n${shiftHoursFrom(cell) || ''}` : statusLabel(cell)
}

function personCounts(person, weekDays) {
  const counts = { work: 0, rest: 0, absent: 0, empty: 0, off: 0, leave: 0 }
  weekDays.forEach(date => {
    const cell = person.days?.[date]
    if (!cell) counts.empty += 1
    else if (cell.status === 'absent') counts.absent += 1
    else if (cell.status === 'off') { counts.rest += 1; counts.off += 1 }
    else if (cell.status === 'on_leave') { counts.rest += 1; counts.leave += 1 }
    else if (isWorking(cell)) counts.work += 1
  })
  return counts
}

function riskFor(counts) {
  if (counts.empty > 0) return 'Bos var'
  if (counts.absent > 0) return 'YOK var'
  if (counts.work > 0 && counts.rest === 0) return 'OFF eksik'
  return 'OK'
}

function setupTitle(ws, titleText, subtitle, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol)
  ws.mergeCells(2, 1, 2, lastCol)
  ws.getCell(1, 1).value = titleText
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell(1, 1).fill = fill(COLORS.ink)
  ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell(2, 1).value = subtitle
  ws.getCell(2, 1).font = { size: 10, color: { argb: 'FFCBD5E1' } }
  ws.getCell(2, 1).fill = fill(COLORS.ink)
  ws.getCell(2, 1).alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 26
  ws.getRow(2).height = 20
}

function setupSheet(ws, tabHex = COLORS.blue) {
  ws.properties.defaultRowHeight = 20
  ws.properties.tabColor = { argb: argb(tabHex) }
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
  }
  ws.pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
}

function addNav(ws, sheetNames, rowNo = 3) {
  ws.getCell(rowNo, 1).value = 'Sayfa'
  ws.getCell(rowNo, 1).font = { bold: true, size: 9, color: { argb: argb(COLORS.gray) } }
  sheetNames.forEach((name, idx) => {
    const cell = ws.getCell(rowNo, idx + 2)
    cell.value = { text: name, hyperlink: `#${quoteSheet(name)}!A1` }
    cell.font = { bold: true, underline: true, size: 9, color: { argb: argb(COLORS.blue) } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = fill(COLORS.surface)
    cell.border = border
  })
}

function styleHeaderRow(row) {
  row.eachCell(cell => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill = fill(COLORS.header)
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = border
  })
}

function applyQuickCodeValidation(ws, rowStart, rowEnd, colStart, colEnd, formulaRange) {
  for (let rowNo = rowStart; rowNo <= rowEnd; rowNo += 1) {
    for (let colNo = colStart; colNo <= colEnd; colNo += 1) {
      ws.getCell(rowNo, colNo).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formulaRange],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Gecersiz vardiya kodu',
        error: 'Kodlar Ayarlar veya Kodlar ve Sablon sayfasindaki listeden secilmeli.',
      }
    }
  }
}

function applyQuickCodeConditionalFormatting(ws, rangeRef, firstCellRef, codeRows) {
  const rules = [
    { type: 'expression', formulae: [`${firstCellRef}=""`], style: { fill: fill(STATUS_FILL.empty), font: { color: { argb: 'FF64748B' } } } },
    { type: 'expression', formulae: [`${firstCellRef}="OFF"`], style: { fill: fill(STATUS_FILL.off), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
    { type: 'expression', formulae: [`${firstCellRef}="I"`], style: { fill: fill(STATUS_FILL.on_leave), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
    { type: 'expression', formulae: [`${firstCellRef}="YOK"`], style: { fill: fill(STATUS_FILL.absent), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
    { type: 'expression', formulae: [`${firstCellRef}="sil"`], style: { fill: fill(COLORS.muted), font: { color: { argb: argb(COLORS.gray) }, italic: true } } },
  ]
  codeRows.filter(item => item.kind === 'shift').forEach(item => {
    rules.push({
      type: 'expression',
      formulae: [`${firstCellRef}="${item.code}"`],
      style: { fill: fill(item.hex), font: { color: { argb: 'FFFFFFFF' }, bold: true } },
    })
  })
  ws.addConditionalFormatting({ ref: rangeRef, rules })
}

function styleAllUsedCells(ws) {
  ws.eachRow(row => {
    row.eachCell({ includeEmpty: false }, cell => {
      cell.border = cell.border || border
      cell.alignment = cell.alignment || { vertical: 'middle', wrapText: true }
    })
  })
}

function addMetric(ws, startCol, label, value, hex) {
  ws.mergeCells(4, startCol, 4, startCol + 1)
  ws.mergeCells(5, startCol, 5, startCol + 1)
  ws.getCell(4, startCol).value = label
  ws.getCell(5, startCol).value = value
  ws.getCell(4, startCol).font = { bold: true, size: 9, color: { argb: 'FF475569' } }
  ws.getCell(5, startCol).font = { bold: true, size: 18, color: { argb: argb(hex) } }
  ;[4, 5].forEach(rowNo => {
    const cell = ws.getCell(rowNo, startCol)
    cell.fill = fill(COLORS.surface)
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = border
  })
}

function quickCodeRows(shiftDefs) {
  return [
    ...shiftDefs.map((shift, idx) => ({
      kind: 'shift',
      code: String(idx + 1),
      label: shift.name,
      hours: formatShiftHours(shift.start_hour, shift.end_hour),
      hex: TAILWIND_HEX[shift.color_class] || COLORS.gray,
      note: 'Vardiya kodu',
    })),
    { kind: 'status', code: 'OFF', label: 'Haftalik izin', hours: '', hex: STATUS_FILL.off, note: 'Dinlenme/haftalik izin' },
    { kind: 'status', code: 'I', label: 'Izin', hours: '', hex: STATUS_FILL.on_leave, note: 'Onayli izin gunu' },
    { kind: 'status', code: 'YOK', label: 'Devamsizlik', hours: '', hex: STATUS_FILL.absent, note: 'Gelmedi olarak isaretler' },
    { kind: 'status', code: 'sil', label: 'Hucreyi temizle', hours: '', hex: COLORS.muted, note: 'Excel icinde temizleme isareti' },
  ]
}

function buildDeptSummary(rows, weekDays) {
  const map = new Map()
  rows.forEach(person => {
    const key = person.dept_name || 'Departmansiz'
    if (!map.has(key)) {
      map.set(key, {
        name: key,
        members: 0,
        male: 0,
        female: 0,
        perDay: weekDays.map(() => ({ work: 0, rest: 0, empty: 0 })),
      })
    }
    const item = map.get(key)
    item.members += 1
    if (person.gender === 'male') item.male += 1
    if (person.gender === 'female') item.female += 1
    weekDays.forEach((date, idx) => {
      const cell = person.days?.[date]
      if (isWorking(cell)) item.perDay[idx].work += 1
      else if (isRest(cell)) item.perDay[idx].rest += 1
      else item.perDay[idx].empty += 1
    })
  })
  return [...map.values()]
}

function inferWorkArea(person) {
  const text = [person.dept_name, person.position, person.full_name]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr')
  const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const site = plain.includes('otc')
    ? 'OTC'
    : plain.includes('fpu')
    ? 'FPU'
    : plain.includes('kamp')
    ? 'Kamp'
    : 'Genel'
  const service = plain.includes('lokal')
    ? 'Lokal'
    : plain.includes('yemekhane') || plain.includes('yemek') || plain.includes('mutfak') || plain.includes('asci') || plain.includes('ikram')
    ? 'Yemekhane'
    : ''
  if (service) return site === 'Genel' ? service : `${site} ${service}`
  return site
}

function buildAreaSummary(rows, weekDays) {
  const map = new Map()
  rows.forEach(person => {
    const key = inferWorkArea(person)
    if (!map.has(key)) {
      map.set(key, {
        name: key,
        members: 0,
        perDay: weekDays.map(() => ({ work: 0, rest: 0, empty: 0 })),
      })
    }
    const item = map.get(key)
    item.members += 1
    weekDays.forEach((date, idx) => {
      const cell = person.days?.[date]
      if (isWorking(cell)) item.perDay[idx].work += 1
      else if (isRest(cell)) item.perDay[idx].rest += 1
      else item.perDay[idx].empty += 1
    })
  })
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

function saveWorkbook(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

async function exportScheduleExcelLegacy({
  weekStart,
  weekEnd,
  weekDays,
  staffGrid,
  visibleGrid,
  gridSearch,
  statusFilter,
  deptFilter,
  coverageMin,
  shiftDefs,
}) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'YYS'
  wb.created = new Date()
  wb.modified = new Date()
  wb.properties.date1904 = false
  wb.calcProperties.fullCalcOnLoad = true

  const exportRows = visibleGrid.length || gridSearch || statusFilter !== 'all' ? visibleGrid : staffGrid
  const exportStats = computeWeekStats(exportRows, weekDays)
  const exportWarnings = buildScheduleWarnings(exportRows, weekDays, { coverageMin })
  const closingCheck = buildPayrollClosingCheck(exportRows, weekDays, { coverageMin })
  const deptSummary = buildDeptSummary(exportRows, weekDays)
  const generatedAt = new Date()
  const codes = quickCodeRows(shiftDefs)
  const sheetNames = {
    dash: 'Kontrol Paneli',
    entry: 'Excel Giris',
    weekly: 'Haftalik Cizelge',
    operation: 'Gunluk Operasyon',
    daily: 'Gunluk Detay',
    dept: 'Bolum Ozeti',
    person: 'Personel Ozeti',
    settings: 'Ayarlar',
    legend: 'Kodlar ve Sablon',
    raw: 'Ham Veri',
  }
  const navSheets = [sheetNames.entry, sheetNames.operation, sheetNames.weekly, sheetNames.dept, sheetNames.person, sheetNames.settings, sheetNames.raw]
  const entryStartRow = 8
  const entryEndRow = Math.max(entryStartRow, entryStartRow + exportRows.length - 1)
  const entryDayStartCol = 5
  const entryDayEndCol = 11
  const entryDayStart = colLetter(entryDayStartCol)
  const entryDayEnd = colLetter(entryDayEndCol)
  const entryDayRange = sheetRange(sheetNames.entry, `$${entryDayStart}$${entryStartRow}:$${entryDayEnd}$${entryEndRow}`)
  const entryPersonRange = sheetRange(sheetNames.entry, `$B$${entryStartRow}:$B$${entryEndRow}`)
  const entryRiskRange = sheetRange(sheetNames.entry, `$P$${entryStartRow}:$P$${entryEndRow}`)
  const codeListStart = 5
  const codeListEnd = codeListStart + codes.length - 1
  const codeValidationRange = sheetRange(sheetNames.settings, `$F$${codeListStart}:$F$${codeListEnd}`)

  const dash = wb.addWorksheet(sheetNames.dash, { views: [{ state: 'frozen', ySplit: 8 }] })
  setupSheet(dash, COLORS.ink)
  setupTitle(dash, 'VARDIYA EXCEL KONTROL PANELI', `${formatDate(weekStart)} - ${formatDate(weekEnd)} | ${generatedAt.toLocaleString('tr-TR')}`, 12)
  addNav(dash, navSheets)
  addMetric(dash, 1, 'Personel', { formula: `COUNTA(${entryPersonRange})`, result: exportRows.length }, COLORS.blue)
  addMetric(dash, 3, 'Calisma', { formula: quickWorkFormula(entryDayRange), result: exportStats.working }, COLORS.green)
  addMetric(dash, 5, 'Izin/OFF', { formula: quickRestFormula(entryDayRange), result: exportStats.onLeave }, COLORS.teal)
  addMetric(dash, 7, 'Bos', { formula: quickEmptyFormula(entryDayRange), result: exportStats.empty }, exportStats.empty ? COLORS.red : COLORS.green)
  addMetric(dash, 9, 'Riskli Satir', { formula: `COUNTIF(${entryRiskRange},"<>OK")`, result: exportRows.filter(person => riskFor(personCounts(person, weekDays)) !== 'OK').length }, COLORS.red)
  addMetric(dash, 11, 'Uyari', exportWarnings.length, exportWarnings.length ? COLORS.amber : COLORS.green)
  dash.getRow(7).values = ['Seviye', 'Tip', 'Tarih', 'Personel/Bolum', 'Mesaj']
  styleHeaderRow(dash.getRow(7))
  const warningRows = exportWarnings.length
    ? exportWarnings
    : [{ severity: 'info', title: 'Temiz', date: '', staffName: '', dept: '', message: 'Bu haftalik cizelgede kural uyarisi yok.' }]
  warningRows.slice(0, 250).forEach(warning => {
    const row = dash.addRow([warning.severity || 'info', warning.title || warning.type, warning.date || '', warning.staffName || warning.dept || '', warning.message || ''])
    row.eachCell(cell => { cell.border = border; cell.alignment = { vertical: 'middle', wrapText: true }; cell.font = { size: 10 } })
    row.getCell(1).fill = fill(warning.severity === 'high' ? COLORS.red : warning.severity === 'medium' ? COLORS.amber : COLORS.green)
    row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
  })
  const closeStart = dash.lastRow.number + 3
  dash.getCell(closeStart, 1).value = 'PUANTAJ KAPANIS OZETI'
  dash.getCell(closeStart, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  dash.getRow(closeStart + 1).values = ['Kontrol', 'Adet', 'Aciklama']
  styleHeaderRow(dash.getRow(closeStart + 1))
  closingCheck.issues.forEach(issue => {
    const row = dash.addRow([issue.title, issue.count, issue.message])
    row.eachCell(cell => { cell.border = border; cell.alignment = { vertical: 'middle', wrapText: true }; cell.font = { size: 10 } })
  })
  dash.columns = [
    { width: 12 }, { width: 18 }, { width: 14 }, { width: 22 }, { width: 60 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
  ]
  styleAllUsedCells(dash)

  const entry = wb.addWorksheet(sheetNames.entry, { views: [{ state: 'frozen', xSplit: 4, ySplit: 7 }] })
  setupSheet(entry, COLORS.blue)
  setupTitle(entry, 'EXCEL GIRIS TABLOSU', 'Hucrelere kisa kod yaz: 1, 2, OFF, I, YOK. Formuller ve renkler otomatik takip eder.', 16)
  addNav(entry, [sheetNames.dash, sheetNames.operation, sheetNames.weekly, sheetNames.settings, sheetNames.legend])
  addMetric(entry, 1, 'Calisma', { formula: quickWorkFormula(entryDayRange), result: exportStats.working }, COLORS.green)
  addMetric(entry, 3, 'Izin/OFF', { formula: quickRestFormula(entryDayRange), result: exportStats.onLeave }, COLORS.teal)
  addMetric(entry, 5, 'YOK', { formula: quickAbsentFormula(entryDayRange), result: exportRows.reduce((sum, person) => sum + personCounts(person, weekDays).absent, 0) }, COLORS.red)
  addMetric(entry, 7, 'Bos', { formula: quickEmptyFormula(entryDayRange), result: exportStats.empty }, exportStats.empty ? COLORS.red : COLORS.green)
  addMetric(entry, 9, 'Riskli', { formula: `COUNTIF(${entryRiskRange},"<>OK")`, result: exportRows.filter(person => riskFor(personCounts(person, weekDays)) !== 'OK').length }, COLORS.amber)
  addMetric(entry, 11, 'Kod Listesi', 'Ayarlar', COLORS.purple)
  entry.getCell(6, 1).value = 'Kullanim: Gun hucrelerine kod yaz veya acilir listeden sec. Ozet kolonlari formullu; Excel icinde degisiklik yaptiginda yenilenir.'
  entry.getCell(6, 1).font = { italic: true, size: 10, color: { argb: argb(COLORS.gray) } }
  entry.mergeCells(6, 1, 6, 16)
  entry.getRow(7).values = [
    'Sira', 'Personel', 'Bolum', 'Pozisyon',
    ...weekDays.map((date, idx) => `${DAY_LABELS[idx]}\n${formatDate(date)}`),
    'Calisma', 'OFF/Izin', 'YOK', 'Bos', 'Risk',
  ]
  styleHeaderRow(entry.getRow(7))
  exportRows.forEach((person, idx) => {
    const counts = personCounts(person, weekDays)
    const risk = riskFor(counts)
    const row = entry.addRow([
      idx + 1,
      person.full_name,
      person.dept_name || '-',
      person.position || '-',
      ...weekDays.map(date => cellToScheduleCode(person.days?.[date], shiftDefs)),
      null, null, null, null, null,
    ])
    const rowNo = row.number
    const rowDayRange = `${entryDayStart}${rowNo}:${entryDayEnd}${rowNo}`
    row.getCell(12).value = { formula: quickWorkFormula(rowDayRange), result: counts.work }
    row.getCell(13).value = { formula: quickRestFormula(rowDayRange), result: counts.rest }
    row.getCell(14).value = { formula: quickAbsentFormula(rowDayRange), result: counts.absent }
    row.getCell(15).value = { formula: quickEmptyFormula(rowDayRange), result: counts.empty }
    row.getCell(16).value = { formula: riskFormulaForRow(rowNo, 'L', 'M', 'N', 'O'), result: risk }
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo <= 4 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
      if (colNo >= entryDayStartCol && colNo <= entryDayEndCol) {
        const dayCell = person.days?.[weekDays[colNo - entryDayStartCol]]
        cell.numFmt = '@'
        cell.fill = fill(cellHex(dayCell))
        cell.font = { size: 9, bold: !!dayCell, color: { argb: dayCell ? 'FFFFFFFF' : 'FF64748B' } }
      }
      if (colNo === 16) {
        cell.fill = fill(risk === 'OK' ? COLORS.green : risk === 'Bos var' ? COLORS.red : COLORS.amber)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
    row.height = 26
  })
  if (exportRows.length) {
    applyQuickCodeValidation(entry, entryStartRow, entryEndRow, entryDayStartCol, entryDayEndCol, codeValidationRange)
    applyQuickCodeConditionalFormatting(entry, `${entryDayStart}${entryStartRow}:${entryDayEnd}${entryEndRow}`, `${entryDayStart}${entryStartRow}`, codes)
    entry.addConditionalFormatting({
      ref: `P${entryStartRow}:P${entryEndRow}`,
      rules: [
        { type: 'expression', formulae: [`P${entryStartRow}="OK"`], style: { fill: fill(COLORS.green), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
        { type: 'expression', formulae: [`P${entryStartRow}="Bos var"`], style: { fill: fill(COLORS.red), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
        { type: 'expression', formulae: [`AND(P${entryStartRow}<>"OK",P${entryStartRow}<>"Bos var")`], style: { fill: fill(COLORS.amber), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
      ],
    })
  }
  entry.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: 16 } }
  entry.columns = [
    { width: 7 }, { width: 26 }, { width: 18 }, { width: 18 },
    ...weekDays.map(() => ({ width: 13 })),
    { width: 10 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 12 },
  ]
  styleAllUsedCells(entry)

  const ws = wb.addWorksheet(sheetNames.weekly, { views: [{ state: 'frozen', xSplit: 4, ySplit: 7 }] })
  setupSheet(ws, COLORS.purple)
  const weekLastCol = 16
  setupTitle(ws, 'HAFTALIK VARDIYA CIZELGESI', `${formatDate(weekStart)} - ${formatDate(weekEnd)} | Filtre: ${deptFilter ? 'Bolum secili' : 'Tum bolumler'} | ${exportRows.length} personel`, weekLastCol)
  addNav(ws, [sheetNames.dash, sheetNames.entry, sheetNames.operation, sheetNames.settings, sheetNames.raw])
  addMetric(ws, 1, 'Calisma', { formula: quickWorkFormula(entryDayRange), result: exportStats.working }, COLORS.green)
  addMetric(ws, 3, 'Izin/OFF', { formula: quickRestFormula(entryDayRange), result: exportStats.onLeave }, COLORS.teal)
  addMetric(ws, 5, 'Bos', { formula: quickEmptyFormula(entryDayRange), result: exportStats.empty }, exportStats.empty ? COLORS.red : COLORS.green)
  addMetric(ws, 7, 'Uyari', exportWarnings.length, exportWarnings.length ? COLORS.amber : COLORS.green)
  addMetric(ws, 9, 'Min Kisi', { formula: `${sheetRange(sheetNames.settings, '$B$6')}`, result: coverageMin }, COLORS.blue)
  addMetric(ws, 11, 'Dosya', 'Ultra', COLORS.purple)
  const headerRowNo = 7
  ws.getRow(headerRowNo).values = [
    'Sira', 'Personel', 'Bolum', 'Pozisyon',
    ...weekDays.map((date, idx) => `${DAY_LABELS[idx]}\n${formatDate(date)}`),
    'Calisma', 'OFF/Izin', 'YOK', 'Bos', 'Risk',
  ]
  styleHeaderRow(ws.getRow(headerRowNo))
  exportRows.forEach((person, idx) => {
    const counts = personCounts(person, weekDays)
    const risk = riskFor(counts)
    const row = ws.addRow([
      idx + 1,
      person.full_name,
      person.dept_name || '-',
      person.position || '-',
      ...weekDays.map(date => displayForCell(person.days?.[date])),
      null, null, null, null, risk,
    ])
    const rowNo = row.number
    const dayStart = 5
    const dayEnd = 11
    const dayRange = `${colLetter(dayStart)}${rowNo}:${colLetter(dayEnd)}${rowNo}`
    row.getCell(12).value = { formula: `COUNTA(${dayRange})-COUNTIF(${dayRange},"OFF*")-COUNTIF(${dayRange},"Izin*")-COUNTIF(${dayRange},"YOK*")`, result: counts.work }
    row.getCell(13).value = { formula: `COUNTIF(${dayRange},"OFF*")+COUNTIF(${dayRange},"Izin*")`, result: counts.rest }
    row.getCell(14).value = { formula: `COUNTIF(${dayRange},"YOK*")`, result: counts.absent }
    row.getCell(15).value = { formula: `COUNTBLANK(${dayRange})`, result: counts.empty }
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo <= 4 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
      if (colNo >= dayStart && colNo <= dayEnd) {
        const dayCell = person.days?.[weekDays[colNo - dayStart]]
        cell.fill = fill(cellHex(dayCell))
        cell.font = { size: 9, bold: !!dayCell, color: { argb: dayCell ? 'FFFFFFFF' : 'FF64748B' } }
        if (dayCell?.absent_reason) cell.note = `Devamsizlik nedeni: ${dayCell.absent_reason}`
      }
      if (colNo === 16) {
        const riskHex = risk === 'OK' ? COLORS.green : risk === 'Bos var' ? COLORS.red : COLORS.amber
        cell.fill = fill(riskHex)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
    row.height = 34
  })
  ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo, column: weekLastCol } }
  ws.columns = [
    { width: 7 }, { width: 26 }, { width: 18 }, { width: 18 },
    ...weekDays.map(() => ({ width: 16 })),
    { width: 10 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 12 },
  ]
  styleAllUsedCells(ws)

  const operation = wb.addWorksheet(sheetNames.operation, { views: [{ state: 'frozen', xSplit: 2, ySplit: 7 }] })
  setupSheet(operation, COLORS.green)
  setupTitle(operation, 'GUNLUK OPERASYON TAKIBI', 'Gun gun calisan, izinli, devamsiz, bos ve bolum kapsama kontrolu.', 14)
  addNav(operation, [sheetNames.dash, sheetNames.entry, sheetNames.daily, sheetNames.dept, sheetNames.settings])
  addMetric(operation, 1, 'Min Kisi', { formula: `${sheetRange(sheetNames.settings, '$B$6')}`, result: coverageMin }, COLORS.blue)
  addMetric(operation, 3, 'Bos', { formula: quickEmptyFormula(entryDayRange), result: exportStats.empty }, exportStats.empty ? COLORS.red : COLORS.green)
  addMetric(operation, 5, 'YOK', { formula: quickAbsentFormula(entryDayRange), result: exportRows.reduce((sum, person) => sum + personCounts(person, weekDays).absent, 0) }, COLORS.red)
  addMetric(operation, 7, 'Riskli Satir', { formula: `COUNTIF(${entryRiskRange},"<>OK")`, result: exportRows.filter(person => riskFor(personCounts(person, weekDays)) !== 'OK').length }, COLORS.amber)
  operation.getRow(7).values = ['Tarih', 'Gun', 'Calisma', 'OFF/Izin', 'YOK', 'Bos', 'Durum']
  styleHeaderRow(operation.getRow(7))
  weekDays.forEach((date, idx) => {
    const entryCol = colLetter(entryDayStartCol + idx)
    const dayRange = sheetRange(sheetNames.entry, `$${entryCol}$${entryStartRow}:$${entryCol}$${entryEndRow}`)
    const workCount = exportRows.filter(person => isWorking(person.days?.[date])).length
    const restCount = exportRows.filter(person => isRest(person.days?.[date])).length
    const absentCount = exportRows.filter(person => person.days?.[date]?.status === 'absent').length
    const emptyCount = exportRows.filter(person => !person.days?.[date]).length
    const row = operation.addRow([
      new Date(`${date}T00:00:00`),
      DAY_LABELS[idx],
      { formula: quickWorkFormula(dayRange), result: workCount },
      { formula: quickRestFormula(dayRange), result: restCount },
      { formula: quickAbsentFormula(dayRange), result: absentCount },
      { formula: quickEmptyFormula(dayRange), result: emptyCount },
      null,
    ])
    const rowNo = row.number
    row.getCell(7).value = { formula: `IF(F${rowNo}>0,"Bos var",IF(C${rowNo}<${sheetRange(sheetNames.settings, '$B$6')},"Eksik kisi","OK"))`, result: emptyCount > 0 ? 'Bos var' : workCount < coverageMin ? 'Eksik kisi' : 'OK' }
    row.getCell(1).numFmt = 'yyyy-mm-dd'
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo <= 2 ? 'left' : 'center', vertical: 'middle' }
      cell.font = { size: 10 }
      if (colNo === 7) {
        const status = cell.result || cell.value?.result
        cell.fill = fill(status === 'OK' ? COLORS.green : status === 'Bos var' ? COLORS.red : COLORS.amber)
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      }
    })
  })
  const matrixStart = operation.lastRow.number + 3
  operation.getCell(matrixStart, 1).value = 'BOLUM x GUN KAPSAMA'
  operation.getCell(matrixStart, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  operation.getRow(matrixStart + 1).values = ['Bolum', 'Personel', ...weekDays.map((date, idx) => `${DAY_LABELS[idx]}\n${formatDate(date)}`), 'Toplam', 'En Dusuk', 'Durum']
  styleHeaderRow(operation.getRow(matrixStart + 1))
  deptSummary.forEach(dept => {
    const row = operation.addRow([dept.name, dept.members, ...weekDays.map(() => null), null, null, null])
    const rowNo = row.number
    weekDays.forEach((date, idx) => {
      const entryCol = colLetter(entryDayStartCol + idx)
      const deptRange = sheetRange(sheetNames.entry, `$C$${entryStartRow}:$C$${entryEndRow}`)
      const dayRange = sheetRange(sheetNames.entry, `$${entryCol}$${entryStartRow}:$${entryCol}$${entryEndRow}`)
      row.getCell(3 + idx).value = {
        formula: `COUNTIFS(${deptRange},$A${rowNo},${dayRange},"<>",${dayRange},"<>OFF",${dayRange},"<>I",${dayRange},"<>YOK",${dayRange},"<>sil")`,
        result: dept.perDay[idx].work,
      }
    })
    const firstDay = colLetter(3)
    const lastDay = colLetter(3 + weekDays.length - 1)
    row.getCell(10).value = { formula: `SUM(${firstDay}${rowNo}:${lastDay}${rowNo})`, result: dept.perDay.reduce((sum, day) => sum + day.work, 0) }
    row.getCell(11).value = { formula: `MIN(${firstDay}${rowNo}:${lastDay}${rowNo})`, result: Math.min(...dept.perDay.map(day => day.work)) }
    row.getCell(12).value = { formula: `IF(K${rowNo}<${sheetRange(sheetNames.settings, '$B$6')},"Eksik","OK")`, result: Math.min(...dept.perDay.map(day => day.work)) < coverageMin ? 'Eksik' : 'OK' }
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
      if (colNo >= 3 && colNo <= 9 && Number(cell.value?.result ?? cell.value ?? 0) < coverageMin) {
        cell.fill = fill(COLORS.red)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
      if (colNo === 12) {
        const status = cell.value?.result || cell.value
        cell.fill = fill(status === 'OK' ? COLORS.green : COLORS.red)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
  })
  if (deptSummary.length) {
    const firstMatrixRow = matrixStart + 2
    const lastMatrixRow = firstMatrixRow + deptSummary.length - 1
    operation.addConditionalFormatting({
      ref: `C${firstMatrixRow}:I${lastMatrixRow}`,
      rules: [
        { type: 'expression', formulae: [`C${firstMatrixRow}<${sheetRange(sheetNames.settings, '$B$6')}`], style: { fill: fill(COLORS.red), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
      ],
    })
  }
  operation.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: 7 } }
  operation.columns = [
    { width: 13 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 12 },
    { width: 4 }, { width: 4 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 },
  ]
  styleAllUsedCells(operation)

  const daily = wb.addWorksheet(sheetNames.daily, { views: [{ state: 'frozen', ySplit: 3 }] })
  setupSheet(daily, COLORS.teal)
  setupTitle(daily, 'GUNLUK DETAY LISTESI', 'Her personel-gun tek satir. Filtreleyip raporlanabilir.', 12)
  daily.getRow(3).values = ['Tarih', 'Gun', 'Personel', 'Bolum', 'Pozisyon', 'Kod', 'Durum', 'Vardiya', 'Saat', 'Baslangic', 'Bitis', 'Not']
  styleHeaderRow(daily.getRow(3))
  weekDays.forEach((date, idx) => {
    exportRows.forEach(person => {
      const cell = person.days?.[date]
      const row = daily.addRow([
        new Date(`${date}T00:00:00`),
        DAY_LABELS[idx],
        person.full_name,
        person.dept_name || '-',
        person.position || '-',
        cellToScheduleCode(cell, shiftDefs),
        statusLabel(cell),
        cell?.shift_name || '',
        shiftHoursFrom(cell) || '',
        cell?.start_hour ?? cell?.shift_start ?? '',
        cell?.end_hour ?? cell?.shift_end ?? '',
        cell?.absent_reason || cell?.leave_type || '',
      ])
      row.getCell(1).numFmt = 'yyyy-mm-dd'
      row.eachCell((item, colNo) => {
        item.border = border
        item.alignment = { vertical: 'middle', wrapText: true }
        item.font = { size: 9 }
        if (colNo === 6 || colNo === 7) {
          item.fill = fill(cellHex(cell))
          item.font = { size: 9, bold: true, color: { argb: cell ? 'FFFFFFFF' : 'FF64748B' } }
        }
      })
    })
  })
  daily.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 12 } }
  daily.columns = [
    { width: 12 }, { width: 8 }, { width: 26 }, { width: 18 }, { width: 18 }, { width: 10 },
    { width: 18 }, { width: 16 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 24 },
  ]
  styleAllUsedCells(daily)

  const deptWs = wb.addWorksheet(sheetNames.dept, { views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }] })
  setupSheet(deptWs, COLORS.amber)
  const deptLastCol = 4 + weekDays.length * 3 + 3
  setupTitle(deptWs, 'BOLUM BAZLI KAPSAMA OZETI', `Min kisi/gun: ${coverageMin}`, deptLastCol)
  deptWs.getRow(3).values = ['Bolum', 'Personel', 'Erkek', 'Kadin', ...weekDays.flatMap((date, idx) => [`${DAY_LABELS[idx]} ${formatDate(date)}`, '', '']), 'Toplam Calisma', 'Toplam Izin', 'Toplam Bos/YOK']
  deptWs.getRow(4).values = ['', '', '', '', ...weekDays.flatMap(() => ['Calisan', 'Izin/OFF', 'Bos/YOK']), '', '', '']
  for (let idx = 0; idx < weekDays.length; idx += 1) deptWs.mergeCells(3, 5 + idx * 3, 3, 7 + idx * 3)
  styleHeaderRow(deptWs.getRow(3))
  styleHeaderRow(deptWs.getRow(4))
  deptSummary.forEach(dept => {
    const totalWork = dept.perDay.reduce((sum, day) => sum + day.work, 0)
    const totalRest = dept.perDay.reduce((sum, day) => sum + day.rest, 0)
    const totalEmpty = dept.perDay.reduce((sum, day) => sum + day.empty, 0)
    const row = deptWs.addRow([
      dept.name, dept.members, dept.male, dept.female,
      ...dept.perDay.flatMap(day => [day.work, day.rest, day.empty]),
      totalWork, totalRest, totalEmpty,
    ])
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo === 1 ? 'left' : 'center', vertical: 'middle' }
      cell.font = { size: 9 }
      if (colNo >= 5 && colNo < 5 + weekDays.length * 3 && (colNo - 5) % 3 === 0 && Number(cell.value || 0) < coverageMin) {
        cell.fill = fill(COLORS.red)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
  })
  deptWs.columns = [
    { width: 22 }, { width: 10 }, { width: 8 }, { width: 8 },
    ...Array.from({ length: weekDays.length * 3 }, (_, idx) => ({ width: idx % 3 === 0 ? 10 : 9 })),
    { width: 14 }, { width: 12 }, { width: 14 },
  ]
  styleAllUsedCells(deptWs)

  const personWs = wb.addWorksheet(sheetNames.person, { views: [{ state: 'frozen', ySplit: 3 }] })
  setupSheet(personWs, COLORS.teal)
  setupTitle(personWs, 'PERSONEL PUANTAJ ONCESI OZET', 'Satir bazli haftalik calisma, izin, bos ve risk ozeti.', 10)
  personWs.getRow(3).values = ['Personel', 'Bolum', 'Pozisyon', 'Calisma', 'OFF', 'Izin', 'YOK', 'Bos', 'Toplam', 'Risk']
  styleHeaderRow(personWs.getRow(3))
  exportRows.forEach((person, idx) => {
    const counts = personCounts(person, weekDays)
    const risk = riskFor(counts)
    const sourceRow = entryStartRow + idx
    const sourceRange = sheetRange(sheetNames.entry, `$${entryDayStart}$${sourceRow}:$${entryDayEnd}$${sourceRow}`)
    const row = personWs.addRow([person.full_name, person.dept_name || '-', person.position || '-', null, null, null, null, null, null, null])
    const rowNo = row.number
    row.getCell(4).value = { formula: quickWorkFormula(sourceRange), result: counts.work }
    row.getCell(5).value = { formula: `COUNTIF(${sourceRange},"OFF")`, result: counts.off }
    row.getCell(6).value = { formula: `COUNTIF(${sourceRange},"I")`, result: counts.leave }
    row.getCell(7).value = { formula: quickAbsentFormula(sourceRange), result: counts.absent }
    row.getCell(8).value = { formula: quickEmptyFormula(sourceRange), result: counts.empty }
    row.getCell(9).value = { formula: `SUM(D${rowNo}:H${rowNo})`, result: weekDays.length }
    row.getCell(10).value = { formula: `IF(H${rowNo}>0,"Bos var",IF(G${rowNo}>0,"YOK var",IF(AND(D${rowNo}>0,(E${rowNo}+F${rowNo})=0),"OFF eksik","OK")))`, result: risk }
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo <= 3 ? 'left' : 'center', vertical: 'middle' }
      cell.font = { size: 9 }
      if (colNo === 10) {
        cell.fill = fill(risk === 'OK' ? COLORS.green : risk === 'Bos var' ? COLORS.red : COLORS.amber)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
  })
  if (exportRows.length) {
    personWs.addConditionalFormatting({
      ref: `J4:J${3 + exportRows.length}`,
      rules: [
        { type: 'expression', formulae: ['J4="OK"'], style: { fill: fill(COLORS.green), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
        { type: 'expression', formulae: ['J4="Bos var"'], style: { fill: fill(COLORS.red), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
        { type: 'expression', formulae: ['AND(J4<>"OK",J4<>"Bos var")'], style: { fill: fill(COLORS.amber), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
      ],
    })
  }
  personWs.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 10 } }
  personWs.columns = [{ width: 28 }, { width: 18 }, { width: 18 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 12 }]
  styleAllUsedCells(personWs)

  const settings = wb.addWorksheet(sheetNames.settings, { views: [{ state: 'frozen', ySplit: 4 }] })
  setupSheet(settings, COLORS.purple)
  setupTitle(settings, 'AYARLAR VE RENK PALETI', 'Esik degerleri, kisa kodlar ve renk referanslari. Formuller min kisi degerini bu sayfadan okur.', 11)
  addNav(settings, [sheetNames.dash, sheetNames.entry, sheetNames.operation, sheetNames.legend])
  settings.getRow(4).values = ['Ayar', 'Deger', 'Aciklama', '', 'Liste', 'Kod', 'Anlam', 'Saat', 'Renk HEX', 'Renk', 'Not']
  styleHeaderRow(settings.getRow(4))
  settings.getCell(5, 1).value = 'Hafta Baslangic'
  settings.getCell(5, 2).value = new Date(`${weekStart}T00:00:00`)
  settings.getCell(5, 2).numFmt = 'yyyy-mm-dd'
  settings.getCell(5, 3).value = 'Raporun basladigi tarih'
  settings.getCell(6, 1).value = 'Min Kisi/Gun'
  settings.getCell(6, 2).value = coverageMin
  settings.getCell(6, 3).value = 'Gunluk operasyon ve bolum kapsama kontrol esigi'
  settings.getCell(7, 1).value = 'Max Ardisik Calisma'
  settings.getCell(7, 2).value = 6
  settings.getCell(7, 3).value = 'Kontrol amacli referans deger'
  settings.getCell(8, 1).value = 'Hafta Bitis'
  settings.getCell(8, 2).value = new Date(`${weekEnd}T00:00:00`)
  settings.getCell(8, 2).numFmt = 'yyyy-mm-dd'
  settings.getCell(8, 3).value = 'Raporun bittigi tarih'
  settings.getCell(9, 1).value = 'Dosya Modu'
  settings.getCell(9, 2).value = 'Operasyon'
  settings.getCell(9, 3).value = 'Excel Giris sayfasi duzenlenebilir; diger sayfalar takip ve rapor icindir'
  codes.forEach((item, idx) => {
    const rowNo = codeListStart + idx
    const row = settings.getRow(rowNo)
    row.getCell(5).value = item.kind === 'shift' ? 'Vardiya' : 'Durum'
    row.getCell(6).value = item.code
    row.getCell(7).value = item.label
    row.getCell(8).value = item.hours
    row.getCell(9).value = item.hex
    row.getCell(10).value = ''
    row.getCell(10).fill = fill(item.hex)
    row.getCell(11).value = item.note
    row.eachCell(cell => {
      cell.border = border
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
    })
    row.getCell(6).font = { bold: true, size: 10, color: { argb: argb(COLORS.ink) } }
  })
  const settingsNoteRow = Math.max(11, codeListEnd + 3)
  settings.getCell(settingsNoteRow, 1).value = 'RENK AYARI'
  settings.getCell(settingsNoteRow, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  settings.getCell(settingsNoteRow + 1, 1).value = 'Vardiya renkleri uygulamadaki vardiya renklerinden gelir. Excel icinde renkleri degistirmek istersen Excel Giris sayfasindaki kosullu bicimlendirme kurallarini veya bu palet hucrelerini duzenleyebilirsin.'
  settings.mergeCells(settingsNoteRow + 1, 1, settingsNoteRow + 1, 11)
  settings.getCell(settingsNoteRow + 1, 1).alignment = { wrapText: true, vertical: 'middle' }
  settings.columns = [
    { width: 22 }, { width: 16 }, { width: 42 }, { width: 4 }, { width: 12 }, { width: 10 },
    { width: 24 }, { width: 14 }, { width: 12 }, { width: 10 }, { width: 34 },
  ]
  styleAllUsedCells(settings)

  const legend = wb.addWorksheet(sheetNames.legend, { views: [{ state: 'frozen', ySplit: 4 }] })
  setupSheet(legend, COLORS.gray)
  setupTitle(legend, 'KODLAR, RENKLER VE KOPYALA-YAPISTIR SABLONU', 'Bu sayfadaki kod tablosu uygulamadaki hizli giris ile uyumludur.', 10)
  addNav(legend, [sheetNames.dash, sheetNames.entry, sheetNames.settings, sheetNames.raw])
  legend.getRow(4).values = ['Kod', 'Anlam', 'Saat', 'Not']
  styleHeaderRow(legend.getRow(4))
  codes.forEach(item => {
    const row = legend.addRow([item.code, item.label, item.hours, item.note])
    row.getCell(1).fill = fill(item.hex)
    row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    row.eachCell(cell => { cell.border = border; cell.alignment = { vertical: 'middle' }; cell.font = cell.font || { size: 10 } })
  })
  const tplStart = legend.lastRow.number + 3
  legend.getCell(tplStart, 1).value = 'KOPYALA-YAPISTIR SABLONU'
  legend.getCell(tplStart, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  legend.getRow(tplStart + 1).values = ['Personel', 'Bolum', ...weekDays.map((date, idx) => `${DAY_LABELS[idx]} ${formatDate(date)}`)]
  styleHeaderRow(legend.getRow(tplStart + 1))
  exportRows.forEach(person => {
    const row = legend.addRow([person.full_name, person.dept_name || '-', ...weekDays.map(date => cellToScheduleCode(person.days?.[date], shiftDefs))])
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo <= 2 ? 'left' : 'center', vertical: 'middle' }
      cell.font = { size: 9 }
      if (colNo > 2) {
        const dayCell = person.days?.[weekDays[colNo - 3]]
        if (dayCell) {
          cell.fill = fill(cellHex(dayCell))
          cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
        }
      }
    })
  })
  if (exportRows.length) {
    const tplDataStart = tplStart + 2
    const tplDataEnd = tplDataStart + exportRows.length - 1
    applyQuickCodeValidation(legend, tplDataStart, tplDataEnd, 3, 2 + weekDays.length, codeValidationRange)
    applyQuickCodeConditionalFormatting(legend, `C${tplDataStart}:I${tplDataEnd}`, `C${tplDataStart}`, codes)
  }
  legend.columns = [{ width: 18 }, { width: 24 }, { width: 18 }, { width: 32 }, ...weekDays.map(() => ({ width: 13 }))]
  styleAllUsedCells(legend)

  const raw = wb.addWorksheet(sheetNames.raw, { views: [{ state: 'frozen', ySplit: 3 }] })
  setupSheet(raw, COLORS.gray)
  setupTitle(raw, 'HAM VERI', 'Analiz, pivot ve denetim icin tekil kayitlar.', 13)
  raw.getRow(3).values = ['staff_id', 'personel', 'dept_id', 'bolum', 'tarih', 'gun', 'status', 'kod', 'shift_def_id', 'vardiya', 'baslangic', 'bitis', 'not']
  styleHeaderRow(raw.getRow(3))
  weekDays.forEach((date, idx) => {
    exportRows.forEach(person => {
      const cell = person.days?.[date]
      const row = raw.addRow([
        person.id,
        person.full_name,
        person.dept_id || '',
        person.dept_name || '',
        new Date(`${date}T00:00:00`),
        DAY_LABELS[idx],
        cell?.status || 'empty',
        cellToScheduleCode(cell, shiftDefs),
        cell?.shift_def_id || '',
        cell?.shift_name || '',
        cell?.start_hour ?? cell?.shift_start ?? '',
        cell?.end_hour ?? cell?.shift_end ?? '',
        cell?.absent_reason || cell?.leave_type || '',
      ])
      row.getCell(5).numFmt = 'yyyy-mm-dd'
      row.eachCell(cellItem => { cellItem.border = border; cellItem.alignment = { vertical: 'middle' }; cellItem.font = { size: 9 } })
    })
  })
  raw.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 13 } }
  raw.columns = [
    { width: 9 }, { width: 28 }, { width: 9 }, { width: 18 }, { width: 12 }, { width: 8 },
    { width: 14 }, { width: 8 }, { width: 11 }, { width: 16 }, { width: 10 }, { width: 10 }, { width: 24 },
  ]
  styleAllUsedCells(raw)

  const buffer = await wb.xlsx.writeBuffer()
  saveWorkbook(buffer, `vardiya-ultra-${weekStart}.xlsx`)
}

export async function exportScheduleExcel({
  weekStart,
  weekEnd,
  weekDays,
  staffGrid,
  visibleGrid,
  gridSearch,
  statusFilter,
  deptFilter,
  coverageMin,
  shiftDefs,
}) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'YYS'
  wb.created = new Date()
  wb.modified = new Date()
  wb.properties.date1904 = false
  wb.calcProperties.fullCalcOnLoad = true

  const hasActiveFilter = Boolean(gridSearch || deptFilter || statusFilter !== 'all')
  const exportRows = hasActiveFilter ? visibleGrid : staffGrid
  const exportStats = computeWeekStats(exportRows, weekDays)
  const exportWarnings = buildScheduleWarnings(exportRows, weekDays, { coverageMin })
  const closingCheck = buildPayrollClosingCheck(exportRows, weekDays, { coverageMin })
  const deptSummary = buildDeptSummary(exportRows, weekDays)
  const areaSummary = buildAreaSummary(exportRows, weekDays)
  const generatedAt = new Date()
  const codes = quickCodeRows(shiftDefs)

  const sheetNames = { plan: 'Plan', operation: 'Operasyon', raw: 'Veri' }
  const navSheets = [sheetNames.plan, sheetNames.operation, sheetNames.raw]
  const entryStartRow = 8
  const entryEndRow = Math.max(entryStartRow, entryStartRow + exportRows.length - 1)
  const entryDayStartCol = 6
  const entryDayEndCol = 12
  const entryDayStart = colLetter(entryDayStartCol)
  const entryDayEnd = colLetter(entryDayEndCol)
  const entryDayRange = sheetRange(sheetNames.plan, `$${entryDayStart}$${entryStartRow}:$${entryDayEnd}$${entryEndRow}`)
  const entryPersonRange = sheetRange(sheetNames.plan, `$B$${entryStartRow}:$B$${entryEndRow}`)
  const entryRiskRange = sheetRange(sheetNames.plan, `$Q$${entryStartRow}:$Q$${entryEndRow}`)
  const codeListStart = 5
  const codeListEnd = codeListStart + codes.length - 1
  const codeValidationRange = sheetRange(sheetNames.raw, `$S$${codeListStart}:$S$${codeListEnd}`)
  const absentTotal = exportRows.reduce((sum, person) => sum + personCounts(person, weekDays).absent, 0)
  const riskyRows = exportRows.filter(person => riskFor(personCounts(person, weekDays)) !== 'OK').length

  const plan = wb.addWorksheet(sheetNames.plan, { views: [{ state: 'frozen', xSplit: 5, ySplit: 7 }] })
  setupSheet(plan, COLORS.blue)
  setupTitle(plan, 'VARDIYA PLAN VE EXCEL GIRIS', `${formatDate(weekStart)} - ${formatDate(weekEnd)} | ${generatedAt.toLocaleString('tr-TR')} | 3 sayfalik operasyon dosyasi`, 23)
  addNav(plan, navSheets)
  addMetric(plan, 1, 'Personel', { formula: `COUNTA(${entryPersonRange})`, result: exportRows.length }, COLORS.blue)
  addMetric(plan, 3, 'Calisma', { formula: quickWorkFormula(entryDayRange), result: exportStats.working }, COLORS.green)
  addMetric(plan, 5, 'OFF/Izin', { formula: quickRestFormula(entryDayRange), result: exportStats.onLeave }, COLORS.teal)
  addMetric(plan, 7, 'YOK', { formula: quickAbsentFormula(entryDayRange), result: absentTotal }, COLORS.red)
  addMetric(plan, 9, 'Bos', { formula: quickEmptyFormula(entryDayRange), result: exportStats.empty }, exportStats.empty ? COLORS.red : COLORS.green)
  addMetric(plan, 11, 'Riskli', { formula: `COUNTIF(${entryRiskRange},"<>OK")`, result: riskyRows }, riskyRows ? COLORS.amber : COLORS.green)
  addMetric(plan, 13, 'Min Kisi', coverageMin, COLORS.purple)
  plan.mergeCells(6, 1, 6, 17)
  plan.getCell(6, 1).value = 'Gun hucrelerine 1, 2, 3, OFF, I, YOK veya sil yaz. M-Q kolonlari ve Operasyon sayfasi Excel icinde formulle takip eder.'
  plan.getCell(6, 1).font = { italic: true, size: 10, color: { argb: argb(COLORS.gray) } }
  plan.getCell(6, 1).alignment = { vertical: 'middle', wrapText: true }
  plan.getRow(7).values = [
    'Sira', 'Personel', 'Bolum', 'Alan', 'Pozisyon',
    ...weekDays.map((date, idx) => `${DAY_LABELS[idx]}\n${formatDate(date)}`),
    'Calisma', 'OFF/Izin', 'YOK', 'Bos', 'Risk',
  ]
  styleHeaderRow(plan.getRow(7))
  exportRows.forEach((person, idx) => {
    const counts = personCounts(person, weekDays)
    const risk = riskFor(counts)
    const row = plan.addRow([
      idx + 1,
      person.full_name,
      person.dept_name || '-',
      inferWorkArea(person),
      person.position || '-',
      ...weekDays.map(date => cellToScheduleCode(person.days?.[date], shiftDefs)),
      null, null, null, null, null,
    ])
    const rowNo = row.number
    const rowDayRange = `${entryDayStart}${rowNo}:${entryDayEnd}${rowNo}`
    row.getCell(13).value = { formula: quickWorkFormula(rowDayRange), result: counts.work }
    row.getCell(14).value = { formula: quickRestFormula(rowDayRange), result: counts.rest }
    row.getCell(15).value = { formula: quickAbsentFormula(rowDayRange), result: counts.absent }
    row.getCell(16).value = { formula: quickEmptyFormula(rowDayRange), result: counts.empty }
    row.getCell(17).value = { formula: riskFormulaForRow(rowNo, 'M', 'N', 'O', 'P'), result: risk }
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo <= 5 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
      if (colNo >= entryDayStartCol && colNo <= entryDayEndCol) {
        const dayCell = person.days?.[weekDays[colNo - entryDayStartCol]]
        cell.numFmt = '@'
        cell.fill = fill(cellHex(dayCell))
        cell.font = { size: 9, bold: !!dayCell, color: { argb: dayCell ? 'FFFFFFFF' : 'FF64748B' } }
        if (dayCell?.absent_reason) cell.note = `Devamsizlik nedeni: ${dayCell.absent_reason}`
      }
      if (colNo === 17) {
        cell.fill = fill(risk === 'OK' ? COLORS.green : risk === 'Bos var' ? COLORS.red : COLORS.amber)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
    row.height = 26
  })
  if (exportRows.length) {
    applyQuickCodeValidation(plan, entryStartRow, entryEndRow, entryDayStartCol, entryDayEndCol, codeValidationRange)
    applyQuickCodeConditionalFormatting(plan, `${entryDayStart}${entryStartRow}:${entryDayEnd}${entryEndRow}`, `${entryDayStart}${entryStartRow}`, codes)
    plan.addConditionalFormatting({
      ref: `Q${entryStartRow}:Q${entryEndRow}`,
      rules: [
        { type: 'expression', formulae: [`Q${entryStartRow}="OK"`], style: { fill: fill(COLORS.green), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
        { type: 'expression', formulae: [`Q${entryStartRow}="Bos var"`], style: { fill: fill(COLORS.red), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
        { type: 'expression', formulae: [`AND(Q${entryStartRow}<>"OK",Q${entryStartRow}<>"Bos var")`], style: { fill: fill(COLORS.amber), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
      ],
    })
  }
  plan.getRow(7).getCell(19).value = 'Kod'
  plan.getRow(7).getCell(20).value = 'Anlam'
  plan.getRow(7).getCell(21).value = 'Saat'
  plan.getRow(7).getCell(22).value = 'Renk'
  ;[19, 20, 21, 22].forEach(colNo => {
    const cell = plan.getRow(7).getCell(colNo)
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill = fill(COLORS.header)
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = border
  })
  codes.forEach((item, idx) => {
    const rowNo = 8 + idx
    const row = plan.getRow(rowNo)
    row.getCell(19).value = item.code
    row.getCell(20).value = item.label
    row.getCell(21).value = item.hours
    row.getCell(22).value = ''
    row.getCell(22).fill = fill(item.hex)
    ;[19, 20, 21, 22].forEach(colNo => {
      const cell = row.getCell(colNo)
      cell.border = border
      cell.alignment = { horizontal: colNo === 20 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9, bold: colNo === 19, color: { argb: colNo === 19 ? argb(COLORS.ink) : argb(COLORS.ink) } }
    })
  })
  const planSummaryStart = Math.max(entryEndRow, 8 + codes.length) + 3
  plan.getCell(planSummaryStart, 1).value = 'BOLUM HIZLI OZET'
  plan.getCell(planSummaryStart, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  plan.getRow(planSummaryStart + 1).values = ['Bolum', 'Kisi', ...weekDays.map((date, idx) => `${DAY_LABELS[idx]}\n${formatDate(date)}`), 'Toplam', 'Bos/YOK']
  styleHeaderRow(plan.getRow(planSummaryStart + 1))
  deptSummary.forEach(dept => {
    const row = plan.addRow([dept.name, dept.members, ...weekDays.map(() => null), null, null])
    const rowNo = row.number
    weekDays.forEach((_date, idx) => {
      const entryCol = colLetter(entryDayStartCol + idx)
      const deptRange = sheetRange(sheetNames.plan, `$C$${entryStartRow}:$C$${entryEndRow}`)
      const dayRange = sheetRange(sheetNames.plan, `$${entryCol}$${entryStartRow}:$${entryCol}$${entryEndRow}`)
      row.getCell(3 + idx).value = {
        formula: `COUNTIFS(${deptRange},$A${rowNo},${dayRange},"<>",${dayRange},"<>OFF",${dayRange},"<>I",${dayRange},"<>YOK",${dayRange},"<>sil")`,
        result: dept.perDay[idx].work,
      }
    })
    const firstDay = colLetter(3)
    const lastDay = colLetter(3 + weekDays.length - 1)
    row.getCell(10).value = { formula: `SUM(${firstDay}${rowNo}:${lastDay}${rowNo})`, result: dept.perDay.reduce((sum, day) => sum + day.work, 0) }
    row.getCell(11).value = { formula: `SUMPRODUCT(--(${firstDay}${rowNo}:${lastDay}${rowNo}<${coverageMin}))`, result: dept.perDay.filter(day => day.work < coverageMin).length }
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
      if (colNo >= 3 && colNo <= 9 && Number(cell.value?.result ?? cell.value ?? 0) < coverageMin) {
        cell.fill = fill(COLORS.red)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
  })
  plan.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: 17 } }
  plan.columns = [
    { width: 7 }, { width: 26 }, { width: 18 }, { width: 18 }, { width: 18 },
    ...weekDays.map(() => ({ width: 13 })),
    { width: 10 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 12 },
    { width: 4 }, { width: 10 }, { width: 24 }, { width: 14 }, { width: 10 },
  ]
  styleAllUsedCells(plan)

  const operation = wb.addWorksheet(sheetNames.operation, { views: [{ state: 'frozen', xSplit: 2, ySplit: 7 }] })
  setupSheet(operation, COLORS.green)
  setupTitle(operation, 'GUNLUK OPERASYON, LOKAL VE KAPANIS', 'Gun gun calisan, izinli, bos, departman, kamp/OTC/FPU/yemekhane-lokal takibi ve puantaj kapanis kontrolu.', 14)
  addNav(operation, navSheets)
  addMetric(operation, 1, 'Calisma', { formula: quickWorkFormula(entryDayRange), result: exportStats.working }, COLORS.green)
  addMetric(operation, 3, 'OFF/Izin', { formula: quickRestFormula(entryDayRange), result: exportStats.onLeave }, COLORS.teal)
  addMetric(operation, 5, 'YOK', { formula: quickAbsentFormula(entryDayRange), result: absentTotal }, COLORS.red)
  addMetric(operation, 7, 'Bos', { formula: quickEmptyFormula(entryDayRange), result: exportStats.empty }, exportStats.empty ? COLORS.red : COLORS.green)
  addMetric(operation, 9, 'Uyari', exportWarnings.length, exportWarnings.length ? COLORS.amber : COLORS.green)
  addMetric(operation, 11, 'Kapanis', closingCheck.ok ? 'OK' : 'Kontrol', closingCheck.ok ? COLORS.green : COLORS.red)
  addMetric(operation, 13, 'Min Kisi', coverageMin, COLORS.purple)
  operation.getRow(7).values = ['Tarih', 'Gun', 'Calisma', 'OFF/Izin', 'YOK', 'Bos', 'Kritik Bolum', 'Durum']
  styleHeaderRow(operation.getRow(7))
  weekDays.forEach((date, idx) => {
    const entryCol = colLetter(entryDayStartCol + idx)
    const dayRange = sheetRange(sheetNames.plan, `$${entryCol}$${entryStartRow}:$${entryCol}$${entryEndRow}`)
    const workCount = exportRows.filter(person => isWorking(person.days?.[date])).length
    const restCount = exportRows.filter(person => isRest(person.days?.[date])).length
    const absentCount = exportRows.filter(person => person.days?.[date]?.status === 'absent').length
    const emptyCount = exportRows.filter(person => !person.days?.[date]).length
    const criticalDeptCount = deptSummary.filter(dept => dept.perDay[idx].work < coverageMin).length
    const row = operation.addRow([
      new Date(`${date}T00:00:00`),
      DAY_LABELS[idx],
      { formula: quickWorkFormula(dayRange), result: workCount },
      { formula: quickRestFormula(dayRange), result: restCount },
      { formula: quickAbsentFormula(dayRange), result: absentCount },
      { formula: quickEmptyFormula(dayRange), result: emptyCount },
      criticalDeptCount,
      null,
    ])
    const rowNo = row.number
    row.getCell(8).value = { formula: `IF(F${rowNo}>0,"Bos var",IF(C${rowNo}<${coverageMin},"Eksik kisi","OK"))`, result: emptyCount > 0 ? 'Bos var' : workCount < coverageMin ? 'Eksik kisi' : 'OK' }
    row.getCell(1).numFmt = 'yyyy-mm-dd'
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo <= 2 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 10 }
      if (colNo === 8) {
        const status = cell.value?.result || cell.value
        cell.fill = fill(status === 'OK' ? COLORS.green : status === 'Bos var' ? COLORS.red : COLORS.amber)
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      }
    })
  })
  const matrixStart = operation.lastRow.number + 3
  operation.getCell(matrixStart, 1).value = 'BOLUM x GUN KAPSAMA'
  operation.getCell(matrixStart, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  operation.getRow(matrixStart + 1).values = ['Bolum', 'Kisi', ...weekDays.map((date, idx) => `${DAY_LABELS[idx]}\n${formatDate(date)}`), 'Toplam', 'En Dusuk', 'Durum']
  styleHeaderRow(operation.getRow(matrixStart + 1))
  deptSummary.forEach(dept => {
    const row = operation.addRow([dept.name, dept.members, ...weekDays.map(() => null), null, null, null])
    const rowNo = row.number
    weekDays.forEach((_date, idx) => {
      const entryCol = colLetter(entryDayStartCol + idx)
      const deptRange = sheetRange(sheetNames.plan, `$C$${entryStartRow}:$C$${entryEndRow}`)
      const dayRange = sheetRange(sheetNames.plan, `$${entryCol}$${entryStartRow}:$${entryCol}$${entryEndRow}`)
      row.getCell(3 + idx).value = {
        formula: `COUNTIFS(${deptRange},$A${rowNo},${dayRange},"<>",${dayRange},"<>OFF",${dayRange},"<>I",${dayRange},"<>YOK",${dayRange},"<>sil")`,
        result: dept.perDay[idx].work,
      }
    })
    const firstDay = colLetter(3)
    const lastDay = colLetter(3 + weekDays.length - 1)
    row.getCell(10).value = { formula: `SUM(${firstDay}${rowNo}:${lastDay}${rowNo})`, result: dept.perDay.reduce((sum, day) => sum + day.work, 0) }
    row.getCell(11).value = { formula: `MIN(${firstDay}${rowNo}:${lastDay}${rowNo})`, result: Math.min(...dept.perDay.map(day => day.work)) }
    row.getCell(12).value = { formula: `IF(K${rowNo}<${coverageMin},"Eksik","OK")`, result: Math.min(...dept.perDay.map(day => day.work)) < coverageMin ? 'Eksik' : 'OK' }
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
      if (colNo >= 3 && colNo <= 9 && Number(cell.value?.result ?? cell.value ?? 0) < coverageMin) {
        cell.fill = fill(COLORS.red)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
      if (colNo === 12) {
        const status = cell.value?.result || cell.value
        cell.fill = fill(status === 'OK' ? COLORS.green : COLORS.red)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
  })

  const areaStart = operation.lastRow.number + 3
  operation.getCell(areaStart, 1).value = 'ALAN / LOKAL / YEMEKHANE OZETI'
  operation.getCell(areaStart, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  operation.getRow(areaStart + 1).values = ['Alan', 'Kisi', ...weekDays.map((date, idx) => `${DAY_LABELS[idx]}\n${formatDate(date)}`), 'Toplam', 'En Dusuk', 'Durum']
  styleHeaderRow(operation.getRow(areaStart + 1))
  areaSummary.forEach(area => {
    const row = operation.addRow([area.name, area.members, ...weekDays.map(() => null), null, null, null])
    const rowNo = row.number
    weekDays.forEach((_date, idx) => {
      const entryCol = colLetter(entryDayStartCol + idx)
      const areaRange = sheetRange(sheetNames.plan, `$D$${entryStartRow}:$D$${entryEndRow}`)
      const dayRange = sheetRange(sheetNames.plan, `$${entryCol}$${entryStartRow}:$${entryCol}$${entryEndRow}`)
      row.getCell(3 + idx).value = {
        formula: `COUNTIFS(${areaRange},$A${rowNo},${dayRange},"<>",${dayRange},"<>OFF",${dayRange},"<>I",${dayRange},"<>YOK",${dayRange},"<>sil")`,
        result: area.perDay[idx].work,
      }
    })
    const firstDay = colLetter(3)
    const lastDay = colLetter(3 + weekDays.length - 1)
    row.getCell(10).value = { formula: `SUM(${firstDay}${rowNo}:${lastDay}${rowNo})`, result: area.perDay.reduce((sum, day) => sum + day.work, 0) }
    row.getCell(11).value = { formula: `MIN(${firstDay}${rowNo}:${lastDay}${rowNo})`, result: Math.min(...area.perDay.map(day => day.work)) }
    row.getCell(12).value = { formula: `IF(K${rowNo}<${coverageMin},"Dusuk","OK")`, result: Math.min(...area.perDay.map(day => day.work)) < coverageMin ? 'Dusuk' : 'OK' }
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
      if (colNo === 12) {
        const status = cell.value?.result || cell.value
        cell.fill = fill(status === 'OK' ? COLORS.green : COLORS.amber)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
  })

  const warnStart = operation.lastRow.number + 3
  operation.getCell(warnStart, 1).value = 'CANLI UYARI VE PUANTAJ KAPANIS'
  operation.getCell(warnStart, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  operation.getRow(warnStart + 1).values = ['Seviye', 'Tip', 'Tarih', 'Personel/Bolum', 'Adet', 'Mesaj']
  styleHeaderRow(operation.getRow(warnStart + 1))
  const warningRows = exportWarnings.length
    ? exportWarnings
    : [{ severity: 'info', title: 'Temiz', date: '', staffName: '', dept: '', count: '', message: 'Bu haftalik cizelgede kural uyarisi yok.' }]
  warningRows.slice(0, 200).forEach(warning => {
    const row = operation.addRow([warning.severity || 'info', warning.title || warning.type, warning.date || '', warning.staffName || warning.dept || '', warning.count || '', warning.message || ''])
    row.eachCell(cell => { cell.border = border; cell.alignment = { vertical: 'middle', wrapText: true }; cell.font = { size: 9 } })
    row.getCell(1).fill = fill(warning.severity === 'high' ? COLORS.red : warning.severity === 'medium' ? COLORS.amber : COLORS.green)
    row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
  })
  closingCheck.issues.forEach(issue => {
    const row = operation.addRow([issue.severity, issue.title, '', '', issue.count, issue.message])
    row.eachCell(cell => { cell.border = border; cell.alignment = { vertical: 'middle', wrapText: true }; cell.font = { size: 9 } })
    row.getCell(1).fill = fill(issue.severity === 'high' ? COLORS.red : issue.severity === 'medium' ? COLORS.amber : COLORS.green)
    row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
  })
  operation.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: 8 } }
  operation.columns = [
    { width: 18 }, { width: 9 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 8 },
    { width: 12 }, { width: 12 }, { width: 4 }, { width: 10 }, { width: 10 }, { width: 12 },
    { width: 12 }, { width: 12 },
  ]
  styleAllUsedCells(operation)

  const raw = wb.addWorksheet(sheetNames.raw, { views: [{ state: 'frozen', ySplit: 4 }] })
  setupSheet(raw, COLORS.gray)
  setupTitle(raw, 'VERI, KODLAR VE AYARLAR', 'Filtre, pivot, denetim ve Excel icindeki acilir kod listeleri bu sayfada toplanir.', 23)
  raw.getRow(3).values = ['staff_id', 'personel', 'dept_id', 'bolum', 'alan', 'pozisyon', 'tarih', 'gun', 'status', 'kod', 'shift_def_id', 'vardiya', 'baslangic', 'bitis', 'not']
  styleHeaderRow(raw.getRow(3))
  weekDays.forEach((date, idx) => {
    exportRows.forEach(person => {
      const cell = person.days?.[date]
      const row = raw.addRow([
        person.id,
        person.full_name,
        person.dept_id || '',
        person.dept_name || '',
        inferWorkArea(person),
        person.position || '',
        new Date(`${date}T00:00:00`),
        DAY_LABELS[idx],
        cell?.status || 'empty',
        cellToScheduleCode(cell, shiftDefs),
        cell?.shift_def_id || '',
        cell?.shift_name || '',
        cell?.start_hour ?? cell?.shift_start ?? '',
        cell?.end_hour ?? cell?.shift_end ?? '',
        cell?.absent_reason || cell?.leave_type || '',
      ])
      row.getCell(7).numFmt = 'yyyy-mm-dd'
      row.eachCell((cellItem, colNo) => {
        cellItem.border = border
        cellItem.alignment = { vertical: 'middle', wrapText: true }
        cellItem.font = { size: 9 }
        if (colNo === 10) {
          cellItem.fill = fill(cellHex(cell))
          cellItem.font = { size: 9, bold: true, color: { argb: cell ? 'FFFFFFFF' : 'FF64748B' } }
        }
      })
    })
  })
  raw.getRow(4).getCell(18).value = 'Liste'
  raw.getRow(4).getCell(19).value = 'Kod'
  raw.getRow(4).getCell(20).value = 'Anlam'
  raw.getRow(4).getCell(21).value = 'Saat'
  raw.getRow(4).getCell(22).value = 'Renk HEX'
  raw.getRow(4).getCell(23).value = 'Not'
  ;[18, 19, 20, 21, 22, 23].forEach(colNo => {
    const cell = raw.getRow(4).getCell(colNo)
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill = fill(COLORS.header)
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = border
  })
  codes.forEach((item, idx) => {
    const rowNo = codeListStart + idx
    const row = raw.getRow(rowNo)
    row.getCell(18).value = item.kind === 'shift' ? 'Vardiya' : 'Durum'
    row.getCell(19).value = item.code
    row.getCell(20).value = item.label
    row.getCell(21).value = item.hours
    row.getCell(22).value = item.hex
    row.getCell(23).value = item.note
    row.getCell(22).fill = fill(item.hex)
    ;[18, 19, 20, 21, 22, 23].forEach(colNo => {
      const cell = row.getCell(colNo)
      cell.border = border
      cell.alignment = { horizontal: colNo === 20 || colNo === 23 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9, bold: colNo === 19 }
    })
  })
  const settingsStart = Math.max(codeListEnd + 3, 18)
  raw.getCell(settingsStart, 18).value = 'Ayar'
  raw.getCell(settingsStart, 19).value = 'Deger'
  raw.getCell(settingsStart, 20).value = 'Aciklama'
  ;[18, 19, 20].forEach(colNo => {
    const cell = raw.getRow(settingsStart).getCell(colNo)
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill = fill(COLORS.header)
    cell.border = border
  })
  ;[
    ['Hafta Baslangic', new Date(`${weekStart}T00:00:00`), 'Plan haftasinin ilk gunu'],
    ['Hafta Bitis', new Date(`${weekEnd}T00:00:00`), 'Plan haftasinin son gunu'],
    ['Min Kisi/Gun', coverageMin, 'Operasyon sayfasinda dusuk kapsama esigi'],
    ['Sayfa Modu', '3 sayfa', 'Plan + Operasyon + Veri'],
  ].forEach((item, idx) => {
    const row = raw.getRow(settingsStart + 1 + idx)
    row.getCell(18).value = item[0]
    row.getCell(19).value = item[1]
    row.getCell(20).value = item[2]
    if (item[1] instanceof Date) row.getCell(19).numFmt = 'yyyy-mm-dd'
    ;[18, 19, 20].forEach(colNo => {
      const cell = row.getCell(colNo)
      cell.border = border
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
    })
  })
  raw.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 15 } }
  raw.columns = [
    { width: 9 }, { width: 28 }, { width: 9 }, { width: 18 }, { width: 18 }, { width: 18 },
    { width: 12 }, { width: 8 }, { width: 14 }, { width: 8 }, { width: 11 }, { width: 16 },
    { width: 10 }, { width: 10 }, { width: 24 }, { width: 4 }, { width: 4 },
    { width: 12 }, { width: 10 }, { width: 24 }, { width: 14 }, { width: 12 }, { width: 34 },
  ]
  styleAllUsedCells(raw)

  const buffer = await wb.xlsx.writeBuffer()
  saveWorkbook(buffer, `vardiya-plan-operasyon-${weekStart}.xlsx`)
}
