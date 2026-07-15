import * as q from './queries.js'
import { INPUT_UNITS, assertAvailableUnit, availableUnits, humanize, toBase } from './units.js'
import { assertMonthUnlocked, isCountReason, writeReconciliationPDF } from './reconciliation.js'
import { forecastService, summaryService } from './analytics.js'
import { checkLowStock, notifyWaterOperations } from './notifications.js'
import fs from 'node:fs'
import { getDB } from '../../shared/db/index.js'
import { enqueue } from '../../shared/jobs/index.js'
import { parseRecipients } from '../email/service.js'
export { availableUnits, humanize, toBase, unitMultiplier } from './units.js'
export { depositService, forecastService, summaryService, trendsService } from './analytics.js'
export { notifyWaterOperations, WATER_OPERATION_ROLES } from './notifications.js'
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
  const wholeSetting = (value, fallback, label, min = 0) => {
    if (value == null || value === '') return fallback
    const numeric = Number(value)
    if (!Number.isSafeInteger(numeric) || numeric < min) {
      throw Object.assign(new Error(`${label} ${min || 0} veya daha büyük tam sayı olmalı`), { statusCode: 400 })
    }
    return numeric
  }
  const upc = wholeSetting(has('units_per_case') ? data.units_per_case : null, existing?.units_per_case || 1, 'Koli içi miktarı', 1)
  const cpp = wholeSetting(has('cases_per_pallet') ? data.cases_per_pallet : null, existing?.cases_per_pallet || 1, 'Palet içi miktarı', 1)
  const minLevel = wholeSetting(has('min_level') ? data.min_level : null, existing?.min_level || 0, 'Minimum stok')
  const criticalLevel = wholeSetting(has('critical_level') ? data.critical_level : null, existing?.critical_level || 0, 'Kritik stok')
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

// ── Tır ön bildirimleri + irsaliye fotoğraf arşivi ──
const TRUCK_STATUS = new Set(['planned', 'mail_sent', 'confirmed', 'arrived', 'cancelled'])
const STATUS_LABEL = {
  planned: 'Planlandı',
  mail_sent: 'Mail atıldı',
  confirmed: 'Gelecek onaylandı',
  arrived: 'Geldi',
  cancelled: 'İptal',
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
const isTime = (v) => /^\d{2}:\d{2}$/.test(v || '')
const minutesOf = (v) => {
  if (!isTime(v)) return null
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}
const clean = (v) => {
  const s = String(v ?? '').trim()
  return s || null
}

function validateTimeRange(start, end, label) {
  if (!isTime(start) || !isTime(end)) throw Object.assign(new Error(`${label} saatleri HH:MM olmalı`), { statusCode: 400 })
  if (minutesOf(start) > minutesOf(end)) throw Object.assign(new Error(`${label} başlangıcı bitişten sonra olamaz`), { statusCode: 400 })
}

function normalizeTruckPayload(data, userId, existing = null) {
  if (!isDate(data?.arrival_date)) throw Object.assign(new Error('Geliş tarihi YYYY-MM-DD olmalı'), { statusCode: 400 })
  const arrival_start_time = data.arrival_start_time || existing?.arrival_start_time || '08:00'
  const arrival_end_time = data.arrival_end_time || existing?.arrival_end_time || '17:00'
  const mail_deadline_date = data.mail_deadline_date || existing?.mail_deadline_date || data.arrival_date
  const mail_deadline_time = data.mail_deadline_time || existing?.mail_deadline_time || '17:00'
  const reminder_start_time = data.reminder_start_time || existing?.reminder_start_time || '08:00'
  const reminder_end_time = data.reminder_end_time || existing?.reminder_end_time || '17:00'
  if (!isDate(mail_deadline_date)) throw Object.assign(new Error('Mail son tarihi YYYY-MM-DD olmalı'), { statusCode: 400 })
  validateTimeRange(arrival_start_time, arrival_end_time, 'Geliş aralığı')
  validateTimeRange(reminder_start_time, reminder_end_time, 'Kontrol aralığı')
  if (!isTime(mail_deadline_time)) throw Object.assign(new Error('Mail son saati HH:MM olmalı'), { statusCode: 400 })
  const reminder_interval_minutes = Math.max(15, Math.min(240, parseInt(data.reminder_interval_minutes) || existing?.reminder_interval_minutes || 60))
  const plate = clean(data.plate)
  if (!plate) throw Object.assign(new Error('Plaka gerekli'), { statusCode: 400 })
  let brand_id = existing?.brand_id || null
  if (Object.prototype.hasOwnProperty.call(data, 'brand_id')) {
    brand_id = data.brand_id ? parseInt(data.brand_id) : null
    if (brand_id && !q.getBrand(brand_id)) throw Object.assign(new Error('Marka bulunamadı'), { statusCode: 400 })
  }
  const center_email = clean(data.center_email)
  if (center_email && !EMAIL_RE.test(center_email)) throw Object.assign(new Error('Ana merkez e-postası geçersiz'), { statusCode: 400 })
  const identity_type = data.identity_type || existing?.identity_type || 'tc'
  if (!['tc', 'passport'].includes(identity_type)) throw Object.assign(new Error('Kimlik türü TC veya pasaport olmalı'), { statusCode: 400 })
  const status = data.status || existing?.status || 'planned'
  if (!TRUCK_STATUS.has(status)) throw Object.assign(new Error('Geçersiz tır durumu'), { statusCode: 400 })
  return {
    arrival_date: data.arrival_date,
    arrival_start_time, arrival_end_time,
    mail_deadline_date, mail_deadline_time,
    reminder_start_time, reminder_end_time, reminder_interval_minutes,
    supplier_name: clean(data.supplier_name),
    brand_id,
    driver_name: clean(data.driver_name),
    driver_tc: clean(data.driver_tc),
    driver_phone: clean(data.driver_phone),
    plate: plate.toUpperCase(),
    trailer_plate: clean(data.trailer_plate)?.toUpperCase() || null,
    identity_type,
    visit_company: clean(data.visit_company),
    host_person_name: clean(data.host_person_name),
    host_person_phone: clean(data.host_person_phone),
    entry_reason: clean(data.entry_reason) || existing?.entry_reason || 'SU AMAÇLI NAKLİYE',
    work_area: clean(data.work_area),
    center_email,
    status,
    note: clean(data.note),
    created_by: existing?.created_by || userId || null,
    updated_by: userId || null,
  }
}

const MAIL_FIELD_DEFS = [
  ['center_email', 'Ana merkez e-postası'],
  ['driver_name', 'Tırcı adı'],
  ['driver_tc', 'Sicil / Arşiv TC'],
  ['driver_phone', 'Telefon'],
  ['plate', 'Plaka'],
  ['trailer_plate', 'Dorse'],
  ['visit_company', 'Ziyaret edilecek firma'],
  ['host_person_name', 'Ziyaret edilecek kişi'],
  ['host_person_phone', 'Ziyaret edilecek kişi telefonu'],
  ['entry_reason', 'Saha giriş nedeni'],
  ['work_area', 'Çalışma yapılacak bölge'],
  ['arrival_date', 'Geliş tarihi'],
  ['arrival_start_time', 'Geliş başlangıç'],
  ['arrival_end_time', 'Geliş bitiş'],
]

function mailChecklist(row) {
  return MAIL_FIELD_DEFS.map(([key, label]) => ({
    key, label,
    ok: !!row[key],
    value: row[key] || null,
  }))
}

function missingMailFields(row) {
  return mailChecklist(row).filter(x => !x.ok).map(x => x.label)
}

function dateTimeMinute(date, time) {
  if (!isDate(date) || !isTime(time)) return null
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return Math.round(Date.UTC(y, m - 1, d, hh, mm) / 60000)
}

function durationLabel(minutes) {
  const abs = Math.abs(Math.round(minutes || 0))
  if (abs < 60) return `${abs} dk`
  const hours = Math.floor(abs / 60)
  const mins = abs % 60
  if (hours < 24) return mins ? `${hours} sa ${mins} dk` : `${hours} sa`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours ? `${days} gün ${remHours} sa` : `${days} gün`
}

function nextReminderLabel(row, current) {
  const start = minutesOf(row.reminder_start_time)
  const end = minutesOf(row.reminder_end_time)
  const interval = Math.max(15, parseInt(row.reminder_interval_minutes, 10) || 60)
  if (current == null || start == null || end == null) return null
  if (current <= start) return row.reminder_start_time
  if (current > end) return null
  const elapsed = current - start
  const next = start + (Math.floor(elapsed / interval) + 1) * interval
  if (next > end) return null
  const hh = String(Math.floor(next / 60)).padStart(2, '0')
  const mm = String(next % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function minuteSlotKey(totalMinutes) {
  const safe = Math.max(0, Math.min(1439, Math.round(totalMinutes)))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}${String(safe % 60).padStart(2, '0')}`
}

function reminderSlot(current, start, end, interval) {
  if ([current, start, end].some(value => value == null) || current < start || current > end) return null
  const slotMinute = start + Math.floor((current - start) / interval) * interval
  return { minute: slotMinute, key: minuteSlotKey(slotMinute) }
}

function overdueSlot(current, deadline, interval) {
  if (current == null || deadline == null || current <= deadline) return null
  const firstOverdueMinute = deadline + 1
  const slotMinute = firstOverdueMinute + Math.floor((current - firstOverdueMinute) / interval) * interval
  return { minute: slotMinute, key: minuteSlotKey(slotMinute) }
}

function truckMailSubject(row) {
  return `Su amaçlı nakliye personel giriş talebi - ${row.arrival_date} - ${row.plate}`
}

function trDateLabel(value) {
  if (!isDate(value)) return value || '-'
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

function truckMailBody(row) {
  const identityLabel = row.identity_type === 'passport' ? 'Pasaport' : 'T.C. Kimlik'
  const arrivalWindow = `${row.arrival_start_time}-${row.arrival_end_time}`
  return [
    'Merhaba,',
    '',
    `${trDateLabel(row.arrival_date)} tarihinde ${arrivalWindow} saatleri arasında ${row.driver_name || 'aşağıda bilgileri bulunan personelin'}, ${row.plate}${row.trailer_plate ? ` araç / ${row.trailer_plate} dorse` : ' plakalı araç'} ile ${row.work_area || 'belirtilen bölgede'} su amaçlı nakliyesi olacaktır. Personel ve araç girişinin sağlanması hususunda yardımlarınızı rica ederiz.`,
    '',
    'PERSONEL GÜNLÜK GİRİŞ BİLGİLERİ',
    `Adı soyadı: ${row.driver_name || '-'}`,
    `${identityLabel} / Sicil-Arşiv No: ${row.driver_tc || '-'}`,
    `Telefon numarası: ${row.driver_phone || '-'}`,
    `Araç plakası: ${row.plate}`,
    `Dorse plakası: ${row.trailer_plate || '-'}`,
    `Ziyaret edilecek firma: ${row.visit_company || '-'}`,
    `Ziyaret edilecek kişi: ${row.host_person_name || '-'}`,
    `Ziyaret edilecek kişi telefonu: ${row.host_person_phone || '-'}`,
    `Giriş tarihi: ${trDateLabel(row.arrival_date)}`,
    `Giriş saat aralığı: ${arrivalWindow}`,
    `Saha giriş nedeni: ${row.entry_reason || 'SU AMAÇLI NAKLİYE'}`,
    `Çalışma yapacağı bölge: ${row.work_area || '-'}`,
    `Tedarikçi / marka: ${row.supplier_name || row.brand_name || '-'}`,
    row.note ? `Not: ${row.note}` : null,
    '',
    'Bilgilerinize sunar, yardımlarınızı rica ederiz.',
  ].filter(Boolean).join('\n')
}

function registerGatePdfFonts(doc) {
  const candidates = [
    ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf'],
    ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
    ['/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'],
  ]
  const pair = candidates.find(([regular, bold]) => fs.existsSync(regular) && fs.existsSync(bold))
  if (!pair) return { regular: 'Helvetica', bold: 'Helvetica-Bold' }
  try {
    doc.registerFont('GateRegular', pair[0])
    doc.registerFont('GateBold', pair[1])
    return { regular: 'GateRegular', bold: 'GateBold' }
  } catch {
    return { regular: 'Helvetica', bold: 'Helvetica-Bold' }
  }
}

export function truckGateEntryService(id) {
  const row = q.getTruckArrival(id)
  if (!row) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  return decorateTruck(row)
}

export function buildTruckGateEntryPDF(truck, doc) {
  if (!truck?.id) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  const fonts = registerGatePdfFonts(doc)
  const entry = truck.gate_entry || {}
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  const margin = 48
  const innerWidth = pageWidth - margin * 2
  doc.info.Title = truck.mail_subject
  doc.info.Subject = 'Su amaçlı nakliye personel giriş talebi'
  doc.info.Author = 'Şantiye Yatakhane Yönetim Sistemi'

  doc.rect(0, 0, pageWidth, 92).fill('#155E75')
  doc.font(fonts.bold).fontSize(19).fillColor('#FFFFFF')
    .text('SU AMAÇLI NAKLİYE', margin, 30, { width: innerWidth })
  doc.font(fonts.regular).fontSize(10).fillColor('#CFFAFE')
    .text('PERSONEL VE ARAÇ GİRİŞ TALEBİ', margin, 58, { width: innerWidth })
  doc.font(fonts.bold).fontSize(9).fillColor('#0F172A')
    .text(`KAYIT NO  #${truck.id}`, margin, 112)
  doc.font(fonts.regular).fillColor('#475569')
    .text(`GELİŞ  ${trDateLabel(truck.arrival_date)}  ${truck.arrival_window}`, margin, 129)
  doc.font(fonts.bold).fillColor('#0F172A')
    .text('KONU', margin, 162, { width: 54 })
  doc.roundedRect(margin + 54, 154, innerWidth - 54, 40, 4).fillAndStroke('#F0F9FF', '#7DD3FC')
  doc.font(fonts.bold).fontSize(10).fillColor('#0F172A')
    .text(truck.mail_subject, margin + 66, 168, { width: innerWidth - 78, ellipsis: true })

  doc.font(fonts.regular).fontSize(10).fillColor('#1E293B')
    .text(truck.mail_body, margin, 216, { width: innerWidth, lineGap: 4 })

  const signatureY = pageHeight - 132
  const signatureGap = 12
  const signatureWidth = (innerWidth - signatureGap * 2) / 3
  ;['HAZIRLAYAN', 'KONTROL EDEN', 'ONAY'].forEach((label, index) => {
    const x = margin + index * (signatureWidth + signatureGap)
    doc.roundedRect(x, signatureY, signatureWidth, 58, 4).stroke('#CBD5E1')
    doc.font(fonts.bold).fontSize(8).fillColor('#475569').text(label, x + 10, signatureY + 9)
    doc.moveTo(x + 10, signatureY + 42).lineTo(x + signatureWidth - 10, signatureY + 42).dash(3, { space: 3 }).stroke('#94A3B8').undash()
  })
  doc.font(fonts.regular).fontSize(7).fillColor('#64748B')
    .text(`Oluşturma: ${new Date().toLocaleString('tr-TR')}  ·  YYS Su Takibi`, margin, pageHeight - 60, { width: innerWidth, align: 'center' })

  doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 })
  const landscapeWidth = doc.page.width
  const tableX = 24
  const tableWidth = landscapeWidth - 48
  doc.rect(0, 0, landscapeWidth, 66).fill('#155E75')
  doc.font(fonts.bold).fontSize(16).fillColor('#FFFFFF')
    .text('PERSONEL GÜNLÜK GİRİŞ FORMU', tableX, 24, { width: tableWidth, align: 'center' })
  doc.font(fonts.regular).fontSize(8).fillColor('#475569')
    .text(`${trDateLabel(truck.arrival_date)} · ${truck.arrival_window} · ${truck.vehicle_summary}`, tableX, 78, { width: tableWidth, align: 'center' })

  const headers = [
    'ADI SOYADI', 'T.C. KİMLİK / PASAPORT NUMARASI', 'TELEFON NUMARASI', 'ARAÇ PLAKASI',
    'ZİYARET EDİLECEK FİRMA', 'ZİYARET EDİLECEK KİŞİ', 'ZİYARET EDİLECEK KİŞİ TELEFONU',
    'GİRİŞ TARİHİ', 'GİRİŞ SAATİ', 'SAHA GİRİŞ NEDENİ', 'ÇALIŞMA YAPACAĞI BÖLGE',
  ]
  const values = [
    entry.full_name || '-', `${entry.identity_label || 'T.C. Kimlik'}\n${entry.identity_no || '-'}`,
    entry.phone || '-', [entry.plate, entry.trailer_plate].filter(Boolean).join('\n'),
    entry.visit_company || '-', entry.host_person_name || '-', entry.host_person_phone || '-',
    trDateLabel(entry.entry_date), `${entry.entry_start_time || '-'}-${entry.entry_end_time || '-'}`,
    entry.entry_reason || 'SU AMAÇLI NAKLİYE', entry.work_area || '-',
  ]
  const baseWidths = [72, 88, 70, 72, 110, 82, 84, 58, 62, 74, 82]
  const widthScale = tableWidth / baseWidths.reduce((sum, width) => sum + width, 0)
  const widths = baseWidths.map(width => width * widthScale)
  const drawRow = (items, y, height, header = false) => {
    let x = tableX
    items.forEach((item, index) => {
      const width = widths[index]
      doc.rect(x, y, width, height).fillAndStroke(header ? '#D6EAF0' : '#FFFFFF', '#64748B')
      doc.font(header ? fonts.bold : fonts.regular).fontSize(header ? 6.4 : 7.8).fillColor('#0F172A')
        .text(String(item || '-'), x + 4, y + 7, { width: width - 8, height: height - 14, align: 'center', valign: 'center', ellipsis: true })
      x += width
    })
  }
  drawRow(headers, 104, 58, true)
  drawRow(values, 162, 82)

  const requestY = 272
  doc.roundedRect(tableX, requestY, tableWidth, 112, 5).fillAndStroke('#F8FAFC', '#CBD5E1')
  doc.font(fonts.bold).fontSize(9).fillColor('#155E75').text('GİRİŞ TALEBİ', tableX + 14, requestY + 12)
  const requestText = `${trDateLabel(truck.arrival_date)} tarihinde ${truck.arrival_window} saatleri arasında ${entry.full_name || 'bilgileri bulunan personelin'}, ${truck.vehicle_summary} ile ${entry.work_area || 'belirtilen bölgede'} su amaçlı nakliyesi olacaktır. Personel ve araç girişinin sağlanması hususunda yardımlarınızı rica ederiz.`
  doc.font(fonts.regular).fontSize(9).fillColor('#1E293B').text(requestText, tableX + 14, requestY + 34, { width: tableWidth - 28, lineGap: 3 })
  doc.font(fonts.regular).fontSize(7).fillColor('#64748B')
    .text(`Alıcı: ${truck.center_email || '-'}  ·  Kayıt #${truck.id}`, tableX, doc.page.height - 34, { width: tableWidth, align: 'center' })
  doc.end()
  return truck
}

function decorateTruck(row, now = new Date()) {
  const clock = trClock(now)
  const current = minutesOf(clock.time)
  const missing = missingMailFields(row)
  const mailDiff = dateTimeMinute(row.mail_deadline_date, row.mail_deadline_time) - dateTimeMinute(clock.date, clock.time)
  const arrivalStartDiff = dateTimeMinute(row.arrival_date, row.arrival_start_time) - dateTimeMinute(clock.date, clock.time)
  const arrivalEndDiff = dateTimeMinute(row.arrival_date, row.arrival_end_time) - dateTimeMinute(clock.date, clock.time)
  const mailDone = !!row.mail_sent_at || ['arrived', 'cancelled'].includes(row.status)
  const mailJobActive = ['pending', 'processing'].includes(row.mail_job_status)
  const mailJobFailed = !!row.mail_job_id && (
    row.mail_job_status === 'failed'
    || (row.mail_job_status === 'done' && !!row.mail_job_last_error)
  )
  let mailPhase = 'scheduled'
  let mailPhaseLabel = 'Planlı'
  let mailSeverity = 'info'
  let mailNotice = `${row.mail_deadline_label || `${row.mail_deadline_date} ${row.mail_deadline_time}`} son saatine kadar mail hazırlanmalı`
  if (row.mail_sent_at) {
    mailPhase = 'sent'
    mailPhaseLabel = 'Mail atıldı'
    mailSeverity = 'success'
    mailNotice = `Mail ${row.mail_sent_at} tarihinde işaretlenmiş`
  } else if (row.status === 'cancelled') {
    mailPhase = 'cancelled'
    mailPhaseLabel = 'İptal'
    mailSeverity = 'muted'
    mailNotice = 'Tır kaydı iptal edildi'
  } else if (mailJobActive) {
    mailPhase = row.mail_job_status === 'processing' ? 'sending' : 'queued'
    mailPhaseLabel = row.mail_job_status === 'processing' ? 'Gönderiliyor' : 'Mail sırada'
    mailSeverity = row.mail_job_status === 'processing' ? 'attention' : 'info'
    mailNotice = `Mail kalıcı gönderim kuyruğunda · deneme ${row.mail_job_attempts || 0}/${row.mail_job_max_attempts || 5}`
  } else if (mailJobFailed) {
    mailPhase = 'send_failed'
    mailPhaseLabel = 'Gönderilemedi'
    mailSeverity = 'critical'
    mailNotice = row.mail_job_last_error || 'Mail gönderimi bütün denemelerde başarısız oldu'
  } else if (mailDiff < 0) {
    mailPhase = 'overdue'
    mailPhaseLabel = 'Süre geçti'
    mailSeverity = 'critical'
    mailNotice = `Mail son saati ${durationLabel(mailDiff)} geçti`
  } else if (row.mail_deadline_date === clock.date) {
    mailPhase = missing.length ? 'due_missing' : 'due_ready'
    mailPhaseLabel = missing.length ? 'Bugün eksik' : 'Bugün hazır'
    mailSeverity = missing.length ? 'warning' : 'attention'
    mailNotice = `${durationLabel(mailDiff)} içinde ana merkeze mail atılmalı`
  } else if (mailDiff <= 24 * 60) {
    mailPhase = missing.length ? 'soon_missing' : 'soon_ready'
    mailPhaseLabel = missing.length ? 'Yakın eksik' : 'Yakın'
    mailSeverity = missing.length ? 'warning' : 'info'
    mailNotice = `${durationLabel(mailDiff)} sonra mail deadline`
  }

  let arrivalPhase = 'scheduled'
  let arrivalPhaseLabel = 'Planlı'
  let arrivalSeverity = 'info'
  let arrivalNotice = `${row.arrival_date} ${row.arrival_start_time}-${row.arrival_end_time} aralığında bekleniyor`
  if (row.status === 'arrived') {
    arrivalPhase = 'arrived'
    arrivalPhaseLabel = 'Geldi'
    arrivalSeverity = 'success'
    arrivalNotice = 'Geldi olarak işaretlendi'
  } else if (row.status === 'cancelled') {
    arrivalPhase = 'cancelled'
    arrivalPhaseLabel = 'İptal'
    arrivalSeverity = 'muted'
    arrivalNotice = 'Tır kaydı iptal edildi'
  } else if (arrivalEndDiff < 0) {
    arrivalPhase = 'late'
    arrivalPhaseLabel = 'Geliş gecikti'
    arrivalSeverity = 'critical'
    arrivalNotice = `Geliş aralığı ${durationLabel(arrivalEndDiff)} önce bitti`
  } else if (arrivalStartDiff <= 0 && arrivalEndDiff >= 0) {
    arrivalPhase = 'in_window'
    arrivalPhaseLabel = 'Geliş aralığında'
    arrivalSeverity = 'attention'
    arrivalNotice = `${durationLabel(arrivalEndDiff)} içinde geliş aralığı bitecek`
  } else if (row.arrival_date === clock.date) {
    arrivalPhase = 'today'
    arrivalPhaseLabel = 'Bugün gelecek'
    arrivalSeverity = 'warning'
    arrivalNotice = `${durationLabel(arrivalStartDiff)} sonra geliş aralığı başlayacak`
  }

  const nextCheck = nextReminderLabel(row, current)
  const actionItems = []
  if (mailJobActive) actionItems.push(`Mail gönderim kuyruğunda · iş #${row.mail_job_id}`)
  if (mailJobFailed) actionItems.push('Mail gönderimi başarısız; hata kontrol edilip yeniden kuyruğa alınmalı')
  if (!mailDone && missing.length) actionItems.push(`Mail için eksik: ${missing.join(', ')}`)
  if (!row.mail_sent_at && mailDiff < 0 && row.status !== 'cancelled') actionItems.push('Mail deadline geçti, ana merkeze gönderim teyidi alınmalı')
  if (!row.mail_sent_at && mailDiff >= 0 && row.mail_deadline_date === clock.date) actionItems.push('Bugün 17:00 öncesi mail gönderimi kapatılmalı')
  if (row.arrival_date === clock.date && row.status !== 'arrived' && row.status !== 'cancelled') actionItems.push('Tır geliş teyidi yapılmalı')
  if (!row.photo_count) actionItems.push('İrsaliye fotoğrafı henüz yok')

  const mailSubject = truckMailSubject(row)
  const mailBody = truckMailBody(row)
  return {
    ...row,
    status_label: STATUS_LABEL[row.status] || row.status,
    arrival_window: `${row.arrival_start_time}-${row.arrival_end_time}`,
    mail_deadline_label: `${row.mail_deadline_date} ${row.mail_deadline_time}`,
    missing_mail_fields: missing,
    mail_checklist: mailChecklist(row),
    mail_ready: missing.length === 0,
    mail_required: !mailDone,
    deadline_passed: !row.mail_sent_at && mailDiff < 0 && !['arrived', 'cancelled'].includes(row.status),
    mail_phase: mailPhase,
    mail_phase_label: mailPhaseLabel,
    mail_severity: mailSeverity,
    mail_minutes_left: mailDiff,
    mail_time_left_label: mailDiff == null ? null : durationLabel(mailDiff),
    mail_notice: mailNotice,
    mail_queue: row.mail_job_id ? {
      job_id: row.mail_job_id,
      status: row.mail_job_status,
      attempts: row.mail_job_attempts || 0,
      max_attempts: row.mail_job_max_attempts || 5,
      last_error: row.mail_job_last_error || null,
      queued_at: row.mail_queued_at || null,
      active: mailJobActive,
      failed: mailJobFailed,
    } : null,
    arrival_phase: arrivalPhase,
    arrival_phase_label: arrivalPhaseLabel,
    arrival_severity: arrivalSeverity,
    arrival_minutes_to_start: arrivalStartDiff,
    arrival_minutes_to_end: arrivalEndDiff,
    arrival_notice: arrivalNotice,
    next_check_time: nextCheck,
    check_plan_label: `${row.reminder_start_time}-${row.reminder_end_time} / ${row.reminder_interval_minutes || 60} dk`,
    action_items: actionItems,
    identity_summary: [row.driver_name, row.driver_tc].filter(Boolean).join(' · ') || null,
    vehicle_summary: [row.plate, row.trailer_plate].filter(Boolean).join(' / '),
    contact_summary: [row.driver_phone, row.center_email].filter(Boolean).join(' · ') || null,
    gate_entry: {
      full_name: row.driver_name || null,
      identity_type: row.identity_type || 'tc',
      identity_label: row.identity_type === 'passport' ? 'Pasaport' : 'T.C. Kimlik',
      identity_no: row.driver_tc || null,
      phone: row.driver_phone || null,
      plate: row.plate,
      trailer_plate: row.trailer_plate || null,
      visit_company: row.visit_company || null,
      host_person_name: row.host_person_name || null,
      host_person_phone: row.host_person_phone || null,
      entry_date: row.arrival_date,
      entry_start_time: row.arrival_start_time,
      entry_end_time: row.arrival_end_time,
      entry_reason: row.entry_reason || 'SU AMAÇLI NAKLİYE',
      work_area: row.work_area || null,
      ready: missing.length === 0,
      missing_fields: missing,
    },
    mail_subject: mailSubject,
    mail_body: mailBody,
    mail_preview: {
      to: row.center_email || null,
      subject: mailSubject,
      body: mailBody,
      ready: missing.length === 0,
      missing_fields: missing,
      checklist: mailChecklist(row),
    },
  }
}

export function truckArrivalsService(filters = {}) {
  const limit = filters.limit ? Math.min(1000, Math.max(1, parseInt(filters.limit) || 200)) : 200
  return q.listTruckArrivals({ ...filters, limit }).map(r => decorateTruck(r))
}

export function createTruckArrivalService(data, userId) {
  return q.createTruckArrival(normalizeTruckPayload(data, userId))
}

export function updateTruckArrivalService(id, data, userId) {
  const existing = q.getTruckArrival(id)
  if (!existing) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  if (!q.updateTruckArrival(id, normalizeTruckPayload(data, userId, existing)))
    throw Object.assign(new Error('Tır kaydı güncellenemedi'), { statusCode: 500 })
}

export function sendTruckArrivalMailService(id, userId) {
  const row = q.getTruckArrival(id)
  if (!row) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  if (row.mail_sent_at) throw Object.assign(new Error('Bu tırın maili daha önce gönderilmiş'), { statusCode: 409 })
  const missing = missingMailFields(row)
  if (missing.length) throw Object.assign(new Error(`Mail için eksik bilgi: ${missing.join(', ')}`), { statusCode: 400 })
  parseRecipients(row.center_email)

  if (['pending', 'processing'].includes(row.mail_job_status)) {
    return { queued: true, alreadyQueued: true, job_id: row.mail_job_id, truck: decorateTruck(row) }
  }

  const subject = truckMailSubject(row)
  const queueMail = getDB().transaction(() => {
    const jobId = enqueue('water.truck-mail', {
      truckArrivalId: id,
      requestedBy: userId || null,
      to: row.center_email,
      subject,
      body: truckMailBody(row),
    }, { maxAttempts: 5 })
    if (!q.setTruckMailQueued(id, jobId, userId)) throw new Error('Tır mail kuyruğu kayda bağlanamadı')
    return jobId
  })
  const jobId = queueMail.immediate()
  return { queued: true, alreadyQueued: false, job_id: jobId, truck: decorateTruck(q.getTruckArrival(id)) }
}

export function markTruckMailSentService(id, userId) {
  if (!q.getTruckArrival(id)) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  q.setTruckMailSent(id, userId)
  return decorateTruck(q.getTruckArrival(id))
}

export function markTruckCheckedService(id, userId) {
  if (!q.getTruckArrival(id)) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  q.setTruckChecked(id, userId)
  return decorateTruck(q.getTruckArrival(id))
}

export function deleteTruckArrivalService(id) {
  const result = q.deleteTruckArrival(id)
  if (!result) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  return result
}

function trClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    hour: parts.hour,
  }
}

// ── Günlük operasyon özeti (V3) — cron 06:15, müdüre tek bildirim (push'a fan-out) ──
export function waterDailyDigest({ now = new Date() } = {}) {
  const clock = trClock(now)
  const today = clock.date
  const s = alertsService({ today }).summary
  const f = forecastService({ today }).totals
  const parts = []
  if (s.pending) parts.push(`${s.pending} irsaliye bekleyen`)
  if (s.negative) parts.push(`${s.negative} eksi stok`)
  if (s.low) parts.push(`${s.low} düşük stok`)
  if (f.order_count) parts.push(`${f.order_count} sipariş önerisi`)
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
  return { date: today, actionable, notified, parts, summary: s, order_count: f.order_count, soon_count: f.soon_count }
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

export function checkTruckArrivalAlerts({ now = new Date() } = {}) {
  const clock = trClock(now)
  const current = minutesOf(clock.time)
  const rows = q.listTruckArrivals({ limit: 1000 })
    .filter(r => !['arrived', 'cancelled'].includes(r.status))
    .filter(r => r.arrival_date === clock.date || r.mail_deadline_date === clock.date)
  let created = 0
  const alerts = []
  for (const r of rows) {
    const base = `${r.plate}${r.trailer_plate ? ` / ${r.trailer_plate}` : ''}`
    const missing = missingMailFields(r)
    const missingText = missing.length ? ` Eksik bilgi: ${missing.join(', ')}.` : ''
    const interval = Math.max(15, parseInt(r.reminder_interval_minutes, 10) || 60)
    const reminder = reminderSlot(current, minutesOf(r.reminder_start_time), minutesOf(r.reminder_end_time), interval)
    if (!r.mail_sent_at && r.mail_deadline_date === clock.date) {
      const deadline = minutesOf(r.mail_deadline_time)
      if (reminder && current <= deadline) {
        const message = `Su tırı mail kontrolü: ${base} için ana merkeze ${r.mail_deadline_time}'ye kadar mail atılmalı.${missingText}`
        const notifications = notifyWaterOperations({
          message,
          severity: missing.length ? 'critical' : 'warning', module: 'water',
          dedup_key: `water_truck_mail_${r.id}_${clock.date}_${reminder.key}`,
          link: '/water',
        })
        if (notifications.length) created += 1
        alerts.push({ truck_id: r.id, type: 'mail_due', severity: missing.length ? 'critical' : 'warning', created: notifications.length > 0, message })
      } else if (current > deadline) {
        const overdue = overdueSlot(current, deadline, interval)
        const message = `Su tırı mail süresi geçti: ${base} için ${r.mail_deadline_time} deadline aşıldı, mail atıldı mı kontrol edin.${missingText}`
        const notifications = notifyWaterOperations({
          message,
          severity: 'critical', module: 'water',
          dedup_key: `water_truck_deadline_${r.id}_${clock.date}_${overdue.key}`,
          link: '/water',
        })
        if (notifications.length) created += 1
        alerts.push({ truck_id: r.id, type: 'mail_overdue', severity: 'critical', created: notifications.length > 0, message })
      }
    }
    if (r.arrival_date === clock.date) {
      const start = minutesOf(r.arrival_start_time)
      const end = minutesOf(r.arrival_end_time)
      const inWindow = current >= start && current <= end
      const late = current > end
      if ((inWindow || late) && reminder) {
        const message = inWindow
          ? `Su tırı geliş kontrolü: ${base} bugün ${r.arrival_start_time}-${r.arrival_end_time} aralığında bekleniyor. Tır gelecek mi teyit edin.`
          : `Su tırı gecikme kontrolü: ${base} için geliş aralığı geçti (${r.arrival_end_time}). Geldi mi kontrol edin.`
        const notifications = notifyWaterOperations({
          message,
          severity: late ? 'critical' : 'info', module: 'water',
          dedup_key: `water_truck_arrival_${r.id}_${clock.date}_${reminder.key}`,
          link: '/water',
        })
        if (notifications.length) created += 1
        alerts.push({ truck_id: r.id, type: late ? 'arrival_late' : 'arrival_due', severity: late ? 'critical' : 'info', created: notifications.length > 0, message })
      }
    }
  }
  return { checked: rows.length, created, date: clock.date, time: clock.time, alerts }
}

export function waybillPhotosService(filters = {}) {
  const limit = filters.limit ? Math.min(1000, Math.max(1, parseInt(filters.limit) || 200)) : 200
  return q.listWaybillPhotos({ ...filters, limit }).map(r => ({
    ...r,
    qty_human: r.product_id ? humanize(r, r.qty_base) : null,
  }))
}

export function createWaybillPhotoService(data, file, userId) {
  if (!file) throw Object.assign(new Error('İrsaliye fotoğrafı gerekli'), { statusCode: 400 })
  const truckId = data.truck_arrival_id ? parseInt(data.truck_arrival_id) : null
  const movementId = data.movement_id ? parseInt(data.movement_id) : null
  const truck = truckId ? q.getTruckArrival(truckId) : null
  if (truckId && !truck) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 400 })
  const movement = movementId ? q.getMovement(movementId) : null
  if (movementId && !movement) throw Object.assign(new Error('İrsaliye hareketi bulunamadı'), { statusCode: 400 })
  if (movement && movement.type !== 'in') throw Object.assign(new Error('Fotoğraf sadece giriş/irsaliye kaydına bağlanabilir'), { statusCode: 400 })
  const moveDate = data.move_date || movement?.move_date || truck?.arrival_date
  if (!isDate(moveDate)) throw Object.assign(new Error('Fotoğraf tarihi YYYY-MM-DD olmalı'), { statusCode: 400 })
  return q.createWaybillPhoto({
    truck_arrival_id: truckId,
    movement_id: movementId,
    waybill_no: clean(data.waybill_no) || movement?.waybill_no || null,
    move_date: moveDate,
    photo_url: `/uploads/${file.filename}`,
    original_name: file.originalname || null,
    mime: file.mimetype || null,
    size: file.size || null,
    note: clean(data.note),
    uploaded_by: userId || null,
  })
}

export function deleteWaybillPhotoService(id) {
  const row = q.deleteWaybillPhoto(id)
  if (!row) throw Object.assign(new Error('Fotoğraf bulunamadı'), { statusCode: 404 })
  return row
}

// Ay kapanışı kısa PDF içeriğini verilen pdfkit doc'una yazar + doc.end().
// Route res'e pipe eder, cron dosya stream'ine pipe eder (V4). pdfkit'i çağıran import eder.
export function buildReconciliationPDF(month, doc) {
  return writeReconciliationPDF(month, doc, summaryService)
}
