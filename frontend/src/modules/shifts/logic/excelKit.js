// Paylaşılan ExcelJS yardımcıları — vardiya çizelge Excel + puantaj föyü + (ileride) diğer
// export'lar ortak kullanır. Renk/dolgu/kenarlık/başlık/sayfa-kurulum/indirme tek yerde.

export const COLORS = {
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

export const border = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
}

// 6 haneli hex (veya #hex) → ExcelJS ARGB
export const argb = hex => `FF${String(hex || COLORS.gray).replace('#', '').toUpperCase()}`
export const fill = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } })

export function colLetter(col) {
  let value = ''
  let n = col
  while (n > 0) {
    const m = (n - 1) % 26
    value = String.fromCharCode(65 + m) + value
    n = Math.floor((n - 1) / 26)
  }
  return value
}

export function quoteSheet(sheetName) {
  return `'${String(sheetName).replaceAll("'", "''")}'`
}
export function sheetRange(sheetName, range) {
  return `${quoteSheet(sheetName)}!${range}`
}

// İki satır birleşik başlık (title + subtitle) — koyu zemin, beyaz yazı
export function setupTitle(ws, titleText, subtitle, lastCol) {
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

// Yazdırma-hazır sayfa kurulumu (landscape, fitToWidth, dar kenar boşlukları)
export function setupSheet(ws, tabHex = COLORS.blue) {
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

export function styleHeaderRow(row) {
  row.eachCell(cell => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill = fill(COLORS.header)
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = border
  })
}

export function styleAllUsedCells(ws) {
  ws.eachRow(row => {
    row.eachCell({ includeEmpty: false }, cell => {
      cell.border = cell.border || border
      cell.alignment = cell.alignment || { vertical: 'middle', wrapText: true }
    })
  })
}

// 2 satırlık metrik kartı (etiket + büyük değer) — startCol'dan 2 sütun birleşik
export function addMetric(ws, startCol, label, value, hex) {
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

// workbook buffer → tarayıcıdan indir
export function saveWorkbook(buffer, filename, options = {}) {
  let url = ''
  try {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    url = URL.createObjectURL(blob)
    a.href = url
    a.download = filename
    a.click()
  } catch (error) {
    options.onError?.(error)
    throw error
  } finally {
    if (url) URL.revokeObjectURL(url)
  }
}
