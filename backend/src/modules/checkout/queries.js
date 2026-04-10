import { getDB } from '../../shared/db/index.js'

export function getCheckoutPreview(personnelId) {
  const db = getDB()
  const person = db.prepare(`
    SELECT p.*, p.emergency_name, p.emergency_phone,
      ra.room_id, r.block, r.floor, r.room_no, ra.bed_no,
      COALESCE(s.shift_type, 'day') as shift_type
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE p.id=?
  `).get(personnelId)
  if (!person) return null

  const zimmet = db.prepare(`
    SELECT z.id, z.item_name, z.quantity, z.created_at, z.returned_at, z.return_condition
    FROM zimmet z WHERE z.personnel_id=?
    ORDER BY z.returned_at IS NULL DESC, z.created_at DESC
  `).all(personnelId)

  const discipline = db.prepare(`
    SELECT dr.*, u.full_name as created_by_name
    FROM discipline_records dr
    JOIN users u ON u.id=dr.created_by
    WHERE dr.personnel_id=? ORDER BY dr.created_at DESC
  `).all(personnelId)

  const unreturned = zimmet.filter(z => !z.returned_at)
  return { person, zimmet, unreturned, discipline }
}

export function processCheckout(personnelId, zimmetActions, userId) {
  const db = getDB()
  const tx = db.transaction(() => {
    // Process zimmet actions: each item can be 'return', 'damaged', 'lost'
    if (zimmetActions && zimmetActions.length > 0) {
      for (const action of zimmetActions) {
        if (action.action === 'return') {
          db.prepare("UPDATE zimmet SET returned_at=datetime('now'), return_condition='normal' WHERE id=?").run(action.zimmet_id)
        } else if (action.action === 'damaged') {
          db.prepare("UPDATE zimmet SET returned_at=datetime('now'), return_condition='damaged', damage_note=? WHERE id=?").run(action.note || null, action.zimmet_id)
        } else if (action.action === 'lost') {
          db.prepare("UPDATE zimmet SET returned_at=datetime('now'), return_condition='lost', damage_note=? WHERE id=?").run(action.note || 'Kayip bildirimi', action.zimmet_id)
        }
      }
    }
    // Remove from room
    db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE personnel_id=? AND check_out_at IS NULL").run(personnelId)
    // Set checkout date
    db.prepare("UPDATE personnel SET check_out_date=datetime('now') WHERE id=?").run(personnelId)
  })
  tx()
}

export function getRecentCheckouts(limit = 20) {
  const db = getDB()
  return db.prepare(`
    SELECT p.id, p.full_name, p.company, p.check_out_date,
      r.block, r.room_no
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id
    LEFT JOIN rooms r ON r.id=ra.room_id
    WHERE p.check_out_date IS NOT NULL
    ORDER BY p.check_out_date DESC
    LIMIT ?
  `).all(limit)
}
