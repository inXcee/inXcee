import { getDB } from '../../shared/db/index.js'

/**
 * Tüm odaların son N günlük özet istatistikleri:
 * - temizlik sayısı, atlanan, arıza sayısı, açık arıza
 */
export function getRoomSummary(days = 7) {
  const db = getDB()
  return db.prepare(`
    SELECT
      r.id,
      r.block,
      r.floor,
      r.room_no,
      r.status as room_status,
      r.capacity,
      r.active_beds,
      COALESCE(ct_done.cnt, 0)    as cleaned_count,
      COALESCE(ct_done.photo_cnt, 0) as photo_count,
      ct_done.last_cleaned        as last_cleaned_at,
      COALESCE(ct_skip.cnt, 0)    as skipped_count,
      COALESCE(ct_total.cnt, 0)   as total_tasks,
      COALESCE(mr_total.cnt, 0)   as fault_count,
      COALESCE(mr_open.cnt, 0)    as open_faults
    FROM rooms r
    LEFT JOIN (
      SELECT block, area, COUNT(*) as cnt,
             SUM(CASE WHEN photo_url IS NOT NULL THEN 1 ELSE 0 END) as photo_cnt,
             MAX(datetime(completed_at, 'localtime')) as last_cleaned
      FROM cleaning_tasks
      WHERE completed_at IS NOT NULL
        AND DATE(scheduled_at) >= DATE('now', 'localtime', ?)
      GROUP BY block, area
    ) ct_done ON ct_done.area = (r.block || ' Oda ' || r.room_no)
    LEFT JOIN (
      SELECT block, area, COUNT(*) as cnt
      FROM cleaning_tasks
      WHERE skipped = 1
        AND DATE(scheduled_at) >= DATE('now', 'localtime', ?)
      GROUP BY block, area
    ) ct_skip ON ct_skip.area = (r.block || ' Oda ' || r.room_no)
    LEFT JOIN (
      SELECT block, area, COUNT(*) as cnt
      FROM cleaning_tasks
      WHERE DATE(scheduled_at) >= DATE('now', 'localtime', ?)
      GROUP BY block, area
    ) ct_total ON ct_total.area = (r.block || ' Oda ' || r.room_no)
    LEFT JOIN (
      SELECT location, COUNT(*) as cnt
      FROM maintenance_requests
      WHERE DATE(opened_at) >= DATE('now', ?)
      GROUP BY location
    ) mr_total ON mr_total.location LIKE (r.block || '%' || r.room_no || '%')
    LEFT JOIN (
      SELECT location, COUNT(*) as cnt
      FROM maintenance_requests
      WHERE status != 'done'
      GROUP BY location
    ) mr_open ON mr_open.location LIKE (r.block || '%' || r.room_no || '%')
    ORDER BY r.block, r.floor, r.room_no
  `).all(
    `-${days} days`,
    `-${days} days`,
    `-${days} days`,
    `-${days} days`
  )
}

/**
 * Tek odanın gün gün timeline'ı: temizlik + arıza kayıtları birleştirilmiş
 */
export function getRoomTimeline(block, roomNo, days = 7) {
  const db = getDB()

  const areaName = `${block} Oda ${roomNo}`

  // Temizlik kayıtları — foto kanıtı + kiosk personeli (staff) dahil
  const cleanings = db.prepare(`
    SELECT
      ct.id,
      'cleaning' as type,
      ct.area,
      ct.scheduled_at,
      ct.completed_at,
      ct.skipped,
      ct.skip_reason,
      ct.checklist,
      ct.photo_url,
      ct.verified_by_qr,
      u.full_name as completed_by,
      w.full_name as worker_name
    FROM cleaning_tasks ct
    LEFT JOIN users u ON u.id = ct.assigned_to
    LEFT JOIN staff w ON w.id = ct.completed_by_worker_id
    WHERE ct.area = ?
      AND DATE(ct.scheduled_at) >= DATE('now', 'localtime', ?)
    ORDER BY ct.scheduled_at DESC
  `).all(areaName, `-${days} days`)

  // Arıza kayıtları
  const faults = db.prepare(`
    SELECT
      mr.id,
      'fault' as type,
      mr.location,
      mr.description,
      mr.status,
      mr.priority,
      mr.opened_at,
      mr.closed_at,
      mr.assigned_at,
      mr.started_at,
      mr.photo_before,
      mr.photo_url,
      t.full_name as technician_name,
      t.specialty as technician_specialty,
      ru.full_name as reporter_name
    FROM maintenance_requests mr
    LEFT JOIN technicians t ON t.id = mr.assigned_to
    LEFT JOIN users ru ON ru.id = mr.reporter_user_id
    WHERE (mr.location LIKE ? OR mr.location LIKE ?)
      AND DATE(mr.opened_at) >= DATE('now', ?)
    ORDER BY mr.opened_at DESC
  `).all(`%${block}%${roomNo}%`, `%Oda ${roomNo}%`, `-${days} days`)

  // Arıza yorumları
  const faultIds = faults.map(f => f.id)
  let comments = []
  if (faultIds.length > 0) {
    comments = db.prepare(`
      SELECT mc.*, u.full_name as user_name
      FROM maintenance_comments mc
      LEFT JOIN users u ON u.id = mc.user_id
      WHERE mc.request_id IN (${faultIds.map(() => '?').join(',')})
      ORDER BY mc.created_at ASC
    `).all(...faultIds)
  }

  // Yorumları ilgili arızalara ekle
  const commentsByRequest = {}
  comments.forEach(c => {
    if (!commentsByRequest[c.request_id]) commentsByRequest[c.request_id] = []
    commentsByRequest[c.request_id].push(c)
  })
  faults.forEach(f => { f.comments = commentsByRequest[f.id] || [] })

  // Oda bilgisi
  const room = db.prepare('SELECT * FROM rooms WHERE block = ? AND room_no = ?').get(block, roomNo)

  // Mevcut sakinler
  const occupants = db.prepare(`
    SELECT p.full_name, p.company, ra.bed_no, ra.assigned_at
    FROM room_assignments ra
    JOIN personnel p ON p.id = ra.personnel_id
    WHERE ra.room_id = ? AND ra.check_out_at IS NULL
    ORDER BY ra.bed_no
  `).all(room?.id)

  // Geçmiş sakinler
  const pastOccupants = db.prepare(`
    SELECT p.full_name, p.company, ra.bed_no, ra.assigned_at, ra.check_out_at,
      u.full_name as assigned_by_name
    FROM room_assignments ra
    JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN users u ON u.id = ra.assigned_by
    WHERE ra.room_id = ? AND ra.check_out_at IS NOT NULL
      AND DATE(ra.check_out_at) >= DATE('now', ?)
    ORDER BY ra.check_out_at DESC
  `).all(room?.id, `-${days} days`)

  return { room, occupants, pastOccupants, cleanings, faults }
}
