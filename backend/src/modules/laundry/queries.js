import { getDB } from '../../shared/db/index.js'

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════════════════

export function insertItemQuery({ room_id, item_count = 1, item_details, notes, urgent = 0, photo_url, phone_override, intake_name, intake_signature, clothing_items, created_by }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO laundry_items(room_id, item_count, item_details, notes, urgent, photo_url, phone_override, intake_name, intake_signature, clothing_items, created_by, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(room_id, item_count, item_details || null, notes || null, urgent ? 1 : 0, photo_url || null, phone_override || null, intake_name || null, intake_signature || null, clothing_items ? JSON.stringify(clothing_items) : null, created_by)
  return r.lastInsertRowid
}

export function getItemQuery(id) {
  const db = getDB()
  return db.prepare(`
    SELECT li.*,
           r.block, r.room_no, r.floor,
           u.full_name as created_by_name,
           m.name as machine_name,
           (SELECT COUNT(*) FROM laundry_damages WHERE item_id = li.id) as damage_count,
           COALESCE(li.phone_override, p.phone_number) as phone_number,
           p.full_name as occupant_name,
           li.intake_name,
           li.clothing_items,
           (SELECT COUNT(*) FROM laundry_items li2
            WHERE li2.room_id = li.room_id
            AND li2.status NOT IN ('delivered','lost')) as room_active_count
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    LEFT JOIN laundry_machines m ON m.id = li.machine_id
    LEFT JOIN room_assignments ra ON ra.room_id = li.room_id AND ra.check_out_at IS NULL
    LEFT JOIN personnel p ON p.id = ra.personnel_id
    WHERE li.id = ?
  `).get(id)
}

export function listItemsQuery({ status, urgent, sla_only, search } = {}) {
  const db = getDB()
  const conditions = []
  const params = []

  // Only exclude delivered if we're not specifically querying for delivered
  if (!status || status !== 'delivered') {
    conditions.push("li.status != 'delivered'")
  }

  if (status) { conditions.push('li.status = ?'); params.push(status) }
  if (urgent) { conditions.push('li.urgent = 1') }
  if (search) {
    conditions.push("(r.block || ' ' || r.room_no LIKE ? OR li.notes LIKE ?)")
    params.push(`%${search}%`, `%${search}%`)
  }
  if (sla_only) {
    conditions.push(`(
      SELECT CASE
        WHEN li.status='dirty' THEN (julianday('now') - julianday(li.created_at)) * 24
        WHEN li.status IN ('washing','ready') THEN (julianday('now') - julianday(li.updated_at)) * 24
        ELSE 0
      END
    ) >= COALESCE((SELECT warning_hours FROM laundry_sla_config WHERE stage = li.status LIMIT 1), 9999)`)
  }

  const where = conditions.join(' AND ')
  return db.prepare(`
    SELECT li.*,
           r.block, r.room_no,
           u.full_name as created_by_name,
           m.name as machine_name,
           CASE
             WHEN li.status IN ('dirty','washing','ready')
             THEN ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1)
             ELSE NULL
           END as hours_in_status,
           (SELECT COUNT(*) FROM laundry_damages WHERE item_id = li.id) as damage_count,
           COALESCE(li.phone_override, p.phone_number) as phone_number,
           p.full_name as occupant_name,
           li.intake_name,
           li.clothing_items,
           (SELECT COUNT(*) FROM laundry_items li2
            WHERE li2.room_id = li.room_id
            AND li2.status NOT IN ('delivered','lost')
            AND li2.id != li.id) + 1 as room_active_count
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    LEFT JOIN laundry_machines m ON m.id = li.machine_id
    LEFT JOIN room_assignments ra ON ra.room_id = li.room_id AND ra.check_out_at IS NULL
    LEFT JOIN personnel p ON p.id = ra.personnel_id
    WHERE ${where}
    ORDER BY li.urgent DESC, li.updated_at ASC
  `).all(...params)
}

export function listAllItemsQuery({ status, from_date, to_date } = {}) {
  const db = getDB()
  const conditions = []
  const params = []
  if (status) { conditions.push('li.status = ?'); params.push(status) }
  if (from_date) { conditions.push('li.created_at >= ?'); params.push(from_date) }
  if (to_date) { conditions.push('li.created_at <= ?'); params.push(to_date) }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  return db.prepare(`
    SELECT li.*, r.block, r.room_no, u.full_name as created_by_name
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    ${where}
    ORDER BY li.created_at DESC
  `).all(...params)
}

export function updateItemStatusQuery(id, status, extra = {}) {
  const db = getDB()
  const sets = ["status = ?", "updated_at = datetime('now')"]
  const vals = [status]
  if (extra.machine_id !== undefined) { sets.push('machine_id = ?'); vals.push(extra.machine_id) }
  if (extra.shelf_location !== undefined) { sets.push('shelf_location = ?'); vals.push(extra.shelf_location) }
  if (extra.photo_url !== undefined) { sets.push('photo_url = ?'); vals.push(extra.photo_url) }
  vals.push(id)
  db.prepare(`UPDATE laundry_items SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function deleteItemQuery(id) {
  const db = getDB()
  const result = db.prepare('DELETE FROM laundry_items WHERE id = ?').run(id)
  return result.changes > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// MACHINES
// ═══════════════════════════════════════════════════════════════════════════

export function listMachinesQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT lm.*,
           (SELECT COUNT(*) FROM laundry_items WHERE machine_id = lm.id AND status = 'washing') as active_items
    FROM laundry_machines lm
    ORDER BY lm.type, lm.name
  `).all()
}

export function getMachineQuery(id) {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_machines WHERE id = ?').get(id)
}

export function insertMachineQuery({ name, type = 'washer', capacity_kg = 10 }) {
  const db = getDB()
  return db.prepare('INSERT INTO laundry_machines(name, type, capacity_kg) VALUES(?, ?, ?)').run(name, type, capacity_kg).lastInsertRowid
}

export function updateMachineQuery(id, fields) {
  const db = getDB()
  const { increment_runs, ...rest } = fields
  const allowed = ['name', 'type', 'status', 'timer_end', 'timer_started_at', 'capacity_kg', 'maintenance_notes', 'total_runs']
  const entries = Object.entries(rest).filter(([k]) => allowed.includes(k))
  if (!entries.length && !increment_runs) return
  const sets = entries.map(([k]) => `${k} = ?`)
  const vals = entries.map(([, v]) => v)
  if (increment_runs) {
    sets.push('total_runs = total_runs + 1')
  }
  if (!sets.length) return
  db.prepare(`UPDATE laundry_machines SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id)
}

export function deleteMachineQuery(id) {
  const db = getDB()
  const hasActive = db.prepare("SELECT COUNT(*) as c FROM laundry_items WHERE machine_id = ? AND status = 'washing'").get(id)
  if (hasActive.c > 0) return false
  db.prepare('DELETE FROM laundry_machines WHERE id = ?').run(id)
  return true
}

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE (FIFO + Urgent Priority)
// ═══════════════════════════════════════════════════════════════════════════

export function getQueueQuery(machineId) {
  const db = getDB()
  const where = machineId ? 'AND lq.machine_id = ?' : ''
  const params = machineId ? [machineId] : []
  return db.prepare(`
    SELECT lq.*, li.room_id, li.item_count, li.urgent, li.notes,
           r.block, r.room_no
    FROM laundry_queue lq
    LEFT JOIN laundry_items li ON li.id = lq.item_id
    LEFT JOIN rooms r ON r.id = li.room_id
    WHERE 1=1 ${where}
    ORDER BY lq.priority DESC, lq.position ASC
  `).all(...params)
}

export function addToQueueQuery({ item_id, machine_id, priority = 'normal' }) {
  const db = getDB()
  if (priority === 'urgent') {
    db.prepare('UPDATE laundry_queue SET position = position + 1').run()
    db.prepare(`
      INSERT INTO laundry_queue(item_id, machine_id, priority, position)
      VALUES(?, ?, 'urgent', 1)
    `).run(item_id, machine_id || null)
  } else {
    const max = db.prepare('SELECT COALESCE(MAX(position), 0) as m FROM laundry_queue').get()
    db.prepare(`
      INSERT INTO laundry_queue(item_id, machine_id, priority, position)
      VALUES(?, ?, 'normal', ?)
    `).run(item_id, machine_id || null, max.m + 1)
  }
}

export function removeFromQueueQuery(queueId) {
  const db = getDB()
  db.prepare('DELETE FROM laundry_queue WHERE id = ?').run(queueId)
}

export function removeItemFromQueueQuery(itemId) {
  const db = getDB()
  db.prepare('DELETE FROM laundry_queue WHERE item_id = ?').run(itemId)
}

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERIES
// ═══════════════════════════════════════════════════════════════════════════

export function insertDeliveryQuery({ item_id, delivered_to, signature_data, delivered_by }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_deliveries(item_id, delivered_to, signature_data, delivered_by)
    VALUES(?, ?, ?, ?)
  `).run(item_id, delivered_to, signature_data || null, delivered_by)
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

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════

export function insertHistoryQuery({ item_id, from_status, to_status, action_by, notes }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_history(item_id, from_status, to_status, action_by, notes)
    VALUES(?, ?, ?, ?, ?)
  `).run(item_id, from_status || null, to_status, action_by, notes || null)
}

export function getItemHistoryQuery(itemId) {
  const db = getDB()
  return db.prepare(`
    SELECT lh.*, u.full_name as action_by_name
    FROM laundry_history lh
    LEFT JOIN users u ON u.id = lh.action_by
    WHERE lh.item_id = ?
    ORDER BY lh.created_at ASC
  `).all(itemId)
}

// ═══════════════════════════════════════════════════════════════════════════
// SLA CONFIG + VIOLATIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getSlaConfigQuery() {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_sla_config ORDER BY stage').all()
}

export function upsertSlaConfigQuery({ stage, warning_hours, critical_hours, updated_by }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_sla_config(stage, warning_hours, critical_hours, updated_by, updated_at)
    VALUES(?, ?, ?, ?, datetime('now'))
    ON CONFLICT(stage) DO UPDATE SET
      warning_hours = excluded.warning_hours,
      critical_hours = excluded.critical_hours,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(stage, warning_hours, critical_hours, updated_by)
}

export function getSlaViolationsQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT li.*, r.block, r.room_no,
      sc.warning_hours, sc.critical_hours,
      ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) as hours_in_status,
      CASE
        WHEN ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) >= sc.critical_hours THEN 'critical'
        ELSE 'warning'
      END as sla_level
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) >= sc.warning_hours
    ORDER BY hours_in_status DESC
  `).all()
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS / STATS
// ═══════════════════════════════════════════════════════════════════════════

export function getStatsQuery({ from_date, to_date } = {}) {
  const db = getDB()

  const by_status = db.prepare(`
    SELECT status, COUNT(*) as count FROM laundry_items
    WHERE status != 'delivered' GROUP BY status
  `).all()

  const delivered_today = db.prepare(`
    SELECT COUNT(*) as count FROM laundry_deliveries
    WHERE date(delivered_at) = date('now')
  `).get()

  const avg_hours = db.prepare(`
    SELECT li.status,
      ROUND(AVG((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24), 1) as avg_h
    FROM laundry_items li
    WHERE li.status IN ('dirty','washing','ready')
    GROUP BY li.status
  `).all()

  const sla_violations = db.prepare(`
    SELECT COUNT(*) as count FROM laundry_items li
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1)
        >= COALESCE(sc.warning_hours, 9999)
  `).get()

  let period_total = { count: 0 }
  let period_delivered = { count: 0 }
  if (from_date && to_date) {
    period_total = db.prepare(`
      SELECT COUNT(*) as count FROM laundry_items
      WHERE created_at >= ? AND created_at <= ?
    `).get(from_date, to_date)
    period_delivered = db.prepare(`
      SELECT COUNT(*) as count FROM laundry_deliveries
      WHERE delivered_at >= ? AND delivered_at <= ?
    `).get(from_date, to_date)
  }

  const machine_stats = db.prepare(`
    SELECT lm.name, lm.type, lm.status,
      (SELECT COUNT(*) FROM laundry_items WHERE machine_id = lm.id AND status = 'washing') as active_loads
    FROM laundry_machines lm ORDER BY lm.type, lm.name
  `).all()

  // En aktif odalar (seçili dönem)
  let by_room = []
  let clothing_breakdown = []
  let lost_period = { count: 0 }
  let avg_delivery_hours = null

  if (from_date && to_date) {
    by_room = db.prepare(`
      SELECT r.block, r.room_no,
        COUNT(*) as total,
        SUM(CASE WHEN li.status='delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN li.status='lost' THEN 1 ELSE 0 END) as lost
      FROM laundry_items li
      LEFT JOIN rooms r ON r.id = li.room_id
      WHERE li.created_at >= ? AND li.created_at <= ?
      GROUP BY li.room_id
      ORDER BY total DESC
      LIMIT 10
    `).all(from_date, to_date)

    lost_period = db.prepare(`
      SELECT COUNT(*) as count FROM laundry_items
      WHERE status='lost' AND created_at >= ? AND created_at <= ?
    `).get(from_date, to_date)

    avg_delivery_hours = db.prepare(`
      SELECT ROUND(AVG((julianday(ld.delivered_at) - julianday(li.created_at)) * 24), 1) as avg_h
      FROM laundry_deliveries ld
      JOIN laundry_items li ON li.id = ld.item_id
      WHERE ld.delivered_at >= ? AND ld.delivered_at <= ?
    `).get(from_date, to_date)?.avg_h

    // Kıyafet tipi dağılımı (clothing_items JSON parse)
    const rawItems = db.prepare(`
      SELECT clothing_items FROM laundry_items
      WHERE clothing_items IS NOT NULL AND created_at >= ? AND created_at <= ?
    `).all(from_date, to_date)

    const typeCounts = {}
    for (const row of rawItems) {
      try {
        const items = JSON.parse(row.clothing_items)
        for (const item of items) {
          typeCounts[item.type] = (typeCounts[item.type] || 0) + (item.qty || 1)
        }
      } catch {}
    }
    clothing_breakdown = Object.entries(typeCounts)
      .map(([type, qty]) => ({ type, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
  }

  return { by_status, delivered_today, avg_hours, sla_violations, period_total, period_delivered, machine_stats, by_room, lost_period, avg_delivery_hours, clothing_breakdown }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSON HISTORY
// ═══════════════════════════════════════════════════════════════════════════

export function getPersonHistoryQuery(name) {
  const db = getDB()
  return db.prepare(`
    SELECT li.*,
           r.block, r.room_no,
           COALESCE(li.phone_override, p.phone_number) as phone_number,
           p.full_name as occupant_name,
           ld.delivered_at,
           CASE WHEN ld.delivered_at IS NOT NULL
             THEN ROUND((julianday(ld.delivered_at) - julianday(li.created_at)) * 24, 1)
             ELSE NULL
           END as total_hours
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN room_assignments ra ON ra.room_id = li.room_id AND ra.check_out_at IS NULL
    LEFT JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN laundry_deliveries ld ON ld.item_id = li.id
    WHERE (p.full_name = ? OR li.intake_name = ?)
    ORDER BY li.created_at DESC
  `).all(name, name)
}

export function markFoundQuery(id, userId) {
  const db = getDB()
  db.prepare(`UPDATE laundry_items SET status='ready', updated_at=datetime('now') WHERE id=?`).run(id)
  db.prepare(`
    INSERT INTO laundry_history(item_id, from_status, to_status, action_by, notes)
    VALUES(?, 'lost', 'ready', ?, 'Kayıp bulundu')
  `).run(id, userId)
  return db.prepare(`SELECT * FROM laundry_items WHERE id=?`).get(id)
}
