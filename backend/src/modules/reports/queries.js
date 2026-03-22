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
