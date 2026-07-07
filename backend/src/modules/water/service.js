import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'

// ── Çevrim mantığı: palet/koli/adet ↔ adet (base) ──
export function unitMultiplier(product, unit) {
  const upc = product.units_per_case || 1
  const cpp = product.cases_per_pallet || 1
  if (unit === 'adet') return 1
  if (unit === 'koli') return upc
  if (unit === 'palet') return upc * cpp
  throw Object.assign(new Error('Geçersiz birim'), { statusCode: 400 })
}

export function toBase(product, qty, unit) {
  return Math.round(qty * unitMultiplier(product, unit))
}

// base adedi palet/koli/adet kırılımına çevirir (insan-okur özet)
export function humanize(product, base) {
  const upc = product.units_per_case || 1
  const cpp = product.cases_per_pallet || 1
  const perPallet = upc * cpp
  const unit = product.unit_label || 'adet'
  let rem = Math.max(0, Math.round(base))
  const parts = []
  if (perPallet > 1) {
    const palet = Math.floor(rem / perPallet); rem %= perPallet
    if (palet) parts.push(`${palet} palet`)
  }
  if (upc > 1) {
    const koli = Math.floor(rem / upc); rem %= upc
    if (koli) parts.push(`${koli} koli`)
  }
  if (rem || parts.length === 0) parts.push(`${rem} ${unit}`)
  return parts.join(' ')
}

// ── Ürün servisleri ──
export function productsService(opts) { return q.listProducts(opts) }
export function createProductService(data) {
  if (!data?.name?.trim()) throw Object.assign(new Error('Ürün adı gerekli'), { statusCode: 400 })
  const upc = parseInt(data.units_per_case) || 1
  const cpp = parseInt(data.cases_per_pallet) || 1
  if (upc < 1 || cpp < 1) throw Object.assign(new Error('Koli/palet adedi 1 veya daha büyük olmalı'), { statusCode: 400 })
  return q.createProduct({ name: data.name.trim(), unit_label: data.unit_label || 'adet', units_per_case: upc, cases_per_pallet: cpp, min_level: Math.max(0, parseInt(data.min_level) || 0) })
}
export function updateProductService(id, data) {
  if (!q.getProduct(id)) throw Object.assign(new Error('Ürün bulunamadı'), { statusCode: 404 })
  if (!data?.name?.trim()) throw Object.assign(new Error('Ürün adı gerekli'), { statusCode: 400 })
  const upc = parseInt(data.units_per_case) || 1
  const cpp = parseInt(data.cases_per_pallet) || 1
  if (upc < 1 || cpp < 1) throw Object.assign(new Error('Koli/palet adedi 1 veya daha büyük olmalı'), { statusCode: 400 })
  q.updateProduct(id, { name: data.name.trim(), unit_label: data.unit_label || 'adet', units_per_case: upc, cases_per_pallet: cpp, is_active: data.is_active !== false, min_level: Math.max(0, parseInt(data.min_level) || 0) })
}

// Dağıtım sonrası: stok eşik altına düştüyse yöneticiye bildirim (günde bir, dedup)
function checkLowStock(productIds) {
  const uniq = [...new Set(productIds)]
  for (const pid of uniq) {
    const p = q.getProduct(pid)
    if (!p || !p.min_level || p.min_level <= 0) continue
    const bal = q.getProductBalance(pid)
    if (bal < p.min_level) {
      createNotification({
        message: `Su stoğu düşük: ${p.name} — kalan ${humanize(p, bal)} (eşik ${humanize(p, p.min_level)})`,
        severity: 'warning', module: 'water', target_role: 'campus_manager',
        dedup_key: `water_low_${pid}`,
      })
    }
  }
}
export function deleteProductService(id) {
  if (!q.getProduct(id)) throw Object.assign(new Error('Ürün bulunamadı'), { statusCode: 404 })
  if (q.productMovementCount(id) > 0)
    throw Object.assign(new Error('Bu ürüne ait hareket var — silmek yerine pasife alın'), { statusCode: 409 })
  q.deleteProduct(id)
}

// ── Bölge servisleri ──
export function zonesService(opts) { return q.listZones(opts) }
export function createZoneService(data) {
  if (!data?.name?.trim()) throw Object.assign(new Error('Bölge adı gerekli'), { statusCode: 400 })
  return q.createZone({ name: data.name.trim(), code: data.code?.trim() || null, note: data.note?.trim() || null })
}
export function updateZoneService(id, data) {
  if (!q.getZone(id)) throw Object.assign(new Error('Bölge bulunamadı'), { statusCode: 404 })
  if (!data?.name?.trim()) throw Object.assign(new Error('Bölge adı gerekli'), { statusCode: 400 })
  q.updateZone(id, { name: data.name.trim(), code: data.code?.trim() || null, note: data.note?.trim() || null, is_active: data.is_active !== false })
}
export function deleteZoneService(id) {
  if (!q.getZone(id)) throw Object.assign(new Error('Bölge bulunamadı'), { statusCode: 404 })
  if (q.zoneMovementCount(id) > 0)
    throw Object.assign(new Error('Bu bölgeye ait hareket var — silmek yerine pasife alın'), { statusCode: 409 })
  q.deleteZone(id)
}

// ── Hareket servisleri ──
function validateMovement(data, requireZone) {
  const product = q.getProduct(data.product_id)
  if (!product) throw Object.assign(new Error('Ürün bulunamadı'), { statusCode: 400 })
  const qty = Number(data.input_qty)
  if (!Number.isFinite(qty) || qty <= 0) throw Object.assign(new Error('Miktar 0’dan büyük olmalı'), { statusCode: 400 })
  if (!['adet', 'koli', 'palet'].includes(data.input_unit)) throw Object.assign(new Error('Geçersiz birim'), { statusCode: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.move_date || '')) throw Object.assign(new Error('Tarih YYYY-MM-DD olmalı'), { statusCode: 400 })
  if (requireZone) {
    if (!data.zone_id || !q.getZone(data.zone_id)) throw Object.assign(new Error('Bölge seçilmeli'), { statusCode: 400 })
  }
  return { product, qty }
}

export function createIntakeService(data, userId) {
  const { product, qty } = validateMovement(data, false)
  return q.createMovement({
    type: 'in', product_id: product.id, zone_id: null, move_date: data.move_date,
    qty_base: toBase(product, qty, data.input_unit), input_qty: qty, input_unit: data.input_unit,
    waybill_no: data.waybill_no?.trim() || null, note: data.note?.trim() || null, created_by: userId || null,
  })
}

export function createDistributionService(data, userId) {
  const { product, qty } = validateMovement(data, true)
  const id = q.createMovement({
    type: 'out', product_id: product.id, zone_id: data.zone_id, move_date: data.move_date,
    qty_base: toBase(product, qty, data.input_unit), input_qty: qty, input_unit: data.input_unit,
    waybill_no: null, note: data.note?.trim() || null, created_by: userId || null,
  })
  checkLowStock([product.id])
  return id
}

export function deleteMovementService(id) {
  if (!q.getMovement(id)) throw Object.assign(new Error('Hareket bulunamadı'), { statusCode: 404 })
  q.deleteMovement(id)
}

// Toplu irsaliye girişi: tek tarih/irsaliye altında çok ürün
export function batchIntakeService(data, userId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.move_date || '')) throw Object.assign(new Error('Tarih YYYY-MM-DD olmalı'), { statusCode: 400 })
  const lines = Array.isArray(data.lines) ? data.lines.filter(l => Number(l.input_qty) > 0) : []
  if (lines.length === 0) throw Object.assign(new Error('En az bir ürün satırı gerekli'), { statusCode: 400 })
  const rows = lines.map(l => {
    const { product, qty } = validateMovement({ ...l, move_date: data.move_date }, false)
    return {
      type: 'in', product_id: product.id, zone_id: null, move_date: data.move_date,
      qty_base: toBase(product, qty, l.input_unit), input_qty: qty, input_unit: l.input_unit,
      waybill_no: data.waybill_no?.trim() || null, note: data.note?.trim() || null, created_by: userId || null,
    }
  })
  return q.createMovementsBatch(rows)
}

export function movementsService(filters) {
  return q.listMovements(filters).map(m => ({
    ...m,
    qty_human: humanize(m, m.qty_base),
  }))
}

// ── Toplu dağıtım (yapılandırılmış satırlar) ──
export function batchDistributeService(data, userId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.move_date || '')) throw Object.assign(new Error('Tarih YYYY-MM-DD olmalı'), { statusCode: 400 })
  const lines = Array.isArray(data.lines) ? data.lines.filter(l => Number(l.input_qty) > 0) : []
  if (lines.length === 0) throw Object.assign(new Error('En az bir dağıtım satırı gerekli'), { statusCode: 400 })
  const rows = lines.map(l => {
    const { product, qty } = validateMovement({ ...l, move_date: data.move_date }, true)
    return {
      type: 'out', product_id: product.id, zone_id: l.zone_id, move_date: data.move_date,
      qty_base: toBase(product, qty, l.input_unit), input_qty: qty, input_unit: l.input_unit,
      waybill_no: null, note: data.note?.trim() || null, created_by: userId || null,
    }
  })
  const ids = q.createMovementsBatch(rows)
  checkLowStock(rows.map(r => r.product_id))
  return ids
}

// ── Serbest metin dağıtım ayrıştırıcı ──
// "A blok yemekhaneye 5 koli 0.5, 10 damacana gönderildi" → yapılandırılmış satırlar
const GENERIC_PRODUCT_WORDS = new Set(['l', 'lt', 'ml', 'su', 'sise', 'şişe', 'water'])

function normTr(s) { return (s || '').toString().toLocaleLowerCase('tr').replace(/İ/g, 'i').replace(/,/g, '.').trim() }

function productKeywords(p) {
  const kws = new Set()
  normTr(p.name).split(/[\s()]+/).forEach(tok => {
    if (!tok) return
    if (/^\d+(\.\d+)?$/.test(tok)) kws.add(tok)          // 0.5, 0.33, 19, 200
    else if (tok.length > 2 && !GENERIC_PRODUCT_WORDS.has(tok)) kws.add(tok)
  })
  if (p.unit_label) kws.add(normTr(p.unit_label))         // damacana, bardak
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
  let m = s.match(/(\d+(?:\.\d+)?)\s*(koli|palet)/)
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

// ── Özet / dashboard ──
export function summaryService({ from, to, product_id, group = 'day' } = {}) {
  const stock = q.stockByProduct().map(p => {
    const balance = p.total_in - p.total_out
    const low = p.min_level > 0 && balance < p.min_level
    return {
      product_id: p.id, name: p.name, unit_label: p.unit_label,
      total_in: p.total_in, total_out: p.total_out, balance,
      min_level: p.min_level, low,
      in_human: humanize(p, p.total_in),
      out_human: humanize(p, p.total_out),
      balance_human: humanize(p, balance),
      min_human: p.min_level > 0 ? humanize(p, p.min_level) : null,
    }
  })
  const zonesRaw = q.zoneTotals({ from, to, product_id })
  const zones = zonesRaw.map(z => ({
    zone_id: z.id, zone_name: z.name, product_id: z.product_id, product_name: z.product_name,
    total_out: z.total_out, out_human: humanize(z, z.total_out),
  }))
  const daily = group === 'month'
    ? q.monthlySeries({ from, to, product_id })
    : q.dailySeries({ from, to, product_id })
  const flow = q.periodFlow({ from, to })
  const totals = {
    period_in: flow.period_in,
    period_out: flow.period_out,
    balance: stock.reduce((s, p) => s + p.balance, 0),
    low_count: stock.filter(p => p.low).length,
  }
  return { stock, zones, daily, totals, group }
}
