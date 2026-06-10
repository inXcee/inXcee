import { getDB } from '../../../shared/db/index.js'
// 50 yıkamada bir bakım — bildirim + needs_maintenance bayrağı bu eşiği kullanır
export const MAINTENANCE_RUN_THRESHOLD = 50

export function listMachinesQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT lm.*,
           (SELECT COUNT(*) FROM laundry_items WHERE machine_id = lm.id AND status = 'washing') as active_items,
           CASE WHEN lm.runs_since_maintenance >= ${MAINTENANCE_RUN_THRESHOLD} THEN 1 ELSE 0 END as needs_maintenance
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
    sets.push('runs_since_maintenance = runs_since_maintenance + 1')
  }
  if (!sets.length) return
  db.prepare(`UPDATE laundry_machines SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id)
}

// Bakım yapıldı: sayaç sıfırlanır, bakımda olan makine boşa döner
export function machineMaintenanceDoneQuery(id) {
  const db = getDB()
  db.prepare(`
    UPDATE laundry_machines
    SET runs_since_maintenance = 0,
        last_maintenance_at = datetime('now'),
        status = CASE WHEN status = 'maintenance' THEN 'idle' ELSE status END
    WHERE id = ?
  `).run(id)
  return db.prepare('SELECT * FROM laundry_machines WHERE id = ?').get(id)
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

