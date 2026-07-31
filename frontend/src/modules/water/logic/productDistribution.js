// Tek ürünün "nereye, ne zaman, kaç adet" dökümü — saf fonksiyonlar.
// Kaynak sözleşme (backend analytics.js → productDistributionService):
//   report.days[]  → { date, total_base, total_human, zones[{ zone_id, zone_name, qty_base, qty_human }] }
//   report.zones[] → { zone_id, zone_name, total_base, share_pct, day_count, days[{ date, qty_base }] }
//   report.totals  → { total_base, day_count, zone_count, daily_avg_base, first_date, last_date }

// Gün × yer matrisinde yan yana en çok bu kadar yer sütunu; kalanı "Diğer"de
// toplanır — yoksa 40 dağıtım yerinde tablo okunmaz hale geliyor.
export const MATRIX_ZONE_COLUMNS = 8

const OTHER_ZONE_ID = '__other__'

export const zoneKey = zone => String(zone?.zone_id ?? 'none')

// Aramada Türkçe İ/ı ayrımı yüzünden eşleşme kaçmasın diye normalize edilir.
export const normalize = value => String(value || '')
  .toLocaleLowerCase('tr')
  .replaceAll('ı', 'i')

export function filterZones(zones, search) {
  const term = normalize(search).trim()
  if (!term) return zones
  return zones.filter(zone => normalize(zone.zone_name).includes(term))
}

// Gün satır, yer sütun. Sütunlar toplam dağıtıma göre sıralanır; taşanlar "Diğer".
export function buildProductMatrix(report, { maxZones = MATRIX_ZONE_COLUMNS } = {}) {
  const allZones = Array.isArray(report?.zones) ? report.zones : []
  const days = Array.isArray(report?.days) ? report.days : []
  const visible = allZones.slice(0, Math.max(1, maxZones))
  const hidden = allZones.slice(Math.max(1, maxZones))

  const columns = visible.map(zone => ({
    key: zoneKey(zone),
    zone_id: zone.zone_id,
    zone_name: zone.zone_name,
    total_base: zone.total_base || 0,
  }))
  if (hidden.length) {
    columns.push({
      key: OTHER_ZONE_ID,
      zone_id: null,
      zone_name: `Diğer (${hidden.length} yer)`,
      total_base: hidden.reduce((sum, zone) => sum + (zone.total_base || 0), 0),
    })
  }

  const hiddenKeys = new Set(hidden.map(zoneKey))
  const rows = days.map(day => {
    const cells = new Map(columns.map(column => [column.key, 0]))
    for (const zone of day.zones || []) {
      const key = hiddenKeys.has(zoneKey(zone)) ? OTHER_ZONE_ID : zoneKey(zone)
      if (!cells.has(key)) continue
      cells.set(key, (cells.get(key) || 0) + (zone.qty_base || 0))
    }
    return {
      date: day.date,
      total_base: day.total_base || 0,
      total_human: day.total_human || '',
      cells: columns.map(column => cells.get(column.key) || 0),
    }
  })

  return { columns, rows, hiddenCount: hidden.length }
}

// En yoğun gün ve en çok alan yer — operatörün ilk baktığı iki bilgi.
export function buildHighlights(report) {
  const days = Array.isArray(report?.days) ? report.days : []
  const zones = Array.isArray(report?.zones) ? report.zones : []
  const busiestDay = days.reduce(
    (best, day) => (!best || (day.total_base || 0) > (best.total_base || 0) ? day : best),
    null,
  )
  return {
    busiestDay: busiestDay ? { date: busiestDay.date, total_base: busiestDay.total_base, total_human: busiestDay.total_human } : null,
    topZone: zones[0] ? { zone_name: zones[0].zone_name, total_base: zones[0].total_base, share_pct: zones[0].share_pct } : null,
  }
}

// Excel: 3 sayfa — Özet (yer bazlı), Gün Detay (gün → yer satırları), Matris (gün × yer).
export function buildProductSheets(report) {
  const product = report?.product || {}
  const title = [product.brand_name, product.name].filter(Boolean).join(' · ')
  const zones = Array.isArray(report?.zones) ? report.zones : []
  const days = Array.isArray(report?.days) ? report.days : []
  const matrix = buildProductMatrix(report, { maxZones: 30 })

  const summary = {
    header: ['DAĞITIM YERİ', 'TOPLAM', 'PAY %', 'GÜN SAYISI', 'SON DAĞITIM'],
    rows: zones.map(zone => [
      zone.zone_name, zone.total_base || 0, zone.share_pct || 0, zone.day_count || 0, zone.last_date || '',
    ]),
  }
  if (zones.length) {
    summary.rows.push(['GENEL TOPLAM', report?.totals?.total_base || 0, 100, report?.totals?.day_count || 0, report?.totals?.last_date || ''])
  }

  const daily = {
    header: ['TARİH', 'DAĞITIM YERİ', 'MİKTAR', 'KAYIT', 'GÜN TOPLAMI'],
    rows: days.flatMap(day => (day.zones || []).map((zone, index) => [
      day.date, zone.zone_name, zone.qty_base || 0, zone.record_count || 0,
      index === 0 ? (day.total_base || 0) : '',
    ])),
  }

  const grid = {
    header: ['TARİH', ...matrix.columns.map(column => column.zone_name), 'GÜN TOPLAMI'],
    rows: matrix.rows.map(row => [row.date, ...row.cells, row.total_base]),
  }

  return { title, summary, daily, grid }
}

export async function exportProductDistributionExcel(report) {
  const ExcelJS = (await import('exceljs')).default
  const { setupSheet, styleHeaderRow, styleAllUsedCells, COLORS } =
    await import('../../../shared/logic/excelKit.js')
  const sheets = buildProductSheets(report)
  const workbook = new ExcelJS.Workbook()

  const add = (name, sheet, tabHex) => {
    const worksheet = workbook.addWorksheet(name)
    setupSheet(worksheet, tabHex)
    styleHeaderRow(worksheet.addRow(sheet.header))
    sheet.rows.forEach(row => worksheet.addRow(row))
    worksheet.columns.forEach(column => { column.width = 18 })
    styleAllUsedCells(worksheet)
    return worksheet
  }

  add('Yer Özeti', sheets.summary, COLORS.blue)
  add('Gün Detay', sheets.daily, COLORS.gray)
  add('Gün × Yer', sheets.grid, COLORS.green)

  const buffer = await workbook.xlsx.writeBuffer()
  const { saveWorkbook } = await import('../../../shared/logic/excelKit.js')
  const slug = String(sheets.title || 'urun').toLocaleLowerCase('tr').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  saveWorkbook(buffer, `su-urun-dagitim-${slug}-${report?.from || ''}_${report?.to || ''}.xlsx`)
}
