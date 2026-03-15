import { getDB } from '../../shared/db/index.js'

export function addRecord({ personnelId, cardType, reason, createdBy }) {
  const db = getDB()
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO discipline_records(personnel_id,card_type,reason,created_by) VALUES(?,?,?,?)').run(personnelId, cardType, reason, createdBy)
    const points = cardType === 'red' ? 2 : 1
    db.prepare('UPDATE personnel SET discipline_points=discipline_points+? WHERE id=?').run(points, personnelId)
    const p = db.prepare('SELECT discipline_points, full_name FROM personnel WHERE id=?').get(personnelId)
    if (p.discipline_points >= 3) {
      db.prepare("INSERT INTO notifications(message,type,module,target_role) VALUES(?,?,?,?)").run(
        `${p.full_name} fesih limitine ulaştı (${p.discipline_points} puan). Çıkış işlemi başlatılmalıdır.`,
        'critical', 'discipline', 'campus_manager'
      )
    }
  })
  tx()
}

export function getRecords(personnelId) {
  const db = getDB()
  return db.prepare(`
    SELECT dr.*, u.full_name as created_by_name FROM discipline_records dr
    JOIN users u ON u.id=dr.created_by
    WHERE dr.personnel_id=? ORDER BY dr.created_at DESC
  `).all(personnelId)
}

export function addToBlacklist(personnelId, reason, userId) {
  const db = getDB()
  db.prepare("UPDATE personnel SET is_blacklisted=1, blacklist_reason=?, blacklisted_at=datetime('now'), blacklisted_by=? WHERE id=?").run(reason, userId, personnelId)
}
