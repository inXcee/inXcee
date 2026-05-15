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

export function bulkTransferTx(ids, { target_block, target_room_id }, assignedBy) {
  const db = getDB()
  const success = []
  const skipped = []
  const tx = db.transaction(() => {
    // Hedef odalari belirle: belirli oda verildiyse onu kullan, yoksa blok icindeki bos yatakli odalari sirayla
    let candidateRooms
    if (target_room_id) {
      const r = db.prepare('SELECT * FROM rooms WHERE id=?').get(target_room_id)
      if (!r) throw new Error('Hedef oda bulunamadi')
      if (r.status && r.status !== 'active') throw new Error(`Hedef oda durumu: ${r.status}`)
      candidateRooms = [r]
    } else if (target_block) {
      candidateRooms = db.prepare(
        "SELECT * FROM rooms WHERE block=? AND (status IS NULL OR status='active') ORDER BY floor, room_no"
      ).all(target_block)
    } else {
      throw new Error('Hedef oda veya blok gerekli')
    }

    for (const id of ids) {
      const person = db.prepare('SELECT id, full_name, check_out_date FROM personnel WHERE id=?').get(id)
      if (!person) { skipped.push({ id, reason: 'bulunamadi' }); continue }
      if (person.check_out_date) { skipped.push({ id, name: person.full_name, reason: 'cikis yapmis' }); continue }
      const personShift = db.prepare('SELECT shift_type FROM shifts WHERE personnel_id=?').get(id)
      const myShift = personShift?.shift_type || 'day'

      let placed = false
      for (const room of candidateRooms) {
        const count = db.prepare('SELECT COUNT(*) AS c FROM room_assignments WHERE room_id=? AND check_out_at IS NULL').get(room.id).c
        if (count >= room.active_beds) continue
        if (count > 0) {
          const conflict = db.prepare(`
            SELECT COUNT(*) AS c FROM room_assignments ra
            JOIN personnel p ON p.id=ra.personnel_id
            LEFT JOIN shifts s ON s.personnel_id=p.id
            WHERE ra.room_id=? AND ra.check_out_at IS NULL
              AND COALESCE(s.shift_type, 'day') != ?
          `).get(room.id, myShift).c
          if (conflict > 0) continue
        }
        // Eski atamayi kapat
        db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE personnel_id=? AND check_out_at IS NULL").run(id)
        // Yeniye yerlestir
        db.prepare('INSERT INTO room_assignments(personnel_id,room_id,bed_no,assigned_by) VALUES(?,?,?,?)')
          .run(id, room.id, count + 1, assignedBy)
        success.push({ id, name: person.full_name, room: `${room.block}-${room.room_no}`, bed_no: count + 1 })
        placed = true
        break
      }
      if (!placed) {
        skipped.push({ id, name: person.full_name, reason: 'uygun yatak yok (kapasite/vardiya)' })
      }
    }
  })
  tx.immediate()
  return { success, skipped }
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
