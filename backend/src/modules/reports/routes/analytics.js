// H11 ileri raporlar: devamsızlık dashboard, kişi başı maliyet, ay karşılaştırma, özel rapor builder
import { Router } from 'express'
import { getDB } from '../../../shared/db/index.js'
import { logger } from '../../../shared/logger.js'
import { mgrAccess } from './shared.js'

export const analyticsReportsRouter = Router()

// ── H11 R1: Devamsızlık dashboard (vardiya + transport + disiplin) ──
analyticsReportsRouter.get('/absence-dashboard', ...mgrAccess, (req, res) => {
  try {
    const db = getDB()
    // 1-365 gün arası, parametre validation
    const days = Math.max(1, Math.min(365, +req.query.days || 30))
    // since'i parameterized olarak SQL'e geç
    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - days)
    const since = sinceDate.toISOString().slice(0, 10)

    const summary = db.prepare(`
      SELECT
        COALESCE((SELECT COUNT(*) FROM shift_schedule WHERE status='absent' AND work_date >= ?), 0) as total_shift_absent,
        COALESCE((SELECT COUNT(*) FROM route_assignments WHERE boarded=0 AND is_waitlist=0 AND work_date >= ?), 0) as total_no_show,
        COALESCE((SELECT COUNT(*) FROM discipline_records WHERE created_at >= ?), 0) as total_discipline,
        COALESCE((SELECT COUNT(DISTINCT staff_id) FROM shift_schedule WHERE status='absent' AND work_date >= ?), 0) as unique_absent_staff
    `).get(since, since, since, since)

    const trend = db.prepare(`
      SELECT work_date as date,
        SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) as shift_absent,
        SUM(CASE WHEN status='worked' OR status='overtime' THEN 1 ELSE 0 END) as worked
      FROM shift_schedule
      WHERE work_date >= ?
      GROUP BY work_date
      ORDER BY work_date
    `).all(since)

    const noShowTrend = db.prepare(`
      SELECT work_date as date,
        SUM(CASE WHEN boarded=0 THEN 1 ELSE 0 END) as no_show,
        SUM(CASE WHEN boarded=1 THEN 1 ELSE 0 END) as boarded
      FROM route_assignments
      WHERE is_waitlist=0 AND work_date >= ?
      GROUP BY work_date
      ORDER BY work_date
    `).all(since)

    const byDept = db.prepare(`
      SELECT d.name as dept_name, d.color_class,
        COALESCE(SUM(CASE WHEN ss.status='absent' THEN 1 ELSE 0 END), 0) as shift_absent,
        COALESCE(SUM(CASE WHEN ss.status IN ('worked','overtime') THEN 1 ELSE 0 END), 0) as worked
      FROM departments d
      LEFT JOIN staff s ON s.department_id = d.id
      LEFT JOIN shift_schedule ss ON ss.staff_id = s.id AND ss.work_date >= ?
      GROUP BY d.id
      HAVING worked + shift_absent > 0
      ORDER BY shift_absent DESC
    `).all(since)

    res.json({ days, summary, trend, no_show_trend: noShowTrend, by_dept: byDept })
  } catch (e) { logger.error('[absence-dash]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── H11 R2: Kişi başı maliyet (oda + servis + yemek + KKD + zimmet kesinti) ──
analyticsReportsRouter.get('/cost-per-person', ...mgrAccess, (req, res) => {
  try {
    const db = getDB()
    const month = req.query.month || db.prepare("SELECT strftime('%Y-%m','now','localtime') m").get().m
    const start = `${month}-01`
    const end = db.prepare("SELECT date(?, '+1 month') AS d").get(start).d

    const rows = db.prepare(`
      SELECT s.id, s.full_name, s.salary, d.name as dept_name,
        COALESCE((SELECT SUM(COALESCE(cost, 0)) FROM meal_logs WHERE staff_id = s.id AND meal_date >= ? AND meal_date < ?), 0) as meal_cost,
        COALESCE((SELECT COUNT(*) FROM meal_logs WHERE staff_id = s.id AND meal_date >= ? AND meal_date < ?), 0) as meal_count,
        COALESCE((SELECT COUNT(*) FROM route_assignments WHERE staff_id = s.id AND boarded = 1 AND work_date >= ? AND work_date < ?), 0) as transport_count,
        COALESCE((SELECT SUM(amount) FROM payroll_deductions WHERE staff_id = s.id AND period = ?), 0) as deductions,
        COALESCE((SELECT COUNT(*) FROM kkd_assignments WHERE staff_id = s.id AND assigned_at >= ? AND assigned_at < ?), 0) as kkd_count
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE s.is_active = 1
      ORDER BY meal_cost DESC, s.full_name
    `).all(start, end, start, end, start, end, month, start, end)

    res.json({ month, rows })
  } catch (e) { logger.error('[cost-per-person]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── H11 R3: Karşılaştırma (bu ay vs geçen ay) ──
analyticsReportsRouter.get('/comparison', ...mgrAccess, (req, res) => {
  try {
    const db = getDB()
    const month = req.query.month || db.prepare("SELECT strftime('%Y-%m','now','localtime') m").get().m
    function range(ym) {
      const start = `${ym}-01`
      return [start, db.prepare("SELECT date(?, '+1 month') AS d").get(start).d]
    }
    const prev = db.prepare("SELECT strftime('%Y-%m', ?, '-1 month') m").get(`${month}-01`).m
    const [s0, e0] = range(month)
    const [s1, e1] = range(prev)

    function metrics(s, e) {
      return db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM shift_schedule WHERE status IN ('worked','overtime') AND work_date >= ? AND work_date < ?) as worked,
          (SELECT COUNT(*) FROM shift_schedule WHERE status='absent' AND work_date >= ? AND work_date < ?) as absent,
          (SELECT COUNT(*) FROM route_assignments WHERE boarded=0 AND is_waitlist=0 AND work_date >= ? AND work_date < ?) as no_show,
          (SELECT COUNT(*) FROM discipline_records WHERE created_at >= ? AND created_at < ?) as discipline,
          (SELECT COUNT(*) FROM maintenance_requests WHERE opened_at >= ? AND opened_at < ?) as maintenance,
          (SELECT COUNT(*) FROM meal_logs WHERE meal_date >= ? AND meal_date < ?) as meals,
          (SELECT COUNT(DISTINCT staff_id) FROM shift_schedule WHERE work_date >= ? AND work_date < ?) as active_staff
      `).get(s, e, s, e, s, e, s, e, s, e, s, e, s, e)
    }
    const current = metrics(s0, e0)
    const previous = metrics(s1, e1)

    const delta = {}
    Object.keys(current).forEach(k => {
      delta[k] = {
        current: current[k], previous: previous[k],
        diff: current[k] - previous[k],
        pct: previous[k] > 0 ? Math.round((current[k] - previous[k]) / previous[k] * 100) : null,
      }
    })

    res.json({ month, previous_month: prev, current, previous, delta })
  } catch (e) { logger.error('[comparison]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── H11 R4: Özel rapor builder — basit kolon seçici ──
analyticsReportsRouter.get('/staff-builder', ...mgrAccess, (req, res) => {
  try {
    const db = getDB()
    const cols = (req.query.cols || 'full_name,dept_name,phone').split(',').filter(Boolean)
    const ALLOWED = {
      full_name: 's.full_name',
      tc_no: 's.tc_no',
      phone: 's.phone',
      email: 's.email',
      position: 's.position',
      hire_date: 's.hire_date',
      contract_end: 's.contract_end',
      birth_date: 's.birth_date',
      blood_type: 's.blood_type',
      gender: 's.gender',
      salary: 's.salary',
      dept_name: 'd.name as dept_name',
      pickup_name: 'pp.name as pickup_name',
      company_name: 'c.name as company_name',
    }
    const selects = cols.filter(c => ALLOWED[c]).map(c => ALLOWED[c])
    if (!selects.length) selects.push('s.full_name')

    const rows = db.prepare(`
      SELECT s.id, ${selects.join(', ')}
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
      LEFT JOIN personnel p ON p.tc_no IS NOT NULL AND p.tc_no = s.tc_no
      LEFT JOIN companies c ON c.id = p.company_id
      WHERE s.is_active = 1
      ORDER BY s.full_name
      LIMIT 1000
    `).all()

    res.json({ available_columns: Object.keys(ALLOWED), selected: cols, rows })
  } catch (e) { logger.error('[staff-builder]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
