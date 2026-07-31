import * as q from './queries.js'
import { humanize } from './units.js'
import { isIsoDate } from '../../shared/validation/date.js'

const DEFAULT_FORECAST_LEAD_DAYS = 7
const DEFAULT_FORECAST_SAFETY_DAYS = 3

function localIsoDate() {
  return new Date().toLocaleDateString('sv-SE')
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function depositService({ from, to } = {}) {
  return q.depositBalances({ from, to }).map(row => {
    const outstanding = row.total_in - row.total_return
    return {
      product_id: row.id,
      name: row.name,
      brand_id: row.brand_id,
      brand_name: row.brand_name || null,
      unit_label: row.unit_label,
      total_in: row.total_in,
      total_return: row.total_return,
      period_return: row.period_return,
      outstanding,
      total_in_human: humanize(row, row.total_in),
      total_return_human: humanize(row, row.total_return),
      period_return_human: humanize(row, row.period_return),
      outstanding_human: humanize(row, outstanding),
    }
  })
}

export function forecastService({ today, window = 30, targetDays = 30 } = {}) {
  const day = isIsoDate(today) ? today : localIsoDate()
  const normalizedWindow = Math.max(1, parseInt(window, 10) || 30)
  const normalizedTarget = Math.max(1, parseInt(targetDays, 10) || 30)
  const rates = new Map(q.consumptionRates({ window: normalizedWindow, asOf: day })
    .map(rate => [rate.product_id, rate]))
  const rows = q.stockByProduct().map(product => {
    const balance = product.total_in - product.total_out + (product.adjust_net || 0)
    const rate = rates.get(product.id) || {}
    const outSum = rate.out_sum || 0
    const averageDaily = outSum / normalizedWindow
    const hasData = outSum > 0 && (rate.active_days || 0) >= 2
    const daysOfCover = averageDaily > 0
      ? Math.floor(Math.max(0, balance) / averageDaily)
      : null
    const leadTimeDays = Number.isInteger(product.lead_time_days) ? product.lead_time_days : DEFAULT_FORECAST_LEAD_DAYS
    const safetyStockDays = Number.isInteger(product.safety_stock_days) ? product.safety_stock_days : DEFAULT_FORECAST_SAFETY_DAYS
    const reorderPointDays = leadTimeDays + safetyStockDays
    const orderDueInDays = daysOfCover == null ? null : daysOfCover - reorderPointDays
    const stockoutDate = daysOfCover != null ? addDays(day, daysOfCover) : null
    const orderByDate = orderDueInDays != null ? addDays(day, orderDueInDays) : null
    const targetStockDays = Math.max(normalizedTarget, reorderPointDays)
    const targetStock = Math.ceil(averageDaily * targetStockDays)
    const belowReorder = daysOfCover != null && daysOfCover <= reorderPointDays
    const suggestedBase = hasData && belowReorder ? Math.max(0, targetStock - balance) : 0
    const orderUrgency = !hasData || orderDueInDays == null
      ? 'insufficient_data'
      : orderDueInDays <= 0
        ? 'overdue'
        : orderDueInDays <= 3
          ? 'due_soon'
          : 'planned'

    return {
      product_id: product.id,
      product_name: product.name,
      unit_label: product.unit_label,
      brand_id: product.brand_id || null,
      brand_name: product.brand_name || null,
      balance,
      balance_human: humanize(product, balance),
      avg_daily: Math.round(averageDaily * 100) / 100,
      avg_daily_human: humanize(product, Math.round(averageDaily)),
      days_of_cover: daysOfCover,
      stockout_date: stockoutDate,
      lead_time_days: leadTimeDays,
      safety_stock_days: safetyStockDays,
      reorder_point_days: reorderPointDays,
      target_stock_days: targetStockDays,
      order_due_in_days: orderDueInDays,
      order_by_date: orderByDate,
      order_urgency: orderUrgency,
      needs_order: suggestedBase > 0,
      suggested_base: suggestedBase,
      suggested_human: suggestedBase ? humanize(product, suggestedBase) : null,
      confidence: hasData ? 'ok' : 'low',
    }
  })
  const orderSuggestions = rows
    .filter(row => row.needs_order)
    .sort((left, right) => (left.order_due_in_days ?? 1e9) - (right.order_due_in_days ?? 1e9))
  const totals = {
    products: rows.length,
    order_count: orderSuggestions.length,
    overdue_order_count: orderSuggestions.filter(row => row.order_urgency === 'overdue').length,
    due_soon_order_count: orderSuggestions.filter(row => row.order_urgency === 'due_soon').length,
    soon_count: rows.filter(row => row.days_of_cover != null && row.days_of_cover <= 7).length,
  }

  return {
    date: day,
    window: normalizedWindow,
    target_days: normalizedTarget,
    rows,
    order_suggestions: orderSuggestions,
    totals,
  }
}

export function trendsService({ months = 6, today } = {}) {
  const day = isIsoDate(today) ? today : localIsoDate()
  const monthCount = Math.max(1, Math.min(24, parseInt(months, 10) || 6))
  const [year, month] = day.slice(0, 7).split('-').map(Number)
  const startIndex = year * 12 + (month - 1) - (monthCount - 1)
  const from = `${Math.floor(startIndex / 12)}-${String((startIndex % 12) + 1).padStart(2, '0')}-01`
  const to = day
  const monthly = q.monthlySeries({ from, to }).map(row => ({
    month: row.move_date,
    in_base: row.in_base,
    out_base: row.out_base,
  }))
  const zoneTotals = new Map()
  for (const row of q.zoneTotals({ from, to })) {
    const current = zoneTotals.get(row.id) || { zone_id: row.id, zone_name: row.name, total: 0 }
    current.total += row.total_out || 0
    zoneTotals.set(row.id, current)
  }
  const zones = [...zoneTotals.values()]
    .sort((left, right) => right.total - left.total)
    .slice(0, 10)
  const products = q.productFlow({ from, to })
    .map(product => ({
      product_id: product.id,
      name: product.name,
      brand_name: product.brand_name || null,
      out: product.period_out,
      out_human: humanize(product, product.period_out),
    }))
    .filter(product => product.out > 0)
    .sort((left, right) => right.out - left.out)
    .slice(0, 10)

  return { from, to, months: monthCount, monthly, zones, products }
}

export function summaryService({ from, to, product_id, group = 'day' } = {}) {
  const periodByProduct = new Map(q.productFlow({ from, to }).map(product => [product.id, product]))
  const stock = q.stockByProduct().map(product => {
    const period = periodByProduct.get(product.id) || {}
    const adjustNet = product.adjust_net || 0
    const balance = product.total_in - product.total_out + adjustNet
    const periodIn = period.period_in || 0
    const periodOut = period.period_out || 0
    const periodNet = periodIn - periodOut
    const deficit = Math.max(0, -balance)
    const low = balance < 0 || (product.min_level > 0 && balance < product.min_level)
    const critical = balance < 0 || (product.critical_level > 0 && balance < product.critical_level)
    const periodStatus = periodNet < 0
      ? 'period_deficit'
      : periodNet > 0
        ? 'period_surplus'
        : 'period_even'

    return {
      product_id: product.id,
      name: product.name,
      unit_label: product.unit_label,
      brand_id: product.brand_id || null,
      brand_name: product.brand_name || null,
      units_per_case: product.units_per_case,
      cases_per_pallet: product.cases_per_pallet,
      total_in: product.total_in,
      total_out: product.total_out,
      adjust_net: adjustNet,
      balance,
      deficit,
      adjust_human: adjustNet ? humanize(product, adjustNet) : null,
      period_in: periodIn,
      period_out: periodOut,
      period_net: periodNet,
      period_status: periodStatus,
      min_level: product.min_level,
      critical_level: product.critical_level || 0,
      low,
      critical,
      negative: balance < 0,
      in_human: humanize(product, product.total_in),
      out_human: humanize(product, product.total_out),
      balance_human: humanize(product, balance),
      deficit_human: deficit ? humanize(product, deficit) : null,
      period_in_human: humanize(product, periodIn),
      period_out_human: humanize(product, periodOut),
      period_net_human: humanize(product, periodNet),
      min_human: product.min_level > 0 ? humanize(product, product.min_level) : null,
    }
  })
  const zones = q.zoneTotals({ from, to, product_id }).map(zone => ({
    zone_id: zone.id,
    zone_name: zone.name,
    product_id: zone.product_id,
    product_name: zone.product_name,
    total_out: zone.total_out,
    out_human: humanize(zone, zone.total_out),
  }))
  const daily = group === 'month'
    ? q.monthlySeries({ from, to, product_id })
    : q.dailySeries({ from, to, product_id })
  const flow = q.periodFlow({ from, to })
  const deposit = depositService({ from, to })
  const totals = {
    period_in: flow.period_in,
    period_out: flow.period_out,
    period_net: flow.period_in - flow.period_out,
    balance: stock.reduce((sum, product) => sum + product.balance, 0),
    deficit_total: stock.reduce((sum, product) => sum + product.deficit, 0),
    deficit_count: stock.filter(product => product.negative).length,
    period_deficit_count: stock.filter(product => product.period_net < 0).length,
    low_count: stock.filter(product => product.low).length,
    critical_count: stock.filter(product => product.critical).length,
    period_return: deposit.reduce((sum, product) => sum + product.period_return, 0),
    outstanding: deposit.reduce((sum, product) => sum + product.outstanding, 0),
  }

  return { stock, zones, daily, totals, deposit, group }
}

// Tek ürünün "nereye, ne zaman, kaç adet" dökümü. Aynı veriden iki yön üretir:
// gün → yerler (o gün nereye ne kadar) ve yer → günler (o yere hangi gün ne kadar).
// Toplamlar SQL'de hesaplandığı için satır sınırı yoktur; dönem verilmezse
// ürünün tüm geçmişi döner.
export function productDistributionService({ product_id, from, to } = {}) {
  const productId = Number(product_id)
  if (!Number.isInteger(productId) || productId <= 0) {
    throw Object.assign(new Error('Geçersiz ürün'), { status: 400 })
  }
  if (from && !isIsoDate(from)) throw Object.assign(new Error('Geçersiz başlangıç tarihi'), { status: 400 })
  if (to && !isIsoDate(to)) throw Object.assign(new Error('Geçersiz bitiş tarihi'), { status: 400 })
  if (from && to && from > to) throw Object.assign(new Error('Başlangıç bitişten sonra olamaz'), { status: 400 })

  const product = q.getProduct(productId)
  if (!product) throw Object.assign(new Error('Ürün bulunamadı'), { status: 404 })

  const cells = q.productDistributionCells({ product_id: productId, from, to })
  const human = base => humanize(product, base)

  const dayMap = new Map()
  const zoneMap = new Map()
  let total = 0
  let recordCount = 0

  for (const cell of cells) {
    const qty = cell.qty_base || 0
    total += qty
    recordCount += cell.record_count || 0

    const day = dayMap.get(cell.date) || { date: cell.date, total_base: 0, zones: [] }
    day.total_base += qty
    day.zones.push({
      zone_id: cell.zone_id,
      zone_name: cell.zone_name,
      qty_base: qty,
      qty_human: human(qty),
      record_count: cell.record_count,
    })
    dayMap.set(cell.date, day)

    const zoneKey = cell.zone_id ?? 0
    const zone = zoneMap.get(zoneKey) || {
      zone_id: cell.zone_id, zone_name: cell.zone_name, total_base: 0, days: [],
    }
    zone.total_base += qty
    zone.days.push({ date: cell.date, qty_base: qty, qty_human: human(qty), record_count: cell.record_count })
    zoneMap.set(zoneKey, zone)
  }

  const days = [...dayMap.values()]
    .sort((left, right) => right.date.localeCompare(left.date))
    .map(day => ({
      ...day,
      total_human: human(day.total_base),
      zones: day.zones.sort((left, right) => right.qty_base - left.qty_base),
    }))

  const zones = [...zoneMap.values()]
    .sort((left, right) => right.total_base - left.total_base)
    .map(zone => ({
      ...zone,
      total_human: human(zone.total_base),
      // Pay yalnızca toplam varken anlamlı; 0'a bölme yok.
      share_pct: total > 0 ? Math.round((zone.total_base / total) * 1000) / 10 : 0,
      day_count: zone.days.length,
      last_date: zone.days.reduce((latest, row) => (latest && latest > row.date ? latest : row.date), null),
      days: zone.days.sort((left, right) => right.date.localeCompare(left.date)),
    }))

  const dayCount = days.length
  return {
    product: {
      id: product.id,
      name: product.name,
      brand_name: product.brand_name || null,
      unit_label: product.unit_label,
      units_per_case: product.units_per_case,
      cases_per_pallet: product.cases_per_pallet,
    },
    from: from || (days.length ? days[days.length - 1].date : null),
    to: to || (days.length ? days[0].date : null),
    totals: {
      total_base: total,
      total_human: human(total),
      day_count: dayCount,
      zone_count: zones.length,
      record_count: recordCount,
      daily_avg_base: dayCount ? Math.round(total / dayCount) : 0,
      daily_avg_human: human(dayCount ? Math.round(total / dayCount) : 0),
      first_date: dayCount ? days[dayCount - 1].date : null,
      last_date: dayCount ? days[0].date : null,
    },
    days,
    zones,
  }
}
