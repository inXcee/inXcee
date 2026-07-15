import * as q from './queries.js'
import { INPUT_UNITS, assertAvailableUnit, availableUnits, humanize, toBase } from './units.js'
import { assertMonthUnlocked, isCountReason, writeReconciliationPDF } from './reconciliation.js'
import { forecastService, summaryService } from './analytics.js'
import { checkLowStock, notifyWaterOperations } from './notifications.js'
import { trClock } from './trucks.js'
import { queueWaterDailyDigestEmail } from './daily-digest.js'
export { availableUnits, humanize, toBase, unitMultiplier } from './units.js'
export { depositService, forecastService, summaryService, trendsService } from './analytics.js'
export { notifyWaterOperations, WATER_OPERATION_ROLES } from './notifications.js'
export { dailyDigestDeliveriesService } from './daily-digest.js'
export {
  batchDistributeService,
  batchIntakeService,
  createDistributionService,
  createIntakeService,
  deleteMovementService,
  movementsService,
  updateDistributionService,
} from './movements.js'
export {
  assertMonthUnlocked,
  COUNT_REASONS,
  monthlyCloseService,
  monthlyUnlockService,
  reconciliationService,
  saveStockCountService,
} from './reconciliation.js'
export {
  buildTruckGateEntryPDF,
  checkTruckArrivalAlerts,
  createTruckArrivalService,
  createWaybillPhotoService,
  deleteTruckArrivalService,
  deleteWaybillPhotoService,
  markTruckCheckedService,
  markTruckMailSentService,
  sendTruckArrivalMailService,
  truckArrivalsService,
  truckGateEntryService,
  updateTruckArrivalService,
  waybillPhotosService,
} from './trucks.js'

// ── Marka servisleri ──
export function brandsService(opts) { return q.listBrands(opts) }
const normColor = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim())) ? c.trim() : null
export function createBrandService(data) {
  if (!data?.name?.trim()) throw Object.assign(new Error('Marka adı gerekli'), { statusCode: 400 })
  if (q.getBrandByName(data.name.trim())) throw Object.assign(new Error('Bu marka zaten var'), { statusCode: 409 })
  return q.createBrand({ name: data.name.trim(), sort_order: parseInt(data.sort_order) || 0, color: normColor(data.color) })
}
export function updateBrandService(id, data) {
  const existing = q.getBrand(id)
  if (!existing) throw Object.assign(new Error('Marka bulunamadı'), { statusCode: 404 })
  if (!data?.name?.trim()) throw Object.assign(new Error('Marka adı gerekli'), { statusCode: 400 })
  const clash = q.getBrandByName(data.name.trim())
  if (clash && clash.id !== id) throw Object.assign(new Error('Bu marka zaten var'), { statusCode: 409 })
  const color = Object.prototype.hasOwnProperty.call(data, 'color') ? normColor(data.color) : existing.color
  if (!q.updateBrand(id, { name: data.name.trim(), sort_order: parseInt(data.sort_order) || 0, is_active: data.is_active !== false, color }))
    throw Object.assign(new Error('Marka güncellenemedi'), { statusCode: 500 })
  return { before: existing, after: q.getBrand(id) }
}
export function deleteBrandService(id) {
  const existing = q.getBrand(id)
  if (!existing) throw Object.assign(new Error('Marka bulunamadı'), { statusCode: 404 })
  if (q.brandProductCount(id) > 0)
    throw Object.assign(new Error('Bu markaya bağlı ürün var — önce ürünlerin markasını değiştirin'), { statusCode: 409 })
  if (!q.deleteBrand(id)) throw Object.assign(new Error('Marka silinemedi'), { statusCode: 500 })
  return existing
}

// ── Ürün servisleri ──
export function productsService(opts) { return q.listProducts(opts) }
// existing verildiğinde (update) gövdeden atlanan alanlar mevcut değerden korunur —
// böylece brand/is_returnable göndermeyen eski istemciler bu alanları silmez.
function productFields(data, existing = null) {
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k)
  const wholeSetting = (value, fallback, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    if (value == null || value === '') return fallback
    const numeric = Number(value)
    if (!Number.isSafeInteger(numeric) || numeric < min || numeric > max) {
      const range = max === Number.MAX_SAFE_INTEGER ? `${min || 0} veya daha büyük` : `${min}-${max} arasında`
      throw Object.assign(new Error(`${label} ${range} tam sayı olmalı`), { statusCode: 400 })
    }
    return numeric
  }
  const upc = wholeSetting(has('units_per_case') ? data.units_per_case : null, existing?.units_per_case || 1, 'Koli içi miktarı', 1)
  const cpp = wholeSetting(has('cases_per_pallet') ? data.cases_per_pallet : null, existing?.cases_per_pallet || 1, 'Palet içi miktarı', 1)
  const minLevel = wholeSetting(has('min_level') ? data.min_level : null, existing?.min_level || 0, 'Minimum stok')
  const criticalLevel = wholeSetting(has('critical_level') ? data.critical_level : null, existing?.critical_level || 0, 'Kritik stok')
  const leadTimeDays = wholeSetting(has('lead_time_days') ? data.lead_time_days : null, existing?.lead_time_days ?? 7, 'Tedarik süresi', 0, 365)
  const safetyStockDays = wholeSetting(has('safety_stock_days') ? data.safety_stock_days : null, existing?.safety_stock_days ?? 3, 'Emniyet stoku günü', 0, 365)
  let brand_id = existing ? existing.brand_id : null
  if (has('brand_id')) {
    if (data.brand_id == null || data.brand_id === '') brand_id = null
    else {
      brand_id = parseInt(data.brand_id)
      if (!q.getBrand(brand_id)) throw Object.assign(new Error('Marka bulunamadı'), { statusCode: 400 })
    }
  }
  const is_returnable = has('is_returnable') ? !!data.is_returnable : (existing ? !!existing.is_returnable : false)
  const sort_order = has('sort_order') ? (parseInt(data.sort_order) || 0) : (existing ? existing.sort_order : 0)
  return {
    name: data.name.trim(), unit_label: data.unit_label || 'adet',
    units_per_case: upc, cases_per_pallet: cpp,
    min_level: minLevel,
    critical_level: criticalLevel,
    lead_time_days: leadTimeDays,
    safety_stock_days: safetyStockDays,
    brand_id, is_returnable, sort_order,
  }
}
export function createProductService(data) {
  if (!data?.name?.trim()) throw Object.assign(new Error('Ürün adı gerekli'), { statusCode: 400 })
  return q.createProduct(productFields(data))
}
export function updateProductService(id, data) {
  const existing = q.getProduct(id)
  if (!existing) throw Object.assign(new Error('Ürün bulunamadı'), { statusCode: 404 })
  if (!data?.name?.trim()) throw Object.assign(new Error('Ürün adı gerekli'), { statusCode: 400 })
  if (!q.updateProduct(id, { ...productFields(data, existing), is_active: data.is_active !== false }))
    throw Object.assign(new Error('Ürün güncellenemedi'), { statusCode: 500 })
  return { before: existing, after: q.getProduct(id) }
}

export function deleteProductService(id) {
  const existing = q.getProduct(id)
  if (!existing) throw Object.assign(new Error('Ürün bulunamadı'), { statusCode: 404 })
  if (q.productMovementCount(id) > 0)
    throw Object.assign(new Error('Bu ürüne ait hareket var — silmek yerine pasife alın'), { statusCode: 409 })
  if (!q.deleteProduct(id)) throw Object.assign(new Error('Ürün silinemedi'), { statusCode: 500 })
  return existing
}

// ── Bölge servisleri ──
export function zonesService(opts) { return q.listZones(opts) }
const expectedMonthly = (data) => Math.max(0, parseInt(data.expected_monthly) || 0)
export function createZoneService(data) {
  if (!data?.name?.trim()) throw Object.assign(new Error('Bölge adı gerekli'), { statusCode: 400 })
  return q.createZone({ name: data.name.trim(), code: data.code?.trim() || null, note: data.note?.trim() || null, expected_monthly: expectedMonthly(data) })
}
export function updateZoneService(id, data) {
  const existing = q.getZone(id)
  if (!existing) throw Object.assign(new Error('Bölge bulunamadı'), { statusCode: 404 })
  if (!data?.name?.trim()) throw Object.assign(new Error('Bölge adı gerekli'), { statusCode: 400 })
  if (!q.updateZone(id, { name: data.name.trim(), code: data.code?.trim() || null, note: data.note?.trim() || null, is_active: data.is_active !== false, expected_monthly: expectedMonthly(data) }))
    throw Object.assign(new Error('Bölge güncellenemedi'), { statusCode: 500 })
  return { before: existing, after: q.getZone(id) }
}
export function deleteZoneService(id) {
  const existing = q.getZone(id)
  if (!existing) throw Object.assign(new Error('Bölge bulunamadı'), { statusCode: 404 })
  if (q.zoneMovementCount(id) > 0)
    throw Object.assign(new Error('Bu bölgeye ait hareket var — silmek yerine pasife alın'), { statusCode: 409 })
  if (!q.deleteZone(id)) throw Object.assign(new Error('Bölge silinemedi'), { statusCode: 500 })
  return existing
}

// ── Serbest metin dağıtım ayrıştırıcı ──
// "A blok yemekhaneye 5 koli 0.5, 10 damacana gönderildi" → yapılandırılmış satırlar
const GENERIC_PRODUCT_WORDS = new Set(['l', 'lt', 'ml', 'su', 'sise', 'şişe', 'water'])
// Miktar birimleri ürün ismine/etiketine ANAHTAR olamaz: metinde "2 palet 0.33"
// yazınca "palet" kelimesi "Tahta Palet" ürününü yanlış eşleştirir. Stop-word olarak dışla.
const UNIT_WORDS = new Set(['palet', 'koli', 'paket', 'adet', 'kutu'])

function normTr(s) { return (s || '').toString().toLocaleLowerCase('tr').replace(/İ/g, 'i').replace(/,/g, '.').trim() }

function productKeywords(p) {
  const kws = new Set()
  normTr(p.name).split(/[\s()]+/).forEach(tok => {
    if (!tok) return
    if (/^\d+(\.\d+)?$/.test(tok)) kws.add(tok)          // 0.5, 0.33, 19, 200
    else if (tok.length > 2 && !GENERIC_PRODUCT_WORDS.has(tok) && !UNIT_WORDS.has(tok)) kws.add(tok)
  })
  const ul = normTr(p.unit_label)
  if (ul && !UNIT_WORDS.has(ul)) kws.add(ul)              // damacana, bardak (palet/koli değil)
  return [...kws]
}

function matchProduct(segment, products) {
  const seg = normTr(segment)
  let best = null, bestScore = 0
  for (const p of products) {
    let score = 0
    for (const kw of productKeywords(p)) if (seg.includes(kw)) score += kw.length
    if (score > bestScore) { bestScore = score; best = p }
  }
  return best
}

function matchZone(line, zones) {
  const ln = normTr(line)
  let best = null, bestLen = 0
  for (const z of zones) {
    const name = normTr(z.name)
    const code = z.code ? normTr(z.code) : null
    if (name && ln.includes(name) && name.length > bestLen) { best = z; bestLen = name.length }
    else if (code && ln.includes(code) && code.length > bestLen) { best = z; bestLen = code.length }
  }
  return best
}

function parseSegmentQty(segment) {
  const s = normTr(segment)
  let m = s.match(/(\d+(?:\.\d+)?)\s*(koli|paket|palet)/)
  if (m) return { qty: parseFloat(m[1]), unit: m[2] }
  m = s.match(/(\d+)\s*(adet|sise|şişe|damacana|bardak|kutu)/)
  if (m) return { qty: parseFloat(m[1]), unit: 'adet' }
  // birim yok: ürün ondalığı olmayan ilk tam sayıyı miktar say
  m = s.match(/(?<![\d.])(\d+)(?![.\d])/)
  if (m) return { qty: parseFloat(m[1]), unit: 'adet' }
  return { qty: null, unit: 'adet' }
}

export function parseDistributionText(text) {
  const zones = q.listZones()
  const products = q.listProducts()
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const items = []
  for (const line of lines) {
    const zone = matchZone(line, zones)
    // bölge adını çıkar, kalanı ürün segmentlerine böl
    let rest = line
    if (zone) {
      const re = new RegExp(zone.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      rest = line.replace(re, ' ')
    }
    const segments = rest.split(/[,;]|\s\+\s|\bve\b/i).map(s => s.trim()).filter(Boolean)
    const segsWithQty = segments.filter(s => /\d/.test(s))
    const useSegs = segsWithQty.length ? segsWithQty : [rest]
    for (const seg of useSegs) {
      const { qty, unit } = parseSegmentQty(seg)
      const product = matchProduct(seg, products)
      const issues = []
      if (!zone) issues.push('bölge')
      if (!product) issues.push('ürün')
      if (!(qty > 0)) issues.push('miktar')
      if (product && !availableUnits(product).includes(unit)) issues.push('birim')
      if (product && qty > 0 && availableUnits(product).includes(unit)) {
        try { toBase(product, qty, unit) } catch { issues.push('miktar') }
      }
      items.push({
        raw: line,
        zone_id: zone?.id || null, zone_name: zone?.name || null,
        product_id: product?.id || null, product_name: product?.name || null,
        input_qty: qty, input_unit: unit,
        ok: issues.length === 0, issues,
      })
    }
  }
  return { items, zones, products }
}

// ── Boş kap / palet iade servisleri (depozito) ──
function validateReturnLine(line, moveDate) {
  const product = q.getProduct(line.product_id)
  if (!product) throw Object.assign(new Error('Ürün bulunamadı'), { statusCode: 400 })
  if (!product.is_returnable) throw Object.assign(new Error(`${product.name} iade edilebilir ürün değil`), { statusCode: 400 })
  const qty = Number(line.input_qty)
  if (!Number.isFinite(qty) || qty <= 0) throw Object.assign(new Error('Miktar 0’dan büyük olmalı'), { statusCode: 400 })
  if (!INPUT_UNITS.includes(line.input_unit)) throw Object.assign(new Error('Geçersiz birim'), { statusCode: 400 })
  assertAvailableUnit(product, line.input_unit)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveDate || '')) throw Object.assign(new Error('Tarih YYYY-MM-DD olmalı'), { statusCode: 400 })
  assertMonthUnlocked(moveDate)
  return { product, qty }
}

export function createReturnService(data, userId) {
  const { product, qty } = validateReturnLine(data, data.move_date)
  return q.createReturn({
    product_id: product.id, move_date: data.move_date,
    qty_base: toBase(product, qty, data.input_unit), input_qty: qty, input_unit: data.input_unit,
    note: data.note?.trim() || null, created_by: userId || null,
  })
}

export function batchReturnService(data, userId) {
  const batchDate = data?.move_date
  const lines = Array.isArray(data.lines) ? data.lines.filter(l => Number(l.input_qty) > 0) : []
  if (lines.length === 0) throw Object.assign(new Error('En az bir iade satırı gerekli'), { statusCode: 400 })
  const rows = lines.map(l => {
    const moveDate = l.move_date || batchDate
    const { product, qty } = validateReturnLine(l, moveDate)
    return {
      product_id: product.id, move_date: moveDate,
      qty_base: toBase(product, qty, l.input_unit), input_qty: qty, input_unit: l.input_unit,
      note: (l.note || data.note)?.trim() || null, created_by: userId || null,
    }
  })
  return q.createReturnsBatch(rows)
}

export function deleteReturnService(id) {
  const existing = q.getReturn(id)
  if (!existing) throw Object.assign(new Error('İade kaydı bulunamadı'), { statusCode: 404 })
  assertMonthUnlocked(existing.move_date)
  q.deleteReturn(id)
}

export function returnsService(filters) {
  return q.listReturns(filters).map(r => ({ ...r, qty_human: humanize(r, r.qty_base) }))
}

// ── INDEX pivot: firma (satır) × marka-gruplu ürün (sütun) ──
// Hücre = SUM(qty_base) — qty_base zaten ürünün doğal biriminde (adet/şişe/damacana),
// bu yüzden Excel INDEX'indeki ham sayılarla birebir örtüşür.
export function pivotService({ from, to } = {}) {
  const zones = q.listZones()
  const products = q.listProducts()
  const totals = q.zoneTotals({ from, to })

  const cell = new Map()
  for (const t of totals) cell.set(`${t.id}:${t.product_id}`, t.total_out)

  const columns = products.map(p => ({
    product_id: p.id, name: p.name, unit_label: p.unit_label,
    brand_id: p.brand_id || null, brand_name: p.brand_name || 'Markasız',
    units_per_case: p.units_per_case, cases_per_pallet: p.cases_per_pallet,
    min_level: p.min_level || 0, critical_level: p.critical_level || 0,
    lead_time_days: p.lead_time_days ?? 7, safety_stock_days: p.safety_stock_days ?? 3,
    is_returnable: p.is_returnable || 0,
  }))

  const rows = zones.map(z => {
    const cells = {}
    let rowTotal = 0
    for (const p of products) {
      const base = cell.get(`${z.id}:${p.id}`) || 0
      if (base) { cells[p.id] = { base, human: humanize(p, base) }; rowTotal += base }
    }
    return { zone_id: z.id, zone_name: z.name, expected_monthly: z.expected_monthly || 0, cells, total_base: rowTotal }
  })

  const colTotals = {}
  let grandTotal = 0
  for (const p of products) {
    let ct = 0
    for (const z of zones) ct += cell.get(`${z.id}:${p.id}`) || 0
    colTotals[p.id] = { base: ct, human: humanize(p, ct) }
    grandTotal += ct
  }

  // Marka grupları (sütun başlığı için, sıralı) — sadece ürünü olan gruplar
  const brandColorById = new Map(q.listBrands({ includeInactive: true }).map(b => [b.id, b.color || null]))
  const brandOrder = []
  const seen = new Set()
  for (const c of columns) {
    const key = c.brand_id == null ? 'null' : String(c.brand_id)
    if (!seen.has(key)) {
      seen.add(key)
      brandOrder.push({ brand_id: c.brand_id, brand_name: c.brand_name, color: brandColorById.get(c.brand_id) || null, product_ids: [] })
    }
    brandOrder.find(b => (b.brand_id == null ? 'null' : String(b.brand_id)) === key).product_ids.push(c.product_id)
  }

  return { from: from || null, to: to || null, brands: brandOrder, columns, rows, colTotals, grandTotal }
}

// ── Operasyon Uyarı Merkezi ("Bugün Yapılacaklar") ──
// İki YYYY-MM-DD arasındaki tam gün farkı (UTC — DST kaymasını önler)
function daysBetween(fromIso, toIso) {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime()
  const b = new Date(`${toIso}T00:00:00Z`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

// today: istemci yerel gününü gönderir (sunucu TZ'ine güvenme — geçmişte UTC/yerel
// gün kayması bug'ları yaşandı). Geçersizse sunucu yerel gününe düşer.
export function alertsService({ today } = {}) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : new Date().toLocaleDateString('sv-SE')
  const month = day.slice(0, 7)
  const monthStart = `${month}-01`

  const pmap = new Map(q.listProducts().map(p => [p.id, p]))

  // 1. İrsaliye bekleyen dağıtımlar (eşleşmemiş çıkış) — ürün bazında grupla
  const needMap = new Map()
  for (const need of q.openDistributionNeeds(null)) {
    const g = needMap.get(need.product_id) || { count: 0, unallocated_base: 0, oldest_date: need.move_date }
    g.count += 1
    g.unallocated_base += need.unallocated_base
    if (need.move_date < g.oldest_date) g.oldest_date = need.move_date
    needMap.set(need.product_id, g)
  }
  const pending_waybill = [...needMap.entries()].map(([pid, g]) => {
    const p = pmap.get(pid) || {}
    return {
      product_id: pid, product_name: p.name || `#${pid}`,
      count: g.count, unallocated_base: g.unallocated_base,
      unallocated_human: humanize(p, g.unallocated_base),
      oldest_date: g.oldest_date, waiting_days: daysBetween(g.oldest_date, day),
    }
  }).sort((a, b) => b.waiting_days - a.waiting_days)

  // 2 & 4. Eksi stok / düşük stok (tüm-zaman bakiye)
  const negative_stock = []
  const low_stock = []
  for (const p of q.stockByProduct()) {
    const balance = p.total_in - p.total_out + (p.adjust_net || 0)
    if (balance < 0) {
      negative_stock.push({
        product_id: p.id, product_name: p.name, balance,
        balance_human: humanize(p, balance), deficit_human: humanize(p, -balance),
      })
    } else if (p.min_level > 0 && balance < p.min_level) {
      low_stock.push({
        product_id: p.id, product_name: p.name, balance, min_level: p.min_level,
        balance_human: humanize(p, balance), min_human: humanize(p, p.min_level),
      })
    }
  }

  // 3. Bu ay dağıtım > gelen
  const over_distributed = q.productFlow({ from: monthStart, to: day })
    .filter(p => p.period_out > p.period_in)
    .map(p => {
      const diff = p.period_out - p.period_in
      return {
        product_id: p.id, product_name: p.name,
        period_in: p.period_in, period_out: p.period_out, diff,
        period_in_human: humanize(p, p.period_in), period_out_human: humanize(p, p.period_out),
        diff_human: humanize(p, diff),
      }
    })

  // 5. Bugün hiç dağıtım kaydı girilmeyen aktif bölgeler
  const idle_zones = q.zonesWithoutMovementOn(day).map(z => ({ zone_id: z.id, zone_name: z.name }))

  const summary = {
    pending: pending_waybill.length,
    negative: negative_stock.length,
    over: over_distributed.length,
    low: low_stock.length,
    idle_zones: idle_zones.length,
  }
  summary.total = summary.pending + summary.negative + summary.over + summary.low + summary.idle_zones
  return { date: day, month, summary, pending_waybill, negative_stock, over_distributed, low_stock, idle_zones }
}

// ── Stok düzeltme / sayım fişi (W7) ──
export function adjustmentsService(filters) {
  return q.listAdjustments(filters).map(a => ({
    ...a,
    qty_human: humanize(a, a.qty_base),
    signed_base: a.direction === 'in' ? a.qty_base : -a.qty_base,
    signed_human: `${a.direction === 'in' ? '+' : '−'}${humanize(a, a.qty_base)}`,
  }))
}

export function createAdjustmentService(data, userId) {
  const product = q.getProduct(data.product_id)
  if (!product) throw Object.assign(new Error('Ürün bulunamadı'), { statusCode: 400 })
  if (!['in', 'out'].includes(data.direction)) throw Object.assign(new Error('Yön "in" (artı) veya "out" (eksi) olmalı'), { statusCode: 400 })
  const qty = Number(data.input_qty)
  if (!Number.isFinite(qty) || qty <= 0) throw Object.assign(new Error('Miktar 0’dan büyük olmalı'), { statusCode: 400 })
  const unit = data.input_unit || 'adet'
  if (!INPUT_UNITS.includes(unit)) throw Object.assign(new Error('Geçersiz birim'), { statusCode: 400 })
  assertAvailableUnit(product, unit)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.move_date || '')) throw Object.assign(new Error('Tarih YYYY-MM-DD olmalı'), { statusCode: 400 })
  assertMonthUnlocked(data.move_date)
  if (!isCountReason(data.reason)) throw Object.assign(new Error('Sebep seçilmeli'), { statusCode: 400 })
  const id = q.createAdjustment({
    product_id: product.id, move_date: data.move_date, direction: data.direction,
    qty_base: toBase(product, qty, unit), input_qty: qty, input_unit: unit,
    reason: data.reason, note: data.note?.trim() || null, created_by: userId || null,
  })
  checkLowStock([product.id])
  return id
}

export function deleteAdjustmentService(id) {
  const existing = q.getAdjustment(id)
  if (!existing) throw Object.assign(new Error('Düzeltme bulunamadı'), { statusCode: 404 })
  assertMonthUnlocked(existing.move_date)
  q.deleteAdjustment(id)
}

// ── Hızlı giriş şablonları (W5) ──
export function templatesService() { return q.listTemplates() }

export function createTemplateService(data, userId) {
  const name = data?.name?.trim()
  if (!name) throw Object.assign(new Error('Şablon adı gerekli'), { statusCode: 400 })
  if (q.getTemplateByName(name)) throw Object.assign(new Error('Bu şablon zaten var'), { statusCode: 409 })
  const rawLines = Array.isArray(data.lines) ? data.lines : []
  const lines = []
  for (const l of rawLines) {
    const product = q.getProduct(l.product_id)
    if (!product) throw Object.assign(new Error('Ürün bulunamadı'), { statusCode: 400 })
    if (!q.getZone(l.zone_id)) throw Object.assign(new Error('Bölge bulunamadı'), { statusCode: 400 })
    const unit = l.default_unit || 'adet'
    if (!INPUT_UNITS.includes(unit)) throw Object.assign(new Error('Geçersiz birim'), { statusCode: 400 })
    assertAvailableUnit(product, unit)
    const qty = l.default_qty == null || l.default_qty === '' ? null : Number(l.default_qty)
    if (qty != null && (!Number.isFinite(qty) || qty < 0)) throw Object.assign(new Error('Varsayılan miktar geçersiz'), { statusCode: 400 })
    if (qty != null) toBase(product, qty, unit)
    lines.push({ zone_id: l.zone_id, product_id: product.id, default_qty: qty, default_unit: unit })
  }
  if (lines.length === 0) throw Object.assign(new Error('En az bir satır gerekli'), { statusCode: 400 })
  return q.createTemplate({ name, created_by: userId || null, lines })
}

export function deleteTemplateService(id) {
  if (!q.deleteTemplate(id)) throw Object.assign(new Error('Şablon bulunamadı'), { statusCode: 404 })
}

// ── İrsaliye Bekleyenler (eşleşmemiş dağıtımlar) ──
export function pendingDistributionsService({ today } = {}) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : new Date().toLocaleDateString('sv-SE')
  const rows = q.pendingDistributions().map(r => {
    const waiting_days = daysBetween(r.move_date, day)
    return {
      movement_id: r.id, move_date: r.move_date,
      zone_name: r.zone_name || '—', product_name: r.product_name, brand_name: r.brand_name || null,
      qty_base: r.qty_base, allocated_base: r.allocated_base, unallocated_base: r.unallocated_base,
      waiting_days, source_waybills: r.source_waybills || null, note: r.note || null,
      qty_human: humanize(r, r.qty_base),
      allocated_human: humanize(r, r.allocated_base),
      unallocated_human: humanize(r, r.unallocated_base),
      severity: waiting_days >= 3 ? 'overdue' : 'waiting',
    }
  })
  const totals = {
    count: rows.length,
    overdue: rows.filter(x => x.severity === 'overdue').length,
    unallocated_base: rows.reduce((s, x) => s + x.unallocated_base, 0),
  }
  return { date: day, rows, totals }
}

// ── Onay akışı (W10) ──
export function reviewQueueService() {
  const rows = q.reviewQueue().map(r => ({
    movement_id: r.id, move_date: r.move_date, zone_name: r.zone_name || '—',
    product_name: r.product_name, brand_name: r.brand_name || null, created_by_name: r.created_by_name || null,
    qty_base: r.qty_base, unallocated_base: r.unallocated_base,
    qty_human: humanize(r, r.qty_base), unallocated_human: humanize(r, r.unallocated_base),
  }))
  return { rows, count: rows.length }
}
export function approveReviewsService(ids) {
  const list = Array.isArray(ids) ? ids.map(Number).filter(Boolean) : null
  return q.approveReviews(list)
}


// ── Günlük operasyon özeti (V3/V3.1) — bildirim + kalıcı SMTP kuyruğu ──
export function waterDailyDigest({
  now = new Date(),
  queueEmail = true,
  forceEmail = false,
  requestedBy = null,
  source = 'cron',
} = {}) {
  const clock = trClock(now)
  const today = clock.date
  const alerts = alertsService({ today })
  const forecast = forecastService({ today })
  const s = alerts.summary
  const f = forecast.totals
  const parts = []
  if (s.pending) parts.push(`${s.pending} irsaliye bekleyen`)
  if (s.negative) parts.push(`${s.negative} eksi stok`)
  if (s.low) parts.push(`${s.low} düşük stok`)
  if (f.order_count) parts.push(`${f.order_count} sipariş önerisi`)
  if (f.overdue_order_count) parts.push(`${f.overdue_order_count} gecikmiş sipariş`)
  if (f.soon_count) parts.push(`${f.soon_count} ürün 7 günden az`)
  if (s.idle_zones) parts.push(`${s.idle_zones} bölge bugün kayıtsız`)
  const actionable = parts.length > 0
  let notified = false
  if (actionable) {
    const notifications = notifyWaterOperations({
      message: `Su takip günlük özet (${today}): ${parts.join(', ')}.`,
      severity: (s.negative || f.order_count) ? 'warning' : 'info',
      module: 'water',
      dedup_key: `water_digest_${today}`,
      link: '/water',
    })
    notified = notifications.length > 0
  }
  const digest = {
    date: today,
    actionable,
    notified,
    parts,
    summary: s,
    order_count: f.order_count,
    overdue_order_count: f.overdue_order_count,
    due_soon_order_count: f.due_soon_order_count,
    soon_count: f.soon_count,
    details: {
      pending: alerts.pending_waybill.slice(0, 20),
      negative: alerts.negative_stock.slice(0, 20),
      low: alerts.low_stock.slice(0, 20),
      over_distributed: alerts.over_distributed.slice(0, 20),
      idle_zones: alerts.idle_zones.slice(0, 20),
      orders: forecast.order_suggestions.slice(0, 20),
    },
  }
  return {
    ...digest,
    email: queueEmail
      ? queueWaterDailyDigestEmail(digest, { force: forceEmail, requestedBy, source })
      : null,
  }
}

// ── Eskalasyon (V5) — 3+ gün bekleyen irsaliye + kritik stok → critical bildirim (push'a fan-out) ──
export function waterEscalations({ now = new Date() } = {}) {
  const clock = trClock(now)
  const today = clock.date
  let created = 0
  for (const p of pendingDistributionsService({ today }).rows.filter(r => r.severity === 'overdue')) {
    const notifications = notifyWaterOperations({
      message: `Su: ${p.product_name} → ${p.zone_name} dağıtımı ${p.waiting_days} gündür irsaliye bekliyor (bekleyen ${p.unallocated_human}).`,
      severity: 'critical', module: 'water',
      dedup_key: `water_esc_pending_${p.movement_id}_${today}`, link: '/water',
    })
    if (notifications.length) created += 1
  }
  for (const s of (summaryService({}).stock || []).filter(x => x.critical)) {
    const notifications = notifyWaterOperations({
      message: `Su: ${s.name} KRİTİK stok — kalan ${s.balance_human}${s.min_human ? ` (eşik ${s.min_human})` : ''}.`,
      severity: 'critical', module: 'water',
      dedup_key: `water_esc_critical_${s.product_id}_${today}`, link: '/water',
    })
    if (notifications.length) created += 1
  }
  return { date: today, created }
}


// Ay kapanışı kısa PDF içeriğini verilen pdfkit doc'una yazar + doc.end().
// Route res'e pipe eder, cron dosya stream'ine pipe eder (V4). pdfkit'i çağıran import eder.
export function buildReconciliationPDF(month, doc) {
  return writeReconciliationPDF(month, doc, summaryService)
}
