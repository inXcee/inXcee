import { getDB } from '../../shared/db/index.js'

// ── Search ──────────────────────────────────────────────────────────────────

export function searchPersonnel(term) {
  const db = getDB()
  const like = `%${term}%`
  return db.prepare(`
    SELECT p.id, p.full_name, p.company, p.job_title, p.tc_no,
      p.discipline_points, p.is_blacklisted, p.blacklist_reason, p.blacklisted_at,
      ra.room_id, r.block, r.floor, r.room_no, ra.bed_no,
      s.shift_type
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE p.full_name LIKE ? OR p.company LIKE ? OR p.tc_no LIKE ? OR p.job_title LIKE ?
    ORDER BY p.full_name
    LIMIT 25
  `).all(like, like, like, like)
}

export function getPersonnelById(id) {
  const db = getDB()
  return db.prepare(`
    SELECT p.*, ra.room_id, r.block, r.floor, r.room_no, ra.bed_no, s.shift_type
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE p.id=?
  `).get(id)
}

// ── Records ─────────────────────────────────────────────────────────────────

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
    if (p.discipline_points >= 5) {
      db.prepare("UPDATE personnel SET is_blacklisted=1, blacklist_reason='Otomatik: disiplin limiti aşıldı (5+ puan)', blacklisted_at=datetime('now') WHERE id=? AND is_blacklisted=0").run(personnelId)
      db.prepare("INSERT INTO audit_log(user_id, action, module, target_id, detail) VALUES(?, 'auto_blacklist', 'discipline', ?, 'Otomatik kara liste: 5+ disiplin puanı')").run(createdBy, personnelId)
    }
    return p
  })
  return tx()
}

export function deleteRecord(recordId) {
  const db = getDB()
  const rec = db.prepare('SELECT * FROM discipline_records WHERE id=?').get(recordId)
  if (!rec) throw new Error('Kayıt bulunamadı')
  const points = rec.card_type === 'red' ? 2 : 1
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM discipline_records WHERE id=?').run(recordId)
    db.prepare('UPDATE personnel SET discipline_points=CASE WHEN discipline_points-? < 0 THEN 0 ELSE discipline_points-? END WHERE id=?').run(points, points, rec.personnel_id)
  })
  tx()
}

export function getRecords(personnelId, { date_from, date_to } = {}) {
  const db = getDB()
  let q = `SELECT dr.*, u.full_name as created_by_name FROM discipline_records dr
    JOIN users u ON u.id=dr.created_by
    WHERE dr.personnel_id=?`
  const params = [personnelId]
  if (date_from) { q += ' AND DATE(dr.created_at)>=?'; params.push(date_from) }
  if (date_to)   { q += ' AND DATE(dr.created_at)<=?'; params.push(date_to) }
  q += ' ORDER BY dr.created_at DESC'
  return db.prepare(q).all(...params)
}

// ── Blacklist ───────────────────────────────────────────────────────────────

export function addToBlacklist(personnelId, reason, userId) {
  const db = getDB()
  db.prepare("UPDATE personnel SET is_blacklisted=1, blacklist_reason=?, blacklisted_at=datetime('now'), blacklisted_by=? WHERE id=?").run(reason, userId, personnelId)
}

export function removeFromBlacklist(personnelId) {
  const db = getDB()
  db.prepare("UPDATE personnel SET is_blacklisted=0, blacklist_reason=NULL, blacklisted_at=NULL, blacklisted_by=NULL WHERE id=?").run(personnelId)
}

export function getBlacklisted() {
  const db = getDB()
  return db.prepare(`
    SELECT p.id, p.full_name, p.company, p.job_title, p.tc_no,
      p.discipline_points, p.blacklist_reason, p.blacklisted_at,
      u.full_name as blacklisted_by_name
    FROM personnel p
    LEFT JOIN users u ON u.id=p.blacklisted_by
    WHERE p.is_blacklisted=1
    ORDER BY p.blacklisted_at DESC
  `).all()
}

// ── Stats ───────────────────────────────────────────────────────────────────

export function getStats({ date_from, date_to } = {}) {
  const db = getDB()
  const hasDateFilter = date_from || date_to

  let dateWhere = ''
  const dateParams = []
  if (date_from) { dateWhere += ' AND DATE(dr.created_at)>=?'; dateParams.push(date_from) }
  if (date_to)   { dateWhere += ' AND DATE(dr.created_at)<=?'; dateParams.push(date_to) }

  const overview = db.prepare(`
    SELECT
      COUNT(*) as total_records,
      SUM(CASE WHEN card_type='yellow' THEN 1 ELSE 0 END) as yellow_cards,
      SUM(CASE WHEN card_type='red' THEN 1 ELSE 0 END) as red_cards
    FROM discipline_records dr
    WHERE 1=1${dateWhere}
  `).get(...dateParams)

  const blacklisted = db.prepare(`SELECT COUNT(*) as cnt FROM personnel WHERE is_blacklisted=1`).get()
  const critical = db.prepare(`SELECT COUNT(*) as cnt FROM personnel WHERE discipline_points>=3 AND is_blacklisted=0 AND check_out_date IS NULL`).get()
  const warned = db.prepare(`SELECT COUNT(*) as cnt FROM personnel WHERE discipline_points>=1 AND discipline_points<3 AND is_blacklisted=0 AND check_out_date IS NULL`).get()

  const byCompany = db.prepare(`
    SELECT p.company, COUNT(dr.id) as total,
      SUM(CASE WHEN dr.card_type='yellow' THEN 1 ELSE 0 END) as yellow,
      SUM(CASE WHEN dr.card_type='red' THEN 1 ELSE 0 END) as red
    FROM discipline_records dr
    JOIN personnel p ON p.id=dr.personnel_id
    WHERE p.company IS NOT NULL AND p.company != ''${dateWhere}
    GROUP BY p.company ORDER BY total DESC
  `).all(...dateParams)

  const topOffenders = db.prepare(`
    SELECT p.id, p.full_name, p.company, p.job_title, p.discipline_points, p.is_blacklisted,
      COUNT(dr.id) as record_count,
      SUM(CASE WHEN dr.card_type='yellow' THEN 1 ELSE 0 END) as yellow,
      SUM(CASE WHEN dr.card_type='red' THEN 1 ELSE 0 END) as red
    FROM personnel p
    JOIN discipline_records dr ON dr.personnel_id=p.id
    WHERE p.check_out_date IS NULL${dateWhere}
    GROUP BY p.id
    ORDER BY p.discipline_points DESC
    LIMIT 15
  `).all(...dateParams)

  const recentActivity = db.prepare(`
    SELECT dr.id, dr.card_type, dr.reason, dr.created_at,
      p.full_name as personnel_name, p.company,
      u.full_name as created_by_name
    FROM discipline_records dr
    JOIN personnel p ON p.id=dr.personnel_id
    JOIN users u ON u.id=dr.created_by
    WHERE 1=1${dateWhere}
    ORDER BY dr.created_at DESC
    LIMIT 20
  `).all(...dateParams)

  const reasonStats = db.prepare(`
    SELECT dr.reason, COUNT(*) as cnt, dr.card_type
    FROM discipline_records dr
    WHERE 1=1${dateWhere}
    GROUP BY dr.reason, dr.card_type
    ORDER BY cnt DESC
    LIMIT 15
  `).all(...dateParams)

  const trend = db.prepare(`
    SELECT DATE(dr.created_at) as date,
      SUM(CASE WHEN dr.card_type='yellow' THEN 1 ELSE 0 END) as yellow,
      SUM(CASE WHEN dr.card_type='red' THEN 1 ELSE 0 END) as red
    FROM discipline_records dr
    WHERE dr.created_at >= datetime('now', '-30 days')${dateWhere}
    GROUP BY DATE(dr.created_at)
    ORDER BY date
  `).all(...dateParams)

  return {
    ...overview,
    blacklisted_count: blacklisted.cnt,
    critical_count: critical.cnt,
    warned_count: warned.cnt,
    byCompany,
    topOffenders,
    recentActivity,
    reasonStats,
    trend,
  }
}

// ── Common reasons ──────────────────────────────────────────────────────────

export function getReasonSuggestions() {
  const db = getDB()
  return db.prepare(`
    SELECT reason, COUNT(*) as cnt
    FROM discipline_records
    WHERE reason IS NOT NULL AND reason != ''
    GROUP BY reason
    ORDER BY cnt DESC
    LIMIT 20
  `).all()
}
