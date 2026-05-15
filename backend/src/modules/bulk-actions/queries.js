import { getDB } from '../../shared/db/index.js'

export function listActivePersonnel(filters = {}) {
  const db = getDB()
  const where = ['p.check_out_date IS NULL']
  const params = []
  if (filters.block) { where.push('r.block = ?'); params.push(filters.block) }
  if (filters.floor != null && filters.floor !== '') { where.push('r.floor = ?'); params.push(+filters.floor) }
  if (filters.company) { where.push('p.company LIKE ?'); params.push(`%${filters.company}%`) }
  if (filters.q) {
    where.push('(p.full_name LIKE ? OR p.tc_no LIKE ? OR r.room_no LIKE ?)')
    const term = `%${filters.q}%`
    params.push(term, term, term)
  }
  return db.prepare(`
    SELECT p.id, p.full_name, p.tc_no, p.company, p.job_title, p.check_in_date,
      r.block, r.floor, r.room_no, ra.bed_no,
      (SELECT COUNT(*) FROM zimmet z WHERE z.personnel_id=p.id AND z.returned_at IS NULL) AS unreturned_zimmet
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    WHERE ${where.join(' AND ')}
    ORDER BY r.block, r.room_no, p.full_name
    LIMIT 500
  `).all(...params)
}

export function bulkCheckoutTx(ids) {
  const db = getDB()
  const success = []
  const skipped = []
  const tx = db.transaction(() => {
    for (const id of ids) {
      const person = db.prepare('SELECT id, full_name, check_out_date FROM personnel WHERE id=?').get(id)
      if (!person) { skipped.push({ id, reason: 'bulunamadi' }); continue }
      if (person.check_out_date) { skipped.push({ id, name: person.full_name, reason: 'zaten cikti' }); continue }
      const unreturned = db.prepare(
        'SELECT COUNT(*) AS c FROM zimmet WHERE personnel_id=? AND returned_at IS NULL'
      ).get(id).c
      if (unreturned > 0) {
        skipped.push({ id, name: person.full_name, reason: `${unreturned} zimmet bekliyor` })
        continue
      }
      db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE personnel_id=? AND check_out_at IS NULL").run(id)
      db.prepare("UPDATE personnel SET check_out_date=datetime('now') WHERE id=?").run(id)
      success.push({ id, name: person.full_name })
    }
  })
  tx()
  return { success, skipped }
}
