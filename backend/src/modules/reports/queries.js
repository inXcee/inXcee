import { getDB } from '../../shared/db/index.js'

export function getCleaningTasks(date) {
  const db = getDB()
  return db.prepare(`
    SELECT ct.area, ct.block, ct.floor, ct.task_type,
      CASE WHEN ct.completed_at IS NOT NULL THEN 'Tamamlandi'
           WHEN ct.skipped=1 THEN 'Atlandi'
           ELSE 'Bekliyor' END as durum,
      COALESCE(u.full_name, '-') as temizlikci,
      COALESCE(ct.skip_reason, '-') as aciklama
    FROM cleaning_tasks ct
    LEFT JOIN users u ON u.id=ct.assigned_to
    WHERE DATE(ct.scheduled_at)=?
    ORDER BY ct.block, ct.floor, ct.area
  `).all(date)
}

export function getWeeklyMaintenance() {
  const db = getDB()
  return db.prepare(`
    SELECT mr.id, mr.location, mr.description, mr.priority,
      CASE mr.status
        WHEN 'open' THEN 'Acik'
        WHEN 'assigned' THEN 'Atandi'
        WHEN 'in_progress' THEN 'Devam Ediyor'
        WHEN 'review' THEN 'Inceleme'
        WHEN 'done' THEN 'Tamamlandi'
      END as durum,
      COALESCE(t.full_name, '-') as teknisyen,
      mr.opened_at, mr.closed_at,
      CASE WHEN mr.sla_deadline < datetime('now') AND mr.status != 'done' THEN 'ASILDI' ELSE 'Normal' END as sla
    FROM maintenance_requests mr
    LEFT JOIN technicians t ON t.id=mr.assigned_to
    WHERE mr.opened_at >= datetime('now', '-7 days')
    ORDER BY mr.priority DESC, mr.opened_at DESC
  `).all()
}

export function getOccupancyByBlock() {
  const db = getDB()
  return db.prepare(`
    SELECT r.block,
      COUNT(DISTINCT r.id) as oda_sayisi,
      SUM(r.active_beds) as toplam_yatak,
      COALESCE(SUM(cnt.c), 0) as dolu_yatak
    FROM rooms r
    LEFT JOIN (
      SELECT room_id, COUNT(*) as c FROM room_assignments WHERE check_out_at IS NULL GROUP BY room_id
    ) cnt ON cnt.room_id=r.id
    WHERE r.status='active'
    GROUP BY r.block
    ORDER BY r.block
  `).all()
}

export function getPersonnelByCompany() {
  const db = getDB()
  return db.prepare(`
    SELECT p.company, COUNT(*) as kisi
    FROM personnel p
    WHERE p.check_out_date IS NULL AND p.is_blacklisted=0
    GROUP BY p.company
    ORDER BY kisi DESC
  `).all()
}

export function getDisciplineRecords() {
  const db = getDB()
  return db.prepare(`
    SELECT dr.card_type, dr.reason, dr.created_at,
      p.full_name, p.company, p.discipline_points,
      u.full_name as created_by_name
    FROM discipline_records dr
    JOIN personnel p ON p.id=dr.personnel_id
    LEFT JOIN users u ON u.id=dr.created_by
    WHERE dr.created_at >= datetime('now', '-30 days')
    ORDER BY dr.created_at DESC
  `).all()
}

// ── Yeni raporlar ──

export function getCompaniesReport() {
  const db = getDB()
  try {
    return db.prepare(`
      SELECT c.id, c.name, c.contact_name, c.contact_phone, c.bed_quota, c.price_per_bed,
        c.contract_start, c.contract_end, c.is_active,
        (SELECT COUNT(*) FROM personnel p WHERE (p.company_id=c.id OR p.company=c.name) AND p.check_out_date IS NULL) AS active_personnel,
        CAST(julianday(c.contract_end) - julianday('now') AS INTEGER) AS days_left
      FROM companies c
      ORDER BY c.is_active DESC, c.contract_end ASC
    `).all()
  } catch { return [] }
}

export function getSurveysReport(days = 30) {
  const db = getDB()
  try {
    const summary = db.prepare(`
      SELECT COUNT(*) AS total,
        ROUND(AVG(room_score), 2) AS avg_room,
        ROUND(AVG(cleaning_score), 2) AS avg_cleaning,
        ROUND(AVG(food_score), 2) AS avg_food,
        ROUND(AVG(laundry_score), 2) AS avg_laundry,
        ROUND(AVG(overall_score), 2) AS avg_overall
      FROM satisfaction_surveys
      WHERE created_at >= datetime('now', '-' || ? || ' days')
    `).get(days)
    const recent = db.prepare(`
      SELECT s.created_at, s.overall_score, s.room_score, s.cleaning_score, s.food_score, s.laundry_score, s.comment,
        p.full_name, p.company
      FROM satisfaction_surveys s
      LEFT JOIN personnel p ON p.id=s.personnel_id
      WHERE s.created_at >= datetime('now', '-' || ? || ' days')
      ORDER BY s.created_at DESC LIMIT 100
    `).all(days)
    return { summary, recent }
  } catch { return { summary: {}, recent: [] } }
}

export function getDrillsReport() {
  const db = getDB()
  try {
    const recent = db.prepare(`
      SELECT d.drill_type, d.drill_date, d.expected_count, d.actual_count, d.duration_minutes,
        d.findings, d.next_drill_date, u.full_name AS created_by_name
      FROM drills d LEFT JOIN users u ON u.id=d.created_by
      WHERE d.drill_date >= date('now', '-365 days')
      ORDER BY d.drill_date DESC
    `).all()
    return recent
  } catch { return [] }
}

export function getVisitorsReport(days = 30) {
  const db = getDB()
  try {
    return db.prepare(`
      SELECT v.full_name, v.tc_no, v.phone, v.purpose, v.visiting_block,
        v.check_in_at, v.check_out_at,
        CAST((julianday(COALESCE(v.check_out_at, 'now')) - julianday(v.check_in_at)) * 24 * 60 AS INTEGER) AS minutes
      FROM visitors v
      WHERE v.check_in_at >= datetime('now', '-' || ? || ' days')
      ORDER BY v.check_in_at DESC LIMIT 500
    `).all(days)
  } catch { return [] }
}

export function getExpensesReport(months = 1) {
  const db = getDB()
  try {
    const summary = db.prepare(`
      SELECT ROUND(SUM(amount), 2) AS total, COUNT(*) AS count
      FROM expenses WHERE strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now')
    `).get()
    const byCategory = db.prepare(`
      SELECT category, ROUND(SUM(amount), 2) AS total, COUNT(*) AS count
      FROM expenses
      WHERE expense_date >= date('now', '-' || ? || ' months')
      GROUP BY category ORDER BY total DESC
    `).all(months)
    const monthly = db.prepare(`
      SELECT strftime('%Y-%m', expense_date) AS month,
        ROUND(SUM(amount), 2) AS total
      FROM expenses
      WHERE expense_date >= date('now', '-12 months')
      GROUP BY month ORDER BY month
    `).all()
    const recent = db.prepare(`
      SELECT e.expense_date, e.category, e.description, e.amount, e.invoice_no,
        c.name AS company_name
      FROM expenses e LEFT JOIN companies c ON c.id=e.company_id
      WHERE e.expense_date >= date('now', '-' || ? || ' months')
      ORDER BY e.expense_date DESC LIMIT 200
    `).all(months)
    const activeResidents = db.prepare('SELECT COUNT(*) AS c FROM personnel WHERE check_out_date IS NULL').get().c
    return {
      summary: {
        ...summary,
        active_residents: activeResidents,
        per_resident: activeResidents > 0 && summary.total ? Math.round(summary.total / activeResidents * 100) / 100 : 0,
      },
      by_category: byCategory,
      monthly,
      recent,
    }
  } catch { return { summary: {}, by_category: [], monthly: [], recent: [] } }
}

export function getExecutiveData() {
  const db = getDB()
  const data = {}

  // Doluluk
  const occ = db.prepare(`
    SELECT SUM(r.active_beds) AS beds,
      COALESCE(SUM(cnt.c), 0) AS occupied
    FROM rooms r
    LEFT JOIN (SELECT room_id, COUNT(*) AS c FROM room_assignments WHERE check_out_at IS NULL GROUP BY room_id) cnt ON cnt.room_id=r.id
    WHERE r.status='active'
  `).get()
  data.occupancy = {
    beds: occ.beds || 0,
    occupied: occ.occupied || 0,
    rate: occ.beds ? Math.round((occ.occupied / occ.beds) * 100) : 0,
  }

  data.maintenance_open = db.prepare(`SELECT COUNT(*) AS c FROM maintenance_requests WHERE status NOT IN ('done')`).get().c

  // 30 günlük giriş/çıkış
  data.checkins_30d = db.prepare(`SELECT COUNT(*) AS c FROM personnel WHERE check_in_date >= date('now', '-30 days')`).get().c
  data.checkouts_30d = db.prepare(`SELECT COUNT(*) AS c FROM personnel WHERE check_out_date >= date('now', '-30 days')`).get().c

  // Disiplin / kara liste
  try {
    data.discipline_30d = db.prepare(`SELECT COUNT(*) AS c FROM discipline_records WHERE created_at >= datetime('now', '-30 days')`).get().c
  } catch { data.discipline_30d = 0 }
  data.blacklisted = db.prepare('SELECT COUNT(*) AS c FROM personnel WHERE is_blacklisted=1 AND check_out_date IS NULL').get().c

  // Yeni modüller (varsa)
  try { data.active_visitors = db.prepare('SELECT COUNT(*) AS c FROM visitors WHERE check_out_at IS NULL').get().c } catch { data.active_visitors = 0 }
  try {
    const s = db.prepare(`SELECT ROUND(AVG(overall_score),2) AS avg, COUNT(*) AS n FROM satisfaction_surveys WHERE created_at >= datetime('now', '-30 days')`).get()
    data.satisfaction = s
  } catch { data.satisfaction = { avg: null, n: 0 } }
  try {
    const exp = db.prepare(`SELECT ROUND(SUM(amount),2) AS total FROM expenses WHERE strftime('%Y-%m', expense_date)=strftime('%Y-%m','now')`).get()
    data.expense_this_month = exp.total || 0
  } catch { data.expense_this_month = 0 }
  try {
    data.expiring_contracts = db.prepare(`
      SELECT COUNT(*) AS c FROM companies
      WHERE is_active=1 AND contract_end IS NOT NULL
        AND julianday(contract_end) - julianday('now') BETWEEN 0 AND 30
    `).get().c
  } catch { data.expiring_contracts = 0 }
  try {
    const last = db.prepare('SELECT MAX(drill_date) AS d FROM drills').get()
    data.last_drill = last?.d || null
  } catch { data.last_drill = null }

  return data
}
