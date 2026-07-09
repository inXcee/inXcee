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
export function createBrand({ name, sort_order }) {
  return getDB().prepare('INSERT INTO water_brands(name, sort_order) VALUES(?,?)')
    .run(name, sort_order || 0).lastInsertRowid
}
export function updateBrand(id, { name, sort_order, is_active }) {
  return getDB().prepare('UPDATE water_brands SET name=?, sort_order=?, is_active=? WHERE id=?')
    .run(name, sort_order || 0, is_active ? 1 : 0, id).changes > 0
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
export function createProduct({ name, unit_label, units_per_case, cases_per_pallet, min_level, brand_id, is_returnable, sort_order }) {
  return getDB().prepare(`
    INSERT INTO water_products(name, unit_label, units_per_case, cases_per_pallet, min_level, brand_id, is_returnable, sort_order)
    VALUES(?,?,?,?,?,?,?,?)
  `).run(name, unit_label || 'adet', units_per_case || 1, cases_per_pallet || 1, min_level || 0,
    brand_id || null, is_returnable ? 1 : 0, sort_order || 0).lastInsertRowid
}
export function updateProduct(id, { name, unit_label, units_per_case, cases_per_pallet, is_active, min_level, brand_id, is_returnable, sort_order }) {
  return getDB().prepare(`
    UPDATE water_products SET name=?, unit_label=?, units_per_case=?, cases_per_pallet=?, is_active=?, min_level=?,
      brand_id=?, is_returnable=?, sort_order=? WHERE id=?
  `).run(name, unit_label || 'adet', units_per_case || 1, cases_per_pallet || 1, is_active ? 1 : 0, min_level || 0,
    brand_id || null, is_returnable ? 1 : 0, sort_order || 0, id).changes > 0
}
export function getProductBalance(productId) {
  const r = getDB().prepare(`
    SELECT COALESCE(SUM(CASE WHEN type='in' THEN qty_base ELSE -qty_base END), 0) AS bal
    FROM water_movements WHERE product_id=?
  `).get(productId)
  return r.bal
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
export function createZone({ name, code, note }) {
  return getDB().prepare('INSERT INTO water_zones(name, code, note) VALUES(?,?,?)')
    .run(name, code || null, note || null).lastInsertRowid
}
export function updateZone(id, { name, code, note, is_active }) {
  return getDB().prepare('UPDATE water_zones SET name=?, code=?, note=?, is_active=? WHERE id=?')
    .run(name, code || null, note || null, is_active ? 1 : 0, id).changes > 0
}
export function zoneMovementCount(id) {
  return getDB().prepare('SELECT COUNT(*) c FROM water_movements WHERE zone_id=?').get(id).c
}
export function deleteZone(id) {
  return getDB().prepare('DELETE FROM water_zones WHERE id=?').run(id).changes > 0
}

// ── Hareketler ──
export function createMovement(m) {
  return getDB().prepare(`
    INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit, waybill_no, note, created_by)
    VALUES(@type, @product_id, @zone_id, @move_date, @qty_base, @input_qty, @input_unit, @waybill_no, @note, @created_by)
  `).run(m).lastInsertRowid
}
export function getMovement(id) {
  return getDB().prepare('SELECT * FROM water_movements WHERE id=?').get(id)
}

// Birden çok hareketi tek transaction'da ekler (toplu irsaliye / toplu dağıtım)
export function createMovementsBatch(movements) {
  const db = getDB()
  const stmt = db.prepare(`
    INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit, waybill_no, note, created_by)
    VALUES(@type, @product_id, @zone_id, @move_date, @qty_base, @input_qty, @input_unit, @waybill_no, @note, @created_by)
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

export function openIntakeLots(productId, { releaseOutMovementId } = {}) {
  const releaseClause = releaseOutMovementId ? 'AND wa.out_movement_id != ?' : ''
  const params = releaseOutMovementId ? [releaseOutMovementId, productId] : [productId]
  return getDB().prepare(`
    SELECT mv.id, mv.product_id, mv.move_date, mv.waybill_no, mv.qty_base,
           COALESCE(SUM(wa.qty_base), 0) AS allocated_base,
           mv.qty_base - COALESCE(SUM(wa.qty_base), 0) AS remaining_base
    FROM water_movements mv
    LEFT JOIN water_movement_allocations wa ON wa.in_movement_id = mv.id ${releaseClause}
    WHERE mv.type='in' AND mv.product_id=?
    GROUP BY mv.id
    HAVING remaining_base > 0
    ORDER BY mv.move_date ASC, mv.id ASC
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
           p.brand_id, b.name AS brand_name, z.name AS zone_name,
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
    SELECT p.id, p.name, p.unit_label, p.units_per_case, p.cases_per_pallet, p.min_level,
      p.brand_id, b.name AS brand_name,
      COALESCE(SUM(CASE WHEN mv.type='in'  THEN mv.qty_base END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN mv.type='out' THEN mv.qty_base END), 0) AS total_out
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
