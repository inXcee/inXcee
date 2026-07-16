import { getDB } from '../../shared/db/index.js'

// Ürün listesi marka bilgisiyle; sıralama INDEX Excel'ine göre (marka → ürün sort_order).
const PRODUCT_SELECT = `
  SELECT p.*, b.name AS brand_name, b.sort_order AS brand_sort
  FROM water_products p
  LEFT JOIN water_brands b ON b.id = p.brand_id
`
const PRODUCT_ORDER = 'ORDER BY COALESCE(b.sort_order, 999), p.sort_order, p.name'

// ── Markalar (tedarikçiler) ──
export function listBrands({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE is_active = 1'
  return getDB().prepare(`SELECT * FROM water_brands ${where} ORDER BY sort_order, name`).all()
}
export function getBrand(id) {
  return getDB().prepare('SELECT * FROM water_brands WHERE id=?').get(id)
}
export function getBrandByName(name) {
  return getDB().prepare('SELECT * FROM water_brands WHERE name=?').get(name)
}
export function createBrand({ name, sort_order, color }) {
  return getDB().prepare('INSERT INTO water_brands(name, sort_order, color) VALUES(?,?,?)')
    .run(name, sort_order || 0, color || null).lastInsertRowid
}
export function updateBrand(id, { name, sort_order, is_active, color }) {
  return getDB().prepare('UPDATE water_brands SET name=?, sort_order=?, is_active=?, color=? WHERE id=?')
    .run(name, sort_order || 0, is_active ? 1 : 0, color || null, id).changes > 0
}
export function brandProductCount(id) {
  return getDB().prepare('SELECT COUNT(*) c FROM water_products WHERE brand_id=?').get(id).c
}
export function deleteBrand(id) {
  return getDB().prepare('DELETE FROM water_brands WHERE id=?').run(id).changes > 0
}

// ── Ürünler ──
export function listProducts({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE p.is_active = 1'
  return getDB().prepare(`${PRODUCT_SELECT} ${where} ${PRODUCT_ORDER}`).all()
}
export function getProduct(id) {
  return getDB().prepare(`${PRODUCT_SELECT} WHERE p.id=?`).get(id)
}
export function createProduct({ name, unit_label, units_per_case, cases_per_pallet, min_level, critical_level, lead_time_days, safety_stock_days, expiry_tracking, expiry_warning_days, brand_id, is_returnable, sort_order }) {
  return getDB().prepare(`
    INSERT INTO water_products(
      name, unit_label, units_per_case, cases_per_pallet, min_level, critical_level,
      lead_time_days, safety_stock_days, expiry_tracking, expiry_warning_days,
      brand_id, is_returnable, sort_order
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    name, unit_label || 'adet', units_per_case || 1, cases_per_pallet || 1, min_level || 0, critical_level || 0,
    lead_time_days ?? 7, safety_stock_days ?? 3, expiry_tracking ? 1 : 0, expiry_warning_days ?? 30,
    brand_id || null, is_returnable ? 1 : 0, sort_order || 0,
  ).lastInsertRowid
}
export function updateProduct(id, { name, unit_label, units_per_case, cases_per_pallet, is_active, min_level, critical_level, lead_time_days, safety_stock_days, expiry_tracking, expiry_warning_days, brand_id, is_returnable, sort_order }) {
  return getDB().prepare(`
    UPDATE water_products SET name=?, unit_label=?, units_per_case=?, cases_per_pallet=?, is_active=?, min_level=?, critical_level=?,
      lead_time_days=?, safety_stock_days=?, expiry_tracking=?, expiry_warning_days=?,
      brand_id=?, is_returnable=?, sort_order=? WHERE id=?
  `).run(name, unit_label || 'adet', units_per_case || 1, cases_per_pallet || 1, is_active ? 1 : 0, min_level || 0, critical_level || 0,
    lead_time_days ?? 7, safety_stock_days ?? 3, expiry_tracking ? 1 : 0, expiry_warning_days ?? 30,
    brand_id || null, is_returnable ? 1 : 0, sort_order || 0, id).changes > 0
}
export function getProductBalance(productId) {
  const mv = getDB().prepare(`
    SELECT COALESCE(SUM(CASE WHEN type='in' THEN qty_base ELSE -qty_base END), 0) AS bal
    FROM water_movements WHERE product_id=?
  `).get(productId)
  const adj = getDB().prepare(`
    SELECT COALESCE(SUM(CASE WHEN direction='in' THEN qty_base ELSE -qty_base END), 0) AS net
    FROM water_adjustments WHERE product_id=?
  `).get(productId)
  return mv.bal + adj.net
}
export function productMovementCount(id) {
  return getDB().prepare('SELECT COUNT(*) c FROM water_movements WHERE product_id=?').get(id).c
}
export function deleteProduct(id) {
  return getDB().prepare('DELETE FROM water_products WHERE id=?').run(id).changes > 0
}

// ── Bölgeler ──
export function listZones({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE is_active = 1'
  return getDB().prepare(`SELECT * FROM water_zones ${where} ORDER BY name`).all()
}
export function getZone(id) {
  return getDB().prepare('SELECT * FROM water_zones WHERE id=?').get(id)
}
export function createZone({ name, code, note, expected_monthly }) {
  return getDB().prepare('INSERT INTO water_zones(name, code, note, expected_monthly) VALUES(?,?,?,?)')
    .run(name, code || null, note || null, expected_monthly || 0).lastInsertRowid
}
export function updateZone(id, { name, code, note, is_active, expected_monthly }) {
  return getDB().prepare('UPDATE water_zones SET name=?, code=?, note=?, is_active=?, expected_monthly=? WHERE id=?')
    .run(name, code || null, note || null, is_active ? 1 : 0, expected_monthly || 0, id).changes > 0
}
export function zoneMovementCount(id) {
  return getDB().prepare('SELECT COUNT(*) c FROM water_movements WHERE zone_id=?').get(id).c
}
export function deleteZone(id) {
  return getDB().prepare('DELETE FROM water_zones WHERE id=?').run(id).changes > 0
}

// ── Hareketler ──
export function runInTransaction(work) {
  return getDB().transaction(work)()
}

export function createMovement(m) {
  return getDB().prepare(`
    INSERT INTO water_movements(
      type, product_id, zone_id, move_date, qty_base, input_qty, input_unit,
      waybill_no, note, created_by, lot_no, production_date, expiry_date
    ) VALUES(
      @type, @product_id, @zone_id, @move_date, @qty_base, @input_qty, @input_unit,
      @waybill_no, @note, @created_by, @lot_no, @production_date, @expiry_date
    )
  `).run(m).lastInsertRowid
}
export function getMovement(id) {
  return getDB().prepare('SELECT * FROM water_movements WHERE id=?').get(id)
}

// Birden çok hareketi tek transaction'da ekler (toplu irsaliye / toplu dağıtım)
export function createMovementsBatch(movements) {
  const db = getDB()
  const stmt = db.prepare(`
    INSERT INTO water_movements(
      type, product_id, zone_id, move_date, qty_base, input_qty, input_unit,
      waybill_no, note, created_by, lot_no, production_date, expiry_date
    ) VALUES(
      @type, @product_id, @zone_id, @move_date, @qty_base, @input_qty, @input_unit,
      @waybill_no, @note, @created_by, @lot_no, @production_date, @expiry_date
    )
  `)
  const tx = db.transaction((rows) => {
    const ids = []
    for (const r of rows) ids.push(stmt.run(r).lastInsertRowid)
    return ids
  })
  return tx(movements)
}
export function createMovementsBatchWithAllocations(plans) {
  const db = getDB()
  const insertMovement = db.prepare(`
    INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit, waybill_no, note, created_by)
    VALUES(@type, @product_id, @zone_id, @move_date, @qty_base, @input_qty, @input_unit, @waybill_no, @note, @created_by)
  `)
  const insertAllocation = db.prepare(`
    INSERT INTO water_movement_allocations(out_movement_id, in_movement_id, qty_base)
    VALUES(?,?,?)
  `)
  const tx = db.transaction((rows) => {
    const ids = []
    for (const plan of rows) {
      const id = insertMovement.run(plan.movement).lastInsertRowid
      ids.push(id)
      for (const alloc of plan.allocations || []) {
        insertAllocation.run(id, alloc.in_movement_id, alloc.qty_base)
      }
    }
    return ids
  })
  return tx(plans)
}

export function addMovementAllocations(rows) {
  if (!rows?.length) return 0
  const db = getDB()
  const stmt = db.prepare(`
    INSERT INTO water_movement_allocations(out_movement_id, in_movement_id, qty_base)
    VALUES(@out_movement_id, @in_movement_id, @qty_base)
    ON CONFLICT(out_movement_id, in_movement_id)
    DO UPDATE SET qty_base = water_movement_allocations.qty_base + excluded.qty_base
  `)
  const tx = db.transaction((list) => {
    let count = 0
    for (const r of list) {
      stmt.run(r)
      count += 1
    }
    return count
  })
  return tx(rows)
}

export function intakeAllocationUsage(inMovementId) {
  return getDB().prepare(`
    SELECT COUNT(DISTINCT out_movement_id) AS distribution_count,
           COALESCE(SUM(qty_base), 0) AS allocated_base
    FROM water_movement_allocations
    WHERE in_movement_id=?
  `).get(inMovementId)
}

export function releaseIntakeAllocations(inMovementId) {
  const db = getDB()
  const rows = db.prepare(`
    SELECT out_movement_id, qty_base
    FROM water_movement_allocations
    WHERE in_movement_id=?
    ORDER BY out_movement_id
  `).all(inMovementId)
  if (rows.length) {
    db.prepare('DELETE FROM water_movement_allocations WHERE in_movement_id=?').run(inMovementId)
  }
  return rows
}

export function deleteMovement(id) {
  return getDB().prepare('DELETE FROM water_movements WHERE id=?').run(id).changes > 0
}

export function updateMovementWithAllocations(id, plan) {
  const db = getDB()
  const updateMovement = db.prepare(`
    UPDATE water_movements
    SET product_id=@product_id, zone_id=@zone_id, move_date=@move_date, qty_base=@qty_base,
        input_qty=@input_qty, input_unit=@input_unit, waybill_no=@waybill_no, note=@note
    WHERE id=@id AND type='out'
  `)
  const deleteAllocations = db.prepare('DELETE FROM water_movement_allocations WHERE out_movement_id=?')
  const insertAllocation = db.prepare(`
    INSERT INTO water_movement_allocations(out_movement_id, in_movement_id, qty_base)
    VALUES(?,?,?)
  `)
  const tx = db.transaction(() => {
    const changed = updateMovement.run({ ...plan.movement, id }).changes
    if (!changed) return false
    deleteAllocations.run(id)
    for (const alloc of plan.allocations || []) {
      insertAllocation.run(id, alloc.in_movement_id, alloc.qty_base)
    }
    return true
  })
  return tx()
}

export function openIntakeLots(productId) {
  return getDB().prepare(`
    SELECT mv.id, mv.product_id, mv.move_date, mv.waybill_no, mv.qty_base,
           mv.lot_no, mv.production_date, mv.expiry_date, mv.lot_status,
           p.expiry_tracking,
           COALESCE(SUM(wa.qty_base), 0) AS allocated_base,
           mv.qty_base - COALESCE(SUM(wa.qty_base), 0) AS remaining_base
    FROM water_movements mv
    JOIN water_products p ON p.id=mv.product_id
    LEFT JOIN water_movement_allocations wa ON wa.in_movement_id = mv.id
    WHERE mv.type='in' AND mv.product_id=? AND mv.lot_status='active'
    GROUP BY mv.id
    HAVING remaining_base > 0
    ORDER BY CASE WHEN mv.expiry_date IS NULL THEN 1 ELSE 0 END,
      mv.expiry_date ASC, mv.move_date ASC, mv.id ASC
  `).all(productId)
}

export function getIntakeLot(id) {
  return getDB().prepare(`
    SELECT mv.*, p.name AS product_name, p.unit_label, p.units_per_case, p.cases_per_pallet,
      p.expiry_tracking, p.expiry_warning_days, b.name AS brand_name,
      COALESCE((SELECT SUM(wa.qty_base) FROM water_movement_allocations wa WHERE wa.in_movement_id=mv.id), 0) AS allocated_base,
      mv.qty_base - COALESCE((SELECT SUM(wa.qty_base) FROM water_movement_allocations wa WHERE wa.in_movement_id=mv.id), 0) AS remaining_base,
      u.full_name AS lot_status_updated_by_name
    FROM water_movements mv
    JOIN water_products p ON p.id=mv.product_id
    LEFT JOIN water_brands b ON b.id=p.brand_id
    LEFT JOIN users u ON u.id=mv.lot_status_updated_by
    WHERE mv.id=? AND mv.type='in'
  `).get(id)
}

export function updateIntakeLot(id, data) {
  return getDB().prepare(`
    UPDATE water_movements
    SET lot_no=@lot_no, production_date=@production_date, expiry_date=@expiry_date,
      lot_status=@lot_status, lot_status_note=@lot_status_note,
      lot_status_updated_by=@lot_status_updated_by, lot_status_updated_at=CURRENT_TIMESTAMP
    WHERE id=@id AND type='in'
  `).run({ ...data, id }).changes > 0
}

export function listIntakeLots({ product_id } = {}) {
  const params = []
  let productFilter = ''
  if (product_id) {
    productFilter = 'AND mv.product_id=?'
    params.push(product_id)
  }
  return getDB().prepare(`
    WITH lots AS (
      SELECT mv.*, p.name AS product_name, p.unit_label, p.units_per_case, p.cases_per_pallet,
        p.expiry_tracking, p.expiry_warning_days, b.name AS brand_name,
        COALESCE((SELECT SUM(wa.qty_base) FROM water_movement_allocations wa WHERE wa.in_movement_id=mv.id), 0) AS allocated_base,
        mv.qty_base - COALESCE((SELECT SUM(wa.qty_base) FROM water_movement_allocations wa WHERE wa.in_movement_id=mv.id), 0) AS remaining_base,
        u.full_name AS lot_status_updated_by_name
      FROM water_movements mv
      JOIN water_products p ON p.id=mv.product_id
      LEFT JOIN water_brands b ON b.id=p.brand_id
      LEFT JOIN users u ON u.id=mv.lot_status_updated_by
      WHERE mv.type='in'
        AND (p.expiry_tracking=1 OR mv.lot_no IS NOT NULL OR mv.expiry_date IS NOT NULL OR mv.lot_status!='active')
        ${productFilter}
    )
    SELECT * FROM lots
    WHERE remaining_base > 0
    ORDER BY CASE WHEN lot_status='quarantined' THEN 0 ELSE 1 END,
      CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
      expiry_date ASC, move_date ASC, id ASC
  `).all(...params)
}

export function openDistributionNeeds(productId) {
  const params = []
  let where = "mv.type='out'"
  if (productId) { where += ' AND mv.product_id=?'; params.push(productId) }
  return getDB().prepare(`
    SELECT mv.id, mv.product_id, mv.move_date, mv.qty_base,
           COALESCE(SUM(wa.qty_base), 0) AS allocated_base,
           mv.qty_base - COALESCE(SUM(wa.qty_base), 0) AS unallocated_base
    FROM water_movements mv
    LEFT JOIN water_movement_allocations wa ON wa.out_movement_id = mv.id
    WHERE ${where}
    GROUP BY mv.id
    HAVING unallocated_base > 0
    ORDER BY mv.move_date ASC, mv.id ASC
  `).all(...params)
}

export function listMovements({ type, product_id, zone_id, from, to, limit = 200 } = {}) {
  let q = `
    SELECT mv.*, p.name AS product_name, p.unit_label, p.units_per_case, p.cases_per_pallet,
           p.brand_id, p.expiry_tracking, p.expiry_warning_days,
           b.name AS brand_name, z.name AS zone_name,
           u.full_name AS created_by_name, u.username AS created_by_username,
           (
             SELECT GROUP_CONCAT(COALESCE(src.waybill_no, 'GİRİŞ #' || src.id) || ': ' || wa.qty_base, ', ')
             FROM water_movement_allocations wa
             JOIN water_movements src ON src.id = wa.in_movement_id
             WHERE wa.out_movement_id = mv.id
           ) AS source_waybills,
           (
             SELECT COALESCE(SUM(wa.qty_base), 0)
             FROM water_movement_allocations wa
             WHERE wa.out_movement_id = mv.id
           ) AS allocated_base,
           (
             SELECT COALESCE(SUM(wa.qty_base), 0)
             FROM water_movement_allocations wa
             WHERE wa.in_movement_id = mv.id
           ) AS intake_allocated_base,
            CASE WHEN mv.type='in' THEN mv.qty_base - (
              SELECT COALESCE(SUM(wa.qty_base), 0)
              FROM water_movement_allocations wa
              WHERE wa.in_movement_id = mv.id
            ) ELSE NULL END AS remaining_base,
            CASE WHEN mv.type='out' THEN mv.qty_base - (
              SELECT COALESCE(SUM(wa.qty_base), 0)
              FROM water_movement_allocations wa
              WHERE wa.out_movement_id = mv.id
            ) ELSE NULL END AS unallocated_base
    FROM water_movements mv
    JOIN water_products p ON p.id = mv.product_id
    LEFT JOIN water_brands b ON b.id = p.brand_id
    LEFT JOIN water_zones z ON z.id = mv.zone_id
    LEFT JOIN users u ON u.id = mv.created_by
    WHERE 1=1
  `
  const params = []
  if (type) { q += ' AND mv.type=?'; params.push(type) }
  if (product_id) { q += ' AND mv.product_id=?'; params.push(product_id) }
  if (zone_id) { q += ' AND mv.zone_id=?'; params.push(zone_id) }
  if (from) { q += ' AND mv.move_date>=?'; params.push(from) }
  if (to) { q += ' AND mv.move_date<=?'; params.push(to) }
  q += ' ORDER BY mv.move_date DESC, mv.id DESC LIMIT ?'
  params.push(limit)
  return getDB().prepare(q).all(...params)
}

// ── Özet sorguları (qty_base = adet cinsinden) ──
// Kalan stok TÜM ZAMANLAR üzerinden (gerçek anlık stok). Dönem giriş/çıkış ayrı hesaplanır.
export function stockByProduct() {
  return getDB().prepare(`
    SELECT p.id, p.name, p.unit_label, p.units_per_case, p.cases_per_pallet, p.min_level, p.critical_level,
      p.lead_time_days, p.safety_stock_days,
      p.brand_id, b.name AS brand_name,
      COALESCE(SUM(CASE WHEN mv.type='in'  THEN mv.qty_base END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN mv.type='out' THEN mv.qty_base END), 0) AS total_out,
      COALESCE((SELECT SUM(CASE WHEN a.direction='in' THEN a.qty_base ELSE -a.qty_base END)
                FROM water_adjustments a WHERE a.product_id = p.id), 0) AS adjust_net
    FROM water_products p
    LEFT JOIN water_brands b ON b.id = p.brand_id
    LEFT JOIN water_movements mv ON mv.product_id = p.id
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY COALESCE(b.sort_order, 999), p.sort_order, p.name
  `).all()
}

// Seçili aralıktaki giriş/çıkış (dönem KPI'ları için)
export function periodFlow({ from, to } = {}) {
  const cond = []
  const params = []
  if (from) { cond.push('move_date>=?'); params.push(from) }
  if (to) { cond.push('move_date<=?'); params.push(to) }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : ''
  const r = getDB().prepare(`
    SELECT COALESCE(SUM(CASE WHEN type='in' THEN qty_base END),0) AS period_in,
           COALESCE(SUM(CASE WHEN type='out' THEN qty_base END),0) AS period_out
    FROM water_movements ${where}
  `).get(...params)
  return r
}

export function productFlow({ from, to } = {}) {
  const join = []
  const params = []
  if (from) { join.push('mv.move_date>=?'); params.push(from) }
  if (to) { join.push('mv.move_date<=?'); params.push(to) }
  const dateClause = join.length ? `AND ${join.join(' AND ')}` : ''
  return getDB().prepare(`
    SELECT p.id, p.name, p.unit_label, p.units_per_case, p.cases_per_pallet, p.min_level,
      p.brand_id, b.name AS brand_name,
      COALESCE(SUM(CASE WHEN mv.type='in' THEN mv.qty_base END), 0) AS period_in,
      COALESCE(SUM(CASE WHEN mv.type='out' THEN mv.qty_base END), 0) AS period_out
    FROM water_products p
    LEFT JOIN water_brands b ON b.id = p.brand_id
    LEFT JOIN water_movements mv ON mv.product_id = p.id ${dateClause}
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY COALESCE(b.sort_order, 999), p.sort_order, p.name
  `).all(...params)
}

// ── Stok düzeltme / sayım fişi (W7) ──
// İşaretli net etki: in = +qty_base, out = −qty_base
export function createAdjustment(a) {
  return getDB().prepare(`
    INSERT INTO water_adjustments(product_id, move_date, direction, qty_base, input_qty, input_unit, reason, note, created_by)
    VALUES(@product_id, @move_date, @direction, @qty_base, @input_qty, @input_unit, @reason, @note, @created_by)
  `).run(a).lastInsertRowid
}
export function getAdjustment(id) {
  return getDB().prepare('SELECT * FROM water_adjustments WHERE id=?').get(id)
}
export function deleteAdjustment(id) {
  return getDB().prepare('DELETE FROM water_adjustments WHERE id=?').run(id).changes > 0
}
export function listAdjustments({ product_id, from, to, limit = 200 } = {}) {
  let sql = `
    SELECT a.*, p.name AS product_name, p.unit_label, p.units_per_case, p.cases_per_pallet,
           p.brand_id, b.name AS brand_name, u.full_name AS created_by_name
    FROM water_adjustments a
    JOIN water_products p ON p.id = a.product_id
    LEFT JOIN water_brands b ON b.id = p.brand_id
    LEFT JOIN users u ON u.id = a.created_by
    WHERE 1=1
  `
  const params = []
  if (product_id) { sql += ' AND a.product_id=?'; params.push(product_id) }
  if (from) { sql += ' AND a.move_date>=?'; params.push(from) }
  if (to) { sql += ' AND a.move_date<=?'; params.push(to) }
  sql += ' ORDER BY a.move_date DESC, a.id DESC LIMIT ?'
  params.push(limit)
  return getDB().prepare(sql).all(...params)
}

// ── Hızlı giriş şablonları (W5) ──
export function getTemplateByName(name) {
  return getDB().prepare('SELECT * FROM water_templates WHERE name=?').get(name)
}
export function listTemplates() {
  const templates = getDB().prepare('SELECT * FROM water_templates ORDER BY name').all()
  const lines = getDB().prepare(`
    SELECT l.*, z.name AS zone_name, p.name AS product_name, p.unit_label
    FROM water_template_lines l
    JOIN water_zones z ON z.id = l.zone_id
    JOIN water_products p ON p.id = l.product_id
    ORDER BY l.id
  `).all()
  const byTpl = new Map()
  for (const l of lines) { if (!byTpl.has(l.template_id)) byTpl.set(l.template_id, []); byTpl.get(l.template_id).push(l) }
  return templates.map(t => ({ ...t, lines: byTpl.get(t.id) || [] }))
}
export function createTemplate({ name, created_by, lines }) {
  const db = getDB()
  const insTpl = db.prepare('INSERT INTO water_templates(name, created_by) VALUES(?,?)')
  const insLine = db.prepare('INSERT INTO water_template_lines(template_id, zone_id, product_id, default_qty, default_unit) VALUES(?,?,?,?,?)')
  const tx = db.transaction(() => {
    const id = insTpl.run(name, created_by || null).lastInsertRowid
    for (const l of lines) insLine.run(id, l.zone_id, l.product_id, l.default_qty ?? null, l.default_unit || 'adet')
    return id
  })
  return tx()
}
export function deleteTemplate(id) {
  const db = getDB()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM water_template_lines WHERE template_id=?').run(id)
    return db.prepare('DELETE FROM water_templates WHERE id=?').run(id).changes > 0
  })
  return tx()
}

// ── Onay akışı (W10) ──
// Verilen dağıtım id'lerinden stok karşılığı olmayanları (eşleşmemiş) kontrol bekliyor işaretle
export function flagReviewForUnallocated(ids) {
  if (!ids?.length) return 0
  const ph = ids.map(() => '?').join(',')
  return getDB().prepare(`
    UPDATE water_movements SET needs_review=1
    WHERE id IN (${ph}) AND type='out'
      AND qty_base > (SELECT COALESCE(SUM(qty_base),0) FROM water_movement_allocations WHERE out_movement_id=water_movements.id)
  `).run(...ids).changes
}
export function reviewQueue() {
  return getDB().prepare(`
    SELECT mv.id, mv.move_date, mv.qty_base, p.name AS product_name, p.unit_label, p.units_per_case, p.cases_per_pallet,
           p.brand_id, b.name AS brand_name, z.name AS zone_name, u.full_name AS created_by_name,
           mv.qty_base - COALESCE((SELECT SUM(wa.qty_base) FROM water_movement_allocations wa WHERE wa.out_movement_id=mv.id),0) AS unallocated_base
    FROM water_movements mv
    JOIN water_products p ON p.id = mv.product_id
    LEFT JOIN water_brands b ON b.id = p.brand_id
    LEFT JOIN water_zones z ON z.id = mv.zone_id
    LEFT JOIN users u ON u.id = mv.created_by
    WHERE mv.type='out' AND mv.needs_review=1
    ORDER BY mv.move_date ASC, mv.id ASC
  `).all()
}
export function approveReviews(ids) {
  if (Array.isArray(ids) && ids.length) {
    const ph = ids.map(() => '?').join(',')
    return getDB().prepare(`UPDATE water_movements SET needs_review=0 WHERE id IN (${ph}) AND needs_review=1`).run(...ids).changes
  }
  return getDB().prepare("UPDATE water_movements SET needs_review=0 WHERE type='out' AND needs_review=1").run().changes
}

export function clearResolvedReviews(productIds = null) {
  const ids = productIds == null ? [] : [...new Set((Array.isArray(productIds) ? productIds : [productIds]).map(Number).filter(Boolean))]
  const productClause = ids.length ? `AND product_id IN (${ids.map(() => '?').join(',')})` : ''
  return getDB().prepare(`
    UPDATE water_movements
    SET needs_review=0
    WHERE type='out' AND needs_review=1 ${productClause}
      AND qty_base <= (
        SELECT COALESCE(SUM(qty_base),0)
        FROM water_movement_allocations
        WHERE out_movement_id=water_movements.id
      )
  `).run(...ids).changes
}

// İrsaliye bekleyen (eşleşmemiş) tüm dağıtımlar — detaylı liste (W3)
export function pendingDistributions() {
  return getDB().prepare(`
    SELECT mv.id, mv.move_date, mv.qty_base, mv.note,
           p.name AS product_name, p.unit_label, p.units_per_case, p.cases_per_pallet,
           p.brand_id, b.name AS brand_name, z.name AS zone_name,
           COALESCE((SELECT SUM(wa.qty_base) FROM water_movement_allocations wa WHERE wa.out_movement_id=mv.id),0) AS allocated_base,
           mv.qty_base - COALESCE((SELECT SUM(wa.qty_base) FROM water_movement_allocations wa WHERE wa.out_movement_id=mv.id),0) AS unallocated_base,
           (SELECT GROUP_CONCAT(COALESCE(src.waybill_no,'GİRİŞ #'||src.id)||': '||wa.qty_base, ', ')
            FROM water_movement_allocations wa JOIN water_movements src ON src.id=wa.in_movement_id
            WHERE wa.out_movement_id=mv.id) AS source_waybills
    FROM water_movements mv
    JOIN water_products p ON p.id = mv.product_id
    LEFT JOIN water_brands b ON b.id = p.brand_id
    LEFT JOIN water_zones z ON z.id = mv.zone_id
    WHERE mv.type='out'
    GROUP BY mv.id
    HAVING unallocated_base > 0
    ORDER BY mv.move_date ASC, mv.id ASC
  `).all()
}

// Verilen günde hiç dağıtım (out) kaydı girilmemiş aktif bölgeler (Uyarı Merkezi)
export function zonesWithoutMovementOn(day) {
  return getDB().prepare(`
    SELECT z.id, z.name FROM water_zones z
    WHERE z.is_active = 1
      AND NOT EXISTS (
        SELECT 1 FROM water_movements mv
        WHERE mv.zone_id = z.id AND mv.type='out' AND mv.move_date = ?
      )
    ORDER BY z.name
  `).all(day)
}

export function zoneTotals({ from, to, product_id } = {}) {
  const cond = ["mv.type='out'"]
  const params = []
  if (from) { cond.push('mv.move_date>=?'); params.push(from) }
  if (to) { cond.push('mv.move_date<=?'); params.push(to) }
  if (product_id) { cond.push('mv.product_id=?'); params.push(product_id) }
  return getDB().prepare(`
    SELECT z.id, z.name, p.id AS product_id, p.name AS product_name,
      p.unit_label, p.units_per_case, p.cases_per_pallet,
      SUM(mv.qty_base) AS total_out
    FROM water_movements mv
    JOIN water_zones z ON z.id = mv.zone_id
    JOIN water_products p ON p.id = mv.product_id
    WHERE ${cond.join(' AND ')}
    GROUP BY z.id, p.id
    ORDER BY z.name, p.name
  `).all(...params)
}

export function dailySeries({ from, to, product_id } = {}) {
  const cond = []
  const params = []
  if (from) { cond.push('move_date>=?'); params.push(from) }
  if (to) { cond.push('move_date<=?'); params.push(to) }
  if (product_id) { cond.push('product_id=?'); params.push(product_id) }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : ''
  return getDB().prepare(`
    SELECT move_date,
      COALESCE(SUM(CASE WHEN type='in'  THEN qty_base END), 0) AS in_base,
      COALESCE(SUM(CASE WHEN type='out' THEN qty_base END), 0) AS out_base
    FROM water_movements
    ${where}
    GROUP BY move_date
    ORDER BY move_date
  `).all(...params)
}

// ── Tüketim hızı / öngörü (V1) ──
// Son `window` gün içindeki dağıtım (out) toplamı + kayıtlı gün sayısı — ürün bazında.
// asOf: bugünün YYYY-MM-DD'si (istemci yerel günü); pencere (asOf-window, asOf] aralığı.
export function consumptionRates({ window = 30, asOf } = {}) {
  return getDB().prepare(`
    SELECT product_id,
      COALESCE(SUM(qty_base), 0) AS out_sum,
      COUNT(DISTINCT move_date) AS active_days,
      MIN(move_date) AS first_date, MAX(move_date) AS last_date
    FROM water_movements
    WHERE type='out' AND move_date > date(?, '-' || ? || ' days') AND move_date <= ?
    GROUP BY product_id
  `).all(asOf, window, asOf)
}

// ── Boş kap / palet iadeleri (depozito defteri) ──
export function createReturn(r) {
  return getDB().prepare(`
    INSERT INTO water_returns(product_id, move_date, qty_base, input_qty, input_unit, note, created_by)
    VALUES(@product_id, @move_date, @qty_base, @input_qty, @input_unit, @note, @created_by)
  `).run(r).lastInsertRowid
}
export function createReturnsBatch(rows) {
  const db = getDB()
  const stmt = db.prepare(`
    INSERT INTO water_returns(product_id, move_date, qty_base, input_qty, input_unit, note, created_by)
    VALUES(@product_id, @move_date, @qty_base, @input_qty, @input_unit, @note, @created_by)
  `)
  const tx = db.transaction((list) => list.map(r => stmt.run(r).lastInsertRowid))
  return tx(rows)
}
export function getReturn(id) {
  return getDB().prepare('SELECT * FROM water_returns WHERE id=?').get(id)
}
export function deleteReturn(id) {
  return getDB().prepare('DELETE FROM water_returns WHERE id=?').run(id).changes > 0
}
export function listReturns({ product_id, from, to, limit = 200 } = {}) {
  let sql = `
    SELECT r.*, p.name AS product_name, p.unit_label, p.units_per_case, p.cases_per_pallet,
           p.brand_id, b.name AS brand_name
    FROM water_returns r
    JOIN water_products p ON p.id = r.product_id
    LEFT JOIN water_brands b ON b.id = p.brand_id
    WHERE 1=1
  `
  const params = []
  if (product_id) { sql += ' AND r.product_id=?'; params.push(product_id) }
  if (from) { sql += ' AND r.move_date>=?'; params.push(from) }
  if (to) { sql += ' AND r.move_date<=?'; params.push(to) }
  sql += ' ORDER BY r.move_date DESC, r.id DESC LIMIT ?'
  params.push(limit)
  return getDB().prepare(sql).all(...params)
}

// İade edilebilir ürünler için depozito bakiyesi:
// dolaşımdaki kap = toplam dolu giriş (in) − toplam boş iade (return).
export function depositBalances({ from, to } = {}) {
  const cond = []
  const params = []
  if (from) { cond.push('move_date>=?'); params.push(from) }
  if (to) { cond.push('move_date<=?'); params.push(to) }
  const periodWhere = cond.length ? 'AND ' + cond.join(' AND ') : ''
  return getDB().prepare(`
    SELECT p.id, p.name, p.unit_label, p.units_per_case, p.cases_per_pallet,
      p.brand_id, b.name AS brand_name,
      COALESCE((SELECT SUM(m.qty_base) FROM water_movements m WHERE m.product_id=p.id AND m.type='in'), 0) AS total_in,
      COALESCE((SELECT SUM(r.qty_base) FROM water_returns r WHERE r.product_id=p.id), 0) AS total_return,
      COALESCE((SELECT SUM(r.qty_base) FROM water_returns r WHERE r.product_id=p.id ${periodWhere}), 0) AS period_return
    FROM water_products p
    LEFT JOIN water_brands b ON b.id = p.brand_id
    WHERE p.is_returnable = 1 AND p.is_active = 1
    ORDER BY COALESCE(b.sort_order, 999), p.sort_order, p.name
  `).all(...params)
}

// ── Ay kapanışı / uyuşturma ──
export function getClosure(month) {
  return getDB().prepare(`
    SELECT c.*, u.full_name AS closed_by_name, u.username AS closed_by_username
    FROM water_monthly_closures c LEFT JOIN users u ON u.id = c.closed_by
    WHERE c.month=?
  `).get(month)
}
export function upsertClosure({ month, note, closed_by, is_locked = 1 }) {
  return getDB().prepare(`
    INSERT INTO water_monthly_closures(month, is_locked, note, closed_by)
    VALUES(@month, @is_locked, @note, @closed_by)
    ON CONFLICT(month) DO UPDATE SET
      is_locked=excluded.is_locked, note=excluded.note, closed_by=excluded.closed_by, closed_at=CURRENT_TIMESTAMP
  `).run({ month, is_locked: is_locked ? 1 : 0, note: note || null, closed_by: closed_by || null })
}
export function setClosureLock(month, isLocked) {
  return getDB().prepare('UPDATE water_monthly_closures SET is_locked=? WHERE month=?').run(isLocked ? 1 : 0, month).changes > 0
}

function reconciliationStatement(month, productId) {
  const monthNumber = Number(month.slice(5, 7))
  const year = Number(month.slice(0, 4))
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1
  const nextYear = monthNumber === 12 ? year + 1 : year
  const params = {
    month,
    monthStart: `${month}-01`,
    monthEnd: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
  }
  const productFilter = productId == null ? '' : 'AND p.id = @productId'
  if (productId != null) params.productId = productId

  const statement = getDB().prepare(`
    SELECT p.id AS product_id, p.name AS product_name, p.unit_label, p.units_per_case, p.cases_per_pallet,
      p.brand_id, b.name AS brand_name,
      COALESCE((SELECT SUM(CASE WHEN m.type='in' THEN m.qty_base ELSE -m.qty_base END)
                FROM water_movements m WHERE m.product_id=p.id AND m.move_date < @monthStart), 0)
      + COALESCE((SELECT SUM(CASE WHEN a.direction='in' THEN a.qty_base ELSE -a.qty_base END)
                FROM water_adjustments a WHERE a.product_id=p.id AND a.move_date < @monthStart), 0) AS opening_base,
      COALESCE((SELECT SUM(m.qty_base) FROM water_movements m
                WHERE m.product_id=p.id AND m.type='in'
                  AND m.move_date >= @monthStart AND m.move_date < @monthEnd), 0) AS month_in,
      COALESCE((SELECT SUM(m.qty_base) FROM water_movements m
                WHERE m.product_id=p.id AND m.type='out'
                  AND m.move_date >= @monthStart AND m.move_date < @monthEnd), 0) AS month_out,
      COALESCE((SELECT SUM(CASE WHEN a.direction='in' THEN a.qty_base ELSE -a.qty_base END)
                FROM water_adjustments a WHERE a.product_id=p.id
                  AND a.move_date >= @monthStart AND a.move_date < @monthEnd), 0) AS month_adjust,
      COALESCE((SELECT SUM(r.qty_base) FROM water_returns r
                WHERE r.product_id=p.id
                  AND r.move_date >= @monthStart AND r.move_date < @monthEnd), 0) AS month_return,
      sc.counted_base, sc.reason AS count_reason, sc.note AS count_note
    FROM water_products p
    LEFT JOIN water_brands b ON b.id = p.brand_id
    LEFT JOIN water_stock_counts sc ON sc.product_id = p.id AND sc.month = @month
    WHERE (
      p.is_active = 1
      OR EXISTS (
        SELECT 1 FROM water_movements historical_movement
        WHERE historical_movement.product_id=p.id AND historical_movement.move_date < @monthEnd
      )
      OR EXISTS (
        SELECT 1 FROM water_adjustments historical_adjustment
        WHERE historical_adjustment.product_id=p.id AND historical_adjustment.move_date < @monthEnd
      )
      OR EXISTS (
        SELECT 1 FROM water_returns historical_return
        WHERE historical_return.product_id=p.id AND historical_return.move_date < @monthEnd
      )
      OR sc.product_id IS NOT NULL
    ) ${productFilter}
    ORDER BY COALESCE(b.sort_order, 999), p.sort_order, p.name
  `)
  return { statement, params }
}

// Ürün bazında: ay başı devreden (ay öncesi net) + ay gelen/dağıtılan + ay iadesi + varsa sayım fişi
export function reconciliationRows(month) {
  const { statement, params } = reconciliationStatement(month)
  return statement.all(params)
}

// Sayım fişi tek ürün içindir; tüm ürünlerin uzlaştırmasını hesaplamaz.
export function reconciliationRow(month, productId) {
  const { statement, params } = reconciliationStatement(month, productId)
  return statement.get(params)
}

export function upsertStockCount(row) {
  return getDB().prepare(`
    INSERT INTO water_stock_counts(month, product_id, system_base, counted_base, diff_base, reason, note, created_by)
    VALUES(@month, @product_id, @system_base, @counted_base, @diff_base, @reason, @note, @created_by)
    ON CONFLICT(month, product_id) DO UPDATE SET
      system_base=excluded.system_base, counted_base=excluded.counted_base, diff_base=excluded.diff_base,
      reason=excluded.reason, note=excluded.note, created_by=excluded.created_by, updated_at=CURRENT_TIMESTAMP
  `).run(row)
}

// Kapanış snapshot'ı: her ürün için sistem kalanını yazar (mevcut sayımı silmez)
export function snapshotClosure(month, rows) {
  const db = getDB()
  const stmt = db.prepare(`
    INSERT INTO water_stock_counts(month, product_id, system_base)
    VALUES(?,?,?)
    ON CONFLICT(month, product_id) DO UPDATE SET system_base=excluded.system_base, updated_at=CURRENT_TIMESTAMP
  `)
  const tx = db.transaction((list) => { for (const r of list) stmt.run(month, r.product_id, r.system_base) })
  return tx(rows)
}

// Ay bazlı seri (move_date YYYY-MM-DD → YYYY-MM gruplanır)
export function monthlySeries({ from, to, product_id } = {}) {
  const cond = []
  const params = []
  if (from) { cond.push('move_date>=?'); params.push(from) }
  if (to) { cond.push('move_date<=?'); params.push(to) }
  if (product_id) { cond.push('product_id=?'); params.push(product_id) }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : ''
  return getDB().prepare(`
    SELECT substr(move_date,1,7) AS move_date,
      COALESCE(SUM(CASE WHEN type='in'  THEN qty_base END), 0) AS in_base,
      COALESCE(SUM(CASE WHEN type='out' THEN qty_base END), 0) AS out_base
    FROM water_movements
    ${where}
    GROUP BY substr(move_date,1,7)
    ORDER BY move_date
  `).all(...params)
}

// ── Günlük operasyon özeti e-posta teslimi ──
export function listWaterOperationEmails() {
  return getDB().prepare(`
    SELECT DISTINCT lower(trim(email)) AS email
    FROM users
    WHERE role IN ('campus_manager', 'shift_supervisor')
      AND email IS NOT NULL
      AND trim(email) != ''
    ORDER BY email
  `).all().map(row => row.email)
}

export function getDailyDigestDeliveryByDate(digestDate) {
  return getDB().prepare(`
    SELECT d.*, j.status AS job_status, j.attempts AS job_attempts,
      j.max_attempts AS job_max_attempts, j.last_error AS job_last_error,
      u.full_name AS requested_by_name
    FROM water_daily_digest_deliveries d
    LEFT JOIN job_queue j ON j.id=d.job_id
    LEFT JOIN users u ON u.id=d.requested_by
    WHERE d.digest_date=?
  `).get(digestDate)
}

export function getDailyDigestDelivery(id) {
  return getDB().prepare(`
    SELECT d.*, j.status AS job_status, j.attempts AS job_attempts,
      j.max_attempts AS job_max_attempts, j.last_error AS job_last_error,
      u.full_name AS requested_by_name
    FROM water_daily_digest_deliveries d
    LEFT JOIN job_queue j ON j.id=d.job_id
    LEFT JOIN users u ON u.id=d.requested_by
    WHERE d.id=?
  `).get(id)
}

export function upsertDailyDigestDelivery(row) {
  const db = getDB()
  db.prepare(`
    INSERT INTO water_daily_digest_deliveries(
      digest_date, status, source, recipients, subject, summary_json,
      last_error, requested_by
    ) VALUES(
      @digest_date, @status, @source, @recipients, @subject, @summary_json,
      @last_error, @requested_by
    )
    ON CONFLICT(digest_date) DO UPDATE SET
      status=excluded.status,
      source=excluded.source,
      recipients=excluded.recipients,
      subject=excluded.subject,
      summary_json=excluded.summary_json,
      job_id=NULL,
      message_id=NULL,
      last_error=excluded.last_error,
      requested_by=excluded.requested_by,
      queued_at=NULL,
      sent_at=NULL,
      updated_at=CURRENT_TIMESTAMP
  `).run(row)
  return getDailyDigestDeliveryByDate(row.digest_date)
}

export function linkDailyDigestJob(id, jobId) {
  return getDB().prepare(`
    UPDATE water_daily_digest_deliveries
    SET status='queued', job_id=?, queued_at=CURRENT_TIMESTAMP,
      last_error=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(jobId, id).changes > 0
}

export function markDailyDigestSending(id) {
  return getDB().prepare(`
    UPDATE water_daily_digest_deliveries
    SET status='sending', last_error=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND sent_at IS NULL
  `).run(id).changes > 0
}

export function markDailyDigestRetrying(id, errorMessage) {
  return getDB().prepare(`
    UPDATE water_daily_digest_deliveries
    SET status='retrying', last_error=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND sent_at IS NULL
  `).run(errorMessage || null, id).changes > 0
}

export function markDailyDigestFailed(id, errorMessage) {
  return getDB().prepare(`
    UPDATE water_daily_digest_deliveries
    SET status='failed', last_error=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND sent_at IS NULL
  `).run(errorMessage || null, id).changes > 0
}

export function markDailyDigestSent(id, messageId) {
  return getDB().prepare(`
    UPDATE water_daily_digest_deliveries
    SET status='sent', message_id=?, sent_at=CURRENT_TIMESTAMP,
      last_error=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(messageId || null, id).changes > 0
}

export function listDailyDigestDeliveries(limit = 14) {
  return getDB().prepare(`
    SELECT d.*, j.status AS job_status, j.attempts AS job_attempts,
      j.max_attempts AS job_max_attempts, j.last_error AS job_last_error,
      u.full_name AS requested_by_name
    FROM water_daily_digest_deliveries d
    LEFT JOIN job_queue j ON j.id=d.job_id
    LEFT JOIN users u ON u.id=d.requested_by
    ORDER BY d.digest_date DESC, d.id DESC
    LIMIT ?
  `).all(limit)
}

// ── Tır ön bildirimleri + irsaliye foto arşivi ──
export function listTruckArrivals({ from, to, status, limit = 200 } = {}) {
  let sql = `
    SELECT t.*, b.name AS brand_name, u.full_name AS created_by_name,
      j.status AS mail_job_status, j.attempts AS mail_job_attempts,
      j.max_attempts AS mail_job_max_attempts, j.last_error AS mail_job_last_error,
      (SELECT COUNT(*) FROM water_waybill_photos p WHERE p.truck_arrival_id=t.id) AS photo_count
    FROM water_truck_arrivals t
    LEFT JOIN water_brands b ON b.id=t.brand_id
    LEFT JOIN users u ON u.id=t.created_by
    LEFT JOIN job_queue j ON j.id=t.mail_job_id
    WHERE 1=1
  `
  const params = []
  if (from) { sql += ' AND t.arrival_date>=?'; params.push(from) }
  if (to) { sql += ' AND t.arrival_date<=?'; params.push(to) }
  if (status) { sql += ' AND t.status=?'; params.push(status) }
  sql += ' ORDER BY t.arrival_date DESC, t.arrival_start_time DESC, t.id DESC LIMIT ?'
  params.push(limit)
  return getDB().prepare(sql).all(...params)
}

export function getTruckArrival(id) {
  return getDB().prepare(`
    SELECT t.*, b.name AS brand_name,
      j.status AS mail_job_status, j.attempts AS mail_job_attempts,
      j.max_attempts AS mail_job_max_attempts, j.last_error AS mail_job_last_error,
      (SELECT COUNT(*) FROM water_waybill_photos p WHERE p.truck_arrival_id=t.id) AS photo_count
    FROM water_truck_arrivals t
    LEFT JOIN water_brands b ON b.id=t.brand_id
    LEFT JOIN job_queue j ON j.id=t.mail_job_id
    WHERE t.id=?
  `).get(id)
}

export function createTruckArrival(row) {
  return getDB().prepare(`
    INSERT INTO water_truck_arrivals(
      arrival_date, arrival_start_time, arrival_end_time, mail_deadline_date, mail_deadline_time,
      reminder_start_time, reminder_end_time, reminder_interval_minutes,
      supplier_name, brand_id, driver_name, driver_tc, driver_phone, plate, trailer_plate,
      identity_type, visit_company, host_person_name, host_person_phone, entry_reason, work_area,
      center_email, status, note, created_by, updated_by
    ) VALUES(
      @arrival_date, @arrival_start_time, @arrival_end_time, @mail_deadline_date, @mail_deadline_time,
      @reminder_start_time, @reminder_end_time, @reminder_interval_minutes,
      @supplier_name, @brand_id, @driver_name, @driver_tc, @driver_phone, @plate, @trailer_plate,
      @identity_type, @visit_company, @host_person_name, @host_person_phone, @entry_reason, @work_area,
      @center_email, @status, @note, @created_by, @updated_by
    )
  `).run(row).lastInsertRowid
}

export function updateTruckArrival(id, row) {
  return getDB().prepare(`
    UPDATE water_truck_arrivals SET
      arrival_date=@arrival_date, arrival_start_time=@arrival_start_time, arrival_end_time=@arrival_end_time,
      mail_deadline_date=@mail_deadline_date, mail_deadline_time=@mail_deadline_time,
      reminder_start_time=@reminder_start_time, reminder_end_time=@reminder_end_time,
      reminder_interval_minutes=@reminder_interval_minutes,
      supplier_name=@supplier_name, brand_id=@brand_id, driver_name=@driver_name, driver_tc=@driver_tc,
      driver_phone=@driver_phone, plate=@plate, trailer_plate=@trailer_plate, center_email=@center_email,
      identity_type=@identity_type, visit_company=@visit_company, host_person_name=@host_person_name,
      host_person_phone=@host_person_phone, entry_reason=@entry_reason, work_area=@work_area,
      status=@status, note=@note, updated_by=@updated_by, updated_at=CURRENT_TIMESTAMP
    WHERE id=@id
  `).run({ ...row, id }).changes > 0
}

export function setTruckMailSent(id, userId) {
  return getDB().prepare(`
    UPDATE water_truck_arrivals
    SET mail_sent_at=CURRENT_TIMESTAMP,
        status=CASE WHEN status='planned' THEN 'mail_sent' ELSE status END,
        updated_by=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(userId || null, id).changes > 0
}

export function setTruckMailQueued(id, jobId, userId) {
  return getDB().prepare(`
    UPDATE water_truck_arrivals
    SET mail_job_id=?, mail_queued_at=CURRENT_TIMESTAMP,
        updated_by=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(jobId, userId || null, id).changes > 0
}

export function setTruckChecked(id, userId) {
  return getDB().prepare(`
    UPDATE water_truck_arrivals
    SET last_checked_at=CURRENT_TIMESTAMP, updated_by=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(userId || null, id).changes > 0
}

export function deleteTruckArrival(id) {
  const db = getDB()
  const remove = db.transaction(() => {
    const truck = db.prepare('SELECT * FROM water_truck_arrivals WHERE id=?').get(id)
    if (!truck) return null

    const photos = db.prepare('SELECT * FROM water_waybill_photos WHERE truck_arrival_id=?').all(id)
    const deletedPhotos = photos.filter(photo => photo.movement_id == null)
    const preservedPhotos = photos.filter(photo => photo.movement_id != null)

    if (deletedPhotos.length) {
      const deletePhoto = db.prepare('DELETE FROM water_waybill_photos WHERE id=?')
      deletedPhotos.forEach(photo => deletePhoto.run(photo.id))
    }
    if (preservedPhotos.length) {
      db.prepare('UPDATE water_waybill_photos SET truck_arrival_id=NULL WHERE truck_arrival_id=? AND movement_id IS NOT NULL').run(id)
    }
    db.prepare('DELETE FROM water_truck_arrivals WHERE id=?').run(id)

    return {
      truck,
      deleted_photos: deletedPhotos,
      preserved_photo_ids: preservedPhotos.map(photo => photo.id),
    }
  })
  return remove.immediate()
}

export function listWaybillPhotos({ truck_arrival_id, movement_id, waybill_no, from, to, limit = 200 } = {}) {
  let sql = `
    SELECT ph.*, t.plate, t.trailer_plate, t.driver_name, t.arrival_date,
      mv.product_id, mv.qty_base, mv.input_qty, mv.input_unit,
      p.name AS product_name, p.unit_label, p.units_per_case, p.cases_per_pallet,
      b.name AS brand_name, u.full_name AS uploaded_by_name
    FROM water_waybill_photos ph
    LEFT JOIN water_truck_arrivals t ON t.id=ph.truck_arrival_id
    LEFT JOIN water_movements mv ON mv.id=ph.movement_id
    LEFT JOIN water_products p ON p.id=mv.product_id
    LEFT JOIN water_brands b ON b.id=p.brand_id
    LEFT JOIN users u ON u.id=ph.uploaded_by
    WHERE 1=1
  `
  const params = []
  if (truck_arrival_id) { sql += ' AND ph.truck_arrival_id=?'; params.push(truck_arrival_id) }
  if (movement_id) { sql += ' AND ph.movement_id=?'; params.push(movement_id) }
  if (waybill_no) { sql += ' AND ph.waybill_no LIKE ?'; params.push(`%${waybill_no}%`) }
  if (from) { sql += ' AND ph.move_date>=?'; params.push(from) }
  if (to) { sql += ' AND ph.move_date<=?'; params.push(to) }
  sql += ' ORDER BY ph.move_date DESC, ph.id DESC LIMIT ?'
  params.push(limit)
  return getDB().prepare(sql).all(...params)
}

export function getWaybillPhoto(id) {
  return getDB().prepare('SELECT * FROM water_waybill_photos WHERE id=?').get(id)
}

export function listWaybillPhotoUrls() {
  return getDB().prepare('SELECT photo_url FROM water_waybill_photos WHERE photo_url IS NOT NULL').all().map(row => row.photo_url)
}

export function createWaybillPhoto(row) {
  return getDB().prepare(`
    INSERT INTO water_waybill_photos(
      truck_arrival_id, movement_id, waybill_no, move_date, photo_url,
      original_name, mime, size, note, uploaded_by
    ) VALUES(
      @truck_arrival_id, @movement_id, @waybill_no, @move_date, @photo_url,
      @original_name, @mime, @size, @note, @uploaded_by
    )
  `).run(row).lastInsertRowid
}

export function deleteWaybillPhoto(id) {
  const row = getWaybillPhoto(id)
  if (!row) return null
  getDB().prepare('DELETE FROM water_waybill_photos WHERE id=?').run(id)
  return row
}
