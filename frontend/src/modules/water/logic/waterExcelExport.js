import {
  defaultUnitForProduct,
  humanQty,
  multiplier,
  unitLabel,
} from './waterUnits.js'
import {
  COLORS,
  border,
  colLetter,
  fill,
  saveWorkbook,
  setupSheet,
} from '../../../shared/logic/excelKit.js'

const NUMBER_FORMAT = '#,##0.##'
const FILLS = {
  title: COLORS.ink,
  header: COLORS.header,
  sub: COLORS.muted,
  total: 'FDE68A',
  red: 'FEE2E2',
  green: 'DCFCE7',
  amber: 'FEF3C7',
}

export const WATER_EXCEL_SHEETS = [
  'Kontrol',
  'Aylık Özet',
  'Ay Uyuşturma',
  'INDEX',
  'Günlük Çizelge',
  'Dağıtım Defteri',
  'İrsaliye Stok',
  'Bölge Toplamları',
  'Ürün Kuralları',
  'Boş İade',
  'İrsaliye Bekleyen',
  'Eksi Stoklar',
  'Düzeltme Fişleri',
]

const SHEET_DESCRIPTIONS = {
  'Aylık Özet': 'Dönem göstergeleri ve güncel stok durumu',
  'Ay Uyuşturma': 'Ay içinde gelen, dağıtılan ve kalan karşılaştırması',
  INDEX: 'Dağıtım yeri ve ürün matrisi; toplam hücreleri formüllüdür',
  'Günlük Çizelge': 'Günlük giriş, dağıtım, net ve kümülatif net akış',
  'Dağıtım Defteri': 'Tek tek dağıtım hareketleri ve irsaliye kaynakları',
  'İrsaliye Stok': 'Gelen irsaliyeler, dağıtılan ve kalan lot miktarları',
  'Bölge Toplamları': 'Dağıtım yeri, marka ve ürün kırılımı',
  'Ürün Kuralları': 'Koli, paket, palet ve baz birim çevrimleri',
  'Boş İade': 'Boş kap ve depozito dönüş kayıtları',
  'İrsaliye Bekleyen': 'FIFO ile henüz eşleşmemiş dağıtımlar',
  'Eksi Stoklar': 'Negatif bakiyedeki ürünler',
  'Düzeltme Fişleri': 'Sayım ve stok düzeltme hareketleri',
}

export function safeExcelText(value) {
  if (value == null) return ''
  const text = String(value)
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

const formatNumber = value => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(value || 0))

const longDay = iso => new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const movementTime = value => {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

const title = (sheet, text, lastColumn) => {
  sheet.mergeCells(1, 1, 1, lastColumn)
  const cell = sheet.getCell(1, 1)
  cell.value = text
  cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  cell.fill = fill(FILLS.title)
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 24
}

const header = (sheet, rowNumber, lastColumn, color = FILLS.header) => {
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = sheet.getCell(rowNumber, column)
    cell.font = { bold: true, color: { argb: color === FILLS.sub ? 'FF0F172A' : 'FFFFFFFF' } }
    cell.fill = fill(color)
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = border
  }
}

const table = (sheet, headerRow, lastRow, lastColumn, numericColumns = []) => {
  header(sheet, headerRow, lastColumn)
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: Math.max(headerRow, lastRow), column: lastColumn },
  }
  sheet.views = [{ state: 'frozen', ySplit: headerRow }]
  for (let row = headerRow + 1; row <= lastRow; row += 1) {
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = sheet.getCell(row, column)
      cell.border = border
      cell.alignment = { vertical: 'middle', wrapText: true }
      if (numericColumns.includes(column)) cell.numFmt = NUMBER_FORMAT
      if ((row - headerRow) % 2 === 0) cell.fill = fill(COLORS.surface)
    }
  }
}

const paintRow = (sheet, rowNumber, color) => {
  sheet.getRow(rowNumber).eachCell({ includeEmpty: true }, cell => { cell.fill = fill(color) })
}

const tabColor = sheetName => {
  if (sheetName === 'Kontrol') return COLORS.teal
  if (sheetName.includes('Eksi') || sheetName.includes('Bekleyen')) return COLORS.red
  if (sheetName.includes('Özet') || sheetName === 'INDEX') return COLORS.blue
  if (sheetName.includes('İrsaliye')) return COLORS.green
  if (sheetName.includes('Düzeltme')) return COLORS.amber
  return COLORS.gray
}

const finalizeWorkbook = workbook => {
  workbook.eachSheet(sheet => {
    setupSheet(sheet, tabColor(sheet.name))
    sheet.headerFooter.oddFooter = '&L YYS Su Takip&C Sayfa &P / &N&R &D &T'
    sheet.pageSetup.printArea = `A1:${colLetter(Math.max(1, sheet.columnCount))}${Math.max(1, sheet.rowCount)}`
  })
}

export async function loadWaterExcelReportData(api, { from, to }) {
  const [summaryRes, outRes, inRes, returnsRes, pendingRes, adjustmentsRes] = await Promise.all([
    api.get('/water/summary', { params: { from, to } }),
    api.get('/water/movements', { params: { type: 'out', from, to, limit: 1000 } }),
    api.get('/water/movements', { params: { type: 'in', from, to, limit: 1000 } }),
    api.get('/water/returns', { params: { from, to } }),
    api.get('/water/pending'),
    api.get('/water/adjustments', { params: { from, to } }),
  ])

  return {
    summary: summaryRes.data || {},
    outRows: outRes.data || [],
    inRows: inRes.data || [],
    returnRows: returnsRes.data || [],
    pendingRows: pendingRes.data?.rows || [],
    adjustmentRows: adjustmentsRes.data?.rows || [],
  }
}

export function waterExcelFilename(from, to) {
  return `su-takip-detayli-${from}_${to}.xlsx`
}

export function buildWaterExcelWorkbook(ExcelJS, options) {
  const {
    pivot = {},
    columns = [],
    summary = {},
    outRows = [],
    inRows = [],
    returnRows = [],
    pendingRows = [],
    adjustmentRows = [],
    from,
    to,
    label,
    generatedAt = new Date(),
  } = options
  const zones = pivot.rows || []
  const totals = summary.totals || {}
  const stock = summary.stock || []
  const daily = summary.daily || []
  const zoneTotals = summary.zones || []
  const negativeStock = stock.filter(item => item.negative || Number(item.balance) < 0)
  const overduePending = pendingRows.filter(item => Number(item.waiting_days || 0) >= 3)
  const periodDeficits = stock.filter(item => Number(item.period_net || 0) < 0)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'YYS Su Takip'
  workbook.created = generatedAt
  workbook.modified = generatedAt
  workbook.calcProperties.fullCalcOnLoad = true

  const control = workbook.addWorksheet('Kontrol')
  title(control, `SU TAKİP KONTROL PANELİ - ${label}`, 8)
  control.addRow(['Dönem', `${from} / ${to}`, 'Oluşturma', generatedAt.toLocaleString('tr-TR'), '', '', '', ''])
  control.addRow([])
  control.addRow(['Gelen', 'Dağıtım', 'Ay Farkı', 'Kalan', 'Düşük Stok', 'Eksi Stok', 'İrsaliye Bekleyen', 'Boş İade'])
  control.addRow([
    Number(totals.period_in || 0),
    Number(totals.period_out || 0),
    Number(totals.period_net || 0),
    Number(totals.balance || 0),
    Number(totals.low_count || 0),
    negativeStock.length,
    pendingRows.length,
    Number(totals.period_return || 0),
  ])
  header(control, 4, 8, FILLS.sub)
  control.getRow(5).eachCell(cell => {
    cell.numFmt = NUMBER_FORMAT
    cell.font = { bold: true, size: 14 }
    cell.alignment = { horizontal: 'center' }
    cell.border = border
  })
  control.addRow([])
  control.addRow(['Kapanış Kontrolü', 'Adet', 'Durum', 'Önerilen İşlem', '', '', '', ''])
  const checks = [
    ['Eksi stok', negativeStock.length, negativeStock.length ? 'KONTROL' : 'TAMAM', 'Sayım ve eksik irsaliyeleri doğrulayın'],
    ['3+ gün irsaliye bekleyen', overduePending.length, overduePending.length ? 'GECİKMİŞ' : 'TAMAM', 'İrsaliye kaynağını eşleştirin'],
    ['Düşük stok', Number(totals.low_count || 0), Number(totals.low_count || 0) ? 'SİPARİŞ' : 'TAMAM', 'Sipariş önerilerini inceleyin'],
    ['Ay dağıtımı gelenden fazla ürün', periodDeficits.length, periodDeficits.length ? 'UYUŞTUR' : 'TAMAM', 'Ay Uyuşturma sayfasını kontrol edin'],
  ]
  checks.forEach(check => control.addRow(check))
  table(control, 7, 7 + checks.length, 4, [2])
  checks.forEach((check, index) => paintRow(control, 8 + index, check[1] ? FILLS.red : FILLS.green))
  control.addRow([])
  const indexHeaderRow = control.rowCount + 1
  control.addRow(['Rapor Sayfası', 'İçerik', 'Kayıt', '', '', '', '', ''])
  WATER_EXCEL_SHEETS.slice(1).forEach(sheetName => {
    const count = sheetName === 'Dağıtım Defteri' ? outRows.length
      : sheetName === 'İrsaliye Stok' ? inRows.length
        : sheetName === 'Boş İade' ? returnRows.length
          : sheetName === 'İrsaliye Bekleyen' ? pendingRows.length
            : sheetName === 'Eksi Stoklar' ? negativeStock.length
              : sheetName === 'Düzeltme Fişleri' ? adjustmentRows.length
                : ''
    control.addRow([{ text: sheetName, hyperlink: `#'${sheetName.replaceAll("'", "''")}'!A1` }, SHEET_DESCRIPTIONS[sheetName], count])
  })
  table(control, indexHeaderRow, control.rowCount, 3, [3])
  control.columns = [{ width: 25 }, { width: 58 }, { width: 12 }, { width: 28 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 14 }]
  control.views = [{ state: 'frozen', ySplit: 2 }]

  const summarySheet = workbook.addWorksheet('Aylık Özet')
  title(summarySheet, `SU TAKİP AYLIK ÖZET - ${label}`, 8)
  summarySheet.addRow(['Dönem başlangıç', from, 'Dönem bitiş', to, 'Oluşturma', generatedAt.toLocaleString('tr-TR'), '', ''])
  summarySheet.addRow([])
  summarySheet.addRow(['Gösterge', 'Değer', 'Açıklama', '', 'Gösterge', 'Değer', 'Açıklama', ''])
  summarySheet.addRow(['Gelen', totals.period_in || 0, 'Seçili ayda gelen dolu ürün', '', 'Dağıtım', totals.period_out || 0, 'Bölgelere verilen', ''])
  summarySheet.addRow(['Kalan Stok', totals.balance || 0, 'Tüm zamanlı giriş - dağıtım', '', 'Boş İade', totals.period_return || 0, 'Dönen boş kap', ''])
  summarySheet.addRow(['Düşük Stok', totals.low_count || 0, 'Eşik altındaki ürün', '', 'Dolaşımda Boş', totals.outstanding || 0, 'Depozito takibi', ''])
  summarySheet.addRow([])
  summarySheet.addRow(['Stok Durumu'])
  summarySheet.addRow(['Marka', 'Ürün', 'Baz Birim', 'Gelen', 'Dağıtım', 'Kalan', 'Kalan Okunur', 'Durum'])
  stock.forEach(item => summarySheet.addRow([
    safeExcelText(item.brand_name), safeExcelText(item.name), safeExcelText(item.unit_label),
    item.total_in || 0, item.total_out || 0, item.balance || 0,
    safeExcelText(item.balance_human || humanQty(item, item.balance)), item.low ? 'DÜŞÜK' : 'OK',
  ]))
  if (!stock.length) summarySheet.addRow(['', 'Stok verisi yok'])
  header(summarySheet, 4, 8, FILLS.sub)
  const stockLastRow = 10 + Math.max(stock.length, 1)
  table(summarySheet, 10, stockLastRow, 8, [4, 5, 6])
  for (let row = 11; row <= stockLastRow; row += 1) {
    if (summarySheet.getCell(row, 8).value === 'DÜŞÜK') paintRow(summarySheet, row, FILLS.red)
  }
  summarySheet.columns = [{ width: 16 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 22 }, { width: 12 }]

  const match = workbook.addWorksheet('Ay Uyuşturma')
  title(match, `AY SONU GELEN / DAĞITILAN UYUŞTURMA - ${label}`, 9)
  match.addRow(['Marka', 'Ürün', 'Baz Birim', 'Ay Gelen', 'Ay Dağıtım', 'Ay Farkı', 'Anlık Kalan', 'Kalan Okunur', 'Durum'])
  stock.forEach(item => {
    const periodNet = Number(item.period_net || 0)
    const status = item.negative ? 'EKSİ STOK' : periodNet < 0 ? 'AY EKSİ' : periodNet > 0 ? 'FAZLA' : 'TAM'
    match.addRow([
      safeExcelText(item.brand_name), safeExcelText(item.name), safeExcelText(item.unit_label),
      Number(item.period_in || 0), Number(item.period_out || 0), periodNet, Number(item.balance || 0),
      safeExcelText(item.balance_human || humanQty(item, item.balance)), status,
    ])
  })
  if (!stock.length) match.addRow(['', 'Ürün verisi yok'])
  table(match, 2, Math.max(2, 2 + stock.length), 9, [4, 5, 6, 7])
  for (let row = 3; row <= 2 + stock.length; row += 1) {
    if (['EKSİ STOK', 'AY EKSİ'].includes(match.getCell(row, 9).value)) paintRow(match, row, FILLS.red)
  }
  match.columns = [{ width: 16 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 22 }, { width: 12 }]

  const index = workbook.addWorksheet('INDEX')
  const totalColumn = columns.length + 2
  const indexLastColumn = Math.max(totalColumn, 5)
  title(index, `INDEX - DAĞITIM YERİ MATRİSİ - ${label}`, indexLastColumn)
  index.getCell(2, 1).value = 'Dönem'
  index.getCell(2, 2).value = `${from} / ${to}`
  index.getCell(2, 4).value = 'Genel toplam'
  index.getCell(2, 5).value = Number(pivot.grandTotal || 0)
  index.getCell(2, 5).numFmt = NUMBER_FORMAT
  index.mergeCells(3, 1, 5, 1)
  index.getCell(3, 1).value = 'DAĞITIM YERİ'
  let brandColumn = 2
  ;(pivot.brands || []).forEach(brand => {
    const span = (brand.product_ids || []).length
    if (span < 1) return
    index.mergeCells(3, brandColumn, 3, brandColumn + span - 1)
    index.getCell(3, brandColumn).value = safeExcelText(brand.brand_name)
    brandColumn += span
  })
  index.mergeCells(3, totalColumn, 5, totalColumn)
  index.getCell(3, totalColumn).value = 'TOPLAM'
  columns.forEach((column, columnIndex) => {
    index.getCell(4, 2 + columnIndex).value = safeExcelText(column.name)
    index.getCell(5, 2 + columnIndex).value = `${column.unit_label || 'adet'} / 1 palet=${formatNumber(multiplier(column, 'palet'))}`
  })
  for (let row = 3; row <= 5; row += 1) {
    for (let column = 1; column <= totalColumn; column += 1) {
      const cell = index.getCell(row, column)
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = fill(FILLS.header)
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = border
    }
  }
  let indexRow = 6
  zones.forEach(zone => {
    index.getCell(indexRow, 1).value = safeExcelText(zone.zone_name)
    columns.forEach((column, columnIndex) => {
      index.getCell(indexRow, 2 + columnIndex).value = zone.cells?.[column.product_id]?.base || null
    })
    if (columns.length) {
      index.getCell(indexRow, totalColumn).value = {
        formula: `SUM(B${indexRow}:${colLetter(totalColumn - 1)}${indexRow})`,
        result: Number(zone.total_base || 0),
      }
    } else index.getCell(indexRow, totalColumn).value = Number(zone.total_base || 0)
    index.getRow(indexRow).eachCell({ includeEmpty: true }, cell => {
      cell.border = border
      cell.numFmt = NUMBER_FORMAT
    })
    index.getCell(indexRow, totalColumn).font = { bold: true }
    indexRow += 1
  })
  const firstDataRow = 6
  const lastDataRow = indexRow - 1
  index.getCell(indexRow, 1).value = 'GENEL TOPLAM'
  columns.forEach((column, columnIndex) => {
    const columnNumber = 2 + columnIndex
    index.getCell(indexRow, columnNumber).value = zones.length
      ? { formula: `SUM(${colLetter(columnNumber)}${firstDataRow}:${colLetter(columnNumber)}${lastDataRow})`, result: Number(pivot.colTotals?.[column.product_id]?.base || 0) }
      : 0
  })
  index.getCell(indexRow, totalColumn).value = zones.length
    ? { formula: `SUM(${colLetter(totalColumn)}${firstDataRow}:${colLetter(totalColumn)}${lastDataRow})`, result: Number(pivot.grandTotal || 0) }
    : Number(pivot.grandTotal || 0)
  index.getRow(indexRow).eachCell({ includeEmpty: true }, cell => {
    cell.font = { bold: true }
    cell.fill = fill(FILLS.total)
    cell.border = border
    cell.numFmt = NUMBER_FORMAT
  })
  index.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }]
  index.getColumn(1).width = 26
  columns.forEach((column, columnIndex) => { index.getColumn(2 + columnIndex).width = 12 })
  index.getColumn(totalColumn).width = 12

  const dailySheet = workbook.addWorksheet('Günlük Çizelge')
  title(dailySheet, `GÜNLÜK AKIŞ - ${label}`, 7)
  dailySheet.addRow(['Tarih', 'Gün', 'Gelen', 'Dağıtım', 'Net', 'Kümülatif Net', 'Not'])
  let cumulativeNet = 0
  daily.forEach((item, itemIndex) => {
    const row = 3 + itemIndex
    const net = Number(item.in_base || 0) - Number(item.out_base || 0)
    cumulativeNet += net
    dailySheet.addRow([
      item.move_date, longDay(item.move_date), Number(item.in_base || 0), Number(item.out_base || 0),
      { formula: `C${row}-D${row}`, result: net },
      { formula: itemIndex === 0 ? `E${row}` : `F${row - 1}+E${row}`, result: cumulativeNet },
      '',
    ])
  })
  table(dailySheet, 2, Math.max(2, 2 + daily.length), 7, [3, 4, 5, 6])
  dailySheet.columns = [{ width: 14 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 22 }]

  const distributions = workbook.addWorksheet('Dağıtım Defteri')
  title(distributions, `DAĞITIM DEFTERİ - ${label}`, 11)
  distributions.addRow(['Tarih', 'Saat', 'Bölge', 'Marka', 'Ürün', 'Girilen Miktar', 'Birim', 'Hesaplanan', 'İrsaliye Kaynağı', 'Kaydı Giren', 'Not'])
  outRows.forEach(row => distributions.addRow([
    row.move_date, movementTime(row.created_at), safeExcelText(row.zone_name), safeExcelText(row.brand_name), safeExcelText(row.product_name),
    Number(row.input_qty || 0), safeExcelText(row.input_unit), Number(row.qty_base || 0), safeExcelText(row.source_waybills),
    safeExcelText(row.created_by_name || row.created_by_username), safeExcelText(row.note),
  ]))
  table(distributions, 2, Math.max(2, 2 + outRows.length), 11, [6, 8])
  distributions.columns = [{ width: 14 }, { width: 10 }, { width: 24 }, { width: 16 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 30 }, { width: 18 }, { width: 24 }]

  const intakes = workbook.addWorksheet('İrsaliye Stok')
  title(intakes, `GELEN TIR / İRSALİYE STOK - ${label}`, 12)
  intakes.addRow(['Tarih', 'İrsaliye', 'Marka', 'Ürün', 'Girilen Miktar', 'Birim', 'Hesaplanan', 'Dağıtılan', 'Kalan', 'Kalan Okunur', 'Kaydı Giren', 'Not'])
  inRows.forEach(row => intakes.addRow([
    row.move_date, safeExcelText(row.waybill_no || `Giriş #${row.id}`), safeExcelText(row.brand_name), safeExcelText(row.product_name),
    Number(row.input_qty || 0), safeExcelText(row.input_unit), Number(row.qty_base || 0), Number(row.intake_allocated_base || 0),
    Number(row.remaining_base || 0), safeExcelText(row.remaining_human || humanQty(row, row.remaining_base)),
    safeExcelText(row.created_by_name || row.created_by_username), safeExcelText(row.note),
  ]))
  table(intakes, 2, Math.max(2, 2 + inRows.length), 12, [5, 7, 8, 9])
  intakes.columns = [{ width: 14 }, { width: 18 }, { width: 16 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 22 }, { width: 18 }, { width: 22 }]

  const zoneSheet = workbook.addWorksheet('Bölge Toplamları')
  title(zoneSheet, `BÖLGE / ÜRÜN TOPLAMLARI - ${label}`, 7)
  zoneSheet.addRow(['Bölge', 'Marka', 'Ürün', 'Baz Birim', 'Toplam', 'Okunur', 'Not'])
  zoneTotals.forEach(row => zoneSheet.addRow([
    safeExcelText(row.zone_name), safeExcelText(row.brand_name), safeExcelText(row.product_name), safeExcelText(row.unit_label),
    Number(row.total_out || 0), safeExcelText(humanQty(row, row.total_out)), '',
  ]))
  table(zoneSheet, 2, Math.max(2, 2 + zoneTotals.length), 7, [5])
  zoneSheet.columns = [{ width: 26 }, { width: 16 }, { width: 22 }, { width: 12 }, { width: 14 }, { width: 22 }, { width: 18 }]

  const rules = workbook.addWorksheet('Ürün Kuralları')
  title(rules, 'ÜRÜN / PALET ÇEVRİM KURALLARI', 8)
  rules.addRow(['Marka', 'Ürün', 'Baz Birim', 'Koli İçi', 'Palet Koli/Paket', '1 Palet Baz', 'Varsayılan Giriş', 'Min Stok'])
  columns.forEach(product => rules.addRow([
    safeExcelText(product.brand_name), safeExcelText(product.name), safeExcelText(product.unit_label),
    Number(product.units_per_case || 1), Number(product.cases_per_pallet || 1), Number(multiplier(product, 'palet') || 1),
    unitLabel(defaultUnitForProduct(product)), Number(product.min_level || 0),
  ]))
  table(rules, 2, Math.max(2, 2 + columns.length), 8, [4, 5, 6, 8])
  rules.columns = [{ width: 16 }, { width: 24 }, { width: 12 }, { width: 10 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 12 }]

  const returns = workbook.addWorksheet('Boş İade')
  title(returns, `BOŞ İADE / DEPOZİTO - ${label}`, 8)
  returns.addRow(['Tarih', 'Marka', 'Ürün', 'Girilen Miktar', 'Birim', 'Hesaplanan', 'Kaydı Giren', 'Not'])
  returnRows.forEach(row => returns.addRow([
    row.move_date, safeExcelText(row.brand_name), safeExcelText(row.product_name), Number(row.input_qty || 0), safeExcelText(row.input_unit),
    Number(row.qty_base || 0), safeExcelText(row.created_by_name || row.created_by_username), safeExcelText(row.note),
  ]))
  table(returns, 2, Math.max(2, 2 + returnRows.length), 8, [4, 6])
  returns.columns = [{ width: 14 }, { width: 16 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 18 }, { width: 24 }]

  const pending = workbook.addWorksheet('İrsaliye Bekleyen')
  title(pending, 'İRSALİYE BEKLEYEN DAĞITIMLAR', 7)
  pending.addRow(['Tarih', 'Dağıtım Yeri', 'Ürün', 'Dağıtılan', 'Eşleşen', 'Bekleyen', 'Gün'])
  pendingRows.forEach(row => pending.addRow([
    row.move_date, safeExcelText(row.zone_name), safeExcelText(row.product_name), Number(row.qty_base || 0),
    Number(row.allocated_base || 0), Number(row.unallocated_base || 0), Number(row.waiting_days || 0),
  ]))
  if (!pendingRows.length) pending.addRow(['', 'Bekleyen dağıtım yok'])
  table(pending, 2, Math.max(2, 2 + pendingRows.length), 7, [4, 5, 6, 7])
  pendingRows.forEach((row, index) => {
    if (Number(row.waiting_days || 0) >= 3) paintRow(pending, 3 + index, FILLS.red)
  })
  pending.columns = [{ width: 14 }, { width: 26 }, { width: 22 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 8 }]

  const negatives = workbook.addWorksheet('Eksi Stoklar')
  title(negatives, `EKSİ STOKTAKİ ÜRÜNLER - ${label}`, 5)
  negatives.addRow(['Marka', 'Ürün', 'Baz Birim', 'Bakiye', 'Eksik (okunur)'])
  negativeStock.forEach(item => negatives.addRow([
    safeExcelText(item.brand_name), safeExcelText(item.name), safeExcelText(item.unit_label), Number(item.balance || 0),
    safeExcelText(item.deficit_human || humanQty(item, Math.abs(item.balance))),
  ]))
  if (!negativeStock.length) negatives.addRow(['', 'Eksi stok yok'])
  table(negatives, 2, Math.max(2, 2 + negativeStock.length), 5, [4])
  negativeStock.forEach((item, index) => paintRow(negatives, 3 + index, FILLS.red))
  negatives.columns = [{ width: 16 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 20 }]

  const adjustments = workbook.addWorksheet('Düzeltme Fişleri')
  title(adjustments, `STOK DÜZELTME / SAYIM FİŞLERİ - ${label}`, 6)
  adjustments.addRow(['Tarih', 'Ürün', 'Yön', 'Etki (baz)', 'Sebep', 'Not'])
  adjustmentRows.forEach(row => adjustments.addRow([
    row.move_date, safeExcelText(row.product_name), row.direction === 'in' ? 'Artı (+)' : 'Eksi (-)',
    Number(row.signed_base || 0), safeExcelText(row.reason), safeExcelText(row.note),
  ]))
  if (!adjustmentRows.length) adjustments.addRow(['', 'Düzeltme kaydı yok'])
  table(adjustments, 2, Math.max(2, 2 + adjustmentRows.length), 6, [4])
  adjustments.columns = [{ width: 14 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 24 }]

  finalizeWorkbook(workbook)
  return {
    workbook,
    filename: waterExcelFilename(from, to),
    sheetNames: workbook.worksheets.map(sheet => sheet.name),
    checks: {
      negativeStock: negativeStock.length,
      overduePending: overduePending.length,
      lowStock: Number(totals.low_count || 0),
      periodDeficits: periodDeficits.length,
    },
  }
}

export async function saveWaterExcelReport(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer()
  saveWorkbook(buffer, filename)
  return { buffer, filename }
}
