import * as q from './queries.js'
import { INPUT_UNITS, assertAvailableUnit, humanize, toBase } from './units.js'
import { isIsoDate, isIsoMonth } from '../../shared/validation/date.js'

export const COUNT_REASONS = Object.freeze([
  Object.freeze({ key: 'eksik_irsaliye', label: 'Eksik irsaliye' }),
  Object.freeze({ key: 'fazla_dagitim', label: 'Fazla dağıtım' }),
  Object.freeze({ key: 'sayim_farki', label: 'Sayım farkı' }),
  Object.freeze({ key: 'fire_kirik', label: 'Fire / kırık' }),
  Object.freeze({ key: 'yanlis_urun', label: 'Yanlış ürün' }),
  Object.freeze({ key: 'devir_duzeltme', label: 'Devir düzeltme' }),
])

const REASON_KEYS = new Set(COUNT_REASONS.map(reason => reason.key))
const badRequest = message => Object.assign(new Error(message), { statusCode: 400 })

function isMonth(value) {
  return isIsoMonth(value)
}

function systemBaseFor(month, productId) {
  const row = q.reconciliationRow(month, productId)
  return row ? row.opening_base + row.month_in - row.month_out + (row.month_adjust || 0) : 0
}

export function isCountReason(value) {
  return REASON_KEYS.has(value)
}

export function assertMonthUnlocked(dateOrMonth) {
  const value = String(dateOrMonth || '')
  const month = isMonth(value) ? value : isIsoDate(value) ? value.slice(0, 7) : null
  if (!month) return
  if (q.getClosure(month)?.is_locked) {
    throw Object.assign(new Error(
      `${month} ayı kilitli. Bu aya ait kayıt eklenemez, değiştirilemez veya silinemez. Önce Ay Kapanışı bölümünden kilidi açın.`,
    ), { statusCode: 423 })
  }
}

export function reconciliationService({ month } = {}) {
  if (!isMonth(month)) throw badRequest('Ay YYYY-MM formatında olmalı')
  const closure = q.getClosure(month)
  const rows = q.reconciliationRows(month).map(row => {
    const monthAdjust = row.month_adjust || 0
    const systemBase = row.opening_base + row.month_in - row.month_out + monthAdjust
    const countedBase = row.counted_base
    const diffBase = countedBase == null ? null : countedBase - systemBase
    const status = countedBase == null ? 'pending' : diffBase === 0 ? 'even' : diffBase > 0 ? 'over' : 'short'

    return {
      product_id: row.product_id,
      product_name: row.product_name,
      unit_label: row.unit_label,
      brand_id: row.brand_id || null,
      brand_name: row.brand_name || null,
      opening_base: row.opening_base,
      month_in: row.month_in,
      month_out: row.month_out,
      month_adjust: monthAdjust,
      month_return: row.month_return,
      system_base: systemBase,
      counted_base: countedBase,
      diff_base: diffBase,
      reason: row.count_reason || null,
      count_note: row.count_note || null,
      status,
      opening_human: humanize(row, row.opening_base),
      month_in_human: humanize(row, row.month_in),
      month_out_human: humanize(row, row.month_out),
      month_adjust_human: monthAdjust ? humanize(row, monthAdjust) : null,
      month_return_human: humanize(row, row.month_return),
      system_human: humanize(row, systemBase),
      counted_human: countedBase == null ? null : humanize(row, countedBase),
      diff_human: diffBase == null ? null : humanize(row, diffBase),
    }
  })
  const totals = {
    products: rows.length,
    counted: rows.filter(row => row.counted_base != null).length,
    pending: rows.filter(row => row.status === 'pending').length,
    mismatch: rows.filter(row => row.status === 'over' || row.status === 'short').length,
    system_base: rows.reduce((sum, row) => sum + row.system_base, 0),
  }

  return {
    month,
    locked: Boolean(closure?.is_locked),
    closure: closure || null,
    reasons: COUNT_REASONS,
    rows,
    totals,
  }
}

export function saveStockCountService(data, userId) {
  if (!isMonth(data?.month)) throw badRequest('Ay YYYY-MM formatında olmalı')
  assertMonthUnlocked(data.month)
  const product = q.getProduct(data.product_id)
  if (!product) throw badRequest('Ürün bulunamadı')

  const counted = Number(data.counted_qty)
  if (!Number.isFinite(counted) || counted < 0) throw badRequest('Sayım miktarı 0 veya daha büyük olmalı')
  const unit = data.counted_unit || 'adet'
  if (!INPUT_UNITS.includes(unit)) throw badRequest('Geçersiz birim')
  assertAvailableUnit(product, unit)

  const systemBase = systemBaseFor(data.month, product.id)
  const countedBase = toBase(product, counted, unit)
  const diffBase = countedBase - systemBase
  if (diffBase !== 0 && !isCountReason(data.reason)) {
    throw badRequest('Fark var — açıklama (sebep) zorunlu')
  }

  q.upsertStockCount({
    month: data.month,
    product_id: product.id,
    system_base: systemBase,
    counted_base: countedBase,
    diff_base: diffBase,
    reason: diffBase !== 0 ? data.reason : null,
    note: data.note?.trim() || null,
    created_by: userId || null,
  })
  return {
    system_base: systemBase,
    counted_base: countedBase,
    diff_base: diffBase,
    status: diffBase === 0 ? 'even' : diffBase > 0 ? 'over' : 'short',
  }
}

export function monthlyCloseService(data, userId) {
  if (!isMonth(data?.month)) throw badRequest('Ay YYYY-MM formatında olmalı')
  return q.runInTransaction(() => {
    const rows = q.reconciliationRows(data.month).map(row => ({
      product_id: row.product_id,
      system_base: row.opening_base + row.month_in - row.month_out + (row.month_adjust || 0),
    }))
    q.snapshotClosure(data.month, rows)
    q.upsertClosure({
      month: data.month,
      note: data.note?.trim() || null,
      closed_by: userId || null,
      is_locked: 1,
    })
    return q.getClosure(data.month)
  })
}

export function monthlyUnlockService(month) {
  if (!isMonth(month)) throw badRequest('Ay YYYY-MM formatında olmalı')
  if (!q.getClosure(month)) {
    throw Object.assign(new Error('Bu ay için kapanış kaydı yok'), { statusCode: 404 })
  }
  q.setClosureLock(month, 0)
}

// Summary provider is injected to keep this module independent from dashboard services.
export function writeReconciliationPDF(month, doc, summaryProvider) {
  if (!isMonth(month)) throw badRequest('Ay YYYY-MM formatında olmalı')
  if (typeof summaryProvider !== 'function') throw new TypeError('summaryProvider fonksiyon olmalı')

  const [year, monthNumber] = month.split('-').map(Number)
  const from = `${month}-01`
  const to = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`
  const summary = summaryProvider({ from, to })
  const reconciliation = reconciliationService({ month })
  const totals = summary.totals || {}
  const zoneTotals = new Map()
  for (const zone of summary.zones || []) {
    zoneTotals.set(zone.zone_id, {
      name: zone.zone_name,
      total: (zoneTotals.get(zone.zone_id)?.total || 0) + (zone.total_out || 0),
    })
  }
  const topZones = [...zoneTotals.values()].sort((left, right) => right.total - left.total).slice(0, 8)
  const negatives = (summary.stock || []).filter(stock => stock.negative)

  doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f172a')
    .text(`SU TAKIP AY KAPANISI - ${month}`, { align: 'center' })
  doc.moveDown(0.3)
  doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
    .text(`Olusturma: ${new Date().toLocaleString('tr-TR')}${reconciliation.locked ? '  -  AY KILITLI' : ''}`, { align: 'center' })
  doc.moveDown(1)
  const line = (label, value) => {
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#374151')
      .text(label, { continued: true })
      .font('Helvetica').fillColor('#0f172a').text(`  ${value}`)
  }
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f172a').text('OZET')
  doc.moveDown(0.3)
  line('Ay gelen (tir):', String(totals.period_in || 0))
  line('Ay dagitilan:', String(totals.period_out || 0))
  line('Kalan stok (anlik):', String(totals.balance || 0))
  line('Eksi stoktaki urun sayisi:', String(totals.deficit_count || 0))
  line('Sayim farkli urun sayisi:', String(reconciliation.totals?.mismatch || 0))
  doc.moveDown(0.8)
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f172a').text('EN COK DAGITILAN YERLER')
  doc.moveDown(0.3)
  if (topZones.length === 0) {
    doc.fontSize(10).font('Helvetica').fillColor('#9ca3af').text('Kayit yok.')
  } else {
    topZones.forEach((zone, index) => {
      doc.fontSize(10).font('Helvetica').fillColor('#374151')
        .text(`${index + 1}. ${zone.name}  -  ${zone.total}`)
    })
  }
  if (negatives.length) {
    doc.moveDown(0.8)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#dc2626').text('EKSI STOKLAR')
    doc.moveDown(0.3)
    negatives.forEach(stock => {
      doc.fontSize(10).font('Helvetica').fillColor('#374151').text(`- ${stock.name}: ${stock.balance}`)
    })
  }
  doc.end()
  return { month, from, to }
}
