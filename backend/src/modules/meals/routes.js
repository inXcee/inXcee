import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'

export const mealsRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor', 'laundry', 'housekeeper', 'technical')

const VALID_MEALS = ['breakfast', 'lunch', 'dinner', 'snack']

// ── YM1: Öğün okutma ──
mealsRouter.post('/log', ...mgr, (req, res) => {
  try {
    const { staff_id, meal_type, meal_date, qr_token, cost, method = 'manual' } = req.body || {}
    if (!meal_type || !VALID_MEALS.includes(meal_type)) {
      return res.status(400).json({ error: 'Geçersiz meal_type' })
    }

    const db = getDB()
    let sid = staff_id ? +staff_id : null

    // QR ile okutma
    if (!sid && qr_token) {
      const cleaned = String(qr_token).replace(/^AVS:/, '').trim()
      const s = db.prepare('SELECT id, full_name FROM staff WHERE qr_token = ? AND is_active = 1').get(cleaned)
      if (!s) return res.status(404).json({ error: 'Geçersiz QR' })
      sid = s.id
    }
    if (!sid) return res.status(400).json({ error: 'staff_id veya qr_token gerekli' })

    const date = meal_date || new Date().toISOString().slice(0, 10)
    try {
      const id = db.prepare(`
        INSERT INTO meal_logs(staff_id, meal_type, meal_date, logged_by, method, cost)
        VALUES(?,?,?,?,?,?)
      `).run(sid, meal_type, date, req.user.id, method, cost ?? null).lastInsertRowid
      logAudit(req.user.id, 'meal_log', 'meals', id, `${meal_type} ${date}`)
      const staff = db.prepare('SELECT full_name FROM staff WHERE id = ?').get(sid)
      res.status(201).json({ id, staff_id: sid, staff_name: staff?.full_name, meal_type, date })
    } catch (e) {
      if (e.message?.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Bu öğün zaten kayıtlı', staff_id: sid, meal_type, date })
      }
      throw e
    }
  } catch (e) { logger.error('[meals/log]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Günlük dağılım
mealsRouter.get('/daily', ...view, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const db = getDB()
    const counts = db.prepare(`
      SELECT meal_type, COUNT(*) as count, SUM(COALESCE(cost, 0)) as total_cost
      FROM meal_logs WHERE meal_date = ? GROUP BY meal_type
    `).all(date)
    const logs = db.prepare(`
      SELECT m.id, m.meal_type, m.logged_at, m.method, m.cost,
        s.id as staff_id, s.full_name, s.diet_flags,
        d.name as dept_name
      FROM meal_logs m
      JOIN staff s ON s.id = m.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE m.meal_date = ?
      ORDER BY m.logged_at DESC
      LIMIT 500
    `).all(date)
    res.json({ date, counts, logs })
  } catch (e) { logger.error('[meals/daily]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

mealsRouter.delete('/log/:id', ...mgr, (req, res) => {
  try {
    getDB().prepare('DELETE FROM meal_logs WHERE id=?').run(+req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── YM6 (Faz 8): Ertesi-gün öğün seçimi — personel yarın için seçer ──
mealsRouter.put('/selection', ...mgr, (req, res) => {
  try {
    const { staff_id, meal_date, meal_type } = req.body || {}
    const attending = req.body?.attending === false ? 0 : 1
    if (!staff_id || !meal_date || !VALID_MEALS.includes(meal_type)) {
      return res.status(400).json({ error: 'staff_id, meal_date ve geçerli meal_type gerekli' })
    }
    getDB().prepare(`
      INSERT INTO meal_selections(staff_id, meal_date, meal_type, attending)
      VALUES(?,?,?,?)
      ON CONFLICT(staff_id, meal_date, meal_type)
      DO UPDATE SET attending=excluded.attending, updated_at=datetime('now')
    `).run(+staff_id, meal_date, meal_type, attending)
    res.json({ ok: true, staff_id: +staff_id, meal_date, meal_type, attending })
  } catch (e) { logger.error('[meals/selection]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Mutfak sayımı — bir gün için seçim yapan (attending=1) kişi sayısı (öğün bazlı)
mealsRouter.get('/selection-counts', ...view, (req, res) => {
  try {
    const date = req.query.date || (() => {
      const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10)
    })()
    const counts = getDB().prepare(`
      SELECT meal_type, COUNT(*) AS count
      FROM meal_selections WHERE meal_date=? AND attending=1
      GROUP BY meal_type
    `).all(date)
    res.json({ date, counts })
  } catch (e) { logger.error('[meals/selection-counts]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── YM5 (Faz 4): Katılım / no-show raporu — vardiyalı vs gerçekten yiyen ──
// Belirli gün+öğün için: hak sahibi (o gün vardiyada) personel ile meal_logs'u
// karşılaştırır; okutmayan = no-show (israf/sayım metriği).
mealsRouter.get('/attendance', ...view, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const mealType = req.query.meal_type
    if (mealType && !VALID_MEALS.includes(mealType)) {
      return res.status(400).json({ error: 'Geçersiz meal_type' })
    }
    const db = getDB()
    // O gün hak sahibi personel (vardiyada planlı/çalışmış)
    const entitled = db.prepare(`
      SELECT ss.staff_id, s.full_name, d.name AS dept_name
      FROM shift_schedule ss
      JOIN staff s ON s.id = ss.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE ss.work_date = ? AND ss.status IN ('scheduled','worked','overtime')
    `).all(date)

    // O gün (opsiyonel öğün filtresiyle) yemek almış staff id'leri
    const ateRows = mealType
      ? db.prepare('SELECT DISTINCT staff_id FROM meal_logs WHERE meal_date=? AND meal_type=?').all(date, mealType)
      : db.prepare('SELECT DISTINCT staff_id FROM meal_logs WHERE meal_date=?').all(date)
    const ateSet = new Set(ateRows.map(r => r.staff_id))

    const noShow = entitled
      .filter(e => !ateSet.has(e.staff_id))
      .map(e => ({ staff_id: e.staff_id, full_name: e.full_name, dept_name: e.dept_name }))

    res.json({
      date,
      meal_type: mealType || null,
      scheduled: entitled.length,
      ate: entitled.filter(e => ateSet.has(e.staff_id)).length,
      no_show_count: noShow.length,
      no_show: noShow,
    })
  } catch (e) { logger.error('[meals/attendance]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── YM3: Talep tahmini (yarın için kaç kişi yemek bekleniyor) ──
mealsRouter.get('/forecast', ...view, (req, res) => {
  try {
    const targetDate = req.query.date || (() => {
      const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10)
    })()
    const db = getDB()
    // O gün vardiyada olacak personel sayısı
    const scheduled = db.prepare(`
      SELECT COUNT(DISTINCT staff_id) as c FROM shift_schedule
      WHERE work_date = ? AND status IN ('scheduled','worked','overtime')
    `).get(targetDate).c

    // Son 14 gündeki ortalama öğün katılımı
    const avg = db.prepare(`
      SELECT meal_type, AVG(daily_count) as avg_count
      FROM (
        SELECT meal_type, meal_date, COUNT(*) as daily_count
        FROM meal_logs
        WHERE meal_date BETWEEN date(?, '-14 days') AND date(?, '-1 days')
        GROUP BY meal_type, meal_date
      )
      GROUP BY meal_type
    `).all(targetDate, targetDate)

    // Diyet/alerji özeti (vardiyada olacaklar arasında)
    const diets = db.prepare(`
      SELECT s.diet_flags, COUNT(*) as c
      FROM shift_schedule ss
      JOIN staff s ON s.id = ss.staff_id
      WHERE ss.work_date = ? AND ss.status IN ('scheduled','worked','overtime')
        AND s.diet_flags IS NOT NULL AND s.diet_flags != ''
      GROUP BY s.diet_flags
    `).all(targetDate)

    res.json({ date: targetDate, scheduled, averages: avg, diet_summary: diets })
  } catch (e) { logger.error('[meals/forecast]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── YM2: Diyet flag set/unset ──
mealsRouter.put('/staff/:id/diet', ...mgr, (req, res) => {
  try {
    const flags = req.body?.diet_flags || null
    getDB().prepare('UPDATE staff SET diet_flags = ? WHERE id = ?').run(flags, +req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── YM4: Maliyet özeti — kişi başı + aylık ──
mealsRouter.get('/cost-summary', ...view, (req, res) => {
  try {
    const ym = req.query.month || new Date().toISOString().slice(0, 7)
    const start = `${ym}-01`
    const endDate = new Date(start); endDate.setMonth(endDate.getMonth() + 1)
    const end = endDate.toISOString().slice(0, 10)

    const db = getDB()
    const perStaff = db.prepare(`
      SELECT s.id, s.full_name, d.name as dept_name,
        COUNT(*) as meal_count,
        SUM(CASE WHEN m.meal_type='breakfast' THEN 1 ELSE 0 END) as breakfast,
        SUM(CASE WHEN m.meal_type='lunch' THEN 1 ELSE 0 END) as lunch,
        SUM(CASE WHEN m.meal_type='dinner' THEN 1 ELSE 0 END) as dinner,
        SUM(COALESCE(m.cost, 0)) as total_cost
      FROM meal_logs m
      JOIN staff s ON s.id = m.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE m.meal_date >= ? AND m.meal_date < ?
      GROUP BY s.id
      ORDER BY meal_count DESC
    `).all(start, end)

    const total = db.prepare(`
      SELECT meal_type, COUNT(*) as count, SUM(COALESCE(cost, 0)) as total_cost
      FROM meal_logs WHERE meal_date >= ? AND meal_date < ?
      GROUP BY meal_type
    `).all(start, end)

    res.json({ month: ym, by_meal: total, by_staff: perStaff })
  } catch (e) { logger.error('[meals/cost]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Menü ──
mealsRouter.get('/menu', ...view, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const rows = getDB().prepare('SELECT meal_type, items FROM meal_menu WHERE meal_date=?').all(date)
    res.json(rows)
  } catch (e) { logger.error('[meals/menu get]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

mealsRouter.put('/menu', ...mgr, (req, res) => {
  const { meal_date, meal_type, items } = req.body || {}
  if (!meal_date || !VALID_MEALS.includes(meal_type))
    return res.status(400).json({ error: 'Geçersiz tarih veya öğün' })
  try {
    getDB().prepare(`
      INSERT INTO meal_menu(meal_date, meal_type, items) VALUES(?,?,?)
      ON CONFLICT(meal_date, meal_type) DO UPDATE SET items=excluded.items, updated_at=datetime('now')
    `).run(meal_date, meal_type, items ?? null)
    logAudit(req.user.id, 'meal_menu_set', 'meals', null, `${meal_date} ${meal_type}`)
    res.json({ ok: true })
  } catch (e) { logger.error('[meals/menu put]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
