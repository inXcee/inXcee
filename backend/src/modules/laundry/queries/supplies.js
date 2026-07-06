import { getDB } from '../../../shared/db/index.js'
export function listSuppliesQuery(includeInactive = false) {
  const db = getDB()
  const where = includeInactive ? '' : 'WHERE s.is_active = 1'
  return db.prepare(`
    SELECT s.*,
      (SELECT json_group_array(json_object(
        'machine_id', ms.machine_id,
        'machine_name', m.name,
        'per_wash_amount', ms.per_wash_amount
      ))
      FROM laundry_machine_supplies ms
      JOIN laundry_machines m ON m.id = ms.machine_id
      WHERE ms.supply_id = s.id
      ) as machine_links_json
    FROM laundry_supplies s
    ${where}
    ORDER BY s.name ASC
  `).all().map(row => ({
    ...row,
    machine_links: row.machine_links_json ? JSON.parse(row.machine_links_json) : [],
  }))
}

export function getSupplyQuery(id) {
  const db = getDB()
  return db.prepare(`SELECT * FROM laundry_supplies WHERE id = ?`).get(id)
}

export function insertSupplyQuery({ name, unit, current_stock, warning_threshold, critical_threshold }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO laundry_supplies(name, unit, current_stock, warning_threshold, critical_threshold)
    VALUES(?, ?, ?, ?, ?)
  `).run(name, unit || 'kg', current_stock || 0, warning_threshold || 0, critical_threshold || 0)
  return r.lastInsertRowid
}

export function updateSupplyQuery(id, { name, unit, warning_threshold, critical_threshold, is_active }) {
  const db = getDB()
  db.prepare(`
    UPDATE laundry_supplies
    SET name = COALESCE(?, name),
        unit = COALESCE(?, unit),
        warning_threshold = COALESCE(?, warning_threshold),
        critical_threshold = COALESCE(?, critical_threshold),
        is_active = COALESCE(?, is_active),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(name ?? null, unit ?? null, warning_threshold ?? null, critical_threshold ?? null, is_active ?? null, id)
  return db.prepare(`SELECT * FROM laundry_supplies WHERE id = ?`).get(id)
}

export function adjustStockQuery(supplyId, delta, { reason, item_id, machine_id, note, created_by }) {
  const db = getDB()
  db.prepare(`
    UPDATE laundry_supplies
    SET current_stock = MAX(0, current_stock + ?),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(delta, supplyId)
  db.prepare(`
    INSERT INTO laundry_supply_log(supply_id, delta, reason, item_id, machine_id, note, created_by)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `).run(supplyId, delta, reason, item_id ?? null, machine_id ?? null, note ?? null, created_by ?? null)
  return db.prepare(`SELECT * FROM laundry_supplies WHERE id = ?`).get(supplyId)
}

export function setStockQuery(supplyId, newStock, userId) {
  const db = getDB()
  const current = db.prepare(`SELECT current_stock FROM laundry_supplies WHERE id = ?`).get(supplyId)
  if (!current) throw new Error('Ürün bulunamadı')
  const delta = newStock - current.current_stock
  return adjustStockQuery(supplyId, delta, { reason: 'manual_correction', note: 'Sayım düzeltmesi', created_by: userId })
}

export function getMachineSuppliesQuery(machine_id) {
  const db = getDB()
  return db.prepare(`
    SELECT ms.*, s.name, s.unit, s.current_stock
    FROM laundry_machine_supplies ms
    JOIN laundry_supplies s ON s.id = ms.supply_id
    WHERE ms.machine_id = ? AND s.is_active = 1
  `).all(machine_id)
}

export function upsertMachineSupplyQuery(machine_id, supply_id, per_wash_amount) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_machine_supplies(machine_id, supply_id, per_wash_amount)
    VALUES(?, ?, ?)
    ON CONFLICT(machine_id, supply_id) DO UPDATE SET per_wash_amount = excluded.per_wash_amount
  `).run(machine_id, supply_id, per_wash_amount)
}

export function deleteMachineSupplyQuery(machine_id, supply_id) {
  const db = getDB()
  db.prepare(`DELETE FROM laundry_machine_supplies WHERE machine_id = ? AND supply_id = ?`).run(machine_id, supply_id)
}

export function getSupplyLogQuery(supply_id, limit = 20) {
  const db = getDB()
  return db.prepare(`
    SELECT sl.*, u.full_name as user_name
    FROM laundry_supply_log sl
    LEFT JOIN users u ON u.id = sl.created_by
    WHERE sl.supply_id = ?
    ORDER BY sl.created_at DESC LIMIT ?
  `).all(supply_id, limit)
}

export function getAlertSuppliesQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT * FROM laundry_supplies
    WHERE is_active = 1
      AND (current_stock <= critical_threshold OR current_stock <= warning_threshold)
    ORDER BY current_stock ASC
  `).all().map(s => ({
    ...s,
    alert_level: s.current_stock <= s.critical_threshold ? 'critical' : 'warning',
  }))
}

// ═══════════════════════════════════════════════════════════════════════════
// GARMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

