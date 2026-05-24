import { Router } from 'express'
import { requireAvsKiosk } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { createRequest } from '../maintenance/queries.js'
import { changeStaffKioskPin } from '../../shared/auth/service.js'
import { logger } from '../../shared/logger.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'

export const avsSelfServiceRouter = Router()

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
    res.json(w)
  } catch (e) { logger.error('[avs my-info]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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
        AND ss.work_date BETWEEN date('now') AND date('now','+7 days')
      ORDER BY ss.work_date
    `).all(req.user.workerId)
    res.json({ shifts })
  } catch (e) { logger.error('[avs my-shifts]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Servisim — atanmış durak bilgisi + servis programı
avsSelfServiceRouter.get('/my-transport', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const staff = db.prepare('SELECT pickup_point_id FROM staff WHERE id=?').get(req.user.workerId)
    const pickup = staff?.pickup_point_id ? db.prepare(`
      SELECT name, district, neighborhood, notes, lat, lng
      FROM pickup_points WHERE id = ?
    `).get(staff.pickup_point_id) : null

    // Servis programı: önce bugünün ataması, yoksa durağın aktif route_stop'u
    let schedule = db.prepare(`
      SELECT rs.scheduled_time AS time, r.name AS route_name,
             r.driver_name, r.driver_phone, r.vehicle_plate AS plate
      FROM route_assignments ra
      JOIN routes r ON r.id = ra.route_id
      LEFT JOIN route_stops rs ON rs.id = ra.stop_id
      WHERE ra.staff_id = ? AND ra.work_date = date('now')
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

    res.json({ pickup, schedule: schedule || null })
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
    const dept = (staff?.dept_name || '').toLowerCase()

    if (dept.includes('çama') || dept.includes('cama')) {
      // Çamaşır işleme ayrı kioskta yapılır
      return res.json({ type: 'laundry', items: [] })
    }
    if (dept.includes('temizlik')) {
      const items = db.prepare(`
        SELECT id, area, block, floor, task_type, scheduled_at, completed_at
        FROM cleaning_tasks
        WHERE date(scheduled_at) = date('now')
          AND (? IS NULL OR block = ?)
        ORDER BY scheduled_at
        LIMIT 50
      `).all(staff.assigned_block || null, staff.assigned_block || null)
      return res.json({ type: 'housekeeping', items })
    }
    if (dept.includes('teknik')) {
      // assigned_to → technicians(id); staff eşleşmesi yok → açık talepleri göster (bilgi amaçlı)
      const items = db.prepare(`
        SELECT id, location, description, status, priority, opened_at
        FROM maintenance_requests
        WHERE status IN ('open','assigned','in_progress')
        ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, opened_at
        LIMIT 30
      `).all()
      return res.json({ type: 'maintenance', items })
    }
    return res.json({ type: 'none', items: [] })
  } catch (e) { logger.error('[avs my-tasks]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Görev tamamla — sadece kendi assigned_block'undaki cleaning_task
avsSelfServiceRouter.post('/tasks/:id/complete', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const task = db.prepare('SELECT id, block, completed_at FROM cleaning_tasks WHERE id=?').get(Number(req.params.id))
    if (!task) return res.status(404).json({ error: 'Görev bulunamadı' })
    const staff = db.prepare('SELECT assigned_block FROM staff WHERE id=?').get(req.user.workerId)
    if (!staff?.assigned_block || staff.assigned_block !== task.block)
      return res.status(403).json({ error: 'Bu görev sizin bloğunuza ait değil' })
    if (task.completed_at) return res.json({ ok: true, completed_at: task.completed_at })
    db.prepare("UPDATE cleaning_tasks SET completed_at=datetime('now') WHERE id=?").run(task.id)
    const updated = db.prepare('SELECT completed_at FROM cleaning_tasks WHERE id=?').get(task.id)
    db.prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_task_complete', 'avs-self-service', ?, ?)`).run(task.id, JSON.stringify({ workerId: req.user.workerId }))
    res.json({ ok: true, completed_at: updated.completed_at })
  } catch (e) { logger.error('[avs task complete]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

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

// Hızlı arıza — staff reporter olarak audit_log'a düşer
avsSelfServiceRouter.post('/maintenance', requireAvsKiosk, upload.single('photo'), verifyMagicBytes, (req, res) => {
  const { location, description, priority } = req.body
  if (!location || location.trim().length < 3)
    return res.status(400).json({ error: 'location en az 3 karakter olmalıdır' })
  if (!description || description.trim().length < 10)
    return res.status(400).json({ error: 'description en az 10 karakter olmalıdır' })
  try {
    const photoBefore = req.file ? '/uploads/' + req.file.filename : null
    const id = createRequest({
      location: location.trim(),
      description: description.trim(),
      priority: priority || 'medium',
      reporterUserId: null,
      reporterPersonnelId: null,
      photoBefore,
    })
    getDB().prepare(`
      INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_maintenance', 'avs-self-service', ?, ?)
    `).run(id, JSON.stringify({ workerId: req.user.workerId, location: location.trim() }))
    res.status(201).json({ id })
  } catch (e) { logger.error('[avs maintenance]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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

// Bildirdiğim arızalar — audit_log üzerinden (AVS reporter null, workerId audit'te)
avsSelfServiceRouter.get('/my-maintenance', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT m.id, m.location, m.description, m.status, m.priority, m.opened_at, m.closed_at
      FROM maintenance_requests m
      JOIN audit_log a ON a.target_id = m.id
        AND a.action = 'kiosk_avs_maintenance'
        AND json_extract(a.detail, '$.workerId') = ?
      ORDER BY m.opened_at DESC LIMIT 20
    `).all(req.user.workerId)
    res.json(rows)
  } catch (e) { logger.error('[avs my-maintenance]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Geri bildirim — AVS çalışanı (personnel_id null, workerId audit'te)
avsSelfServiceRouter.post('/feedback', requireAvsKiosk, (req, res) => {
  const { type, message } = req.body
  if (!['complaint', 'suggestion', 'other'].includes(type))
    return res.status(400).json({ error: 'Geçersiz tip' })
  if (!message || message.trim().length < 20)
    return res.status(400).json({ error: 'Mesaj en az 20 karakter olmalıdır' })
  try {
    const db = getDB()
    const r = db.prepare('INSERT INTO feedback(personnel_id, type, message) VALUES(NULL,?,?)').run(type, message.trim())
    db.prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_feedback', 'avs-self-service', ?, ?)`).run(r.lastInsertRowid, JSON.stringify({ workerId: req.user.workerId }))
    res.status(201).json({ ok: true, id: r.lastInsertRowid })
  } catch (e) { logger.error('[avs feedback]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
