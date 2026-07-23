// Muhasebe raporu JSON'undan "Dağıtım Dökümü" panelinin ihtiyaç duyduğu görünümü türetir.
// Saf fonksiyonlar — DOM/ağ yok, bileşen bunları çağırır.
// (Excel indirme aşağıda: workbook kurulumu saf, exceljs yalnız indirmede lazy yüklenir.)
//
// Kaynak sözleşme (backend report.js → buildDetail):
//   detail.columns[i]      → { key, label, full }           (gün ya da ay)
//   report.daily[i].label  → "01.07 Çar"                    (columns ile AYNI sıra)
//   detail.rows[]          → yer: { zone_id, zone_name, total, share, cells[], products[] }
//   detail.rows[].products → { product_id, name, brand_name, total, cells[] }
//   detail.days[]          → { key, label, weekday, zones[{ zone_id, lines[] }] }

// Yer tablosunda yan yana en çok bu kadar ürün sütunu; fazlası "Diğer"de toplanır
// (PDF'teki ZONE_PRODUCT_COLUMNS ile aynı kural — iki çıktı aynı görünsün).
export const ZONE_PRODUCT_COLUMNS = 6

export const productLabel = product => (
  product?.brand_name ? `${product.name} · ${product.brand_name}` : (product?.name || '')
)

const sum = values => values.reduce((total, value) => total + (value || 0), 0)

// Yerin ürünlerini sütunlara çevirir: ilk 6 görünür, kalanı tek "Diğer" sütunu.
function zoneColumns(products) {
  const visible = products.slice(0, ZONE_PRODUCT_COLUMNS)
  const hidden = products.slice(ZONE_PRODUCT_COLUMNS)
  const columns = visible.map(product => ({
    product_id: product.product_id,
    name: product.name,
    brand_name: product.brand_name || null,
    label: productLabel(product),
    total: product.total || 0,
  }))
  if (hidden.length) {
    columns.push({
      product_id: null,
      name: 'Diğer',
      brand_name: null,
      label: 'Diğer',
      total: sum(hidden.map(product => product.total)),
    })
  }
  return { columns, visible, hidden }
}

// Yerin gün satırları — yalnız o yere hareket olan günler (kronolojik).
function zoneDays(zone, { columns, visible, hidden }, dayLabels) {
  const rows = []
  ;(zone.cells || []).forEach((zoneTotal, index) => {
    if (!zoneTotal) return
    const cells = visible.map(product => product.cells?.[index] || 0)
    if (hidden.length) cells.push(sum(hidden.map(product => product.cells?.[index] || 0)))
    rows.push({
      key: dayLabels[index]?.key || String(index),
      label: dayLabels[index]?.label || '',
      cells,
      total: zoneTotal,
    })
  })
  return rows
}

export function buildBreakdown(report) {
  const detail = report?.detail || {}
  const daily = report?.daily || []
  // daily ve detail.columns aynı anahtar sırasından üretilir; etiket daily'den gelir.
  const dayLabels = (detail.columns || []).map((column, index) => ({
    key: column.key,
    label: daily[index]?.label || column.full || column.label || '',
  }))

  const zones = [...(detail.rows || [])]
    .sort((left, right) => (right.total || 0) - (left.total || 0))
    .map(zone => {
      const products = [...(zone.products || [])].sort((left, right) => (right.total || 0) - (left.total || 0))
      const layout = zoneColumns(products)
      const days = zoneDays(zone, layout, dayLabels)
      return {
        zone_id: zone.zone_id,
        zone_name: zone.zone_name,
        total: zone.total || 0,
        share: zone.share ?? null,
        activeDays: days.length,
        topProduct: products.length ? productLabel(products[0]) : '',
        columns: layout.columns,
        hidden: layout.hidden.map(product => ({
          product_id: product.product_id,
          name: product.name,
          brand_name: product.brand_name || null,
          label: productLabel(product),
          total: product.total || 0,
        })),
        days,
      }
    })

  const products = (detail.product_rows || []).map(product => ({
    product_id: product.product_id,
    name: product.name,
    brand_name: product.brand_name || null,
    label: productLabel(product),
    unit_label: product.unit_label || 'adet',
    total: product.total || 0,
    share: product.share ?? null,
  }))

  return {
    zones,
    products,
    totals: {
      grandTotal: detail.grand_total || 0,
      zoneCount: zones.length,
      productCount: products.length,
      dayCount: (detail.columns || []).length,
      activeDayCount: (detail.columns || []).filter((_, index) => (detail.column_totals || [])[index]).length,
    },
  }
}

export function filterZones(zones, query) {
  const needle = String(query || '').trim().toLocaleLowerCase('tr')
  if (!needle) return zones
  return zones.filter(zone => String(zone.zone_name || '').toLocaleLowerCase('tr').includes(needle))
}

// 2. seviye: o gün o yere hangi üründen ne gitti (not / kaydeden dahil).
// detail.days üretilmemişse (62+ hareketli gün) boş döner — panel bunu bilgilendirme
// olarak gösterir, tablo yine 1. seviyede çalışır.
export function dayLines(report, zoneId, dayKey) {
  const day = (report?.detail?.days || []).find(item => item.key === dayKey)
  if (!day) return []
  const zone = (day.zones || []).find(item => item.zone_id === zoneId)
  if (!zone) return []
  return (zone.lines || []).map(line => ({
    product_id: line.product_id,
    label: productLabel({ name: line.product_name, brand_name: line.brand_name }),
    product_name: line.product_name,
    brand_name: line.brand_name || null,
    qty_base: line.qty_base || 0,
    qty_human: line.qty_human || '',
    note: line.note ?? null,
    created_by_name: line.created_by_name ?? null,
  }))
}

const sharePercent = value => (value == null ? '' : `%${String(value).replace('.', ',')}`)

// Excel iki sayfa: Özet (muhasebeye giden toplamlar) + Gün Detay (istenince bakılan kırılım).
export function breakdownExcelRows(breakdown, report = null) {
  const products = breakdown?.products || []
  const zones = breakdown?.zones || []

  const summaryHeaders = ['NO', 'DAĞITIM YERİ', ...products.map(product => product.label), 'TOPLAM', 'PAY']
  const zoneProductTotal = zone => {
    const byId = new Map()
    ;(zone.columns || []).forEach(column => { if (column.product_id != null) byId.set(column.product_id, column.total) })
    ;(zone.hidden || []).forEach(product => byId.set(product.product_id, product.total))
    return byId
  }
  const summaryRows = zones.map((zone, index) => {
    const totals = zoneProductTotal(zone)
    return [
      index + 1,
      zone.zone_name,
      ...products.map(product => totals.get(product.product_id) || 0),
      zone.total,
      sharePercent(zone.share),
    ]
  })
  if (summaryRows.length) {
    summaryRows.push(['', 'GENEL TOPLAM', ...products.map(product => product.total), breakdown.totals.grandTotal, '%100'])
  }

  const dailyHeaders = ['TARİH', 'GÜN', 'DAĞITIM YERİ', 'ÜRÜN', 'MARKA', 'MİKTAR', 'OKUNUR', 'NOT', 'KAYDEDEN']
  const dailyRows = []
  for (const day of report?.detail?.days || []) {
    for (const zone of day.zones || []) {
      for (const line of zone.lines || []) {
        dailyRows.push([
          day.key,
          day.weekday || '',
          zone.zone_name,
          line.product_name,
          line.brand_name || '',
          line.qty_base || 0,
          line.qty_human || '',
          line.note || '',
          line.created_by_name || '',
        ])
      }
    }
  }

  return {
    summary: { headers: summaryHeaders, rows: summaryRows },
    daily: { headers: dailyHeaders, rows: dailyRows },
  }
}

// ── Excel ──
// "Özet" muhasebeye giden asıl sayfa (toplamlar), "Gün Detay" istenince bakılan kırılım.

const NUMBER_FORMAT = '#,##0.##'

function addSheet(workbook, name, { headers, rows }, { numberFrom, tabColor }) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.properties.tabColor = { argb: tabColor }
  sheet.addRow(headers)
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
  sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  rows.forEach(row => sheet.addRow(row))
  sheet.columns.forEach((column, index) => {
    const header = String(headers[index] ?? '')
    column.width = Math.min(34, Math.max(10, header.length + 4))
    if (index >= numberFrom) column.numFmt = NUMBER_FORMAT
  })
  if (rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  return sheet
}

// Ham satır bloğu (kendi başlıklarını taşıyan INDEX/Gelen Tır sayfaları için).
function addRawSheet(workbook, name, { rows, brandGroups, leadCols }, tabColor) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 }] })
  sheet.properties.tabColor = { argb: tabColor }
  rows.forEach(row => sheet.addRow(row))
  // Marka bandı: her markanın hücrelerini birleştir ve renklendir
  let column = leadCols + 1
  ;(brandGroups || []).forEach((group, index) => {
    if (group.span > 1) sheet.mergeCells(1, column, 1, column + group.span - 1)
    const cell = sheet.getCell(1, column)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_FILLS[index % BRAND_FILLS.length] } }
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center' }
    column += group.span
  })
  const headerRow = sheet.getRow(2)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
  headerRow.alignment = { horizontal: 'center', wrapText: true }
  // Son iki satır (TOPLAM / GENEL TOPLAM) vurgulanır
  if (rows.length > 2) {
    ;[rows.length - 1, rows.length].forEach(rowNo => {
      const row = sheet.getRow(rowNo)
      if (String(row.getCell(1).value ?? '').length || String(row.getCell(2).value ?? '').includes('TOPLAM')) {
        row.font = { bold: true }
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }
      }
    })
  }
  sheet.columns.forEach((col, index) => {
    const header = String(rows[1]?.[index] ?? '')
    col.width = Math.min(30, Math.max(9, header.length + 3))
    if (index >= leadCols) col.numFmt = NUMBER_FORMAT
  })
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  return sheet
}

const BRAND_FILLS = ['FFD9EAD3', 'FFCFE2F3', 'FFFCE5CD', 'FFEAD1DC', 'FFE0E7FF']

export function buildBreakdownWorkbook(ExcelJS, breakdown, report, sheets = null) {
  const workbook = new ExcelJS.Workbook()
  const { summary, daily } = breakdownExcelRows(breakdown, report)

  // INDEX düzeni (ekranla birebir) — varsa ilk sayfa olur
  if (sheets?.index?.rows?.length) addRawSheet(workbook, 'INDEX', sheets.index, 'FF0E7490')
  if (sheets?.intake?.rows?.length) addRawSheet(workbook, 'Gelen Tır', sheets.intake, 'FF15803D')

  // Özet: NO + YER metin, sonrası sayı
  const summarySheet = addSheet(workbook, 'Özet', summary, { numberFrom: 2, tabColor: 'FF0E7490' })
  // Genel toplam satırı vurgulanır (muhasebe önce ona bakıyor)
  if (summary.rows.length) {
    const totalRow = summarySheet.getRow(summary.rows.length + 1)
    totalRow.font = { bold: true }
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }
  }
  addSheet(workbook, 'Gün Detay', daily, { numberFrom: 5, tabColor: 'FF64748B' })
  if (sheets?.palette?.rows?.length) addSheet(workbook, 'Palet Çevrimleri', sheets.palette, { numberFrom: 99, tabColor: 'FFB45309' })
  if (sheets?.returns?.rows?.length) addSheet(workbook, 'Boş İade', sheets.returns, { numberFrom: 3, tabColor: 'FF7E22CE' })
  return { workbook }
}

export async function exportBreakdownExcel({ breakdown, report, from, to, sheets = null }) {
  const ExcelJS = (await import('exceljs')).default
  const { workbook } = buildBreakdownWorkbook(ExcelJS, breakdown, report, sheets)
  const buffer = await workbook.xlsx.writeBuffer()
  const { saveWorkbook } = await import('../../../shared/logic/excelKit.js')
  saveWorkbook(buffer, `su-dagitim-dokumu-${from}_${to}.xlsx`)
}
