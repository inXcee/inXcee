// Muhasebe raporu verisi: özet sayfası (tek A4) + istendiğinde gün gün nereye ne
// kadar dağıtıldığının tam dökümü. PDF çizimi report-pdf.js içinde.
import * as q from './queries.js'
import { humanize } from './units.js'
import { isIsoDate } from '../../shared/validation/date.js'

const badRequest = message => Object.assign(new Error(message), { statusCode: 400 })

const MAX_RANGE_DAYS = 400
// Tek sayfada okunur kalan gün satırı sayısı — üstüne çıkınca aylık gruplanır.
const DAILY_ROW_LIMIT = 34
// Gün gün detay bölümünün makul kaldığı üst sınır; üstünde detay üretilmez.
const MAX_DETAIL_DAYS = 62
const DETAIL_MOVEMENT_LIMIT = 20000

export const REPORT_SECTIONS = Object.freeze(['matrix', 'days', 'zones', 'intakes'])

export const WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
export const WEEKDAYS_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

const utc = iso => {
  const [year, month, day] = iso.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}
const dayDiff = (from, to) => Math.round((utc(to) - utc(from)) / 86400000)
const isoAdd = (iso, days) => new Date(utc(iso) + days * 86400000).toISOString().slice(0, 10)

function dayKeys(from, to) {
  const keys = []
  for (let index = 0; index <= dayDiff(from, to); index += 1) keys.push(isoAdd(from, index))
  return keys
}

function monthKeys(from, to) {
  const keys = []
  const end = to.slice(0, 7)
  let [year, month] = from.split('-').map(Number)
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    keys.push(key)
    if (key >= end) break
    month += 1
    if (month > 12) { month = 1; year += 1 }
  }
  return keys
}

const dayLabel = iso => `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${WEEKDAYS[new Date(utc(iso)).getUTCDay()]}`
const monthLabel = key => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
export const weekdayLong = iso => WEEKDAYS_LONG[new Date(utc(iso)).getUTCDay()]
export const trDate = iso => (isIsoDate(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—')

// "matrix,days" gibi bir listeyi (veya diziyi) bilinen bölüm adlarına indirger.
export function parseSections(value) {
  if (value == null || value === '') return []
  const raw = Array.isArray(value) ? value : String(value).split(',')
  const wanted = new Set(raw.map(item => String(item).trim().toLowerCase()))
  if (wanted.has('all') || wanted.has('full')) return [...REPORT_SECTIONS]
  return REPORT_SECTIONS.filter(section => wanted.has(section))
}

export function accountingReportService({ from, to, sections } = {}) {
  if (!isIsoDate(from) || !isIsoDate(to)) throw badRequest('Tarih aralığı YYYY-AA-GG formatında olmalı')
  if (from > to) throw badRequest('Başlangıç tarihi bitiş tarihinden sonra olamaz')
  const dayCount = dayDiff(from, to) + 1
  if (dayCount > MAX_RANGE_DAYS) throw badRequest(`Rapor aralığı en fazla ${MAX_RANGE_DAYS} gün olabilir`)
  const wantedSections = parseSections(sections)

  const openingByProduct = new Map(q.openingBalances(from).map(row => [row.id, row.opening_base]))
  const adjustByProduct = new Map(q.adjustmentFlow({ from, to }).map(row => [row.product_id, row.adjust_base]))

  const allProducts = q.productFlow({ from, to }).map(product => {
    const openingBase = openingByProduct.get(product.id) || 0
    const periodIn = product.period_in || 0
    const periodOut = product.period_out || 0
    const adjustBase = adjustByProduct.get(product.id) || 0
    const closingBase = openingBase + periodIn - periodOut + adjustBase
    return {
      product_id: product.id,
      name: product.name,
      unit_label: product.unit_label,
      brand_name: product.brand_name || null,
      opening_base: openingBase,
      period_in: periodIn,
      period_out: periodOut,
      adjust_base: adjustBase,
      closing_base: closingBase,
      opening_human: humanize(product, openingBase),
      in_human: humanize(product, periodIn),
      out_human: humanize(product, periodOut),
      adjust_human: adjustBase ? humanize(product, adjustBase) : null,
      closing_human: humanize(product, closingBase),
    }
  })
  // Hiç hareketi ve devri olmayan ürünler muhasebe çıktısını şişirmesin.
  const moved = allProducts.filter(row =>
    row.opening_base || row.period_in || row.period_out || row.adjust_base || row.closing_base)
  const products = moved.length ? moved : allProducts

  const grouped = dayCount > DAILY_ROW_LIMIT
  const series = new Map((grouped ? q.monthlySeries({ from, to }) : q.dailySeries({ from, to }))
    .map(row => [row.move_date, row]))
  const adjustSeries = new Map()
  for (const adjustment of q.listAdjustments({ from, to, limit: 5000 })) {
    const key = grouped ? adjustment.move_date.slice(0, 7) : adjustment.move_date
    const signed = adjustment.direction === 'in' ? adjustment.qty_base : -adjustment.qty_base
    adjustSeries.set(key, (adjustSeries.get(key) || 0) + signed)
  }

  const openingTotal = products.reduce((sum, row) => sum + row.opening_base, 0)
  let running = openingTotal
  const daily = (grouped ? monthKeys(from, to) : dayKeys(from, to)).map(key => {
    const row = series.get(key) || {}
    const inBase = row.in_base || 0
    const outBase = row.out_base || 0
    const adjustBase = adjustSeries.get(key) || 0
    running += inBase - outBase + adjustBase
    return {
      key,
      label: grouped ? monthLabel(key) : dayLabel(key),
      in_base: inBase,
      out_base: outBase,
      adjust_base: adjustBase,
      net_base: inBase - outBase + adjustBase,
      balance_base: running,
      empty: !inBase && !outBase && !adjustBase,
    }
  })

  const zoneMap = new Map()
  for (const row of q.zoneTotals({ from, to })) {
    const current = zoneMap.get(row.id) || { zone_id: row.id, zone_name: row.name, total_out: 0, products: 0 }
    current.total_out += row.total_out || 0
    current.products += 1
    zoneMap.set(row.id, current)
  }
  const zones = [...zoneMap.values()].sort((left, right) => right.total_out - left.total_out)

  const intakes = q.listMovements({ type: 'in', from, to, limit: 2000 })
    .map(row => ({
      id: row.id,
      move_date: row.move_date,
      waybill_no: row.waybill_no || null,
      product_name: row.product_name,
      brand_name: row.brand_name || null,
      note: row.note || null,
      qty_base: row.qty_base,
      qty_human: humanize(row, row.qty_base),
      remaining_base: row.remaining_base ?? null,
    }))
    .sort((left, right) => (left.move_date === right.move_date ? left.id - right.id : left.move_date < right.move_date ? -1 : 1))

  const deposit = q.depositBalances({ from, to })
  const trucks = q.listTruckArrivals({ from, to, limit: 500 })
  const lockedMonths = monthKeys(from, to).filter(month => q.getClosure(month)?.is_locked)

  const totals = {
    opening: openingTotal,
    period_in: products.reduce((sum, row) => sum + row.period_in, 0),
    period_out: products.reduce((sum, row) => sum + row.period_out, 0),
    period_adjust: products.reduce((sum, row) => sum + row.adjust_base, 0),
    closing: products.reduce((sum, row) => sum + row.closing_base, 0),
    period_return: deposit.reduce((sum, row) => sum + (row.period_return || 0), 0),
    outstanding: deposit.reduce((sum, row) => sum + ((row.total_in || 0) - (row.total_return || 0)), 0),
    active_days: daily.filter(row => !row.empty).length,
    zone_count: zones.length,
    intake_count: intakes.length,
    truck_count: trucks.length,
    negative_count: products.filter(row => row.closing_base < 0).length,
    review_count: q.reviewQueue().length,
  }

  const report = {
    from, to, day_count: dayCount, grouped, daily, products, zones, intakes, totals,
    locked_months: lockedMonths, sections: wantedSections,
  }
  if (wantedSections.length) report.detail = buildDetail(report, { from, to, grouped })
  return report
}

// Gün × yer × ürün dökümü — matris, gün detayları ve yer/ürün kırılımı aynı
// hareket listesinden türetilir (tek sorgu).
function buildDetail(report, { from, to, grouped }) {
  const movements = q.listMovements({ from, to, limit: DETAIL_MOVEMENT_LIMIT })
  const truncated = movements.length >= DETAIL_MOVEMENT_LIMIT
  const columns = (grouped ? monthKeys(from, to) : dayKeys(from, to))
    .map(key => ({ key, label: grouped ? monthLabel(key) : key.slice(8, 10), full: grouped ? monthLabel(key) : trDate(key) }))
  const columnIndex = new Map(columns.map((column, index) => [column.key, index]))
  const bucketKey = date => (grouped ? date.slice(0, 7) : date)

  const zoneRows = new Map()
  const zoneProducts = new Map()
  const dayBuckets = new Map()

  for (const movement of movements) {
    const key = bucketKey(movement.move_date)
    const day = dayBuckets.get(movement.move_date) || { intakes: [], distributions: [] }
    const human = humanize(movement, movement.qty_base)
    if (movement.type === 'in') {
      day.intakes.push({
        waybill_no: movement.waybill_no || null,
        product_name: movement.product_name,
        qty_base: movement.qty_base,
        qty_human: human,
      })
    } else {
      const zoneName = movement.zone_name || 'Yer belirtilmemiş'
      const zoneId = movement.zone_id || 0
      day.distributions.push({
        zone_id: zoneId,
        zone_name: zoneName,
        product_name: movement.product_name,
        qty_base: movement.qty_base,
        qty_human: human,
      })

      const row = zoneRows.get(zoneId)
        || { zone_id: zoneId, zone_name: zoneName, total: 0, cells: new Array(columns.length).fill(0) }
      row.total += movement.qty_base
      const index = columnIndex.get(key)
      if (index != null) row.cells[index] += movement.qty_base
      zoneRows.set(zoneId, row)

      const products = zoneProducts.get(zoneId) || new Map()
      const product = products.get(movement.product_id)
        || { product_id: movement.product_id, name: movement.product_name, total: 0, sample: movement }
      product.total += movement.qty_base
      products.set(movement.product_id, product)
      zoneProducts.set(zoneId, products)
    }
    dayBuckets.set(movement.move_date, day)
  }

  const rows = [...zoneRows.values()].sort((left, right) => right.total - left.total)
  const columnTotals = columns.map((_, index) => rows.reduce((sum, row) => sum + row.cells[index], 0))

  const dailyByKey = new Map(report.daily.map(row => [row.key, row]))
  const activeDates = [...dayBuckets.keys()].sort()
  const detailDays = activeDates.length > MAX_DETAIL_DAYS ? [] : activeDates.map(date => {
    const bucket = dayBuckets.get(date)
    const summary = dailyByKey.get(grouped ? date.slice(0, 7) : date) || {}
    const perZone = new Map()
    for (const line of bucket.distributions) {
      const current = perZone.get(line.zone_id) || { zone_id: line.zone_id, zone_name: line.zone_name, total: 0, lines: [] }
      current.total += line.qty_base
      current.lines.push(line)
      perZone.set(line.zone_id, current)
    }
    const zonesOfDay = [...perZone.values()].sort((left, right) => right.total - left.total)
    zonesOfDay.forEach(zone => zone.lines.sort((left, right) => right.qty_base - left.qty_base))
    return {
      key: date,
      label: trDate(date),
      weekday: weekdayLong(date),
      in_base: bucket.intakes.reduce((sum, line) => sum + line.qty_base, 0),
      out_base: bucket.distributions.reduce((sum, line) => sum + line.qty_base, 0),
      balance_base: grouped ? null : (summary.balance_base ?? null),
      intakes: bucket.intakes,
      zones: zonesOfDay,
    }
  })

  return {
    columns,
    grouped,
    rows: rows.map(row => ({ ...row })),
    column_totals: columnTotals,
    grand_total: rows.reduce((sum, row) => sum + row.total, 0),
    days: detailDays,
    days_skipped: activeDates.length > MAX_DETAIL_DAYS ? activeDates.length : 0,
    zone_products: rows.map(row => ({
      zone_id: row.zone_id,
      zone_name: row.zone_name,
      total: row.total,
      products: [...(zoneProducts.get(row.zone_id) || new Map()).values()]
        .sort((left, right) => right.total - left.total)
        .map(product => ({
          product_id: product.product_id,
          name: product.name,
          total: product.total,
          human: humanize(product.sample, product.total),
        })),
    })),
    truncated,
  }
}

