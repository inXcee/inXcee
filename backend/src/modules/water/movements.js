import * as q from './queries.js'
import { INPUT_UNITS, assertAvailableUnit, humanize, toBase } from './units.js'
import { assertMonthUnlocked } from './reconciliation.js'
import { checkLowStock } from './notifications.js'
import { normalizeIntakeLot } from './lot-fields.js'
import { isIsoDate } from '../../shared/validation/date.js'
import { istanbulDate } from '../../shared/time.js'

const errorWithStatus = (message, statusCode) => Object.assign(new Error(message), { statusCode })
const lotCanServe = (lot, moveDate) => {
  if (lot.expiry_tracking && !lot.expiry_date) return false
  return !lot.expiry_date || lot.expiry_date >= moveDate
}

function validateMovement(data, requireZone) {
  const product = q.getProduct(data.product_id)
  if (!product) throw errorWithStatus('Ürün bulunamadı', 400)
  const quantity = Number(data.input_qty)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw errorWithStatus('Miktar 0’dan büyük olmalı', 400)
  }
  if (!INPUT_UNITS.includes(data.input_unit)) throw errorWithStatus('Geçersiz birim', 400)
  assertAvailableUnit(product, data.input_unit)
  if (!isIsoDate(data.move_date)) throw errorWithStatus('Tarih YYYY-MM-DD olmalı', 400)
  assertMonthUnlocked(data.move_date)
  if (requireZone && (!data.zone_id || !q.getZone(data.zone_id))) {
    throw errorWithStatus('Bölge seçilmeli', 400)
  }
  return { product, quantity }
}

function buildAllocationPlans(rows) {
  const lotsByProduct = new Map()
  const plans = []
  const start = q.getFifoStartDate()

  for (const row of rows) {
    if (start && row.move_date < start) {  // geçiş öncesine geç girilen dağıtım: devirle kapanmış geçmiş, lot almaz
      plans.push({ movement: row, allocations: [] })
      continue
    }
    if (!lotsByProduct.has(row.product_id)) {
      lotsByProduct.set(row.product_id, q.openIntakeLots(row.product_id).map(lot => ({ ...lot })))
    }
    const lots = lotsByProduct.get(row.product_id)
    let needed = row.qty_base
    const allocations = []
    for (const lot of lots) {
      if (needed <= 0) break
      if (lot.remaining_base <= 0) continue
      if (!lotCanServe(lot, row.move_date)) continue
      const allocated = Math.min(needed, lot.remaining_base)
      allocations.push({ in_movement_id: lot.id, qty_base: allocated })
      lot.remaining_base -= allocated
      needed -= allocated
    }
    plans.push({ movement: row, allocations })
  }
  return plans
}

function reconcileUnallocatedOut(productIds) {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : [productIds])
    .filter(Boolean)
    .map(Number))]
  const allocationRows = []

  for (const productId of ids) {
    const lots = q.openIntakeLots(productId).map(lot => ({ ...lot }))
    const needs = q.openDistributionNeeds(productId).map(row => ({ ...row }))
    for (const need of needs) {
      let remaining = need.unallocated_base || 0
      for (const lot of lots) {
        if (remaining <= 0) break
        if (lot.remaining_base <= 0) continue
        if (!lotCanServe(lot, need.move_date)) continue
        const allocated = Math.min(remaining, lot.remaining_base)
        allocationRows.push({
          out_movement_id: need.id,
          in_movement_id: lot.id,
          qty_base: allocated,
        })
        lot.remaining_base -= allocated
        remaining -= allocated
      }
    }
  }
  const matched = q.addMovementAllocations(allocationRows)
  q.clearResolvedReviews(ids)
  return matched
}

export function reconcileProductAllocations(productIds) {
  return reconcileUnallocatedOut(productIds)
}

// FIFO başlangıç (geçiş) tarihini ayarla ya da kaldır (null) ve eşleştirmeyi buna göre yeniden kur — tek transaction.
// Tarihi aşan eşleşmeler serbest bırakılır, tarih öncesi dağıtımların inceleme işareti kalkar, tüm ürünler yeniden
// eşleştirilir. Serbest kalıp hâlâ karşılanamayan (tarih sonrası) dağıtım incelemeye düşer.
export function setFifoStartService(date, { today = istanbulDate() } = {}) {
  const value = date === undefined || date === null || date === '' ? null : String(date)
  if (value !== null && !isIsoDate(value)) throw errorWithStatus('Tarih YYYY-MM-DD olmalı', 400)
  if (value && value > today) throw errorWithStatus('Başlangıç tarihi ileri bir gün olamaz', 400)
  return q.runInTransaction(() => {
    const before = q.getFifoStartDate()
    q.writeFifoStartDate(value)
    const affected = value ? q.crossingPostStartOutIds(value) : []
    const released = value ? q.releaseCrossingAllocations(value) : 0
    const clearedOld = value ? q.clearReviewsBefore(value) : 0
    const matched = reconcileUnallocatedOut(q.movementProductIds())
    const flagged = q.flagReviewForUnallocated(affected)
    return { before, date: value, released, cleared_old_reviews: clearedOld, matched, flagged, open_reviews: q.reviewQueue().length }
  })
}

export function fifoStartService() {
  return q.getFifoStartSetting()
}

export function createIntakeService(data, userId) {
  const { product, quantity } = validateMovement(data, false)
  const lot = normalizeIntakeLot(data, product, data.move_date)
  return q.runInTransaction(() => {
    const id = q.createMovement({
      type: 'in',
      product_id: product.id,
      zone_id: null,
      move_date: data.move_date,
      qty_base: toBase(product, quantity, data.input_unit),
      input_qty: quantity,
      input_unit: data.input_unit,
      waybill_no: data.waybill_no?.trim() || null,
      note: data.note?.trim() || null,
      created_by: userId || null,
      ...lot,
    })
    reconcileUnallocatedOut(product.id)
    return id
  })
}

export function createDistributionService(data, userId) {
  const { product, quantity } = validateMovement(data, true)
  const movement = {
    type: 'out',
    product_id: product.id,
    zone_id: data.zone_id,
    move_date: data.move_date,
    qty_base: toBase(product, quantity, data.input_unit),
    input_qty: quantity,
    input_unit: data.input_unit,
    waybill_no: null,
    note: data.note?.trim() || null,
    created_by: userId || null,
  }
  const [id] = q.createMovementsBatchWithAllocations(buildAllocationPlans([movement]))
  q.flagReviewForUnallocated([id])
  checkLowStock([product.id])
  return id
}

// Boş kap dolaşımı = girişler − iadeler. İadesi yapılmış bir girişin silinmesi / küçültülmesi / başka ürüne
// taşınması dolaşımı eksiye düşürmesin — iade oluştururken (assertReturnCapacity) korunan değişmezin aynısı.
// Transaction içinde: önce depositSnapshot (değişiklikten ÖNCE), sonra assertDepositNotWorse (SONRA); atınca
// değişiklik geri alınır. Yalnız dolaşımı eksiye DÜŞÜREN / eksiyi BÜYÜTEN değişiklik engellenir — zaten eksi
// bir üründe ilgisiz düzeltme (ör. girişi artırmak) kilitlenmez. Hermes Excel geri alması iadeleri önce
// sildiği için (iade → dağıtım → giriş) bu kontrole takılmaz.
function depositBalance(productId) {
  const { total_in, total_return } = q.depositPosition(productId)
  return total_in - total_return
}

function depositSnapshot(productIds) {
  const snap = new Map()
  for (const productId of new Set(productIds)) {
    const product = q.getProduct(productId)
    if (product?.is_returnable) snap.set(productId, { product, before: depositBalance(productId) })
  }
  return snap
}

function assertDepositNotWorse(snap) {
  for (const [productId, { product, before }] of snap) {
    const after = depositBalance(productId)
    if (after < 0 && after < before) {
      const { total_in, total_return } = q.depositPosition(productId)
      throw errorWithStatus(
        `${product.name}: bu değişiklikle iade edilen boş kap (${humanize(product, total_return)}) girişleri `
        + `(${humanize(product, total_in)}) aşar — önce ilgili iadeleri silin ya da düzeltin.`,
        409,
      )
    }
  }
}

// Giriş (irsaliye) kaydını düzenle — yanlış girilen tır/irsaliye düzeltmesi.
// Bu girişin beslediği tahsisler serbest bırakılır, kayıt güncellenir ve
// etkilenen ürünler için FIFO yeniden uzlaştırılır (karşılanamayan dağıtım
// inceleme kuyruğuna düşer). Ay kilidi hem eski hem yeni tarih için geçerlidir.
export function updateIntakeService(id, data, userId) {
  const existing = q.getMovement(id)
  if (!existing) throw errorWithStatus('Hareket bulunamadı', 404)
  if (existing.type !== 'in') throw errorWithStatus('Sadece giriş kaydı düzenlenebilir', 400)
  assertMonthUnlocked(existing.move_date)
  const { product, quantity } = validateMovement(data, false)
  assertMonthUnlocked(data.move_date)
  const lot = normalizeIntakeLot(data, product, data.move_date)
  return q.runInTransaction(() => {
    const deposit = depositSnapshot([existing.product_id, product.id])
    const freed = q.releaseIntakeAllocations(id)
    const ok = q.updateIntakeMovement(id, {
      product_id: product.id,
      move_date: data.move_date,
      qty_base: toBase(product, quantity, data.input_unit),
      input_qty: quantity,
      input_unit: data.input_unit,
      waybill_no: data.waybill_no?.trim() || null,
      note: data.note?.trim() || null,
      ...lot,
    })
    if (!ok) throw errorWithStatus('Giriş güncellenemedi', 500)
    assertDepositNotWorse(deposit)
    reconcileUnallocatedOut([existing.product_id, product.id])
    if (freed.length) q.flagReviewForUnallocated([...new Set(freed.map(f => f.out_movement_id))])
    checkLowStock([existing.product_id, product.id])
    return q.getMovement(id)
  })
}

// force=true: dağıtımlara tahsis edilmiş girişi de sil. Tahsisler çözülür,
// serbest kalan dağıtımlar başka lotlardan karşılanır veya inceleme kuyruğuna düşer.
export function deleteMovementService(id, { force = false } = {}) {
  return q.runInTransaction(() => {
    const existing = q.getMovement(id)
    if (!existing) throw errorWithStatus('Hareket bulunamadı', 404)
    assertMonthUnlocked(existing.move_date)

    if (existing.type === 'in') {
      const usage = q.intakeAllocationUsage(id)
      if (usage.allocated_base > 0 && !force) {
        throw errorWithStatus(
          `Bu giriş ${usage.distribution_count} dağıtıma toplam ${usage.allocated_base} birim tahsis edilmiş. Önce bağlı dağıtımları düzenleyin/silin veya "bağlantıları çözerek sil" seçeneğini kullanın.`,
          409,
        )
      }
      const deposit = depositSnapshot([existing.product_id])
      const freed = usage.allocated_base > 0 ? q.releaseIntakeAllocations(id) : []
      q.deleteMovement(id)
      assertDepositNotWorse(deposit)
      if (freed.length) {
        reconcileUnallocatedOut(existing.product_id)
        q.flagReviewForUnallocated([...new Set(freed.map(f => f.out_movement_id))])
      }
      return existing
    }

    q.deleteMovement(id)
    reconcileUnallocatedOut(existing.product_id)
    return existing
  })
}

// Bir dönemdeki DAĞITIM (out) kayıtlarını topluca sil — giriş/iade kayıtlarına
// DOKUNULMAZ. Ay kilidine saygılıdır (kilitli ay → 423, hiçbir şey silinmez);
// silinen ürünler için serbest kalan lotlar FIFO ile yeniden uzlaştırılır.
export function clearDistributionsService({ from, to } = {}) {
  if (!isIsoDate(from) || !isIsoDate(to)) throw errorWithStatus('Tarih YYYY-MM-DD olmalı', 400)
  if (from > to) throw errorWithStatus('Başlangıç tarihi bitişten sonra olamaz', 400)
  return q.runInTransaction(() => {
    const rows = q.listMovements({ type: 'out', from, to, limit: 100000 })
    for (const m of rows) assertMonthUnlocked(m.move_date)
    const productIds = new Set()
    for (const m of rows) { q.deleteMovement(m.id); productIds.add(m.product_id) }
    if (productIds.size) reconcileUnallocatedOut([...productIds])
    return { deleted: rows.length, from, to }
  })
}

export function updateDistributionService(id, data, userId) {
  const existing = q.getMovement(id)
  if (!existing) throw errorWithStatus('Hareket bulunamadı', 404)
  if (existing.type !== 'out') throw errorWithStatus('Sadece dağıtım kaydı düzenlenebilir', 400)
  assertMonthUnlocked(existing.move_date)
  const { product, quantity } = validateMovement(data, true)
  const movement = {
    type: 'out',
    product_id: product.id,
    zone_id: data.zone_id,
    move_date: data.move_date,
    qty_base: toBase(product, quantity, data.input_unit),
    input_qty: quantity,
    input_unit: data.input_unit,
    waybill_no: null,
    note: data.note?.trim() || null,
    created_by: existing.created_by || userId || null,
  }

  q.runInTransaction(() => {
    if (!q.updateMovementWithAllocations(id, { movement, allocations: [] })) {
      throw errorWithStatus('Hareket güncellenemedi', 500)
    }
    reconcileUnallocatedOut([existing.product_id, product.id])
    q.flagReviewForUnallocated([id])
    // Geçiş öncesine taşınan dağıtım devirle kapanmış geçmiştir: eski inceleme işareti kalırsa
    // (flag yalnız işaretler, eşleşme de olmayacağı için clearResolvedReviews de kaldırmaz) kuyrukta takılı kalır.
    const start = q.getFifoStartDate()
    if (start && movement.move_date < start) q.clearReviewsBefore(start, [id])
  })
  checkLowStock([existing.product_id, product.id])
}

// PUT /movements/:id tek uç — kayıt türüne göre doğru servise yönlendirir.
export function updateMovementService(id, data, userId) {
  const existing = q.getMovement(id)
  if (!existing) throw errorWithStatus('Hareket bulunamadı', 404)
  return existing.type === 'in'
    ? updateIntakeService(id, data, userId)
    : updateDistributionService(id, data, userId)
}

export function batchIntakeService(data, userId) {
  if (!isIsoDate(data?.move_date)) throw errorWithStatus('Tarih YYYY-MM-DD olmalı', 400)
  const lines = Array.isArray(data.lines) ? data.lines.filter(line => Number(line.input_qty) > 0) : []
  if (lines.length === 0) throw errorWithStatus('En az bir ürün satırı gerekli', 400)

  const rows = lines.map(line => {
    const { product, quantity } = validateMovement({ ...line, move_date: data.move_date }, false)
    const lot = normalizeIntakeLot(line, product, data.move_date)
    return {
      type: 'in',
      product_id: product.id,
      zone_id: null,
      move_date: data.move_date,
      qty_base: toBase(product, quantity, line.input_unit),
      input_qty: quantity,
      input_unit: line.input_unit,
      waybill_no: data.waybill_no?.trim() || null,
      note: (line.note || data.note)?.trim() || null,
      created_by: userId || null,
      ...lot,
    }
  })
  return q.runInTransaction(() => {
    const ids = q.createMovementsBatch(rows)
    const matched = reconcileUnallocatedOut(rows.map(row => row.product_id))
    return { ids, matched }
  })
}

export function movementsService(filters) {
  return q.listMovements(filters).map(movement => ({
    ...movement,
    qty_human: humanize(movement, movement.qty_base),
    allocation_human: movement.allocated_base ? humanize(movement, movement.allocated_base) : null,
    intake_allocated_human: movement.intake_allocated_base
      ? humanize(movement, movement.intake_allocated_base)
      : null,
    remaining_human: movement.remaining_base != null ? humanize(movement, movement.remaining_base) : null,
    unallocated_human: movement.unallocated_base ? humanize(movement, movement.unallocated_base) : null,
    allocation_status: movement.type === 'out'
      ? (movement.unallocated_base > 0 ? 'pending' : 'matched')
      : (movement.remaining_base > 0 ? 'open' : 'closed'),
  }))
}

export function batchDistributeService(data, userId) {
  const batchDate = data?.move_date
  if (batchDate && !isIsoDate(batchDate)) throw errorWithStatus('Tarih YYYY-MM-DD olmalı', 400)
  const lines = Array.isArray(data.lines) ? data.lines.filter(line => Number(line.input_qty) > 0) : []
  if (lines.length === 0) throw errorWithStatus('En az bir dağıtım satırı gerekli', 400)

  const rows = lines.map(line => {
    const moveDate = line.move_date || batchDate
    if (!isIsoDate(moveDate)) throw errorWithStatus('Tarih YYYY-MM-DD olmalı', 400)
    const { product, quantity } = validateMovement({ ...line, move_date: moveDate }, true)
    return {
      type: 'out',
      product_id: product.id,
      zone_id: line.zone_id,
      move_date: moveDate,
      qty_base: toBase(product, quantity, line.input_unit),
      input_qty: quantity,
      input_unit: line.input_unit,
      waybill_no: null,
      note: data.note?.trim() || null,
      created_by: userId || null,
    }
  })
  const ids = q.createMovementsBatchWithAllocations(buildAllocationPlans(rows))
  q.flagReviewForUnallocated(ids)
  checkLowStock(rows.map(row => row.product_id))
  return ids
}
