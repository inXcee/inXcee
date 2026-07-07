import * as q from './queries.js'

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
  return q.createProduct({ name: data.name.trim(), unit_label: data.unit_label || 'adet', units_per_case: upc, cases_per_pallet: cpp })
}
export function updateProductService(id, data) {
  if (!q.getProduct(id)) throw Object.assign(new Error('Ürün bulunamadı'), { statusCode: 404 })
  if (!data?.name?.trim()) throw Object.assign(new Error('Ürün adı gerekli'), { statusCode: 400 })
  const upc = parseInt(data.units_per_case) || 1
  const cpp = parseInt(data.cases_per_pallet) || 1
  if (upc < 1 || cpp < 1) throw Object.assign(new Error('Koli/palet adedi 1 veya daha büyük olmalı'), { statusCode: 400 })
  q.updateProduct(id, { name: data.name.trim(), unit_label: data.unit_label || 'adet', units_per_case: upc, cases_per_pallet: cpp, is_active: data.is_active !== false })
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
  return q.createMovement({
    type: 'out', product_id: product.id, zone_id: data.zone_id, move_date: data.move_date,
    qty_base: toBase(product, qty, data.input_unit), input_qty: qty, input_unit: data.input_unit,
    waybill_no: null, note: data.note?.trim() || null, created_by: userId || null,
  })
}

export function deleteMovementService(id) {
  if (!q.getMovement(id)) throw Object.assign(new Error('Hareket bulunamadı'), { statusCode: 404 })
  q.deleteMovement(id)
}

export function movementsService(filters) {
  return q.listMovements(filters).map(m => ({
    ...m,
    qty_human: humanize(m, m.qty_base),
  }))
}

// ── Özet / dashboard ──
export function summaryService({ from, to, product_id } = {}) {
  const stock = q.stockByProduct({ from, to }).map(p => {
    const balance = p.total_in - p.total_out
    return {
      product_id: p.id, name: p.name, unit_label: p.unit_label,
      total_in: p.total_in, total_out: p.total_out, balance,
      in_human: humanize(p, p.total_in),
      out_human: humanize(p, p.total_out),
      balance_human: humanize(p, balance),
    }
  })
  const zonesRaw = q.zoneTotals({ from, to, product_id })
  const zones = zonesRaw.map(z => ({
    zone_id: z.id, zone_name: z.name, product_id: z.product_id, product_name: z.product_name,
    total_out: z.total_out, out_human: humanize(z, z.total_out),
  }))
  const daily = q.dailySeries({ from, to, product_id })
  const totals = {
    total_in: stock.reduce((s, p) => s + p.total_in, 0),
    total_out: stock.reduce((s, p) => s + p.total_out, 0),
    balance: stock.reduce((s, p) => s + p.balance, 0),
  }
  return { stock, zones, daily, totals }
}
