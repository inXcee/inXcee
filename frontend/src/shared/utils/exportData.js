// Listeler için CSV ve Excel export yardımcıları.
// exceljs lazy-import edilir — bundle yalnızca export tetiklendiğinde yüklenir.

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Excel'de "=cmd" gibi formül olarak yorumlanacak değerleri prefix ile zararsızla.
// (CSV injection — bkz. OWASP Top 10)
function safeValue(v) {
  if (v == null) return ''
  const s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) return `'${s}`
  return s
}

function escapeCsvCell(v) {
  const s = safeValue(v)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// columns: [{ key, label, format?: (row) => any }]
// rows: object[]
export function exportRowsToCsv(columns, rows, filename = 'export.csv') {
  const header = columns.map(c => escapeCsvCell(c.label)).join(';')
  const body = rows.map(row =>
    columns.map(c => {
      const val = c.format ? c.format(row) : row[c.key]
      return escapeCsvCell(val)
    }).join(';')
  ).join('\n')
  // BOM — Excel'in TR karakterleri doğru göstermesi için
  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, filename)
}

export async function exportRowsToXlsx(columns, rows, filename = 'export.xlsx', sheetName = 'Veri') {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'YYS'
  wb.created = new Date()
  const ws = wb.addWorksheet(sheetName)
  const preparedRows = rows.map(row => Object.fromEntries(columns.map(column => [
    column.key,
    safeValue(column.format ? column.format(row) : row[column.key]),
  ])))
  ws.columns = columns.map(c => ({
    header: c.label,
    key: c.key,
    width: Math.min(42, Math.max(
      12,
      c.label.length + 2,
      ...preparedRows.slice(0, 250).map(row => String(row[c.key] ?? '').length + 2),
    )),
  }))
  preparedRows.forEach(row => ws.addRow(row))
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  ws.pageSetup = { orientation: columns.length > 8 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  const header = ws.getRow(1)
  header.height = 24
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.alignment = { vertical: 'middle' }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  header.eachCell(cell => {
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF8BA3BF' } } }
  })
  for (let index = 2; index <= ws.rowCount; index += 1) {
    const row = ws.getRow(index)
    row.alignment = { vertical: 'top', wrapText: false }
    if (index % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } }
  }
  const buf = await wb.xlsx.writeBuffer()
  triggerDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}
