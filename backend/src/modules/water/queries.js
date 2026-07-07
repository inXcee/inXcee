import { getDB } from '../../shared/db/index.js'

// ── Ürünler ──
export function listProducts({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE is_active = 1'
  return getDB().prepare(`SELECT * FROM water_products ${where} ORDER BY name`).all()
}
export function getProduct(id) {
  return getDB().prepare('SELECT * FROM water_products WHERE id=?').get(id)
}
export function createProduct({ name, unit_label, units_per_case, cases_per_pallet }) {
  return getDB().prepare(`
    INSERT INTO water_products(name, unit_label, units_per_case, cases_per_pallet) VALUES(?,?,?,?)
  `).run(name, unit_label || 'adet', units_per_case || 1, cases_per_pallet || 1).lastInsertRowid
}
export function updateProduct(id, { name, unit_label, units_per_case, cases_per_pallet, is_active }) {
  return getDB().prepare(`
    UPDATE water_products SET name=?, unit_label=?, units_per_case=?, cases_per_pallet=?, is_active=? WHERE id=?
  `).run(name, unit_label || 'adet', units_per_case || 1, cases_per_pallet || 1, is_active ? 1 : 0, id).changes > 0
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
export function deleteMovement(id) {
  return getDB().prepare('DELETE FROM water_movements WHERE id=?').run(id).changes > 0
}

export function listMovements({ type, product_id, zone_id, from, to, limit = 200 } = {}) {
  let q = `
    SELECT mv.*, p.name AS product_name, p.unit_label, p.units_per_case, p.cases_per_pallet,
           z.name AS zone_name
    FROM water_movements mv
    JOIN water_products p ON p.id = mv.product_id
    LEFT JOIN water_zones z ON z.id = mv.zone_id
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
export function stockByProduct({ from, to } = {}) {
  const cond = []
  const params = []
  if (from) { cond.push('mv.move_date>=?'); params.push(from) }
  if (to) { cond.push('mv.move_date<=?'); params.push(to) }
  const where = cond.length ? 'AND ' + cond.join(' AND ') : ''
  return getDB().prepare(`
    SELECT p.id, p.name, p.unit_label, p.units_per_case, p.cases_per_pallet,
      COALESCE(SUM(CASE WHEN mv.type='in'  THEN mv.qty_base END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN mv.type='out' THEN mv.qty_base END), 0) AS total_out
    FROM water_products p
    LEFT JOIN water_movements mv ON mv.product_id = p.id ${where}
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY p.name
  `).all(...params)
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
