import { getDB } from '../../../shared/db/index.js'
export function archiveItemsQuery({ from, to, status, room, search, page = 1, limit = 50 } = {}) {
  const db = getDB()
  const conditions = [`li.status IN ('delivered','lost')`]
  const params = []

  if (status) { conditions.push(`li.status = ?`); params.push(status) }
  if (from)   { conditions.push(`date(li.created_at) >= date(?)`); params.push(from) }
  if (to)     { conditions.push(`date(li.created_at) <= date(?)`); params.push(to) }
  if (room)   { conditions.push(`(r.block || '-' || r.room_no) = ?`); params.push(room) }
  if (search) {
    conditions.push(`(r.room_no LIKE ? OR li.intake_name LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`)
  }

  const where = conditions.join(' AND ')
  const offset = (page - 1) * limit

  const total = db.prepare(`
    SELECT COUNT(*) as c FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    WHERE ${where}
  `).get(...params).c

  const items = db.prepare(`
    SELECT li.*,
      r.block, r.room_no,
      ld.delivered_to, ld.delivered_at,
      ROUND((julianday(COALESCE(ld.delivered_at, li.updated_at)) - julianday(li.created_at)) * 24, 1) as total_hours,
      lv.all_present
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_deliveries ld ON ld.item_id = li.id
    LEFT JOIN laundry_verifications lv ON lv.item_id = li.id AND lv.stage = 'washing_to_ready'
    WHERE ${where}
    ORDER BY li.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  return { items, total, page, limit }
}

// DELIVERIES
// ═══════════════════════════════════════════════════════════════════════════

export function insertDeliveryQuery({
  item_id,
  delivered_to,
  signature_data,
  delivered_by,
  delivered_by_worker_id,
}) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_deliveries(
      item_id, delivered_to, signature_data, delivered_by, delivered_by_worker_id
    )
    VALUES(?, ?, ?, ?, ?)
  `).run(
    item_id,
    delivered_to,
    signature_data || null,
    delivered_by || null,
    delivered_by_worker_id || null
  )
}

export function getDeliveryForItemQuery(itemId) {
  const db = getDB()
  return db.prepare(`
    SELECT ld.*, u.full_name as delivered_by_name
    FROM laundry_deliveries ld
    LEFT JOIN users u ON u.id = ld.delivered_by
    WHERE ld.item_id = ?
  `).get(itemId)
}

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGES
// ═══════════════════════════════════════════════════════════════════════════

export function insertDamageQuery({ item_id, photo_url, description, reported_by }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_damages(item_id, photo_url, description, reported_by)
    VALUES(?, ?, ?, ?)
  `).run(item_id, photo_url || null, description, reported_by)
}

export function getDamagesForItemQuery(itemId) {
  const db = getDB()
  return db.prepare(`
    SELECT ld.*, u.full_name as reported_by_name
    FROM laundry_damages ld
    LEFT JOIN users u ON u.id = ld.reported_by
    WHERE ld.item_id = ?
    ORDER BY ld.created_at DESC
  `).all(itemId)
}

export function deleteDamageQuery(damageId) {
  const db = getDB()
  const r = db.prepare(`DELETE FROM laundry_damages WHERE id = ?`).run(damageId)
  return r.changes > 0
}

export function updateCompensationQuery(id, value, note) {
  const db = getDB()
  const r = db.prepare(
    `UPDATE laundry_items SET compensation_value=?, compensation_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(value, note ?? null, id)
  return r.changes > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════

export function insertHistoryQuery({
  item_id,
  from_status,
  to_status,
  action_by,
  worker_id,
  notes,
}) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_history(
      item_id, from_status, to_status, action_by, worker_id, notes
    )
    VALUES(?, ?, ?, ?, ?, ?)
  `).run(
    item_id,
    from_status || null,
    to_status,
    action_by || null,
    worker_id || null,
    notes || null
  )
}

export function getItemHistoryQuery(itemId) {
  const db = getDB()
  return db.prepare(`
    SELECT
      lh.*,
      u.full_name AS actor_name,
      ld.delivered_to,
      ld.signature_data,
      u2.full_name AS delivered_by_name
    FROM laundry_history lh
    LEFT JOIN users u ON u.id = lh.action_by
    LEFT JOIN laundry_deliveries ld ON ld.item_id = lh.item_id AND lh.to_status = 'delivered'
    LEFT JOIN users u2 ON u2.id = ld.delivered_by
    WHERE lh.item_id = ?
    ORDER BY lh.created_at ASC
  `).all(itemId)
}

// ═══════════════════════════════════════════════════════════════════════════
// SLA CONFIG + VIOLATIONS
// ═══════════════════════════════════════════════════════════════════════════

