import { Router } from 'express'
import { randomBytes } from 'crypto'
import { unlinkSync } from 'node:fs'
import { requireAvsKiosk } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { createRequest } from '../maintenance/queries.js'
import { changeStaffKioskPin } from '../../shared/auth/service.js'
import { logger } from '../../shared/logger.js'
import {
  upload, createImageUpload, verifyMagicBytes, verifyImageMagicBytes,
} from '../../shared/uploads/middleware.js'
import { createLeaveService, leaveListService, leaveBalanceService } from '../shifts/service.js'
import { checkoutToStaff, getStaffCheckouts } from '../inventory/service.js'
import { departmentToInventoryCategory, getKioskSystemUserId } from './inventory-helpers.js'
import { isPushConfigured, getVapidPublicKey, saveWorkerSubscription, deleteWorkerSubscription } from '../../shared/notifications/push.js'
import { getStaffActivity } from '../activity/service.js'
import { MEAL_TYPES, localDay } from '../meals/service.js'
import { validate } from '../../shared/middleware/validate.js'
import {
  mealSelectionSchema, maintenanceSchema, feedbackSchema, skipCleaningTaskSchema,
} from './schemas.js'
import { getStaffTransport } from '../transport/self-service.js'

export const avsSelfServiceRouter = Router()
const cleaningProofUpload = createImageUpload('housekeeping').fields([
  { name: 'photo', maxCount: 1 },
  { name: 'photos', maxCount: 3 },
])

const ROLE_GROUPS = {
  laundry: ['çama', 'cama'],
  housekeeping: ['temizlik', 'meydan', 'housekeep'],
  technical: ['teknik'],
}

function roleGroup(departmentName = '') {
  const dept = String(departmentName || '').toLocaleLowerCase('tr-TR')
  for (const [group, needles] of Object.entries(ROLE_GROUPS)) {
    if (needles.some(needle => dept.includes(needle))) return group
  }
  return 'general'
}

function loadTechnicalWorker(db, workerId) {
  const worker = db.prepare(`
    SELECT s.id, s.full_name, d.name AS department_name
    FROM staff s
    LEFT JOIN departments d ON d.id=s.department_id
    WHERE s.id=? AND s.is_active=1
  `).get(workerId)
  return worker && roleGroup(worker.department_name) === 'technical' ? worker : null
}

function maintenanceTrackingNo(id) {
  return `ARZ-${String(id).padStart(6, '0')}`
}

function uploadedFiles(req) {
  if (req.files) return Object.values(req.files).flat()
  return req.file ? [req.file] : []
}

function removeUploadedFiles(req) {
  for (const file of uploadedFiles(req)) {
    try { unlinkSync(file.path) } catch { /* already removed or unavailable */ }
  }
}

function acceptCleaningProof(req, res, next) {
  cleaningProofUpload(req, res, err => {
    if (!err) return next()
    removeUploadedFiles(req)
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Fotoğraf başına en fazla 10 MB yüklenebilir'
      : 'En fazla 3 temizlik fotoğrafı yüklenebilir'
    return res.status(400).json({ error: message })
  })
}

function acceptMaintenancePhoto(req, res, next) {
  upload.single('photo')(req, res, err => {
    if (!err) return next()
    removeUploadedFiles(req)
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Arıza fotoğrafı en fazla 10 MB olabilir'
      : err.message || 'Arıza fotoğrafı yüklenemedi'
    return res.status(400).json({ error: message })
  })
}

function validateUploadBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      removeUploadedFiles(req)
      const details = parsed.error.issues.map(issue => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      }))
      return res.status(400).json({ error: details[0]?.message || 'Geçersiz istek', details })
    }
    req.validated = parsed.data
    next()
  }
}

function loadAuthorizedCleaningTask(req, res, next) {
  const taskId = Number(req.params.id)
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return res.status(404).json({ error: 'Görev bulunamadı' })
  }
  const db = getDB()
  const task = db.prepare(`
    SELECT ct.*,
      (SELECT r.id FROM rooms r
       WHERE r.block=ct.block AND ct.qr_location=ct.block || '-' || r.room_no
       LIMIT 1) AS room_id
    FROM cleaning_tasks ct
    WHERE ct.id=?
  `).get(taskId)
  if (!task) return res.status(404).json({ error: 'Görev bulunamadı' })
  const staff = db.prepare('SELECT assigned_block FROM staff WHERE id=?').get(req.user.workerId)
  if (staff?.assigned_block && staff.assigned_block !== task.block) {
    return res.status(403).json({ error: 'Bu görev sizin bloğunuza ait değil' })
  }
  req.avsTask = task
  next()
}

// ── Ertesi-gün öğün seçimi (Faz 8b) — çalışan kendi yarınki öğününü seçer ──
avsSelfServiceRouter.put('/my-meal-selection', requireAvsKiosk, validate(mealSelectionSchema), (req, res) => {
  try {
    const { meal_date, meal_type } = req.body || {}
    const attending = req.body?.attending === false ? 0 : 1
    getDB().prepare(`
      INSERT INTO meal_selections(staff_id, meal_date, meal_type, attending)
      VALUES(?,?,?,?)
      ON CONFLICT(staff_id, meal_date, meal_type)
      DO UPDATE SET attending=excluded.attending, updated_at=datetime('now')
    `).run(req.user.workerId, meal_date, meal_type, attending)
    res.json({ ok: true, meal_date, meal_type, attending })
  } catch (e) { logger.error('[avs/my-meal-selection put]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

avsSelfServiceRouter.get('/my-meal-selection', requireAvsKiosk, (req, res) => {
  try {
    const date = req.query.date || localDay(getDB(), 1)
    const rows = getDB().prepare('SELECT meal_type, attending FROM meal_selections WHERE staff_id=? AND meal_date=?')
      .all(req.user.workerId, date)
    const selections = {}
    for (const r of rows) selections[r.meal_type] = r.attending
    res.json({ date, selections })
  } catch (e) { logger.error('[avs/my-meal-selection get]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Profil bilgisi — sadece görüntüleme
avsSelfServiceRouter.get('/my-info', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const w = db.prepare(`
      SELECT s.full_name, s.role_label, s.phone,
        d.name as department_name,
        pp.name as pickup_name
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
      WHERE s.id = ?
    `).get(req.user.workerId)
    if (!w) return res.status(404).json({ error: 'Çalışan bulunamadı' })
    res.json({ ...w, inventory_category: departmentToInventoryCategory(w.department_name) })
  } catch (e) { logger.error('[avs my-info]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Rol bazlı ana ekran özeti — kiosk ilk açılışında tek istekle kritik operasyon verisi.
avsSelfServiceRouter.get('/overview', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const worker = db.prepare(`
      SELECT s.id, s.full_name, s.role_label, s.assigned_block, s.pickup_point_id,
             d.name AS department_name, pp.name AS pickup_name
      FROM staff s
      LEFT JOIN departments d ON d.id=s.department_id
      LEFT JOIN pickup_points pp ON pp.id=s.pickup_point_id
      WHERE s.id=?
    `).get(req.user.workerId)
    if (!worker) return res.status(404).json({ error: 'Çalışan bulunamadı' })

    const group = roleGroup(worker.department_name)
    const requestedBlock = typeof req.query.block === 'string' ? req.query.block.trim().toUpperCase() : null
    if (requestedBlock && !/^[A-Z][A-Z0-9]{0,7}$/.test(requestedBlock)) {
      return res.status(400).json({ error: 'Geçersiz blok' })
    }
    if (worker.assigned_block && requestedBlock && requestedBlock !== worker.assigned_block) {
      return res.status(403).json({ error: 'Bu blok size atanmış değil' })
    }
    const selectedBlock = worker.assigned_block || requestedBlock || null
    const availableBlocks = group === 'housekeeping'
      ? (worker.assigned_block
          ? [worker.assigned_block]
          : db.prepare(`
              SELECT DISTINCT block FROM cleaning_tasks
              WHERE date(scheduled_at)=date('now','localtime') AND block IS NOT NULL
              ORDER BY block
            `).all().map(row => row.block))
      : []

    const taskSummary = group === 'housekeeping' && selectedBlock
      ? db.prepare(`
          SELECT COUNT(*) AS total,
                 SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed,
                 SUM(CASE WHEN skipped=1 AND completed_at IS NULL THEN 1 ELSE 0 END) AS skipped,
                 SUM(CASE WHEN completed_at IS NULL AND skipped=0 THEN 1 ELSE 0 END) AS pending
          FROM cleaning_tasks
          WHERE date(scheduled_at)=date('now','localtime')
            AND block=?
        `).get(selectedBlock)
      : { total: 0, completed: 0, skipped: 0, pending: 0 }

    const nextTask = group === 'housekeeping' && selectedBlock
      ? db.prepare(`
          SELECT id, area, block, floor, task_type, qr_location
          FROM cleaning_tasks
          WHERE date(scheduled_at)=date('now','localtime')
            AND completed_at IS NULL AND skipped=0
            AND block=?
          ORDER BY block, floor, task_type DESC, id LIMIT 1
        `).get(selectedBlock)
      : null

    const nextShift = db.prepare(`
      SELECT ss.work_date, ss.status, sd.name AS shift_name,
             sd.start_hour, sd.end_hour
      FROM shift_schedule ss
      LEFT JOIN shift_definitions sd ON sd.id=ss.shift_def_id
      WHERE ss.staff_id=? AND ss.work_date>=date('now','localtime')
      ORDER BY ss.work_date LIMIT 1
    `).get(req.user.workerId) || null

    const reportedFaults = db.prepare(`
      SELECT COUNT(DISTINCT m.id) AS open,
             SUM(CASE WHEN m.priority='high' THEN 1 ELSE 0 END) AS urgent
      FROM maintenance_requests m
      JOIN audit_log a ON a.target_id=m.id
        AND a.action='kiosk_avs_maintenance'
        AND json_extract(a.detail, '$.workerId')=?
      WHERE m.status NOT IN ('done')
    `).get(req.user.workerId)

    const technicalFaults = group === 'technical'
      ? db.prepare(`
          SELECT COUNT(*) AS open,
                 SUM(CASE WHEN priority='high' THEN 1 ELSE 0 END) AS urgent,
                 SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress,
                 SUM(CASE WHEN avs_assigned_worker_id=? AND status!='done' THEN 1 ELSE 0 END) AS mine,
                 SUM(CASE WHEN avs_assigned_worker_id IS NULL AND assigned_to IS NULL
                               AND status!='done' THEN 1 ELSE 0 END) AS available
          FROM maintenance_requests WHERE status NOT IN ('done')
        `).get(req.user.workerId)
      : null

    const staffTransport = getStaffTransport(req.user.workerId)
    let transportSchedule = staffTransport.schedule || null
    if (!transportSchedule && worker.pickup_point_id) {
      transportSchedule = db.prepare(`
        SELECT rs.scheduled_time AS time, r.name AS route_name,
               r.driver_name, r.driver_phone, r.vehicle_plate AS plate
        FROM route_assignments ra
        JOIN routes r ON r.id=ra.route_id
        LEFT JOIN route_stops rs ON rs.id=ra.stop_id
        WHERE ra.staff_id=? AND ra.work_date=date('now','localtime')
        LIMIT 1
      `).get(req.user.workerId) || db.prepare(`
        SELECT rs.scheduled_time AS time, r.name AS route_name,
               r.driver_name, r.driver_phone, r.vehicle_plate AS plate
        FROM route_stops rs
        JOIN routes r ON r.id=rs.route_id AND r.is_active=1
        WHERE rs.pickup_point_id=?
        ORDER BY rs.id LIMIT 1
      `).get(worker.pickup_point_id) || null
    }

    const announcements = db.prepare(`
      SELECT id, title, body, created_at
      FROM announcements
      WHERE expires_at IS NULL OR expires_at>datetime('now')
      ORDER BY created_at DESC LIMIT 2
    `).all()

    res.json({
      role_group: group,
      worker,
      selected_block: selectedBlock,
      available_blocks: availableBlocks,
      tasks: {
        total: Number(taskSummary.total || 0),
        completed: Number(taskSummary.completed || 0),
        skipped: Number(taskSummary.skipped || 0),
        pending: Number(taskSummary.pending || 0),
        next: nextTask,
      },
      faults: technicalFaults
        ? {
            open: Number(technicalFaults.open || 0),
            urgent: Number(technicalFaults.urgent || 0),
            in_progress: Number(technicalFaults.in_progress || 0),
            mine: Number(technicalFaults.mine || 0),
            available: Number(technicalFaults.available || 0),
          }
        : {
            open: Number(reportedFaults.open || 0),
            urgent: Number(reportedFaults.urgent || 0),
      },
      next_shift: nextShift,
      transport: {
        pickup_name: worker.pickup_name || null,
        schedule: transportSchedule,
      },
      announcements,
    })
  } catch (e) {
    logger.error('[avs overview]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// Vardiyam — bugünden itibaren 7 gün
avsSelfServiceRouter.get('/my-shifts', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const shifts = db.prepare(`
      SELECT ss.work_date, ss.status,
        sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class
      FROM shift_schedule ss
      LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
      WHERE ss.staff_id = ?
        AND ss.work_date BETWEEN date('now','localtime') AND date('now','localtime','+7 days')
      ORDER BY ss.work_date
    `).all(req.user.workerId)
    res.json({ shifts })
  } catch (e) { logger.error('[avs my-shifts]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Servisim — atanmış durak bilgisi + servis programı
avsSelfServiceRouter.get('/my-transport', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const v2 = getStaffTransport(req.user.workerId)
    if (v2.schedule || v2.upcoming.length || v2.history.length) return res.json(v2)
    const staff = db.prepare('SELECT pickup_point_id FROM staff WHERE id=?').get(req.user.workerId)
    const pickup = v2.pickup

    // Servis programı: önce bugünün ataması, yoksa durağın aktif route_stop'u
    let schedule = db.prepare(`
      SELECT rs.scheduled_time AS time, r.name AS route_name,
             r.driver_name, r.driver_phone, r.vehicle_plate AS plate
      FROM route_assignments ra
      JOIN routes r ON r.id = ra.route_id
      LEFT JOIN route_stops rs ON rs.id = ra.stop_id
      WHERE ra.staff_id = ? AND ra.work_date = date('now','localtime')
      LIMIT 1
    `).get(req.user.workerId)

    if (!schedule && staff?.pickup_point_id) {
      schedule = db.prepare(`
        SELECT rs.scheduled_time AS time, r.name AS route_name,
               r.driver_name, r.driver_phone, r.vehicle_plate AS plate
        FROM route_stops rs
        JOIN routes r ON r.id = rs.route_id AND r.is_active = 1
        WHERE rs.pickup_point_id = ?
        ORDER BY rs.id LIMIT 1
      `).get(staff.pickup_point_id)
    }

    res.json({ ...v2, pickup, schedule: schedule || null })
  } catch (e) { logger.error('[avs my-transport]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Görevlerim — departmana göre dispatch
avsSelfServiceRouter.get('/my-tasks', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const staff = db.prepare(`
      SELECT s.assigned_block, d.name as dept_name
      FROM staff s LEFT JOIN departments d ON d.id = s.department_id
      WHERE s.id = ?
    `).get(req.user.workerId)
    const group = roleGroup(staff?.dept_name)

    if (group === 'laundry') {
      // Çamaşır işleme ayrı kioskta yapılır
      return res.json({ type: 'laundry', items: [] })
    }
    // Temizlik ekibi farklı isimlerle tanımlı olabilir: Temizlik / Meydancı /
    // Housekeeping — hepsi housekeeping görev akışına gider
    if (group === 'housekeeping') {
      const requestedBlock = typeof req.query.block === 'string' ? req.query.block.trim().toUpperCase() : null
      if (requestedBlock && !/^[A-Z][A-Z0-9]{0,7}$/.test(requestedBlock)) {
        return res.status(400).json({ error: 'Geçersiz blok' })
      }
      if (staff.assigned_block && requestedBlock && requestedBlock !== staff.assigned_block) {
        return res.status(403).json({ error: 'Bu blok size atanmış değil' })
      }
      const selectedBlock = staff.assigned_block || requestedBlock || null
      // scheduled_at TZ'siz yerel string ("YYYY-MM-DD 08:00:00") — date() ham
      // alınır; "bugün" yerel gün sınırıyla karşılaştırılır (00:00-03:00 fix)
      // qr_location oda numarası çözümü için döner (M1-205 → 205);
      // assigned_block yoksa TÜM bloklar gelir, kiosk blok seçtirir
      const items = selectedBlock
        ? db.prepare(`
            SELECT ct.id, ct.area, ct.block, ct.floor, ct.task_type, ct.scheduled_at,
                   ct.completed_at, ct.skipped, ct.skip_reason, ct.qr_location, ct.photo_url,
                   (SELECT COUNT(*) FROM cleaning_task_photos p WHERE p.task_id=ct.id) AS photo_count,
                   (SELECT r.id FROM rooms r
                    WHERE r.block=ct.block AND ct.qr_location=ct.block || '-' || r.room_no
                    LIMIT 1) AS room_id
            FROM cleaning_tasks ct
            WHERE date(scheduled_at) = date('now', 'localtime')
              AND block = ?
            ORDER BY block, floor, task_type DESC, id
            LIMIT 400
          `).all(selectedBlock)
        : []
      const availableBlocks = staff.assigned_block
        ? [staff.assigned_block]
        : db.prepare(`
            SELECT DISTINCT block FROM cleaning_tasks
            WHERE date(scheduled_at)=date('now','localtime') AND block IS NOT NULL
            ORDER BY block
          `).all().map(row => row.block)
      return res.json({
        type: 'housekeeping',
        assigned_block: staff.assigned_block || null,
        selected_block: selectedBlock,
        available_blocks: availableBlocks,
        items,
      })
    }
    if (group === 'technical') {
      const items = db.prepare(`
        SELECT mr.id, mr.location, mr.description, mr.status, mr.priority,
               mr.category, mr.block, mr.room_id, mr.cleaning_task_id,
               mr.opened_at, mr.assigned_at, mr.started_at, mr.sla_deadline,
               mr.photo_before, mr.photo_url,
               mr.avs_assigned_worker_id, mr.assigned_to,
               aw.full_name AS avs_worker_name,
               t.full_name AS technician_name,
               CASE WHEN mr.avs_assigned_worker_id=? THEN 1 ELSE 0 END AS is_mine,
               (
                 SELECT json_extract(a.detail, '$.note')
                 FROM audit_log a
                 WHERE a.target_id=mr.id
                   AND a.action='kiosk_avs_maintenance_status'
                   AND json_extract(a.detail, '$.note') IS NOT NULL
                 ORDER BY a.id DESC LIMIT 1
               ) AS last_action_note
        FROM maintenance_requests mr
        LEFT JOIN staff aw ON aw.id=mr.avs_assigned_worker_id
        LEFT JOIN technicians t ON t.id=mr.assigned_to
        WHERE mr.status IN ('open','assigned','in_progress','review')
        ORDER BY CASE WHEN mr.avs_assigned_worker_id=? THEN 0
                      WHEN mr.avs_assigned_worker_id IS NULL AND mr.assigned_to IS NULL THEN 1
                      ELSE 2 END,
                 CASE mr.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                 mr.opened_at
        LIMIT 60
      `).all(req.user.workerId, req.user.workerId)
      return res.json({ type: 'maintenance', worker_id: req.user.workerId, items })
    }
    return res.json({ type: 'none', items: [] })
  } catch (e) { logger.error('[avs my-tasks]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Teknik kiosk iş havuzu — boş bir arızayı güvenli ve atomik şekilde sahiplenir.
avsSelfServiceRouter.patch('/maintenance/:id/claim', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const worker = loadTechnicalWorker(db, req.user.workerId)
    if (!worker) return res.status(403).json({ error: 'Bu işlem yalnız teknik personel içindir' })

    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Arıza bulunamadı' })

    const claim = db.transaction(() => {
      const current = db.prepare(`
        SELECT id, status, assigned_to, avs_assigned_worker_id
        FROM maintenance_requests WHERE id=?
      `).get(id)
      if (!current) return { status: 404, error: 'Arıza bulunamadı' }
      if (current.status === 'done') return { status: 409, error: 'Tamamlanmış arıza sahiplenilemez' }
      if (current.assigned_to) return { status: 409, error: 'Arıza yönetim tarafından başka teknisyene atandı' }
      if (current.avs_assigned_worker_id && current.avs_assigned_worker_id !== worker.id) {
        return { status: 409, error: 'Arıza başka bir teknik personel tarafından üstlenildi' }
      }
      if (current.avs_assigned_worker_id === worker.id) return { ok: true }

      const updated = db.prepare(`
        UPDATE maintenance_requests
        SET avs_assigned_worker_id=?, assigned_at=COALESCE(assigned_at, datetime('now'))
        WHERE id=? AND assigned_to IS NULL
          AND (avs_assigned_worker_id IS NULL OR avs_assigned_worker_id=?)
      `).run(worker.id, id, worker.id)
      if (!updated.changes) return { status: 409, error: 'Arıza şu anda sahiplenilemedi' }

      db.prepare(`
        INSERT INTO audit_log(user_id, action, module, target_id, detail)
        VALUES(NULL, 'kiosk_avs_maintenance_claim', 'avs-self-service', ?, ?)
      `).run(id, JSON.stringify({ workerId: worker.id }))
      return { ok: true }
    })()

    if (!claim.ok) return res.status(claim.status).json({ error: claim.error })
    return res.json({
      ok: true,
      id,
      tracking_no: maintenanceTrackingNo(id),
      avs_assigned_worker_id: worker.id,
      avs_worker_name: worker.full_name,
    })
  } catch (e) {
    logger.error('[avs maintenance claim]', e)
    return res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// Teknik kiosk durum geçişi — sadece işi üstlenen personel başlatabilir/tamamlayabilir.
avsSelfServiceRouter.patch(
  '/maintenance/:id/status',
  requireAvsKiosk,
  acceptMaintenancePhoto,
  verifyMagicBytes,
  (req, res) => {
    try {
    const db = getDB()
    const worker = loadTechnicalWorker(db, req.user.workerId)
    if (!worker) {
      removeUploadedFiles(req)
      return res.status(403).json({ error: 'Bu işlem yalnız teknik personel içindir' })
    }

    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      removeUploadedFiles(req)
      return res.status(404).json({ error: 'Arıza bulunamadı' })
    }
    const status = req.body?.status
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : ''
    if (!['in_progress', 'done'].includes(status)) {
      removeUploadedFiles(req)
      return res.status(400).json({ error: 'Geçersiz arıza durumu' })
    }
    if (note.length > 500) {
      removeUploadedFiles(req)
      return res.status(400).json({ error: 'İşlem notu en fazla 500 karakter olabilir' })
    }
    if (req.file && status !== 'done') {
      removeUploadedFiles(req)
      return res.status(400).json({ error: 'Çözüm fotoğrafı yalnız iş tamamlanırken eklenebilir' })
    }
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null

    const transition = db.transaction(() => {
      const current = db.prepare(`
        SELECT id, status, avs_assigned_worker_id, photo_url
        FROM maintenance_requests WHERE id=?
      `).get(id)
      if (!current) return { status: 404, error: 'Arıza bulunamadı' }
      if (current.avs_assigned_worker_id !== worker.id) {
        return { status: 403, error: 'Bu arızayı önce sizin üstlenmeniz gerekir' }
      }
      if (status === 'in_progress' && current.status === 'in_progress') {
        return { ok: true, idempotent: true, photoUrl: current.photo_url }
      }
      if (status === 'done' && current.status === 'done') {
        return { ok: true, idempotent: true, photoUrl: current.photo_url }
      }
      const allowed = status === 'in_progress'
        ? ['open', 'assigned'].includes(current.status)
        : current.status === 'in_progress'
      if (!allowed) return { status: 409, error: 'Bu durum geçişi artık kullanılamıyor' }

      if (status === 'in_progress') {
        db.prepare(`
          UPDATE maintenance_requests
          SET status='in_progress', started_at=COALESCE(started_at, datetime('now'))
          WHERE id=?
        `).run(id)
      } else {
        db.prepare(`
          UPDATE maintenance_requests
          SET status='done', closed_at=datetime('now'), wait_reason=NULL,
              photo_url=COALESCE(?, photo_url)
          WHERE id=?
        `).run(photoUrl, id)
      }
      db.prepare(`
        INSERT INTO audit_log(user_id, action, module, target_id, detail)
        VALUES(NULL, 'kiosk_avs_maintenance_status', 'avs-self-service', ?, ?)
      `).run(id, JSON.stringify({
        workerId: worker.id,
        status,
        note: note || null,
        photoUrl,
      }))
      return { ok: true, photoUrl }
    })()

    if (!transition.ok) {
      removeUploadedFiles(req)
      return res.status(transition.status).json({ error: transition.error })
    }
    if (transition.idempotent) removeUploadedFiles(req)
    return res.json({
      ok: true,
      id,
      status,
      photo_url: transition.photoUrl || null,
      tracking_no: maintenanceTrackingNo(id),
    })
  } catch (e) {
    removeUploadedFiles(req)
    logger.error('[avs maintenance status]', e)
    return res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// Genel arıza formu için yetkili bloktaki gerçek oda kimlikleri.
avsSelfServiceRouter.get('/location-rooms', requireAvsKiosk, (req, res) => {
  try {
    const block = typeof req.query.block === 'string' ? req.query.block.trim().toUpperCase() : ''
    if (!/^[A-Z][A-Z0-9]{0,7}$/.test(block)) {
      return res.status(400).json({ error: 'Geçersiz blok' })
    }
    const db = getDB()
    const staff = db.prepare('SELECT assigned_block FROM staff WHERE id=?').get(req.user.workerId)
    if (staff?.assigned_block && staff.assigned_block !== block) {
      return res.status(403).json({ error: 'Bu blok size atanmış değil' })
    }
    const items = db.prepare(`
      SELECT id, block, floor, room_no
      FROM rooms
      WHERE block=?
      ORDER BY floor, CAST(room_no AS INTEGER), room_no
    `).all(block)
    res.json({ block, items })
  } catch (e) {
    logger.error('[avs location-rooms]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// Görev tamamla — 1-3 kanıt fotoğrafı zorunlu. Eski tekil `photo` alanı korunur.
avsSelfServiceRouter.post(
  '/tasks/:id/complete',
  requireAvsKiosk,
  loadAuthorizedCleaningTask,
  acceptCleaningProof,
  verifyImageMagicBytes,
  (req, res) => {
  try {
    const db = getDB()
    const task = req.avsTask
    const files = uploadedFiles(req)
    if (task.completed_at) {
      removeUploadedFiles(req)
      return res.json({
        ok: true,
        completed_at: task.completed_at,
        photo_url: task.photo_url,
        already_completed: true,
      })
    }
    if (files.length < 1) return res.status(400).json({ error: 'En az bir temizlik fotoğrafı gerekli' })
    if (files.length > 3) {
      removeUploadedFiles(req)
      return res.status(400).json({ error: 'En fazla 3 fotoğraf yüklenebilir' })
    }

    const photoUrls = files.map(file => `/uploads/${file.filename}`)
    const complete = db.transaction(() => {
      const startOrder = db.prepare(`
        SELECT COALESCE(MAX(sort_order), -1) AS value
        FROM cleaning_task_photos WHERE task_id=?
      `).get(task.id).value
      const insertPhoto = db.prepare(`
        INSERT INTO cleaning_task_photos(
          task_id, photo_url, category, caption, sort_order, uploaded_by
        ) VALUES(?,?,'sonrasi',NULL,?,NULL)
      `)
      photoUrls.forEach((url, index) => insertPhoto.run(task.id, url, startOrder + index + 1))
      db.prepare(`
        UPDATE cleaning_tasks
        SET completed_at=datetime('now'), skipped=0, skip_reason=NULL,
            photo_url=?, completed_by_worker_id=?
        WHERE id=?
      `).run(photoUrls[0], req.user.workerId, task.id)
      db.prepare(`
        INSERT INTO audit_log(user_id, action, module, target_id, detail)
        VALUES(NULL, 'kiosk_avs_task_complete', 'avs-self-service', ?, ?)
      `).run(task.id, JSON.stringify({
        workerId: req.user.workerId,
        photoCount: photoUrls.length,
      }))
      return db.prepare(`
        SELECT completed_at, photo_url,
               (SELECT COUNT(*) FROM cleaning_task_photos WHERE task_id=?) AS photo_count
        FROM cleaning_tasks WHERE id=?
      `).get(task.id, task.id)
    })
    const updated = complete()
    res.json({ ok: true, ...updated })
  } catch (e) {
    removeUploadedFiles(req)
    logger.error('[avs task complete]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

avsSelfServiceRouter.patch(
  '/tasks/:id/skip',
  requireAvsKiosk,
  loadAuthorizedCleaningTask,
  validate(skipCleaningTaskSchema),
  (req, res) => {
    try {
      if (req.avsTask.completed_at) {
        return res.status(409).json({ error: 'Tamamlanmış görev temizlenemedi olarak işaretlenemez' })
      }
      const labels = {
        occupied: 'Oda kullanımda',
        dnd: 'Rahatsız etmeyin',
        locked: 'Kapı kilitli',
        fault: 'Arıza nedeniyle',
        other: 'Diğer',
      }
      const reason = `${labels[req.validated.reason]}${req.validated.note ? `: ${req.validated.note}` : ''}`
      const db = getDB()
      const applySkip = db.transaction(() => {
        db.prepare(`
          UPDATE cleaning_tasks
          SET skipped=1, skip_reason=?, assigned_to=?, completed_at=NULL
          WHERE id=?
        `).run(reason, null, req.avsTask.id)
        db.prepare(`
          INSERT INTO audit_log(user_id, action, module, target_id, detail)
          VALUES(NULL, 'kiosk_avs_task_skip', 'avs-self-service', ?, ?)
        `).run(req.avsTask.id, JSON.stringify({
          workerId: req.user.workerId,
          reason: req.validated.reason,
          note: req.validated.note || null,
        }))
      })
      applySkip()
      res.json({ ok: true, skipped: true, skip_reason: reason })
    } catch (e) {
      logger.error('[avs task skip]', e)
      res.status(500).json({ error: 'Sunucu hatası' })
    }
  }
)

// Duyurular — aktif olanlar (target_role yok, herkese)
avsSelfServiceRouter.get('/announcements', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT id, title, body, created_at
      FROM announcements
      WHERE expires_at IS NULL OR expires_at > datetime('now')
      ORDER BY created_at DESC
      LIMIT 30
    `).all()
    res.json(rows)
  } catch (e) { logger.error('[avs announcements]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Bildirim akışı (feed) ─────────────────────────────────────────────────
// Ayrı bildirim pipeline'ı yerine mevcut verilerden TÜRETİLİR — her zaman tutarlı.
// Kaynaklar: ① izin kararları (onay/ret), ② bildirilen arızanın çözülmesi,
// ③ aktif duyurular. SQLite datetime metinleri ('YYYY-MM-DD HH:MM:SS')
// leksikografik = kronolojik sıralanır.
function buildWorkerFeed(db, workerId, limit = 30) {
  const leave = db.prepare(`
    SELECT id, leave_type, status, start_date, end_date, total_days, approved_at AS ts
    FROM leave_requests
    WHERE staff_id = ? AND status IN ('approved','rejected') AND approved_at IS NOT NULL
    ORDER BY approved_at DESC LIMIT ?
  `).all(workerId, limit).map(r => ({ kind: 'leave', ...r }))

  const maint = db.prepare(`
    SELECT m.id, m.location, m.status, m.closed_at AS ts
    FROM maintenance_requests m
    JOIN audit_log a ON a.target_id = m.id
      AND a.action = 'kiosk_avs_maintenance'
      AND json_extract(a.detail, '$.workerId') = ?
    WHERE m.status = 'done' AND m.closed_at IS NOT NULL
    ORDER BY m.closed_at DESC LIMIT ?
  `).all(workerId, limit).map(r => ({ kind: 'maintenance', ...r }))

  const ann = db.prepare(`
    SELECT id, title, body, created_at AS ts
    FROM announcements
    WHERE expires_at IS NULL OR expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT ?
  `).all(limit).map(r => ({ kind: 'announcement', ...r }))

  return [...leave, ...maint, ...ann]
    .filter(x => x.ts)
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, limit)
}

avsSelfServiceRouter.get('/notifications', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const items = buildWorkerFeed(db, req.user.workerId)
    const row = db.prepare('SELECT seen_at FROM worker_notification_seen WHERE worker_id=?').get(req.user.workerId)
    const seenAt = row?.seen_at || null
    const unread = seenAt ? items.filter(i => i.ts > seenAt).length : items.length
    res.json({ items, unread, seen_at: seenAt })
  } catch (e) { logger.error('[avs notifications]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Feed açılınca çağrılır — okundu yüksek-su-seviyesini şimdiye çeker.
avsSelfServiceRouter.post('/notifications/seen', requireAvsKiosk, (req, res) => {
  try {
    getDB().prepare(`
      INSERT INTO worker_notification_seen(worker_id, seen_at) VALUES(?, datetime('now'))
      ON CONFLICT(worker_id) DO UPDATE SET seen_at = datetime('now')
    `).run(req.user.workerId)
    res.json({ ok: true })
  } catch (e) { logger.error('[avs notifications seen]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Web-push (opt-in, sadece kişisel telefonda) ───────────────────────────
// VAPID public key — frontend subscribe ederken kullanır. Configured değilse 503.
avsSelfServiceRouter.get('/push/vapid-public-key', requireAvsKiosk, (req, res) => {
  if (!isPushConfigured()) return res.status(503).json({ error: 'Push yapılandırılmamış' })
  res.json({ key: getVapidPublicKey() })
})

avsSelfServiceRouter.post('/push/subscribe', requireAvsKiosk, (req, res) => {
  try {
    const { endpoint, keys } = req.body
    if (!endpoint || !keys?.p256dh || !keys?.auth)
      return res.status(400).json({ error: 'Geçersiz subscription' })
    saveWorkerSubscription({
      workerId: req.user.workerId,
      endpoint, p256dh: keys.p256dh, auth: keys.auth,
      userAgent: req.get('user-agent'),
    })
    res.status(201).json({ ok: true })
  } catch (e) { logger.error('[avs push subscribe]', e); res.status(400).json({ error: e.message }) }
})

avsSelfServiceRouter.post('/push/unsubscribe', requireAvsKiosk, (req, res) => {
  try {
    const { endpoint } = req.body
    if (!endpoint) return res.status(400).json({ error: 'endpoint gerekli' })
    deleteWorkerSubscription(endpoint)
    res.json({ ok: true })
  } catch (e) { logger.error('[avs push unsubscribe]', e); res.status(400).json({ error: e.message }) }
})

// Hızlı arıza — kanonik konum/kategori + opsiyonel temizlik görevi bağlantısı.
avsSelfServiceRouter.post('/maintenance', requireAvsKiosk, upload.single('photo'), verifyMagicBytes, validateUploadBody(maintenanceSchema), (req, res) => {
  const {
    location, description, priority, category, block, room_id, cleaning_task_id,
  } = req.validated
  try {
    const db = getDB()
    if (room_id) {
      const room = db.prepare('SELECT id, block FROM rooms WHERE id=?').get(room_id)
      if (!room) {
        removeUploadedFiles(req)
        return res.status(400).json({ error: 'Seçilen oda bulunamadı' })
      }
      if (block && room.block !== block) {
        removeUploadedFiles(req)
        return res.status(400).json({ error: 'Oda seçilen blokla eşleşmiyor' })
      }
    }
    if (cleaning_task_id) {
      const task = db.prepare('SELECT id, block FROM cleaning_tasks WHERE id=?').get(cleaning_task_id)
      if (!task) {
        removeUploadedFiles(req)
        return res.status(400).json({ error: 'Bağlı temizlik görevi bulunamadı' })
      }
      const staff = db.prepare('SELECT assigned_block FROM staff WHERE id=?').get(req.user.workerId)
      if (staff?.assigned_block && staff.assigned_block !== task.block) {
        removeUploadedFiles(req)
        return res.status(403).json({ error: 'Bu görev sizin bloğunuza ait değil' })
      }
    }
    const photoBefore = req.file ? '/uploads/' + req.file.filename : null
    const id = createRequest({
      location: location.trim(),
      description: description.trim(),
      priority: priority || 'medium',
      category,
      block,
      roomId: room_id,
      cleaningTaskId: cleaning_task_id,
      reporterUserId: null,
      reporterPersonnelId: null,
      photoBefore,
    })
    db.prepare(`
      INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_maintenance', 'avs-self-service', ?, ?)
    `).run(id, JSON.stringify({
      workerId: req.user.workerId,
      location: location.trim(),
      category,
      cleaningTaskId: cleaning_task_id || null,
    }))
    res.status(201).json({ id, tracking_no: maintenanceTrackingNo(id) })
  } catch (e) {
    removeUploadedFiles(req)
    logger.error('[avs maintenance]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// PIN değiştir — kendi PIN'i
avsSelfServiceRouter.post('/change-pin', requireAvsKiosk, (req, res) => {
  const { current_pin, new_pin } = req.body
  if (!current_pin || !new_pin) return res.status(400).json({ error: 'Mevcut ve yeni PIN gerekli' })
  const result = changeStaffKioskPin(req.user.workerId, current_pin, new_pin)
  if (result.error) return res.status(result.status).json({ error: result.error })
  getDB().prepare(`
    INSERT INTO audit_log(user_id, action, module, target_id, detail)
    VALUES(NULL, 'kiosk_avs_pin_change', 'avs-self-service', ?, ?)
  `).run(req.user.workerId, JSON.stringify({ workerId: req.user.workerId }))
  res.json(result)
})

// QR kart — staff.qr_token (yoklama/giriş okutması)
avsSelfServiceRouter.get('/my-qr', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const s = db.prepare('SELECT qr_token, full_name FROM staff WHERE id=?').get(req.user.workerId)
    res.json({ qr_token: s?.qr_token || null, full_name: s?.full_name || null })
  } catch (e) { logger.error('[avs my-qr]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Kartlarım — ayrı giriş + yemek kartı (eksikse lazy üret, INSERT OR IGNORE ile race-safe)
const CARD_PREFIX = { access: 'AVS-A:', meal: 'AVS-M:' }
avsSelfServiceRouter.get('/my-cards', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const wid = req.user.workerId
    const ensure = db.transaction(() => {
      for (const t of ['access', 'meal']) {
        const code = CARD_PREFIX[t] + randomBytes(10).toString('hex')
        // partial unique index (holder×type WHERE active) sayesinde mükerrer üretmez
        db.prepare(`INSERT OR IGNORE INTO cards(holder_type, holder_id, card_type, code, status)
                    VALUES('staff', ?, ?, ?, 'active')`).run(wid, t, code)
      }
    })
    ensure()
    const cards = db.prepare(`
      SELECT id, card_type, code, status FROM cards
      WHERE holder_type='staff' AND holder_id=? AND status='active'
      ORDER BY card_type
    `).all(wid)
    res.json({ cards })
  } catch (e) { logger.error('[avs my-cards]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Kişinin kendi birleşik hareket geçmişi (okutma/yemek/zimmet/izin/servis)
avsSelfServiceRouter.get('/my-activity', requireAvsKiosk, (req, res) => {
  try {
    const items = getStaffActivity(getDB(), req.user.workerId, {
      types: typeof req.query.types === 'string' && req.query.types ? req.query.types.split(',') : null,
      limit: +req.query.limit || 40,
    })
    res.json({ items })
  } catch (e) { logger.error('[avs my-activity]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Bildirdiğim arızalar — audit_log üzerinden (AVS reporter null, workerId audit'te)
avsSelfServiceRouter.get('/my-maintenance', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT m.id, m.location, m.description, m.status, m.priority,
             m.category, m.block, m.room_id, m.cleaning_task_id,
             m.photo_before, m.sla_deadline, m.opened_at, m.closed_at,
             COALESCE(t.full_name, aw.full_name) AS technician_name
      FROM maintenance_requests m
      JOIN audit_log a ON a.target_id = m.id
        AND a.action = 'kiosk_avs_maintenance'
        AND json_extract(a.detail, '$.workerId') = ?
      LEFT JOIN technicians t ON t.id=m.assigned_to
      LEFT JOIN staff aw ON aw.id=m.avs_assigned_worker_id
      ORDER BY m.opened_at DESC LIMIT 20
    `).all(req.user.workerId)
    res.json(rows.map(row => ({
      ...row,
      tracking_no: maintenanceTrackingNo(row.id),
    })))
  } catch (e) { logger.error('[avs my-maintenance]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Geri bildirim — AVS çalışanı (personnel_id null, workerId audit'te)
avsSelfServiceRouter.post('/feedback', requireAvsKiosk, validate(feedbackSchema), (req, res) => {
  const { type, message } = req.body
  try {
    const db = getDB()
    const r = db.prepare('INSERT INTO feedback(personnel_id, type, message) VALUES(NULL,?,?)').run(type, message.trim())
    db.prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_feedback', 'avs-self-service', ?, ?)`).run(r.lastInsertRowid, JSON.stringify({ workerId: req.user.workerId }))
    res.status(201).json({ ok: true, id: r.lastInsertRowid })
  } catch (e) { logger.error('[avs feedback]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// İzin — bakiye + kendi talepleri
avsSelfServiceRouter.get('/my-leave', requireAvsKiosk, (req, res) => {
  try {
    res.json({
      balance: leaveBalanceService(req.user.workerId),
      requests: leaveListService({ staff_id: req.user.workerId }),
    })
  } catch (e) { logger.error('[avs my-leave]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// İzin talebi oluştur — daima kendisi için (staff_id zorlanır)
avsSelfServiceRouter.post('/my-leave', requireAvsKiosk, (req, res) => {
  try {
    const id = createLeaveService({
      leave_type: req.body.leave_type,
      start_date: req.body.start_date,
      end_date: req.body.end_date,
      reason: req.body.reason || null,
      staff_id: req.user.workerId,
    })
    getDB().prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_leave', 'avs-self-service', ?, ?)`).run(id, JSON.stringify({ workerId: req.user.workerId }))
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Bugünün yemek menüsü — dolu öğünler
avsSelfServiceRouter.get('/menu/today', requireAvsKiosk, (req, res) => {
  try {
    const rows = getDB().prepare(`
      SELECT meal_type, items FROM meal_menu
      WHERE meal_date = date('now', 'localtime') AND items IS NOT NULL AND items != ''
    `).all()
    res.json(rows)
  } catch (e) { logger.error('[avs menu/today]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Envanter (çıkış/zimmet) ──────────────────────────────────────────────
// Tüm AVS personeli tüm ürünleri görür (departman gating kaldırıldı)
avsSelfServiceRouter.get('/inventory/items', requireAvsKiosk, (req, res) => {
  try {
    const items = getDB().prepare(`
      SELECT id, item_name, category, quantity, unit, reorder_threshold, track_locations
      FROM inventory ORDER BY category, item_name
    `).all()
    res.json({ items })
  } catch (e) { logger.error('[avs inventory items]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Ürün al (stoktan zimmet düşümü) — staff_id = workerId, created_by = sistem
avsSelfServiceRouter.post('/inventory/checkout', requireAvsKiosk, (req, res) => {
  const { item_id, quantity, note, from_location_id } = req.body
  const qty = Number(quantity)
  if (!item_id || !Number.isFinite(qty) || qty <= 0)
    return res.status(400).json({ error: 'Geçerli ürün ve miktar gerekli' })
  try {
    const db = getDB()
    // Departman gating yok — her personel her ürünü alabilir
    const item = db.prepare('SELECT id FROM inventory WHERE id = ?').get(item_id)
    if (!item) return res.status(404).json({ error: 'Ürün bulunamadı' })

    const systemUserId = getKioskSystemUserId()

    // Sadece checkoutToStaff'ın domain throw'ları (yetersiz stok / lokasyon gerekli)
    // → 400. getKioskSystemUserId / audit insert gibi altyapı hataları dıştaki
    // catch'e (500) düşer; iç hata mesajı 400 olarak sızmaz.
    let result
    try {
      result = checkoutToStaff(
        item_id, req.user.workerId, qty, note?.trim() || null, systemUserId, from_location_id || null
      )
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }

    db.prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail)
                VALUES(NULL, 'kiosk_avs_inventory_checkout', 'avs-self-service', ?, ?)`)
      .run(item_id, JSON.stringify({ workerId: req.user.workerId, quantity: qty }))
    res.status(201).json(result)
  } catch (e) {
    logger.error('[avs inventory checkout]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// Lokasyon-takipli ürün için stoklu kaynak lokasyonlar
avsSelfServiceRouter.get('/inventory/items/:id/locations', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    // Departman gating yok — her personel her ürünün lokasyonunu görebilir
    const item = db.prepare('SELECT id FROM inventory WHERE id = ?').get(req.params.id)
    if (!item) return res.status(404).json({ error: 'Ürün bulunamadı' })
    const rows = db.prepare(`
      SELECT isbl.location_id, il.name, il.block, isbl.quantity
      FROM inventory_stock_by_location isbl
      JOIN inventory_locations il ON il.id = isbl.location_id
      WHERE isbl.item_id = ? AND isbl.quantity > 0 AND il.is_active = 1
      ORDER BY il.block, il.name
    `).all(req.params.id)
    res.json(rows)
  } catch (e) { logger.error('[avs item locations]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Aldıklarım — açık (iade edilmemiş) zimmetler
avsSelfServiceRouter.get('/inventory/my-checkouts', requireAvsKiosk, (req, res) => {
  try {
    res.json(getStaffCheckouts(req.user.workerId))
  } catch (e) { logger.error('[avs my-checkouts]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
