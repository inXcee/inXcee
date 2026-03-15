import { getDB } from '../../shared/db/index.js'

const M_BLOCK_SCHEDULE = [
  { hour: 6, label: '06:00 Sabah Temizliği' },
  { hour: 12, label: '12:00 Öğle Temizliği' },
  { hour: 18, label: '18:00 Akşam Temizliği' },
  { hour: 23, label: '23:00 Gece Temizliği' },
]

export function generateDailyTasks(date = new Date()) {
  const db = getDB()
  const dateStr = date.toISOString().split('T')[0]
  const rooms = db.prepare("SELECT DISTINCT block, floor FROM rooms WHERE block LIKE 'M%'").all()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location)
    VALUES(?,?,?,?,?,?)
  `)
  let count = 0
  const tx = db.transaction(() => {
    rooms.forEach(({ block, floor }) => {
      M_BLOCK_SCHEDULE.forEach(({ hour, label }) => {
        const scheduled = `${dateStr} ${String(hour).padStart(2,'0')}:00:00`
        insert.run(`${block} ${floor}.Kat Ortak Alan`, block, floor, 'common_area', scheduled, `${block}-${floor}-common`)
        count++
      })
    })
    // S blok günlük bireysel
    const sRooms = db.prepare("SELECT id, block, floor, room_no FROM rooms WHERE block LIKE 'S%' AND status='active'").all()
    sRooms.forEach(r => {
      insert.run(`${r.block} Oda ${r.room_no}`, r.block, r.floor, 'room', `${dateStr} 10:00:00`, `${r.block}-${r.room_no}`)
      count++
    })
  })
  tx()
  return count
}

export function getTasks({ assigned_to, date, block } = {}) {
  const db = getDB()
  let q = `SELECT ct.*, u.full_name as assignee_name FROM cleaning_tasks ct LEFT JOIN users u ON u.id=ct.assigned_to WHERE 1=1`
  const params = []
  if (assigned_to) { q += ' AND ct.assigned_to=?'; params.push(assigned_to) }
  if (date) { q += ' AND DATE(ct.scheduled_at)=?'; params.push(date) }
  if (block) { q += ' AND ct.block=?'; params.push(block) }
  q += ' ORDER BY ct.scheduled_at'
  return db.prepare(q).all(...params)
}

export function completeTask(taskId, userId) {
  const db = getDB()
  db.prepare("UPDATE cleaning_tasks SET completed_at=datetime('now'), assigned_to=?, verified_by_qr=1 WHERE id=?").run(userId, taskId)
}

export function getDNDRooms() {
  const db = getDB()
  return db.prepare(`
    SELECT DISTINCT r.id, r.block, r.floor, r.room_no
    FROM rooms r
    JOIN room_assignments ra ON ra.room_id=r.id AND ra.check_out_at IS NULL
    WHERE r.block LIKE 'S%'
  `).all()
}
