import { getDB } from '../../shared/db/index.js'

const VALID_SORT = {
  name: 'p.full_name',
  block: 'r.block',
  room: 'CAST(r.room_no AS INTEGER)',
  company: 'p.company',
  check_in: 'p.check_in_date',
  zimmet: 'unreturned_zimmet',
  discipline: 'p.discipline_points',
}

export function listActivePersonnel(filters = {}) {
  const db = getDB()
  const where = ['p.check_out_date IS NULL']
  const params = []

  if (filters.block) { where.push('r.block = ?'); params.push(filters.block) }
  if (filters.floor != null && filters.floor !== '') { where.push('r.floor = ?'); params.push(+filters.floor) }
  if (filters.company) { where.push('p.company LIKE ?'); params.push(`%${filters.company}%`) }
  if (filters.company_id) { where.push('p.company_id = ?'); params.push(+filters.company_id) }
  if (filters.q) {
    where.push('(p.full_name LIKE ? OR p.tc_no LIKE ? OR r.room_no LIKE ? OR p.job_title LIKE ?)')
    const term = `%${filters.q}%`
    params.push(term, term, term, term)
  }
  if (filters.shift_type) {
    if (filters.shift_type === 'day') {
      where.push("COALESCE(s.shift_type, 'day') = 'day'")
    } else if (filters.shift_type === 'night') {
      where.push("s.shift_type = 'night'")
    }
  }
  if (filters.gender === 'male' || filters.gender === 'female') {
    where.push('p.gender = ?'); params.push(filters.gender)
  }
  if (filters.check_in_from) { where.push('p.check_in_date >= ?'); params.push(filters.check_in_from) }
  if (filters.check_in_to) { where.push('p.check_in_date <= ?'); params.push(filters.check_in_to + ' 23:59:59') }
  if (filters.is_blacklisted === '1' || filters.is_blacklisted === true) {
    where.push('p.is_blacklisted = 1')
  } else if (filters.is_blacklisted === '0') {
    where.push('p.is_blacklisted = 0')
  }
  if (filters.has_zimmet === '1') {
    where.push('(SELECT COUNT(*) FROM zimmet z WHERE z.personnel_id=p.id AND z.returned_at IS NULL) > 0')
  } else if (filters.has_zimmet === '0') {
    where.push('(SELECT COUNT(*) FROM zimmet z WHERE z.personnel_id=p.id AND z.returned_at IS NULL) = 0')
  }
  if (filters.unassigned === '1') {
    where.push('ra.id IS NULL')
  } else if (filters.unassigned === '0') {
    where.push('ra.id IS NOT NULL')
  }
  if (filters.discipline_min != null && filters.discipline_min !== '') {
    where.push('p.discipline_points >= ?'); params.push(+filters.discipline_min)
  }

  const sortKey = VALID_SORT[filters.sort] || `r.block, CAST(r.room_no AS INTEGER), p.full_name`
  const sortDir = filters.sort_dir === 'desc' ? 'DESC' : 'ASC'

  const limit = Math.min(+filters.limit || 500, 2000)

  return db.prepare(`
    SELECT p.id, p.full_name, p.tc_no, p.company, p.company_id, p.job_title, p.check_in_date,
      p.phone_number, p.gender, p.is_blacklisted, p.discipline_points,
      r.block, r.floor, r.room_no, ra.bed_no,
      COALESCE(s.shift_type, 'day') AS shift_type,
      (SELECT COUNT(*) FROM zimmet z WHERE z.personnel_id=p.id AND z.returned_at IS NULL) AS unreturned_zimmet
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE ${where.join(' AND ')}
    ORDER BY ${sortKey} ${sortDir}
    LIMIT ${limit}
  `).all(...params)
}

export function listStats(filters = {}) {
  // Filtre uygulanmis liste ustunde mini istatistikler
  const rows = listActivePersonnel({ ...filters, limit: 2000 })
  const byBlock = {}, byCompany = {}, byShift = { day: 0, night: 0 }
  let withZimmet = 0, blacklisted = 0, totalDiscipline = 0
  for (const r of rows) {
    const b = r.block || '(atanmamış)'
    byBlock[b] = (byBlock[b] || 0) + 1
    const c = r.company || '(belirsiz)'
    byCompany[c] = (byCompany[c] || 0) + 1
    byShift[r.shift_type] = (byShift[r.shift_type] || 0) + 1
    if (r.unreturned_zimmet > 0) withZimmet++
    if (r.is_blacklisted) blacklisted++
    totalDiscipline += r.discipline_points || 0
  }
  return {
    total: rows.length,
    by_block: Object.entries(byBlock).map(([k, v]) => ({ block: k, n: v })).sort((a, b) => b.n - a.n),
    by_company: Object.entries(byCompany).map(([k, v]) => ({ company: k, n: v })).sort((a, b) => b.n - a.n).slice(0, 8),
    by_shift: byShift,
    with_zimmet: withZimmet,
    blacklisted,
    avg_discipline: rows.length > 0 ? Math.round(totalDiscipline / rows.length * 10) / 10 : 0,
  }
}

export function bulkTransferTx(ids, { target_block, target_room_id }, assignedBy) {
  const db = getDB()
  const success = []
  const skipped = []
  const tx = db.transaction(() => {
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
        db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE personnel_id=? AND check_out_at IS NULL").run(id)
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

export function bulkSetShiftTx(ids, shiftType) {
  const db = getDB()
  const success = []
  const skipped = []
  const startHour = shiftType === 'night' ? 19 : 7
  const endHour = shiftType === 'night' ? 7 : 19
  const tx = db.transaction(() => {
    for (const id of ids) {
      const person = db.prepare('SELECT id, full_name, check_out_date FROM personnel WHERE id=?').get(id)
      if (!person) { skipped.push({ id, reason: 'bulunamadi' }); continue }
      if (person.check_out_date) { skipped.push({ id, name: person.full_name, reason: 'cikis yapmis' }); continue }
      const exists = db.prepare('SELECT 1 FROM shifts WHERE personnel_id=?').get(id)
      if (exists) {
        db.prepare('UPDATE shifts SET shift_type=?, start_hour=?, end_hour=? WHERE personnel_id=?')
          .run(shiftType, startHour, endHour, id)
      } else {
        db.prepare('INSERT INTO shifts(personnel_id, shift_type, start_hour, end_hour) VALUES(?,?,?,?)')
          .run(id, shiftType, startHour, endHour)
      }
      success.push({ id, name: person.full_name })
    }
  })
  tx()
  return { success, skipped }
}

export function bulkBlacklistTx(ids, blacklisted, reason, userId) {
  const db = getDB()
  const success = []
  const skipped = []
  const tx = db.transaction(() => {
    for (const id of ids) {
      const person = db.prepare('SELECT id, full_name, is_blacklisted FROM personnel WHERE id=?').get(id)
      if (!person) { skipped.push({ id, reason: 'bulunamadi' }); continue }
      if (blacklisted && person.is_blacklisted) { skipped.push({ id, name: person.full_name, reason: 'zaten kara listede' }); continue }
      if (!blacklisted && !person.is_blacklisted) { skipped.push({ id, name: person.full_name, reason: 'zaten kara listede degil' }); continue }
      if (blacklisted) {
        db.prepare("UPDATE personnel SET is_blacklisted=1, blacklist_reason=?, blacklisted_at=datetime('now'), blacklisted_by=? WHERE id=?")
          .run(reason || null, userId, id)
      } else {
        db.prepare('UPDATE personnel SET is_blacklisted=0, blacklist_reason=NULL, blacklisted_at=NULL, blacklisted_by=NULL WHERE id=?').run(id)
      }
      success.push({ id, name: person.full_name })
    }
  })
  tx()
  return { success, skipped }
}

export function bulkDisciplineTx(ids, points, reason, userId) {
  const db = getDB()
  const success = []
  const skipped = []
  // Disiplin tablosuna kayit + personel.discipline_points artir
  const tx = db.transaction(() => {
    for (const id of ids) {
      const person = db.prepare('SELECT id, full_name, check_out_date FROM personnel WHERE id=?').get(id)
      if (!person) { skipped.push({ id, reason: 'bulunamadi' }); continue }
      if (person.check_out_date) { skipped.push({ id, name: person.full_name, reason: 'cikis yapmis' }); continue }
      try {
        db.prepare(`INSERT INTO discipline_records (personnel_id, points, reason, created_by, created_at)
                    VALUES (?,?,?,?,datetime('now'))`).run(id, points, reason || 'Toplu islem', userId)
      } catch { /* discipline_records semasi farkliysa atla */ }
      db.prepare('UPDATE personnel SET discipline_points = COALESCE(discipline_points, 0) + ? WHERE id=?').run(points, id)
      success.push({ id, name: person.full_name })
    }
  })
  tx()
  return { success, skipped }
}

export function bulkSetCompanyTx(ids, companyId) {
  const db = getDB()
  const success = []
  const skipped = []
  const company = companyId ? db.prepare('SELECT id, name FROM companies WHERE id=?').get(companyId) : null
  if (companyId && !company) throw new Error('Firma bulunamadi')
  const tx = db.transaction(() => {
    for (const id of ids) {
      const person = db.prepare('SELECT id, full_name, check_out_date FROM personnel WHERE id=?').get(id)
      if (!person) { skipped.push({ id, reason: 'bulunamadi' }); continue }
      if (person.check_out_date) { skipped.push({ id, name: person.full_name, reason: 'cikis yapmis' }); continue }
      if (company) {
        db.prepare('UPDATE personnel SET company_id=?, company=? WHERE id=?').run(company.id, company.name, id)
      } else {
        db.prepare('UPDATE personnel SET company_id=NULL WHERE id=?').run(id)
      }
      success.push({ id, name: person.full_name })
    }
  })
  tx()
  return { success, skipped }
}
