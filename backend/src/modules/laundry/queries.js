import { getDB } from '../../shared/db/index.js'

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════════════════

export function insertItemQuery({ room_id, item_count = 1, item_details, notes, urgent = 0, photo_url, phone_override, intake_name, intake_signature, clothing_items, needs_ironing = 0, is_premium = 0, created_by }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO laundry_items(room_id, item_count, item_details, notes, urgent, photo_url, phone_override, intake_name, intake_signature, clothing_items, needs_ironing, is_premium, created_by, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(room_id, item_count, item_details || null, notes || null, urgent ? 1 : 0, photo_url || null, phone_override || null, intake_name || null, intake_signature || null, clothing_items ? (typeof clothing_items === 'string' ? clothing_items : JSON.stringify(clothing_items)) : null, needs_ironing ? 1 : 0, is_premium ? 1 : 0, created_by)
  return r.lastInsertRowid
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export function getBlockConfigQuery() {
  const db = getDB()
  return db.prepare(`SELECT * FROM laundry_block_config ORDER BY block ASC`).all()
}

export function upsertBlockConfigQuery(block, is_premium, userId) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_block_config(block, is_premium, updated_by, updated_at)
    VALUES(?, ?, ?, datetime('now'))
    ON CONFLICT(block) DO UPDATE SET
      is_premium=excluded.is_premium,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at
  `).run(block, is_premium ? 1 : 0, userId || null)
  return db.prepare(`SELECT * FROM laundry_block_config WHERE block=?`).get(block)
}

export function isBlockPremiumQuery(block) {
  const db = getDB()
  const row = db.prepare(`SELECT is_premium FROM laundry_block_config WHERE block=?`).get(block)
  if (row) return row.is_premium === 1
  // Konfigürasyonda yoksa: M* ve S* blokları değilse premium kabul et
  return !block.startsWith('M') && !block.startsWith('S')
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
            AND li2.status NOT IN ('delivered','lost')) as room_active_count,
           lv.all_present,
           lv.missing_notes as verification_notes
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    LEFT JOIN laundry_machines m ON m.id = li.machine_id
    LEFT JOIN room_assignments ra ON ra.room_id = li.room_id AND ra.check_out_at IS NULL
    LEFT JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN laundry_verifications lv ON lv.item_id = li.id
      AND lv.stage IN ('washing_to_ready','ironing_to_ready')
      AND lv.rowid = (
        SELECT MAX(rowid) FROM laundry_verifications
        WHERE item_id = li.id AND stage IN ('washing_to_ready','ironing_to_ready')
      )
    WHERE li.id = ?
  `).get(id)
}

export function insertVerificationQuery({ item_id, stage, verified_by, items_json, missing_notes, all_present }) {
  const db = getDB()
  const result = db.prepare(`
    INSERT INTO laundry_verifications(item_id, stage, verified_by, items_json, missing_notes, all_present)
    VALUES (?,?,?,?,?,?)
  `).run(item_id, stage, verified_by,
    typeof items_json === 'string' ? items_json : JSON.stringify(items_json),
    missing_notes || null,
    all_present ? 1 : 0)
  return db.prepare('SELECT * FROM laundry_verifications WHERE id=?').get(result.lastInsertRowid)
}

export function getVerificationsForItemQuery(itemId) {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_verifications WHERE item_id=? ORDER BY verified_at').all(itemId)
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
    conditions.push("(r.block || ' ' || r.room_no LIKE ? OR li.notes LIKE ? OR li.intake_name LIKE ?)")
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
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
           m.timer_end,
           m.timer_started_at,
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
           (SELECT COUNT(*) FROM premium_garments WHERE item_id = li.id) as premium_garment_count,
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
// ARCHIVE
// ═══════════════════════════════════════════════════════════════════════════

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

export function getSlaConfigQuery() {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_sla_config ORDER BY stage').all()
}

export function upsertSlaConfigQuery({ stage, warning_hours, critical_hours, whatsapp_notify, updated_by }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_sla_config(stage, warning_hours, critical_hours, whatsapp_notify, updated_by, updated_at)
    VALUES(?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(stage) DO UPDATE SET
      warning_hours = excluded.warning_hours,
      critical_hours = excluded.critical_hours,
      whatsapp_notify = excluded.whatsapp_notify,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(stage, warning_hours, critical_hours, whatsapp_notify ? 1 : 0, updated_by)
}

export function getSettingsQuery() {
  const db = getDB()
  const rows = db.prepare('SELECT key, value FROM laundry_global_settings').all()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

export function updateSettingQuery(key, value) {
  const db = getDB()
  db.prepare(`INSERT INTO laundry_global_settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value)
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

  const washed_today = db.prepare(`
    SELECT COUNT(*) as count FROM laundry_history
    WHERE to_status = 'washing'
      AND date(created_at) = date('now')
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
    SELECT lm.name, lm.type, lm.status, lm.total_runs, lm.maintenance_notes,
      (SELECT COUNT(*) FROM laundry_items WHERE machine_id = lm.id AND status = 'washing') as active_loads,
      CASE WHEN lm.total_runs >= 50 THEN 1 ELSE 0 END as needs_maintenance
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

  const weekly_trend = db.prepare(`
    SELECT
      date(created_at) as day,
      COUNT(*) as received,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered
    FROM laundry_items
    WHERE date(created_at) >= date('now', '-6 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all()

  return { by_status, delivered_today, washed_today, avg_hours, sla_violations, period_total, period_delivered, machine_stats, by_room, lost_period, avg_delivery_hours, clothing_breakdown, weekly_trend }
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

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

export function getMessagesQuery({ limit = 50, before_id } = {}) {
  const db = getDB()
  if (before_id) {
    return db.prepare(`
      SELECT * FROM laundry_messages WHERE id < ?
      ORDER BY created_at ASC, id ASC LIMIT ?
    `).all(before_id, limit)
  }
  return db.prepare(`
    SELECT * FROM laundry_messages
    ORDER BY created_at ASC, id ASC LIMIT ?
  `).all(limit)
}

export function getMessageQuery(id) {
  const db = getDB()
  return db.prepare(`SELECT * FROM laundry_messages WHERE id=?`).get(id)
}

export function insertMessageQuery({ sender_id, sender_name, message, message_type = 'normal' }) {
  const db = getDB()
  const result = db.prepare(`
    INSERT INTO laundry_messages(sender_id, sender_name, message, message_type)
    VALUES(?, ?, ?, ?)
  `).run(sender_id, sender_name, message, message_type)
  return db.prepare(`SELECT * FROM laundry_messages WHERE id=?`).get(result.lastInsertRowid)
}

export function deleteMessageQuery(id) {
  const db = getDB()
  return db.prepare(`DELETE FROM laundry_messages WHERE id=?`).run(id)
}

export function pinMessageQuery(id, is_pinned) {
  const db = getDB()
  db.prepare(`UPDATE laundry_messages SET is_pinned=? WHERE id=?`).run(is_pinned ? 1 : 0, id)
  return db.prepare(`SELECT * FROM laundry_messages WHERE id=?`).get(id)
}

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM GARMENTS
// ═══════════════════════════════════════════════════════════════════════════

export function generateNextGarmentSeqQuery(prefix) {
  const db = getDB()
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM premium_garments WHERE garment_code LIKE ?`).get(`${prefix}-%`)
  return (row?.cnt || 0) + 1
}

export function insertPremiumGarmentsQuery(item_id, garments) {
  const db = getDB()
  // Oda bilgisini al (block + room_no)
  const item = db.prepare(`
    SELECT r.block, r.room_no FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    WHERE li.id = ?
  `).get(item_id)
  if (!item) throw new Error('Kayıt bulunamadı')

  const prefix = `${item.block}${item.room_no}`

  const insert = db.prepare(`
    INSERT INTO premium_garments(item_id, garment_code, garment_type, brand, model, size, color, pattern, condition_notes)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((list) => {
    const codes = []
    for (const g of list) {
      const seq = generateNextGarmentSeqQuery(prefix)
      const code = `${prefix}-${String(seq).padStart(3, '0')}`
      insert.run(
        item_id, code,
        g.garment_type, g.brand || null, g.model || null,
        g.size || null, g.color || null, g.pattern || null, g.condition_notes || null
      )
      codes.push(code)
    }
    return codes
  })

  return insertMany(garments)
}

export function getPremiumGarmentsQuery(item_id) {
  const db = getDB()
  return db.prepare(`SELECT * FROM premium_garments WHERE item_id=? ORDER BY garment_code ASC`).all(item_id)
}

export function getPremiumGarmentByCodeQuery(code) {
  const db = getDB()
  return db.prepare(`SELECT * FROM premium_garments WHERE garment_code=?`).get(code)
}

export function getPremiumGarmentQuery(garment_id) {
  const db = getDB()
  return db.prepare(`SELECT * FROM premium_garments WHERE id=?`).get(garment_id)
}

export function advancePremiumGarmentQuery(garment_id, to_status, userId) {
  const db = getDB()
  const g = db.prepare(`SELECT * FROM premium_garments WHERE id=?`).get(garment_id)
  if (!g) throw new Error('Parça bulunamadı')
  db.prepare(`
    UPDATE premium_garments SET status=?, updated_at=datetime('now')
    WHERE id=?
  `).run(to_status, garment_id)
  db.prepare(`
    INSERT INTO premium_garment_history(garment_id, from_status, to_status, action_by)
    VALUES(?, ?, ?, ?)
  `).run(garment_id, g.status, to_status, userId || null)
  return db.prepare(`SELECT * FROM premium_garments WHERE id=?`).get(garment_id)
}

export function checkAllGarmentsStatusQuery(item_id) {
  const db = getDB()
  const rows = db.prepare(`SELECT status FROM premium_garments WHERE item_id=?`).all(item_id)
  const counts = { total: rows.length, received: 0, ironing: 0, ready: 0, delivered: 0, lost: 0 }
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1
  return counts
}

export function bulkSetGarmentsStatusQuery(item_id, to_status, userId) {
  const db = getDB()
  const garments = db.prepare(`SELECT id, status FROM premium_garments WHERE item_id=?`).all(item_id)
  const update = db.prepare(`UPDATE premium_garments SET status=?, updated_at=datetime('now') WHERE id=?`)
  const hist = db.prepare(`INSERT INTO premium_garment_history(garment_id, from_status, to_status, action_by) VALUES(?,?,?,?)`)
  const run = db.transaction(() => {
    for (const g of garments) {
      update.run(to_status, g.id)
      hist.run(g.id, g.status, to_status, userId || null)
    }
  })
  run()
  return garments.length
}

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM GARMENT DELIVERIES
// ═══════════════════════════════════════════════════════════════════════════

export function deliverPremiumGarmentQuery(garment_id, item_id, { delivered_to, signature_data }, userId) {
  const db = getDB()
  db.prepare(`
    UPDATE premium_garments
    SET status='delivered', delivered_to=?, delivered_at=datetime('now'), updated_at=datetime('now')
    WHERE id=?
  `).run(delivered_to, garment_id)
  db.prepare(`
    INSERT INTO premium_garment_history(garment_id, from_status, to_status, action_by, notes)
    VALUES(?, 'ready', 'delivered', ?, ?)
  `).run(garment_id, userId || null, `Teslim: ${delivered_to}`)
  db.prepare(`
    INSERT INTO premium_garment_deliveries(garment_id, item_id, delivered_to, signature_data, delivered_by)
    VALUES(?, ?, ?, ?, ?)
  `).run(garment_id, item_id, delivered_to, signature_data || null, userId || null)
}

export function getPremiumDeliveryReceiptQuery(item_id) {
  const db = getDB()
  return db.prepare(`
    SELECT pg.id, pg.garment_code, pg.garment_type, pg.brand, pg.model, pg.size, pg.color,
           pg.status, pg.delivered_to, pg.delivered_at,
           pgd.signature_data, pgd.delivered_at AS receipt_at
    FROM premium_garments pg
    LEFT JOIN premium_garment_deliveries pgd ON pgd.garment_id = pg.id
    WHERE pg.item_id = ?
    ORDER BY pg.garment_code ASC
  `).all(item_id)
}

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM GARMENT SEARCH
// ═══════════════════════════════════════════════════════════════════════════

export function searchPremiumGarmentsQuery({ block, room_no, garment_type, brand, size, color, pattern, intake_name, status, from_date, to_date, page = 1, limit = 50 } = {}) {
  const db = getDB()
  const conditions = []
  const params = []

  if (block)        { conditions.push('r.block = ?');            params.push(block) }
  if (room_no)      { conditions.push('r.room_no = ?');          params.push(room_no) }
  if (garment_type) { conditions.push('pg.garment_type LIKE ?'); params.push(`%${garment_type}%`) }
  if (brand)        { conditions.push('pg.brand LIKE ?');        params.push(`%${brand}%`) }
  if (size)         { conditions.push('pg.size = ?');            params.push(size) }
  if (color)        { conditions.push('pg.color LIKE ?');        params.push(`%${color}%`) }
  if (pattern)      { conditions.push('pg.pattern LIKE ?');      params.push(`%${pattern}%`) }
  if (intake_name)  { conditions.push('li.intake_name LIKE ?');  params.push(`%${intake_name}%`) }
  if (status)       { conditions.push('pg.status = ?');          params.push(status) }
  if (from_date)    { conditions.push("li.created_at >= ?");     params.push(from_date) }
  if (to_date)      { conditions.push("li.created_at <= ?");     params.push(to_date + ' 23:59:59') }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (page - 1) * limit

  const rows = db.prepare(`
    SELECT pg.id, pg.garment_code, pg.garment_type, pg.brand, pg.model, pg.size, pg.color,
           pg.pattern, pg.status, pg.condition_notes, pg.delivered_to, pg.delivered_at,
           li.id AS item_id, li.created_at AS intake_date, li.intake_name,
           r.block, r.room_no
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    ${where}
    ORDER BY li.created_at DESC, pg.garment_code ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  const total = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    ${where}
  `).get(...params)

  return { rows, total: total.cnt, page, limit }
}

export function getRoomGarmentHistoryQuery(room_id, { from_date, to_date } = {}) {
  const db = getDB()
  const conditions = ['li.room_id = ?']
  const params = [room_id]

  if (from_date) { conditions.push("li.created_at >= ?"); params.push(from_date) }
  if (to_date)   { conditions.push("li.created_at <= ?"); params.push(to_date + ' 23:59:59') }

  return db.prepare(`
    SELECT pg.id, pg.garment_code, pg.garment_type, pg.brand, pg.model, pg.size, pg.color, pg.status,
           pg.delivered_to, pg.delivered_at,
           li.id AS item_id, li.created_at AS intake_date
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY li.created_at DESC, pg.garment_code ASC
  `).all(...params)
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOM SCAN
// ═══════════════════════════════════════════════════════════════════════════

export function getRoomGarmentsForScanQuery(block, room_no) {
  const db = getDB()
  const room = db.prepare(`SELECT id FROM rooms WHERE block=? AND room_no=?`).get(block, room_no)
  if (!room) return null

  const items = db.prepare(`
    SELECT id, status, item_count, created_at, needs_ironing, is_premium
    FROM laundry_items
    WHERE room_id=? AND status NOT IN ('delivered','lost')
    ORDER BY created_at DESC
    LIMIT 5
  `).all(room.id)

  if (items.length === 0) return { room_id: room.id, block, room_no, items: [], garments: [] }

  const itemIds = items.map(i => i.id)
  const placeholders = itemIds.map(() => '?').join(',')
  const garments = db.prepare(`
    SELECT pg.*, li.status AS item_status
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    WHERE pg.item_id IN (${placeholders})
    ORDER BY pg.item_id DESC, pg.garment_code ASC
  `).all(...itemIds)

  return { room_id: room.id, block, room_no, items, garments }
}

export function insertScanLogQuery(room_id, block, room_no, garment_id, action, userId) {
  const db = getDB()
  db.prepare(`
    INSERT INTO garment_scan_log(room_id, block, room_no, garment_id, scanned_by, action)
    VALUES(?, ?, ?, ?, ?, ?)
  `).run(room_id || null, block || null, room_no || null, garment_id || null, userId || null, action)
}

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM REPORTS
// ═══════════════════════════════════════════════════════════════════════════

export function getPremiumReportQuery({ from_date, to_date } = {}) {
  const db = getDB()
  const dateFilter = []
  const dateParams = []
  if (from_date) { dateFilter.push("li.created_at >= ?"); dateParams.push(from_date) }
  if (to_date)   { dateFilter.push("li.created_at <= ?"); dateParams.push(to_date + ' 23:59:59') }
  const dateWhere = dateFilter.length ? `AND ${dateFilter.join(' AND ')}` : ''

  const byBlock = db.prepare(`
    SELECT r.block, COUNT(*) AS total,
           SUM(CASE WHEN pg.status='lost' THEN 1 ELSE 0 END) AS lost,
           SUM(CASE WHEN pg.status='delivered' THEN 1 ELSE 0 END) AS delivered
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    WHERE 1=1 ${dateWhere}
    GROUP BY r.block ORDER BY total DESC
  `).all(...dateParams)

  const byType = db.prepare(`
    SELECT pg.garment_type, COUNT(*) AS total,
           SUM(CASE WHEN pg.status='lost' THEN 1 ELSE 0 END) AS lost
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    WHERE 1=1 ${dateWhere}
    GROUP BY pg.garment_type ORDER BY total DESC
    LIMIT 15
  `).all(...dateParams)

  const lostList = db.prepare(`
    SELECT pg.garment_code, pg.garment_type, pg.brand, pg.model, pg.size, pg.color,
           r.block, r.room_no, li.created_at AS intake_date
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    WHERE pg.status='lost' ${dateWhere}
    ORDER BY li.created_at DESC
    LIMIT 50
  `).all(...dateParams)

  const topRooms = db.prepare(`
    SELECT r.block, r.room_no, COUNT(*) AS total
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    WHERE 1=1 ${dateWhere}
    GROUP BY r.block, r.room_no ORDER BY total DESC
    LIMIT 10
  `).all(...dateParams)

  const avgDelivery = db.prepare(`
    SELECT
      ROUND(AVG(CASE WHEN li.is_premium=1
        THEN (julianday(li.updated_at) - julianday(li.created_at)) * 24 END), 1) AS premium_avg_hours,
      ROUND(AVG(CASE WHEN li.is_premium=0
        THEN (julianday(li.updated_at) - julianday(li.created_at)) * 24 END), 1) AS regular_avg_hours
    FROM laundry_items li
    WHERE li.status='delivered' ${dateWhere.replace(/li\.created_at/g, 'li.created_at')}
  `).get(...dateParams)

  const totals = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN pg.status='lost' THEN 1 ELSE 0 END) AS total_lost,
           SUM(CASE WHEN pg.status='delivered' THEN 1 ELSE 0 END) AS total_delivered,
           SUM(CASE WHEN pg.status='ready' THEN 1 ELSE 0 END) AS total_ready,
           SUM(CASE WHEN pg.status IN ('received','ironing') THEN 1 ELSE 0 END) AS total_in_progress
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    WHERE 1=1 ${dateWhere}
  `).get(...dateParams)

  return { totals, byBlock, byType, lostList, topRooms, avgDelivery }
}

export function exportPremiumGarmentsQuery({ from_date, to_date } = {}) {
  const db = getDB()
  const conditions = ['li.is_premium=1']
  const params = []
  if (from_date) { conditions.push("li.created_at >= ?"); params.push(from_date) }
  if (to_date)   { conditions.push("li.created_at <= ?"); params.push(to_date + ' 23:59:59') }

  return db.prepare(`
    SELECT pg.garment_code, r.block, r.room_no, pg.garment_type,
           pg.brand, pg.model, pg.size, pg.color, pg.status,
           li.created_at AS intake_date, pg.delivered_at,
           ROUND((julianday(COALESCE(pg.delivered_at, datetime('now'))) - julianday(li.created_at)) * 24, 1) AS total_hours
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY li.created_at DESC, pg.garment_code ASC
  `).all(...params)
}
