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
  const ws = wb.addWorksheet(sheetName)
  ws.columns = columns.map(c => ({
    header: c.label,
    key: c.key,
    width: Math.max(c.label.length + 2, 14),
  }))
  for (const row of rows) {
    const out = {}
    for (const c of columns) {
      out[c.key] = safeValue(c.format ? c.format(row) : row[c.key])
    }
    ws.addRow(out)
  }
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
  const buf = await wb.xlsx.writeBuffer()
  triggerDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}
