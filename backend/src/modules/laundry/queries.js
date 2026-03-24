import { getDB } from '../../shared/db/index.js'
import { randomUUID } from 'crypto'

export function generateBag(roomId) {
  const db = getDB()
  const qr = randomUUID()
  db.prepare('INSERT INTO laundry_bags(qr_code,room_id,status) VALUES(?,?,?)').run(qr, roomId, 'clean')
  return { qr_code: qr }
}

export function getBagByQR(qrCode) {
  const db = getDB()
  return db.prepare('SELECT lb.*, r.block, r.floor, r.room_no FROM laundry_bags lb JOIN rooms r ON r.id=lb.room_id WHERE lb.qr_code=?').get(qrCode)
}

export function collectBag(qrCode, userId) {
  const db = getDB()
  db.prepare("UPDATE laundry_bags SET status='collected', collected_at=datetime('now'), collected_by=? WHERE qr_code=?").run(userId, qrCode)
  return getBagByQR(qrCode)
}

export function loadMachine(machineId, bagIds, block, userId) {
  const db = getDB()
  const machine = db.prepare('SELECT * FROM machines WHERE id=?').get(machineId)
  const deterjanPerCycle = machine.detergent_per_cycle_g * bagIds.length
  const tx = db.transaction(() => {
    db.prepare("UPDATE machines SET status='running', current_block=?, cycle_start=datetime('now') WHERE id=?").run(block, machineId)
    bagIds.forEach(id => db.prepare("UPDATE laundry_bags SET status='washing', machine_id=?, wash_started_at=datetime('now') WHERE id=?").run(machineId, id))
    db.prepare("UPDATE inventory SET quantity=quantity-?, last_updated=datetime('now') WHERE item_name='Sanayi Deterjanı'").run(deterjanPerCycle)
    // Stok uyarısı kontrol
    const inv = db.prepare("SELECT * FROM inventory WHERE item_name='Sanayi Deterjanı'").get()
    if (inv && inv.quantity <= inv.reorder_threshold) {
      db.prepare("INSERT INTO notifications(message,type,module,target_role) VALUES(?,?,?,?)").run('Deterjan stoku kritik seviyede!', 'critical', 'laundry', 'campus_manager')
    }
  })
  tx()
}

export function finishWash(machineId) {
  const db = getDB()
  db.prepare("UPDATE laundry_bags SET status='ready' WHERE machine_id=? AND status='washing'").run(machineId)
  db.prepare("UPDATE machines SET status='idle', current_block=NULL WHERE id=?").run(machineId)
}

export function getDistributionRoute() {
  const db = getDB()
  return db.prepare(`
    SELECT lb.*, r.block, r.floor, r.room_no
    FROM laundry_bags lb
    JOIN rooms r ON r.id=lb.room_id
    WHERE lb.status='ready'
    ORDER BY CASE r.block WHEN 'M1' THEN 1 WHEN 'M2' THEN 2 WHEN 'S1' THEN 3 WHEN 'S2' THEN 4 WHEN 'S3' THEN 5 ELSE 6 END, r.floor, r.room_no
  `).all()
}

export function distributeBag(bagId, damageNote) {
  const db = getDB()
  db.prepare("UPDATE laundry_bags SET status='distributed', distributed_at=datetime('now'), damage_note=? WHERE id=?").run(damageNote || null, bagId)
}

export function getAllBags() {
  const db = getDB()
  return db.prepare(`
    SELECT lb.*, r.block, r.floor, r.room_no
    FROM laundry_bags lb
    LEFT JOIN rooms r ON r.id = lb.room_id
    WHERE lb.status != 'distributed'
    ORDER BY lb.id DESC
  `).all()
}
