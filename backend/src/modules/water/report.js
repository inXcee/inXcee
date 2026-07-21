// Muhasebe raporu verisi: özet sayfası (tek A4) + istendiğinde gün gün nereye ne
// kadar dağıtıldığının tam dökümü. PDF çizimi report-pdf.js içinde.
import * as q from './queries.js'
import { humanize } from './units.js'
import { COUNT_REASONS, reconciliationService } from './reconciliation.js'
import { isIsoDate } from '../../shared/validation/date.js'

const REASON_LABELS = new Map(COUNT_REASONS.map(reason => [reason.key, reason.label]))
const TRUCK_STATUS_LABELS = {
  planned: 'Planlandı',
  mail_sent: 'Mail gitti',
  confirmed: 'Onaylandı',
  arrived: 'Geldi',
  cancelled: 'İptal',
}

const badRequest = message => Object.assign(new Error(message), { statusCode: 400 })

const MAX_RANGE_DAYS = 400
// Tek sayfada okunur kalan gün satırı sayısı — üstüne çıkınca aylık gruplanır.
const DAILY_ROW_LIMIT = 34
// Gün gün detay bölümünün makul kaldığı üst sınır; üstünde detay üretilmez.
const MAX_DETAIL_DAYS = 62
const DETAIL_MOVEMENT_LIMIT = 20000

// Dağıtım detayı (büyük, kendi sayfalarına) + muhasebe ekleri (küçük, tek akışta)
export const REPORT_SECTIONS = Object.freeze([
  'matrix', 'days', 'zones', 'intakes',
  'deposit', 'adjustments', 'trucks', 'counts', 'checks',
])
const DETAIL_SECTIONS = Object.freeze(['matrix', 'days', 'zones'])
export const EXTRA_SECTIONS = Object.freeze(['deposit', 'adjustments', 'trucks', 'counts', 'checks'])

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
  const activeRows = daily.filter(row => !row.empty)
  totals.avg_out_active = activeRows.length ? Math.round(totals.period_out / activeRows.length) : 0
  const busiest = activeRows.reduce((best, row) => (!best || row.out_base > best.out_base ? row : best), null)
  totals.busiest = busiest ? { key: busiest.key, label: busiest.label, out_base: busiest.out_base } : null

  const report = {
    from, to, day_count: dayCount, grouped, daily, products, zones, intakes, totals,
    locked_months: lockedMonths, sections: wantedSections,
  }
  if (wantedSections.some(section => DETAIL_SECTIONS.includes(section))) {
    report.detail = buildDetail(report, { from, to, grouped })
  }
  if (wantedSections.some(section => EXTRA_SECTIONS.includes(section))) {
    report.extras = buildExtras(report, { from, to, sections: wantedSections })
  }
  return report
}

// Muhasebe ekleri — her biri yalnız istendiğinde hesaplanır.
function buildExtras(report, { from, to, sections }) {
  const extras = {}
  const months = monthKeys(from, to)

  if (sections.includes('deposit')) {
    extras.deposit = q.depositBalances({ from, to }).map(row => {
      const outstanding = (row.total_in || 0) - (row.total_return || 0)
      return {
        product_id: row.id,
        name: row.name,
        brand_name: row.brand_name || null,
        total_in: row.total_in || 0,
        total_return: row.total_return || 0,
        period_return: row.period_return || 0,
        outstanding,
        outstanding_human: humanize(row, outstanding),
        period_return_human: humanize(row, row.period_return || 0),
      }
    })
  }

  if (sections.includes('adjustments')) {
    extras.adjustments = q.listAdjustments({ from, to, limit: 1000 })
      .map(row => ({
        id: row.id,
        move_date: row.move_date,
        product_name: row.product_name,
        direction: row.direction,
        qty_base: row.qty_base,
        signed_base: row.direction === 'in' ? row.qty_base : -row.qty_base,
        qty_human: humanize(row, row.qty_base),
        reason: row.reason || null,
        reason_label: REASON_LABELS.get(row.reason) || row.reason || '—',
        note: row.note || null,
        created_by_name: row.created_by_name || null,
      }))
      .sort((left, right) => (left.move_date === right.move_date ? left.id - right.id : left.move_date < right.move_date ? -1 : 1))
  }

  if (sections.includes('trucks')) {
    extras.trucks = q.listTruckArrivals({ from, to, limit: 500 })
      .map(row => ({
        id: row.id,
        arrival_date: row.arrival_date,
        window: `${(row.arrival_start_time || '').slice(0, 5)}-${(row.arrival_end_time || '').slice(0, 5)}`,
        plate: row.plate,
        trailer_plate: row.trailer_plate || null,
        supplier_name: row.supplier_name || null,
        brand_name: row.brand_name || null,
        driver_name: row.driver_name || null,
        status: row.status,
        status_label: TRUCK_STATUS_LABELS[row.status] || row.status,
        mail_sent: Boolean(row.mail_sent_at),
        photo_count: row.photo_count || 0,
      }))
      .sort((left, right) => (left.arrival_date === right.arrival_date ? left.id - right.id : left.arrival_date < right.arrival_date ? -1 : 1))
  }

  if (sections.includes('counts')) {
    extras.counts = months
      .map(month => {
        const reconciliation = reconciliationService({ month })
        const counted = reconciliation.rows.filter(row => row.counted_base != null)
        return {
          month,
          locked: reconciliation.locked,
          closed_at: reconciliation.closure?.closed_at || null,
          closed_by: reconciliation.closure?.closed_by_name || null,
          note: reconciliation.closure?.note || null,
          pending: reconciliation.totals.pending,
          mismatch: reconciliation.totals.mismatch,
          rows: counted.map(row => ({
            product_name: row.product_name,
            system_base: row.system_base,
            counted_base: row.counted_base,
            diff_base: row.diff_base,
            status: row.status,
            reason: row.reason,
            reason_label: REASON_LABELS.get(row.reason) || row.reason || '—',
            note: row.count_note || null,
          })),
        }
      })
      .filter(month => month.rows.length || month.locked || month.closed_at)
  }

  if (sections.includes('checks')) extras.checks = buildChecks(report, { months })
  return extras
}

// Muhasebenin "bu rapora güvenebilir miyim" sorusuna cevap veren kontrol listesi.
function buildChecks(report, { months }) {
  const checks = []
  const add = (level, label, detail) => checks.push({ level, label, detail })

  const negatives = report.products.filter(row => row.closing_base < 0)
  add(negatives.length ? 'error' : 'ok', 'Eksi stoklu ürün',
    negatives.length ? negatives.map(row => `${row.name} (${row.closing_base})`).join(', ') : 'Yok')

  const review = q.reviewQueue()
  const reviewInRange = review.filter(row => row.move_date >= report.from && row.move_date <= report.to)
  add(reviewInRange.length ? 'warn' : 'ok', 'Karşılıksız dağıtım (inceleme kuyruğu)',
    reviewInRange.length
      ? `${reviewInRange.length} kayıt · ${reviewInRange.reduce((sum, row) => sum + row.unallocated_base, 0)} birim girişle eşleşmedi`
      : 'Tüm dağıtımlar bir girişe bağlandı')

  const withoutWaybill = report.intakes.filter(row => !row.waybill_no)
  add(withoutWaybill.length ? 'warn' : 'ok', 'İrsaliyesiz giriş',
    withoutWaybill.length ? `${withoutWaybill.length} giriş irsaliye numarasız` : 'Tüm girişlerde irsaliye no var')

  const unlocked = months.filter(month => !report.locked_months.includes(month))
  add(unlocked.length ? 'warn' : 'ok', 'Ay kilidi',
    unlocked.length
      ? `${unlocked.join(', ')} açık — rapor sonrası kayıt değişebilir`
      : `${report.locked_months.join(', ')} kilitli`)

  const pendingCounts = months.reduce((sum, month) => sum + reconciliationService({ month }).totals.pending, 0)
  add(pendingCounts ? 'warn' : 'ok', 'Fiziksel sayım',
    pendingCounts ? `${pendingCounts} ürün×ay sayılmadı` : 'Aralıktaki tüm ürünler sayıldı')

  const unnamedZone = (report.detail?.rows || []).find(row => row.zone_id === 0)
  if (unnamedZone) add('warn', 'Yer belirtilmemiş dağıtım', `${unnamedZone.total} birim bir dağıtım yerine bağlı değil`)

  if (report.detail?.truncated) add('error', 'Kayıt sınırı', 'Hareket sayısı sınırı aşıldı, detay eksik olabilir')
  return checks
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
  const productRows = new Map()
  const emptyCells = () => new Array(columns.length).fill(0)

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

      const index = columnIndex.get(key)
      const row = zoneRows.get(zoneId)
        || { zone_id: zoneId, zone_name: zoneName, total: 0, cells: emptyCells() }
      row.total += movement.qty_base
      if (index != null) row.cells[index] += movement.qty_base
      zoneRows.set(zoneId, row)

      // Yerin içinde ürün ürün kırılım — matriste alt satır olarak çizilir.
      const products = zoneProducts.get(zoneId) || new Map()
      const product = products.get(movement.product_id)
        || { product_id: movement.product_id, name: movement.product_name, total: 0, days: new Set(), cells: emptyCells(), sample: movement }
      product.total += movement.qty_base
      product.days.add(movement.move_date)
      if (index != null) product.cells[index] += movement.qty_base
      products.set(movement.product_id, product)
      zoneProducts.set(zoneId, products)

      // Dönem geneli: hangi ürün hangi gün ne kadar çıktı
      const productRow = productRows.get(movement.product_id)
        || { product_id: movement.product_id, name: movement.product_name, total: 0, cells: emptyCells(), sample: movement }
      productRow.total += movement.qty_base
      if (index != null) productRow.cells[index] += movement.qty_base
      productRows.set(movement.product_id, productRow)
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

  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0)
  const share = value => (grandTotal ? Math.round((value / grandTotal) * 1000) / 10 : 0)
  const productsOfZone = zoneId => [...(zoneProducts.get(zoneId) || new Map()).values()]
    .sort((left, right) => right.total - left.total)

  return {
    columns,
    grouped,
    // Her yer satırı, o yere hangi ürünün hangi gün gittiğini alt satır olarak taşır.
    rows: rows.map(row => ({
      ...row,
      share: share(row.total),
      products: productsOfZone(row.zone_id).map(product => ({
        product_id: product.product_id,
        name: product.name,
        total: product.total,
        cells: product.cells,
        human: humanize(product.sample, product.total),
        days_active: product.days.size,
      })),
    })),
    column_totals: columnTotals,
    grand_total: grandTotal,
    product_rows: [...productRows.values()]
      .sort((left, right) => right.total - left.total)
      .map(product => ({
        product_id: product.product_id,
        name: product.name,
        total: product.total,
        cells: product.cells,
        human: humanize(product.sample, product.total),
        share: share(product.total),
      })),
    days: detailDays,
    days_skipped: activeDates.length > MAX_DETAIL_DAYS ? activeDates.length : 0,
    zone_products: rows.map(row => ({
      zone_id: row.zone_id,
      zone_name: row.zone_name,
      total: row.total,
      share: share(row.total),
      products: productsOfZone(row.zone_id).map(product => ({
        product_id: product.product_id,
        name: product.name,
        total: product.total,
        human: humanize(product.sample, product.total),
        days_active: product.days.size,
      })),
    })),
    truncated,
  }
}

