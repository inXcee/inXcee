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

function styleHeaderRow(row) {
  row.eachCell(cell => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill = fill(COLORS.header)
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = border
  })
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

function saveWorkbook(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
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

  const exportRows = visibleGrid.length || gridSearch || statusFilter !== 'all' ? visibleGrid : staffGrid
  const exportStats = computeWeekStats(exportRows, weekDays)
  const exportWarnings = buildScheduleWarnings(exportRows, weekDays, { coverageMin })
  const closingCheck = buildPayrollClosingCheck(exportRows, weekDays, { coverageMin })
  const deptSummary = buildDeptSummary(exportRows, weekDays)
  const generatedAt = new Date()

  const dash = wb.addWorksheet('Kontrol Paneli', { views: [{ state: 'frozen', ySplit: 8 }] })
  setupTitle(dash, 'VARDIYA EXCEL KONTROL PANELI', `${formatDate(weekStart)} - ${formatDate(weekEnd)} | ${generatedAt.toLocaleString('tr-TR')}`, 12)
  addMetric(dash, 1, 'Personel', exportRows.length, COLORS.blue)
  addMetric(dash, 3, 'Calisma', exportStats.working, COLORS.green)
  addMetric(dash, 5, 'Izin/OFF', exportStats.onLeave, COLORS.teal)
  addMetric(dash, 7, 'Bos', exportStats.empty, exportStats.empty ? COLORS.red : COLORS.green)
  addMetric(dash, 9, 'Kritik', exportWarnings.filter(w => w.severity === 'high').length, COLORS.red)
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

  const ws = wb.addWorksheet('Haftalik Cizelge', { views: [{ state: 'frozen', xSplit: 4, ySplit: 7 }] })
  const weekLastCol = 16
  setupTitle(ws, 'HAFTALIK VARDIYA CIZELGESI', `${formatDate(weekStart)} - ${formatDate(weekEnd)} | Filtre: ${deptFilter ? 'Bolum secili' : 'Tum bolumler'} | ${exportRows.length} personel`, weekLastCol)
  addMetric(ws, 1, 'Calisma', exportStats.working, COLORS.green)
  addMetric(ws, 3, 'Izin/OFF', exportStats.onLeave, COLORS.teal)
  addMetric(ws, 5, 'Bos', exportStats.empty, exportStats.empty ? COLORS.red : COLORS.green)
  addMetric(ws, 7, 'Uyari', exportWarnings.length, exportWarnings.length ? COLORS.amber : COLORS.green)
  addMetric(ws, 9, 'Min Kisi', coverageMin, COLORS.blue)
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

  const daily = wb.addWorksheet('Gunluk Detay', { views: [{ state: 'frozen', ySplit: 3 }] })
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

  const deptWs = wb.addWorksheet('Bolum Ozeti', { views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }] })
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

  const personWs = wb.addWorksheet('Personel Ozeti', { views: [{ state: 'frozen', ySplit: 3 }] })
  setupTitle(personWs, 'PERSONEL PUANTAJ ONCESI OZET', 'Satir bazli haftalik calisma, izin, bos ve risk ozeti.', 10)
  personWs.getRow(3).values = ['Personel', 'Bolum', 'Pozisyon', 'Calisma', 'OFF', 'Izin', 'YOK', 'Bos', 'Toplam', 'Risk']
  styleHeaderRow(personWs.getRow(3))
  exportRows.forEach(person => {
    const counts = personCounts(person, weekDays)
    const risk = riskFor(counts)
    const row = personWs.addRow([person.full_name, person.dept_name || '-', person.position || '-', counts.work, counts.off, counts.leave, counts.absent, counts.empty, weekDays.length, risk])
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
  personWs.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 10 } }
  personWs.columns = [{ width: 28 }, { width: 18 }, { width: 18 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 12 }]
  styleAllUsedCells(personWs)

  const legend = wb.addWorksheet('Kodlar ve Sablon', { views: [{ state: 'frozen', ySplit: 3 }] })
  setupTitle(legend, 'KODLAR, RENKLER VE KOPYALA-YAPISTIR SABLONU', 'Bu sayfadaki kod tablosu uygulamadaki hizli giris ile uyumludur.', 10)
  legend.getRow(4).values = ['Kod', 'Anlam', 'Saat', 'Not']
  styleHeaderRow(legend.getRow(4))
  shiftDefs.forEach((shift, idx) => {
    const row = legend.addRow([String(idx + 1), shift.name, formatShiftHours(shift.start_hour, shift.end_hour), 'Hizli hucre giris kodu'])
    row.getCell(1).fill = fill(TAILWIND_HEX[shift.color_class] || COLORS.gray)
    row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    row.eachCell(cell => { cell.border = border; cell.alignment = { vertical: 'middle' }; cell.font = cell.font || { size: 10 } })
  })
  ;[
    ['OFF', 'Haftalik izin', '', 'Dinlenme/haftalik izin'],
    ['I', 'Izin', '', 'Onayli izin gunu'],
    ['YOK', 'Devamsizlik', '', 'Gelmedi olarak isaretler'],
    ['sil', 'Hucreyi temizle', '', 'Secili hucreleri siler'],
  ].forEach(([code, meaning, hour, note]) => {
    const row = legend.addRow([code, meaning, hour, note])
    row.eachCell(cell => { cell.border = border; cell.alignment = { vertical: 'middle' }; cell.font = { size: 10 } })
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
  legend.columns = [{ width: 18 }, { width: 24 }, { width: 18 }, { width: 32 }, ...weekDays.map(() => ({ width: 13 }))]
  styleAllUsedCells(legend)

  const raw = wb.addWorksheet('Ham Veri', { views: [{ state: 'frozen', ySplit: 3 }] })
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
