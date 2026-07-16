import { getDB } from '../../shared/db/index.js'

/* AVS personeli tek tabloda `staff`, yatakhane sakinleri `personnel`.
   Çoğu zaman aynı kişiler — TC numarası üzerinden bağlanırlar.
   360° endpoint staff bazlıdır, personnel tarafını TC ile joinler. */

export function get360(staffId) {
  const db = getDB()
  const person = db.prepare(`
    SELECT s.*,
      d.name as dept_name, d.color_class as dept_color,
      pp.name as pickup_name, pp.district as pickup_district,
      c.name as company_name,
      p.id as dorm_personnel_id,
      p.discipline_points as dorm_discipline_points,
      p.is_blacklisted, p.blacklist_reason,
      p.passport_no
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
    LEFT JOIN personnel p ON p.tc_no IS NOT NULL AND p.tc_no = s.tc_no
    LEFT JOIN companies c ON c.id = p.company_id
    WHERE s.id = ?
  `).get(staffId)
  if (!person) return null

  const personnelId = person.dorm_personnel_id

  const emergencyContacts = db.prepare(
    'SELECT * FROM emergency_contacts WHERE staff_id = ? ORDER BY id'
  ).all(staffId)

  const notes = db.prepare(`
    SELECT id, author_name, note, pinned, created_at
    FROM staff_notes WHERE staff_id = ?
    ORDER BY pinned DESC, created_at DESC LIMIT 50
  `).all(staffId)

  const today = new Date().toISOString().slice(0, 10)
  const last30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  // Oda (aktif atama) — personnel üzerinden
  const room = personnelId ? db.prepare(`
    SELECT ra.id as assignment_id, r.id as room_id, r.room_no, r.block, r.floor,
      ra.assigned_at, ra.bed_no
    FROM room_assignments ra
    JOIN rooms r ON r.id = ra.room_id
    WHERE ra.personnel_id = ? AND ra.check_out_at IS NULL
    LIMIT 1
  `).get(personnelId) : null

  // Vardiya — son 14 gün + sonraki 7 gün
  const shifts = db.prepare(`
    SELECT ss.work_date, ss.status, sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.staff_id = ? AND ss.work_date BETWEEN date('now','-14 days') AND date('now','+7 days')
    ORDER BY ss.work_date DESC
  `).all(staffId)

  // Vardiya devamsızlık özeti son 30g
  const shiftSummary = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'worked' THEN 1 ELSE 0 END) as worked,
      SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
      SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) as on_leave,
      SUM(CASE WHEN status = 'overtime' THEN 1 ELSE 0 END) as overtime,
      COUNT(*) as total
    FROM shift_schedule WHERE staff_id = ? AND work_date BETWEEN ? AND ?
  `).get(staffId, last30, today)

  // Transport — bugünkü + son 30g özet
  const todayTransport = db.prepare(`
    SELECT ra.id, ra.boarded, ra.is_waitlist,
      r.name as route_name, r.vehicle_plate, r.driver_name, r.driver_phone,
      rs.scheduled_time, pp.name as stop_name
    FROM route_assignments ra
    JOIN routes r ON r.id = ra.route_id
    LEFT JOIN route_stops rs ON rs.id = ra.stop_id
    LEFT JOIN pickup_points pp ON pp.id = rs.pickup_point_id
    WHERE ra.staff_id = ? AND ra.work_date = ?
  `).get(staffId, today) || null

  const transportSummary = db.prepare(`
    SELECT
      SUM(CASE WHEN boarded = 1 THEN 1 ELSE 0 END) as boarded,
      SUM(CASE WHEN boarded = 0 THEN 1 ELSE 0 END) as no_show,
      COUNT(*) as assignments
    FROM route_assignments
    WHERE staff_id = ? AND is_waitlist = 0 AND work_date BETWEEN ? AND ?
  `).get(staffId, last30, today)

  // Çamaşır — son 30g (room üzerinden)
  const laundry = (personnelId && room) ? db.prepare(`
    SELECT COUNT(*) as recent_count, MAX(created_at) as last_at
    FROM laundry_items WHERE room_id = ? AND created_at >= ?
  `).get(room.room_id, last30) : { recent_count: 0, last_at: null }

  // Bakım talepleri (rapor eden — personnel üzerinden)
  const maintenance = personnelId ? db.prepare(`
    SELECT id, location, description, status, priority, opened_at as created_at
    FROM maintenance_requests
    WHERE reporter_personnel_id = ?
    ORDER BY opened_at DESC LIMIT 10
  `).all(personnelId) : []

  // Disiplin (personnel üzerinden)
  const discipline = personnelId ? db.prepare(`
    SELECT id, card_type, reason, created_at
    FROM discipline_records
    WHERE personnel_id = ?
    ORDER BY created_at DESC LIMIT 20
  `).all(personnelId) : []

  const disciplineTotal = personnelId ? db.prepare(`
    SELECT
      SUM(CASE WHEN card_type = 'yellow' THEN 1 ELSE 0 END) as yellow,
      SUM(CASE WHEN card_type = 'red' THEN 1 ELSE 0 END) as red,
      COUNT(*) as count
    FROM discipline_records WHERE personnel_id = ?
  `).get(personnelId) : { yellow: 0, red: 0, count: 0 }

  // İzinler
  const leaves = db.prepare(`
    SELECT id, leave_type, start_date, end_date, status, total_days, reason
    FROM leave_requests WHERE staff_id = ?
    ORDER BY start_date DESC LIMIT 10
  `).all(staffId)

  // Mesai
  const overtime = db.prepare(`
    SELECT id, work_date, hours, reason
    FROM overtime_records WHERE staff_id = ?
    ORDER BY work_date DESC LIMIT 10
  `).all(staffId)

  // Çıkış geçmişi (eski oda atamaları)
  const roomHistory = personnelId ? db.prepare(`
    SELECT ra.id, r.room_no, r.block, ra.assigned_at, ra.check_out_at
    FROM room_assignments ra
    JOIN rooms r ON r.id = ra.room_id
    WHERE ra.personnel_id = ? AND ra.check_out_at IS NOT NULL
    ORDER BY ra.check_out_at DESC LIMIT 10
  `).all(personnelId) : []

  return {
    person,
    emergency_contacts: emergencyContacts,
    notes,
    room,
    shifts,
    shift_summary: shiftSummary,
    today_transport: todayTransport,
    transport_summary: transportSummary,
    laundry,
    maintenance,
    discipline,
    discipline_total: disciplineTotal,
    leaves,
    overtime,
    room_history: roomHistory,
  }
}

// ── Timeline (kronolojik tüm olaylar — son 90g) ──
export function getTimeline(staffId) {
  const db = getDB()
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const personnelRow = db.prepare(`
    SELECT p.id FROM staff s
    LEFT JOIN personnel p ON p.tc_no IS NOT NULL AND p.tc_no = s.tc_no
    WHERE s.id = ?
  `).get(staffId)
  const personnelId = personnelRow?.id || null
  const events = []

  // Vardiyalar
  const shifts = db.prepare(`
    SELECT ss.work_date as date, ss.status, sd.name as shift_name
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.staff_id = ? AND ss.work_date >= ?
  `).all(staffId, since)
  shifts.forEach(s => events.push({
    date: s.date,
    kind: 'shift',
    title: `${s.shift_name || '?'} vardiyası — ${s.status}`,
    color: s.status === 'worked' ? '#22c55e' : s.status === 'absent' ? '#ef4444' : s.status === 'on_leave' ? '#f59e0b' : '#94a3b8',
  }))

  if (personnelId) {
    // Disiplin
    const disc = db.prepare(`
      SELECT created_at as date, card_type, reason
      FROM discipline_records WHERE personnel_id = ? AND created_at >= ?
    `).all(personnelId, since)
    disc.forEach(d => events.push({
      date: d.date,
      kind: 'discipline',
      title: `Disiplin ${d.card_type === 'red' ? '🔴' : '🟡'} ${d.reason}`,
      color: '#ef4444',
    }))

    // Bakım talepleri
    const maint = db.prepare(`
      SELECT opened_at as date, location, description, status
      FROM maintenance_requests WHERE reporter_personnel_id = ? AND opened_at >= ?
    `).all(personnelId, since)
    maint.forEach(m => events.push({
      date: m.date,
      kind: 'maintenance',
      title: `Bakım talebi: ${m.description.slice(0, 50)} (${m.status})`,
      color: '#f59e0b',
    }))
  }

  // İzinler
  const leaves = db.prepare(`
    SELECT start_date as date, leave_type, total_days, status
    FROM leave_requests WHERE staff_id = ? AND start_date >= ?
  `).all(staffId, since)
  leaves.forEach(l => events.push({
    date: l.date,
    kind: 'leave',
    title: `İzin: ${l.leave_type} (${l.total_days}g) ${l.status}`,
    color: '#a855f7',
  }))

  // Mesai
  const ot = db.prepare(`
    SELECT work_date as date, hours, reason
    FROM overtime_records WHERE staff_id = ? AND work_date >= ?
  `).all(staffId, since)
  ot.forEach(o => events.push({
    date: o.date,
    kind: 'overtime',
    title: `Mesai: ${o.hours} saat ${o.reason ? '— ' + o.reason : ''}`,
    color: '#0ea5e9',
  }))

  // Transport no-show
  const ts = db.prepare(`
    SELECT ra.work_date as date, r.name as route_name
    FROM route_assignments ra
    JOIN routes r ON r.id = ra.route_id
    WHERE ra.staff_id = ? AND ra.work_date >= ? AND ra.boarded = 0
  `).all(staffId, since)
  ts.forEach(t => events.push({
    date: t.date,
    kind: 'no_show',
    title: `Servise binmedi (${t.route_name})`,
    color: '#ef4444',
  }))

  events.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return events.slice(0, 200)
}

// ── Notlar CRUD ──
const NOTE_CATEGORIES = new Set([
  'general', 'document', 'attendance', 'performance', 'safety',
  'equipment', 'onboarding', 'offboarding', 'transport', 'dormitory',
])

export function addNote({ staffId, authorId, authorName, note, pinned, category, visibility }) {
  const cat = NOTE_CATEGORIES.has(category) ? category : 'general'
  const vis = visibility === 'sensitive' ? 'sensitive' : 'operational'
  return getDB().prepare(`
    INSERT INTO staff_notes(staff_id, author_id, author_name, note, pinned, category, visibility)
    VALUES(?,?,?,?,?,?,?)
  `).run(staffId, authorId, authorName, note, pinned ? 1 : 0, cat, vis).lastInsertRowid
}

// Rol bazlı: hassas notlar yalnız müdüre listelenir; arşivlenenler ayrı işaretlenir.
export function listNotes(staffId, { includeSensitive = false, includeArchived = false } = {}) {
  const where = ['staff_id=?']
  const params = [staffId]
  if (!includeSensitive) where.push("visibility<>'sensitive'")
  if (!includeArchived) where.push('archived_at IS NULL')
  return getDB().prepare(`
    SELECT id, author_id, author_name, note, pinned, category, visibility,
      created_at, updated_at, archived_at
    FROM staff_notes
    WHERE ${where.join(' AND ')}
    ORDER BY pinned DESC, created_at DESC LIMIT 100
  `).all(...params)
}

export function updateNote(noteId, { note, category, visibility }) {
  const fields = []
  const params = []
  if (note != null) { fields.push('note=?'); params.push(String(note).slice(0, 4000)) }
  if (category != null && NOTE_CATEGORIES.has(category)) { fields.push('category=?'); params.push(category) }
  if (visibility != null) { fields.push('visibility=?'); params.push(visibility === 'sensitive' ? 'sensitive' : 'operational') }
  if (!fields.length) return
  params.push(noteId)
  getDB().prepare(`UPDATE staff_notes SET ${fields.join(', ')} WHERE id=?`).run(...params)
}

export function archiveNote(noteId) {
  getDB().prepare('UPDATE staff_notes SET archived_at=CURRENT_TIMESTAMP WHERE id=?').run(noteId)
}

// Vardiya sorumlusu hassas notu okuyamaz/yönetemez.
export function getNoteVisibility(noteId) {
  return getDB().prepare('SELECT visibility FROM staff_notes WHERE id=?').get(noteId)?.visibility || null
}

export function deleteNote(noteId) {
  getDB().prepare('DELETE FROM staff_notes WHERE id=?').run(noteId)
}

export function togglePinNote(noteId) {
  getDB().prepare('UPDATE staff_notes SET pinned = 1 - pinned WHERE id=?').run(noteId)
}

// ── Emergency contacts CRUD ──
export function addEmergencyContact(staffId, data) {
  return getDB().prepare(`
    INSERT INTO emergency_contacts(staff_id, name, relationship, phone, address)
    VALUES(?,?,?,?,?)
  `).run(staffId, data.name, data.relationship || null, data.phone || null, data.address || null).lastInsertRowid
}

export function updateEmergencyContact(id, data) {
  const db = getDB()
  const fields = ['name', 'relationship', 'phone', 'address']
  const sets = []
  const params = []
  fields.forEach(f => {
    if (data[f] !== undefined) { sets.push(`${f}=?`); params.push(data[f] || null) }
  })
  if (!sets.length) return
  params.push(id)
  db.prepare(`UPDATE emergency_contacts SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteEmergencyContact(id) {
  getDB().prepare('DELETE FROM emergency_contacts WHERE id=?').run(id)
}

// ── Arşiv (P5) ──
export function archiveStaff(staffId, reason) {
  getDB().prepare(`
    UPDATE staff
    SET is_active = 0, archived_at = CURRENT_TIMESTAMP, archive_reason = ?
    WHERE id = ?
  `).run(reason || null, staffId)
}

export function restoreStaff(staffId) {
  getDB().prepare(`
    UPDATE staff
    SET is_active = 1, archived_at = NULL, archive_reason = NULL
    WHERE id = ?
  `).run(staffId)
}

export function listArchived({ q } = {}) {
  const db = getDB()
  let query = `
    SELECT s.id, s.full_name, s.tc_no, s.phone, s.archived_at, s.archive_reason,
      d.name as dept_name
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.is_active = 0
  `
  const params = []
  if (q) { query += ' AND s.full_name LIKE ?'; params.push(`%${q}%`) }
  query += ' ORDER BY s.archived_at DESC LIMIT 200'
  return db.prepare(query).all(...params)
}

// ── R5 Risk Listesi ──
export function getRiskList({ limit = 30 } = {}) {
  const db = getDB()
  const last30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  /* Risk skoru:
     - Vardiya devamsızlık (status=absent) son 30g × 2
     - Transport no-show son 30g × 1
     - Disiplin kart sayısı (red=3, yellow=1) son 90g
     - Sözleşme 30 gün içinde bitiyor → +5
     SQLite HAVING aggregate-only çalışır; outer SELECT ile filtrele. */
  return db.prepare(`
    SELECT * FROM (
      SELECT s.id, s.full_name, s.phone, s.contract_end,
        d.name as dept_name, d.color_class as dept_color,
        pp.name as pickup_name,
        c.name as company_name,
        COALESCE((SELECT COUNT(*) FROM shift_schedule
          WHERE staff_id = s.id AND status = 'absent' AND work_date BETWEEN ? AND ?), 0) as shift_absent,
        COALESCE((SELECT COUNT(*) FROM route_assignments
          WHERE staff_id = s.id AND boarded = 0 AND is_waitlist = 0 AND work_date BETWEEN ? AND ?), 0) as transport_no_show,
        COALESCE((
          SELECT SUM(CASE WHEN dr.card_type='red' THEN 3 ELSE 1 END)
          FROM discipline_records dr
          JOIN personnel pn ON pn.id = dr.personnel_id AND pn.tc_no IS NOT NULL AND pn.tc_no = s.tc_no
          WHERE dr.created_at >= date('now','-90 days')
        ), 0) as discipline_score,
        CASE WHEN s.contract_end IS NOT NULL AND s.contract_end <= ? THEN 1 ELSE 0 END as contract_expiring,
        (
          COALESCE((SELECT COUNT(*) FROM shift_schedule
            WHERE staff_id = s.id AND status = 'absent' AND work_date BETWEEN ? AND ?), 0) * 2
          + COALESCE((SELECT COUNT(*) FROM route_assignments
            WHERE staff_id = s.id AND boarded = 0 AND is_waitlist = 0 AND work_date BETWEEN ? AND ?), 0)
          + COALESCE((
            SELECT SUM(CASE WHEN dr.card_type='red' THEN 3 ELSE 1 END)
            FROM discipline_records dr
            JOIN personnel pn ON pn.id = dr.personnel_id AND pn.tc_no IS NOT NULL AND pn.tc_no = s.tc_no
            WHERE dr.created_at >= date('now','-90 days')
          ), 0)
          + CASE WHEN s.contract_end IS NOT NULL AND s.contract_end <= ? THEN 5 ELSE 0 END
        ) as risk_score
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
      LEFT JOIN personnel pn0 ON pn0.tc_no IS NOT NULL AND pn0.tc_no = s.tc_no
      LEFT JOIN companies c ON c.id = pn0.company_id
      WHERE s.is_active = 1
    ) WHERE risk_score > 0
    ORDER BY risk_score DESC
    LIMIT ?
  `).all(last30, today, last30, today, in30, last30, today, last30, today, in30, limit)
}
