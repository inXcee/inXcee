import { Router } from 'express'
import { requireAvsKiosk } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { createRequest } from '../maintenance/queries.js'
import { changeStaffKioskPin } from '../../shared/auth/service.js'
import { logger } from '../../shared/logger.js'

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

// Servisim — atanmış durak bilgisi
avsSelfServiceRouter.get('/my-transport', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const staff = db.prepare('SELECT pickup_point_id FROM staff WHERE id=?').get(req.user.workerId)
    const pickup = staff?.pickup_point_id ? db.prepare(`
      SELECT name, district, neighborhood, notes, lat, lng
      FROM pickup_points WHERE id = ?
    `).get(staff.pickup_point_id) : null
    res.json({ pickup })
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
avsSelfServiceRouter.post('/maintenance', requireAvsKiosk, (req, res) => {
  const { location, description, priority } = req.body
  if (!location || location.trim().length < 3)
    return res.status(400).json({ error: 'location en az 3 karakter olmalıdır' })
  if (!description || description.trim().length < 10)
    return res.status(400).json({ error: 'description en az 10 karakter olmalıdır' })
  try {
    const id = createRequest({
      location: location.trim(),
      description: description.trim(),
      priority: priority || 'medium',
      reporterUserId: null,
      reporterPersonnelId: null,
    })
    getDB().prepare(`
      INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_maintenance', 'avs-self-service', ?, ?)
    `).run(id, JSON.stringify({ workerId: req.user.workerId, location: location.trim() }))
    res.status(201).json({ id })
  } catch (e) { logger.error('[avs maintenance]', e); res.status(400).json({ error: e.message }) }
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
