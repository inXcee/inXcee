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

export function availableUnits(product) {
  const units = ['adet']
  if ((product?.units_per_case || 1) > 1) units.push('koli')
  if ((product?.units_per_case || 1) > 1 && (product?.cases_per_pallet || 1) > 1) units.push('palet')
  return units
}

function assertAvailableUnit(product, unit) {
  if (!availableUnits(product).includes(unit)) {
    throw Object.assign(new Error(`${product.name} için ${unit} birimi kullanılamaz`), { statusCode: 400 })
  }
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

// ── Marka servisleri ──
export function brandsService(opts) { return q.listBrands(opts) }
export function createBrandService(data) {
  if (!data?.name?.trim()) throw Object.assign(new Error('Marka adı gerekli'), { statusCode: 400 })
  if (q.getBrandByName(data.name.trim())) throw Object.assign(new Error('Bu marka zaten var'), { statusCode: 409 })
  return q.createBrand({ name: data.name.trim(), sort_order: parseInt(data.sort_order) || 0 })
}
export function updateBrandService(id, data) {
  if (!q.getBrand(id)) throw Object.assign(new Error('Marka bulunamadı'), { statusCode: 404 })
  if (!data?.name?.trim()) throw Object.assign(new Error('Marka adı gerekli'), { statusCode: 400 })
  const clash = q.getBrandByName(data.name.trim())
  if (clash && clash.id !== id) throw Object.assign(new Error('Bu marka zaten var'), { statusCode: 409 })
  q.updateBrand(id, { name: data.name.trim(), sort_order: parseInt(data.sort_order) || 0, is_active: data.is_active !== false })
}
export function deleteBrandService(id) {
  if (!q.getBrand(id)) throw Object.assign(new Error('Marka bulunamadı'), { statusCode: 404 })
  if (q.brandProductCount(id) > 0)
    throw Object.assign(new Error('Bu markaya bağlı ürün var — önce ürünlerin markasını değiştirin'), { statusCode: 409 })
  q.deleteBrand(id)
}

// ── Ürün servisleri ──
export function productsService(opts) { return q.listProducts(opts) }
// existing verildiğinde (update) gövdeden atlanan alanlar mevcut değerden korunur —
// böylece brand/is_returnable göndermeyen eski istemciler bu alanları silmez.
function productFields(data, existing = null) {
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k)
  const upc = parseInt(data.units_per_case) || 1
  const cpp = parseInt(data.cases_per_pallet) || 1
  if (upc < 1 || cpp < 1) throw Object.assign(new Error('Koli/palet adedi 1 veya daha büyük olmalı'), { statusCode: 400 })
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
    min_level: Math.max(0, parseInt(data.min_level) || 0),
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
  q.updateProduct(id, { ...productFields(data, existing), is_active: data.is_active !== false })
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
  assertAvailableUnit(product, data.input_unit)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.move_date || '')) throw Object.assign(new Error('Tarih YYYY-MM-DD olmalı'), { statusCode: 400 })
  if (requireZone) {
    if (!data.zone_id || !q.getZone(data.zone_id)) throw Object.assign(new Error('Bölge seçilmeli'), { statusCode: 400 })
  }
  return { product, qty }
}

function buildAllocationPlans(rows, { releaseOutMovementId } = {}) {
  const lotsByProduct = new Map()
  const plans = []
  for (const row of rows) {
    if (!lotsByProduct.has(row.product_id)) {
      lotsByProduct.set(row.product_id, q.openIntakeLots(row.product_id, { releaseOutMovementId }).map(lot => ({ ...lot })))
    }
    const lots = lotsByProduct.get(row.product_id)
    let need = row.qty_base
    const allocations = []
    for (const lot of lots) {
      if (need <= 0) break
      if (lot.remaining_base <= 0) continue
      const take = Math.min(need, lot.remaining_base)
      allocations.push({ in_movement_id: lot.id, qty_base: take })
      lot.remaining_base -= take
      need -= take
    }
    if (need > 0) {
      const product = q.getProduct(row.product_id)
      throw Object.assign(new Error(`${product?.name || 'Ürün'} için irsaliye stok yetersiz`), { statusCode: 409 })
    }
    plans.push({ movement: row, allocations })
  }
  return plans
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
  const row = {
    type: 'out', product_id: product.id, zone_id: data.zone_id, move_date: data.move_date,
    qty_base: toBase(product, qty, data.input_unit), input_qty: qty, input_unit: data.input_unit,
    waybill_no: null, note: data.note?.trim() || null, created_by: userId || null,
  }
  const [id] = q.createMovementsBatchWithAllocations(buildAllocationPlans([row]))
  checkLowStock([product.id])
  return id
}

export function deleteMovementService(id) {
  if (!q.getMovement(id)) throw Object.assign(new Error('Hareket bulunamadı'), { statusCode: 404 })
  q.deleteMovement(id)
}

export function updateDistributionService(id, data, userId) {
  const existing = q.getMovement(id)
  if (!existing) throw Object.assign(new Error('Hareket bulunamadı'), { statusCode: 404 })
  if (existing.type !== 'out') throw Object.assign(new Error('Sadece dağıtım kaydı düzenlenebilir'), { statusCode: 400 })
  const { product, qty } = validateMovement(data, true)
  const row = {
    type: 'out', product_id: product.id, zone_id: data.zone_id, move_date: data.move_date,
    qty_base: toBase(product, qty, data.input_unit), input_qty: qty, input_unit: data.input_unit,
    waybill_no: null, note: data.note?.trim() || null, created_by: existing.created_by || userId || null,
  }
  const [plan] = buildAllocationPlans([row], { releaseOutMovementId: id })
  if (!q.updateMovementWithAllocations(id, plan)) throw Object.assign(new Error('Hareket güncellenemedi'), { statusCode: 500 })
  checkLowStock([existing.product_id, product.id])
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
    allocation_human: m.allocated_base ? humanize(m, m.allocated_base) : null,
    intake_allocated_human: m.intake_allocated_base ? humanize(m, m.intake_allocated_base) : null,
    remaining_human: m.remaining_base != null ? humanize(m, m.remaining_base) : null,
  }))
}

// ── Toplu dağıtım (yapılandırılmış satırlar) ──
export function batchDistributeService(data, userId) {
  const batchDate = data?.move_date
  if (batchDate && !/^\d{4}-\d{2}-\d{2}$/.test(batchDate)) throw Object.assign(new Error('Tarih YYYY-MM-DD olmalı'), { statusCode: 400 })
  const lines = Array.isArray(data.lines) ? data.lines.filter(l => Number(l.input_qty) > 0) : []
  if (lines.length === 0) throw Object.assign(new Error('En az bir dağıtım satırı gerekli'), { statusCode: 400 })
  const rows = lines.map(l => {
    const moveDate = l.move_date || batchDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(moveDate || '')) throw Object.assign(new Error('Tarih YYYY-MM-DD olmalı'), { statusCode: 400 })
    const { product, qty } = validateMovement({ ...l, move_date: moveDate }, true)
    return {
      type: 'out', product_id: product.id, zone_id: l.zone_id, move_date: moveDate,
      qty_base: toBase(product, qty, l.input_unit), input_qty: qty, input_unit: l.input_unit,
      waybill_no: null, note: data.note?.trim() || null, created_by: userId || null,
    }
  })
  const ids = q.createMovementsBatchWithAllocations(buildAllocationPlans(rows))
  checkLowStock(rows.map(r => r.product_id))
  return ids
}

// ── Serbest metin dağıtım ayrıştırıcı ──
// "A blok yemekhaneye 5 koli 0.5, 10 damacana gönderildi" → yapılandırılmış satırlar
const GENERIC_PRODUCT_WORDS = new Set(['l', 'lt', 'ml', 'su', 'sise', 'şişe', 'water'])
// Miktar birimleri ürün ismine/etiketine ANAHTAR olamaz: metinde "2 palet 0.33"
// yazınca "palet" kelimesi "Tahta Palet" ürününü yanlış eşleştirir. Stop-word olarak dışla.
const UNIT_WORDS = new Set(['palet', 'koli', 'adet', 'kutu'])

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
      if (product && !availableUnits(product).includes(unit)) issues.push('birim')
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
  if (!['adet', 'koli', 'palet'].includes(line.input_unit)) throw Object.assign(new Error('Geçersiz birim'), { statusCode: 400 })
  assertAvailableUnit(product, line.input_unit)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveDate || '')) throw Object.assign(new Error('Tarih YYYY-MM-DD olmalı'), { statusCode: 400 })
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
  if (!q.getReturn(id)) throw Object.assign(new Error('İade kaydı bulunamadı'), { statusCode: 404 })
  q.deleteReturn(id)
}

export function returnsService(filters) {
  return q.listReturns(filters).map(r => ({ ...r, qty_human: humanize(r, r.qty_base) }))
}

export function depositService({ from, to } = {}) {
  return q.depositBalances({ from, to }).map(d => {
    const outstanding = d.total_in - d.total_return
    return {
      product_id: d.id, name: d.name, brand_id: d.brand_id, brand_name: d.brand_name || null,
      unit_label: d.unit_label,
      total_in: d.total_in, total_return: d.total_return, period_return: d.period_return, outstanding,
      total_in_human: humanize(d, d.total_in),
      total_return_human: humanize(d, d.total_return),
      period_return_human: humanize(d, d.period_return),
      outstanding_human: humanize(d, outstanding),
    }
  })
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
    return { zone_id: z.id, zone_name: z.name, cells, total_base: rowTotal }
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
  const brandOrder = []
  const seen = new Set()
  for (const c of columns) {
    const key = c.brand_id == null ? 'null' : String(c.brand_id)
    if (!seen.has(key)) {
      seen.add(key)
      brandOrder.push({ brand_id: c.brand_id, brand_name: c.brand_name, product_ids: [] })
    }
    brandOrder.find(b => (b.brand_id == null ? 'null' : String(b.brand_id)) === key).product_ids.push(c.product_id)
  }

  return { from: from || null, to: to || null, brands: brandOrder, columns, rows, colTotals, grandTotal }
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
  const deposit = depositService({ from, to })
  const totals = {
    period_in: flow.period_in,
    period_out: flow.period_out,
    balance: stock.reduce((s, p) => s + p.balance, 0),
    low_count: stock.filter(p => p.low).length,
    period_return: deposit.reduce((s, d) => s + d.period_return, 0),
    outstanding: deposit.reduce((s, d) => s + d.outstanding, 0),
  }
  return { stock, zones, daily, totals, deposit, group }
}
