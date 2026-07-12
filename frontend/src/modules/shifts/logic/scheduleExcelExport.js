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
import { shiftHex } from './shiftColors.js'
import {
  COLORS, border, argb, fill, colLetter, quoteSheet, sheetRange,
  setupTitle, setupSheet, styleHeaderRow, styleAllUsedCells, addMetric, saveWorkbook,
} from './excelKit.js'

const DAY_LABELS = ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz']

const STATUS_FILL = { off: '8B5CF6', on_leave: '14B8A6', absent: 'DC2626', empty: 'F1F5F9' }

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

function displayWorkFormula(range) {
  return `COUNTIFS(${range},"<>",${range},"<>OFF*",${range},"<>Izin*",${range},"<>YOK*",${range},"<>sil")`
}

function displayRestFormula(range) {
  return `COUNTIF(${range},"OFF*")+COUNTIF(${range},"Izin*")`
}

function displayAbsentFormula(range) {
  return `COUNTIF(${range},"YOK*")`
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
  return shiftHex(cell.shift_color)
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
  if (isWorking(cell)) {
    const first = shiftHoursFrom(cell) || cell.shift_name || statusLabel(cell)
    const second = cell.work_location_name || cell.shift_name || ''
    return second ? `${first}\n${second}` : first
  }
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
        error: 'Kodlar Veri sayfasindaki listeden secilmeli.',
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

function quickCodeRows(shiftDefs) {
  return [
    ...shiftDefs.map((shift, idx) => ({
      kind: 'shift',
      code: String(idx + 1),
      label: shift.name,
      hours: formatShiftHours(shift.start_hour, shift.end_hour),
      hex: shiftHex(shift.color_class),
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
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
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

function workAreaForCell(cell, person) {
  return cell?.work_location_name || inferWorkArea(person)
}

function buildAreaSummary(rows, weekDays) {
  const map = new Map()
  rows.forEach(person => {
    weekDays.forEach((date, idx) => {
      const cell = person.days?.[date]
      const key = workAreaForCell(cell, person)
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          memberIds: new Set(),
          members: 0,
          perDay: weekDays.map(() => ({ work: 0, rest: 0, empty: 0 })),
        })
      }
      const item = map.get(key)
      item.memberIds.add(person.id)
      if (isWorking(cell)) item.perDay[idx].work += 1
      else if (isRest(cell)) item.perDay[idx].rest += 1
      else item.perDay[idx].empty += 1
    })
  })
  return [...map.values()]
    .map(item => ({ ...item, members: item.memberIds.size, memberIds: undefined }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

function buildRoleSummary(rows, weekDays) {
  const map = new Map()
  rows.forEach(person => {
    const key = person.role_name || 'Rolsuz'
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

function cleanSheetName(value) {
  const cleaned = String(value || 'Sayfa')
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'Sayfa').slice(0, 31)
}

function uniqueSheetName(value, usedNames) {
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

function cellResult(cell) {
  if (cell && typeof cell === 'object' && 'result' in cell) return cell.result
  return cell
}

function addStatusFill(cell, status) {
  cell.fill = fill(status === 'OK' ? COLORS.green : status === 'Bos var' ? COLORS.red : COLORS.amber)
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
}

function appendSummaryMatrix(ws, startRow, title, firstLabel, rows, weekDays, coverageMin, lowLabel = 'Dusuk') {
  ws.getCell(startRow, 1).value = title
  ws.getCell(startRow, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  ws.getRow(startRow + 1).values = [firstLabel, 'Kisi', ...weekDays.map((date, idx) => `${DAY_LABELS[idx]}\n${formatDate(date)}`), 'Toplam', 'En Dusuk', 'Durum']
  styleHeaderRow(ws.getRow(startRow + 1))
  rows.forEach(item => {
    const daily = item.perDay.map(day => day.work)
    const minValue = daily.length ? Math.min(...daily) : 0
    const row = ws.addRow([
      item.name,
      item.members,
      ...daily,
      daily.reduce((sum, value) => sum + value, 0),
      minValue,
      minValue < coverageMin ? lowLabel : 'OK',
    ])
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
      if (colNo >= 3 && colNo <= 9 && Number(cell.value || 0) < coverageMin) {
        cell.fill = fill(COLORS.red)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
      if (colNo === 12) {
        const status = cell.value
        cell.fill = fill(status === 'OK' ? COLORS.green : COLORS.amber)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
  })
  return ws.lastRow.number
}

function addControlSheet(wb, {
  sheetNames,
  navSheets,
  weekStart,
  weekEnd,
  weekDays,
  generatedAt,
  entryDayRange,
  entryPersonRange,
  entryRiskRange,
  exportRows,
  exportStats,
  exportWarnings,
  closingCheck,
  deptSummary,
  areaSummary,
  roleSummary,
  coverageMin,
  absentTotal,
  riskyRows,
}) {
  const ws = wb.addWorksheet(sheetNames.control, { views: [{ state: 'frozen', ySplit: 8 }] })
  setupSheet(ws, exportWarnings.length ? COLORS.amber : COLORS.green)
  setupTitle(ws, 'VARDIYA KONTROL PANELI', `${formatDate(weekStart)} - ${formatDate(weekEnd)} | ${generatedAt.toLocaleString('tr-TR')}`, 14)
  addNav(ws, navSheets)
  addMetric(ws, 1, 'Personel', { formula: `COUNTA(${entryPersonRange})`, result: exportRows.length }, COLORS.blue)
  addMetric(ws, 3, 'Calisma', { formula: quickWorkFormula(entryDayRange), result: exportStats.working }, COLORS.green)
  addMetric(ws, 5, 'OFF/Izin', { formula: quickRestFormula(entryDayRange), result: exportStats.onLeave }, COLORS.teal)
  addMetric(ws, 7, 'YOK', { formula: quickAbsentFormula(entryDayRange), result: absentTotal }, absentTotal ? COLORS.red : COLORS.green)
  addMetric(ws, 9, 'Bos', { formula: quickEmptyFormula(entryDayRange), result: exportStats.empty }, exportStats.empty ? COLORS.red : COLORS.green)
  addMetric(ws, 11, 'Riskli', { formula: `COUNTIF(${entryRiskRange},"<>OK")`, result: riskyRows }, riskyRows ? COLORS.amber : COLORS.green)
  addMetric(ws, 13, 'Kapanis', closingCheck.ok ? 'OK' : 'Kontrol', closingCheck.ok ? COLORS.green : COLORS.red)

  ws.getRow(7).values = ['Tarih', 'Gun', 'Calisma', 'OFF/Izin', 'YOK', 'Bos', 'Eksik Bolum', 'Durum']
  styleHeaderRow(ws.getRow(7))
  weekDays.forEach((date, idx) => {
    const stats = exportStats.perDay?.[idx] || { working: [], leave: [], empty: [] }
    const absentCount = exportRows.filter(person => person.days?.[date]?.status === 'absent').length
    const criticalDeptCount = deptSummary.filter(dept => dept.perDay[idx].work < coverageMin).length
    const row = ws.addRow([
      new Date(`${date}T00:00:00`),
      DAY_LABELS[idx],
      stats.working.length,
      stats.leave.length,
      absentCount,
      stats.empty.length,
      criticalDeptCount,
      null,
    ])
    row.getCell(1).numFmt = 'yyyy-mm-dd'
    row.getCell(8).value = stats.empty.length > 0 ? 'Bos var' : criticalDeptCount > 0 ? 'Eksik kisi' : 'OK'
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo <= 2 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
      if (colNo === 8) addStatusFill(cell, cell.value)
    })
  })

  const deptStart = ws.lastRow.number + 3
  ws.getCell(deptStart, 1).value = 'BOLUM KAPSAMA OZETI'
  ws.getCell(deptStart, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  ws.getRow(deptStart + 1).values = ['Bolum', 'Kisi', ...weekDays.map((date, idx) => `${DAY_LABELS[idx]}\n${formatDate(date)}`), 'Toplam', 'En Dusuk', 'Durum']
  styleHeaderRow(ws.getRow(deptStart + 1))
  deptSummary.forEach(dept => {
    const row = ws.addRow([
      dept.name,
      dept.members,
      ...dept.perDay.map(day => day.work),
      dept.perDay.reduce((sum, day) => sum + day.work, 0),
      Math.min(...dept.perDay.map(day => day.work)),
      Math.min(...dept.perDay.map(day => day.work)) < coverageMin ? 'Eksik' : 'OK',
    ])
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
      if (colNo >= 3 && colNo <= 9 && Number(cell.value || 0) < coverageMin) {
        cell.fill = fill(COLORS.red)
        cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      }
      if (colNo === 12) addStatusFill(cell, cell.value)
    })
  })

  appendSummaryMatrix(ws, ws.lastRow.number + 3, 'CALISMA NOKTASI OZETI', 'Nokta', areaSummary, weekDays, coverageMin)
  appendSummaryMatrix(ws, ws.lastRow.number + 3, 'ROL OZETI', 'Rol', roleSummary, weekDays, coverageMin)

  const warnStart = ws.lastRow.number + 3
  ws.getCell(warnStart, 1).value = 'UYARI VE KAPANIS LISTESI'
  ws.getCell(warnStart, 1).font = { bold: true, size: 12, color: { argb: argb(COLORS.ink) } }
  ws.getRow(warnStart + 1).values = ['Seviye', 'Tip', 'Tarih', 'Personel/Bolum', 'Adet', 'Mesaj']
  styleHeaderRow(ws.getRow(warnStart + 1))
  const warnings = [
    ...(exportWarnings.length ? exportWarnings : [{ severity: 'info', title: 'Temiz', message: 'Bu haftalik cizelgede kural uyarisi yok.' }]),
    ...closingCheck.issues,
  ]
  warnings.slice(0, 220).forEach(warning => {
    const row = ws.addRow([
      warning.severity || 'info',
      warning.title || warning.type || '',
      warning.date || '',
      warning.staffName || warning.dept || '',
      warning.count || '',
      warning.message || '',
    ])
    row.eachCell((cell, colNo) => {
      cell.border = border
      cell.alignment = { horizontal: colNo <= 2 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.font = { size: 9 }
    })
    row.getCell(1).fill = fill(warning.severity === 'high' ? COLORS.red : warning.severity === 'medium' ? COLORS.amber : COLORS.green)
    row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
  })

  ws.columns = [
    { width: 18 }, { width: 9 }, ...weekDays.map(() => ({ width: 10 })),
    { width: 11 }, { width: 10 }, { width: 12 }, { width: 4 }, { width: 12 }, { width: 16 },
  ]
  ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: 8 } }
  styleAllUsedCells(ws)
  return ws
}

function addDepartmentSheet(wb, {
  sheetName,
  navSheets,
  dept,
  rows,
  weekStart,
  weekEnd,
  weekDays,
  shiftDefs,
  coverageMin,
  codes,
}) {
  const displayRows = [...rows].sort((a, b) => {
    const roleCompare = (a.role_name || 'Rolsuz').localeCompare(b.role_name || 'Rolsuz', 'tr')
    if (roleCompare) return roleCompare
    return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'tr')
  })
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', xSplit: 5, ySplit: 7 }] })
  setupSheet(ws, COLORS.teal)
  setupTitle(ws, `BOLUM CIZELGESI - ${dept.name}`, `${formatDate(weekStart)} - ${formatDate(weekEnd)} | ${displayRows.length} personel`, 17)
  addNav(ws, navSheets)
  const deptStats = computeWeekStats(displayRows, weekDays)
  const entryStartRow = 8
  const entryEndRow = Math.max(entryStartRow, entryStartRow + displayRows.length - 1)
  const entryDayStartCol = 6
  const entryDayEndCol = 12
  const dayStart = colLetter(entryDayStartCol)
  const dayEnd = colLetter(entryDayEndCol)
  const dayRange = `${dayStart}${entryStartRow}:${dayEnd}${entryEndRow}`
  addMetric(ws, 1, 'Personel', displayRows.length, COLORS.blue)
  addMetric(ws, 3, 'Calisma', { formula: displayWorkFormula(dayRange), result: deptStats.working }, COLORS.green)
  addMetric(ws, 5, 'OFF/Izin', { formula: displayRestFormula(dayRange), result: deptStats.onLeave }, COLORS.teal)
  addMetric(ws, 7, 'Bos', { formula: quickEmptyFormula(dayRange), result: deptStats.empty }, deptStats.empty ? COLORS.red : COLORS.green)
  addMetric(ws, 9, 'Min Kisi', coverageMin, COLORS.purple)
  ws.getRow(7).values = [
    'Sira', 'Personel', 'Bolum', 'Rol', 'Pozisyon',
    ...weekDays.map((date, idx) => `${DAY_LABELS[idx]}\n${formatDate(date)}`),
    'Calisma', 'OFF/Izin', 'YOK', 'Bos', 'Risk',
  ]
  styleHeaderRow(ws.getRow(7))
  displayRows.forEach((person, idx) => {
    const counts = personCounts(person, weekDays)
    const risk = riskFor(counts)
    const row = ws.addRow([
      idx + 1,
      person.full_name,
      person.dept_name || dept.name,
      person.role_name || 'Rolsuz',
      person.position || '-',
      ...weekDays.map(date => displayForCell(person.days?.[date])),
      null, null, null, null, null,
    ])
    const rowNo = row.number
    const rowDayRange = `${dayStart}${rowNo}:${dayEnd}${rowNo}`
    row.getCell(13).value = { formula: displayWorkFormula(rowDayRange), result: counts.work }
    row.getCell(14).value = { formula: displayRestFormula(rowDayRange), result: counts.rest }
    row.getCell(15).value = { formula: displayAbsentFormula(rowDayRange), result: counts.absent }
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
      }
      if (colNo === 17) addStatusFill(cell, cellResult(cell.value))
    })
  })
  ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: 17 } }
  ws.columns = [
    { width: 7 }, { width: 26 }, { width: 18 }, { width: 18 }, { width: 18 },
    ...weekDays.map(() => ({ width: 13 })),
    { width: 10 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 12 },
  ]
  appendSummaryMatrix(ws, ws.lastRow.number + 3, 'CALISMA NOKTASI OZETI', 'Nokta', buildAreaSummary(displayRows, weekDays), weekDays, coverageMin)
  appendSummaryMatrix(ws, ws.lastRow.number + 3, 'ROL OZETI', 'Rol', buildRoleSummary(displayRows, weekDays), weekDays, coverageMin)
  styleAllUsedCells(ws)
  return ws
}

export function buildScheduleExcelWorkbook(ExcelJS, {
  weekStart,
  weekEnd,
  weekDays,
  staffGrid = [],
  visibleGrid = [],
  gridSearch,
  statusFilter = 'all',
  deptFilter,
  coverageMin = 1,
  shiftDefs = [],
}) {
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
  const roleSummary = buildRoleSummary(exportRows, weekDays)
  const generatedAt = new Date()
  const codes = quickCodeRows(shiftDefs)

  const usedSheetNames = new Set()
  const sheetNames = {
    control: uniqueSheetName('Kontrol', usedSheetNames),
    plan: uniqueSheetName('Plan', usedSheetNames),
    operation: uniqueSheetName('Operasyon', usedSheetNames),
    raw: uniqueSheetName('Veri', usedSheetNames),
  }
  const departmentSheets = deptSummary.map(dept => ({
    dept,
    sheetName: uniqueSheetName(`Bolum - ${dept.name}`, usedSheetNames),
  }))
  const navSheets = [sheetNames.control, sheetNames.plan, sheetNames.operation, sheetNames.raw, ...departmentSheets.map(item => item.sheetName)]
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

  addControlSheet(wb, {
    sheetNames,
    navSheets,
    weekStart,
    weekEnd,
    weekDays,
    generatedAt,
    entryDayRange,
    entryPersonRange,
    entryRiskRange,
    exportRows,
    exportStats,
    exportWarnings,
    closingCheck,
    deptSummary,
    areaSummary,
    roleSummary,
    coverageMin,
    absentTotal,
    riskyRows,
  })

  const plan = wb.addWorksheet(sheetNames.plan, { views: [{ state: 'frozen', xSplit: 5, ySplit: 7 }] })
  setupSheet(plan, COLORS.blue)
  setupTitle(plan, 'VARDIYA PLAN VE EXCEL GIRIS', `${formatDate(weekStart)} - ${formatDate(weekEnd)} | ${generatedAt.toLocaleString('tr-TR')} | ${navSheets.length} sayfalik operasyon dosyasi`, 23)
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
    'Sira', 'Personel', 'Bolum', 'Alan', 'Rol/Gorev',
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
      person.role_name || person.position || '-',
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
      row.getCell(3 + idx).value = area.perDay[idx].work
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

  appendSummaryMatrix(operation, operation.lastRow.number + 3, 'ROL / GOREV OZETI', 'Rol', roleSummary, weekDays, coverageMin)

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
  raw.getRow(3).values = ['staff_id', 'personel', 'dept_id', 'bolum', 'alan', 'pozisyon', 'tarih', 'gun', 'status', 'kod', 'shift_def_id', 'vardiya', 'baslangic', 'bitis', 'not', 'rol', 'calisma_noktasi']
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
        person.role_name || '',
        cell?.work_location_name || '',
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
    ['Sayfa Modu', `${navSheets.length} sayfa`, `Kontrol + Plan + Operasyon + Veri + ${departmentSheets.length} bolum sayfasi`],
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
  raw.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 17 } }
  raw.columns = [
    { width: 9 }, { width: 28 }, { width: 9 }, { width: 18 }, { width: 18 }, { width: 18 },
    { width: 12 }, { width: 8 }, { width: 14 }, { width: 8 }, { width: 11 }, { width: 16 },
    { width: 10 }, { width: 10 }, { width: 24 }, { width: 16 }, { width: 22 },
    { width: 12 }, { width: 10 }, { width: 24 }, { width: 14 }, { width: 12 }, { width: 34 },
  ]
  styleAllUsedCells(raw)

  departmentSheets.forEach(item => {
    const rows = exportRows.filter(person => (person.dept_name || 'Departmansiz') === item.dept.name)
    addDepartmentSheet(wb, {
      sheetName: item.sheetName,
      navSheets,
      dept: item.dept,
      rows,
      weekStart,
      weekEnd,
      weekDays,
      shiftDefs,
      coverageMin,
      codes,
    })
  })

  return {
    workbook: wb,
    sheetNames: {
      ...sheetNames,
      departments: departmentSheets.map(item => item.sheetName),
    },
    exportRows,
    exportWarnings,
    closingCheck,
    deptSummary,
    areaSummary,
    roleSummary,
  }
}

export async function exportScheduleExcel(options) {
  const ExcelJS = (await import('exceljs')).default
  const { workbook } = buildScheduleExcelWorkbook(ExcelJS, options)
  const buffer = await workbook.xlsx.writeBuffer()
  saveWorkbook(buffer, `vardiya-plan-operasyon-${options.weekStart}.xlsx`)
}
