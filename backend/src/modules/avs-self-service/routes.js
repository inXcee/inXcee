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
