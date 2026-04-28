import { Router } from 'express'
import { requireRole } from '../../../shared/auth/middleware.js'
import { getDB } from '../../../shared/db/index.js'

export const analyticsRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')

// ABC analizi: son 90 gun toplam tuketim degeri (cikis hareketleri x birim fiyat)
analyticsRouter.get('/abc', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const days = +req.query.days || 90
    const rows = db.prepare(`
      SELECT i.id, i.item_name, i.unit, i.category, i.unit_price, i.quantity,
        COALESCE(SUM(ABS(sm.delta)), 0) as total_out,
        COALESCE(SUM(ABS(sm.delta) * i.unit_price), 0) as consumption_value
      FROM inventory i
      LEFT JOIN stock_movements sm ON sm.item_id = i.id
        AND sm.type IN ('out', 'request_fulfill', 'damage', 'loss')
        AND sm.created_at > datetime('now', '-' || ? || ' days')
      GROUP BY i.id
      ORDER BY consumption_value DESC
    `).all(days)
    const total = rows.reduce((s, r) => s + r.consumption_value, 0)
    let cumulative = 0
    const result = rows.map(r => {
      cumulative += r.consumption_value
      const cumPct = total > 0 ? (cumulative / total) * 100 : 0
      const pct = total > 0 ? (r.consumption_value / total) * 100 : 0
      let cls = 'C'
      if (cumPct <= 80) cls = 'A'
      else if (cumPct <= 95) cls = 'B'
      return { ...r, abc_class: cls, percentage: Number(pct.toFixed(2)), cumulative_pct: Number(cumPct.toFixed(2)) }
    })
    res.json({ total, days, items: result })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

// Departman tuketimi: son N gun cikis hareketlerinin departmanlara dagilimi
analyticsRouter.get('/department-consumption', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const days = +req.query.days || 30
    const rows = db.prepare(`
      SELECT
        COALESCE(d.name, 'Atanmamis') as department,
        i.category,
        COUNT(*) as movements,
        SUM(ABS(ic.quantity)) as total_qty,
        SUM(ic.quantity * COALESCE(i.unit_price, 0)) as total_value
      FROM inventory_checkouts ic
      JOIN inventory i ON i.id = ic.item_id
      JOIN personnel p ON p.id = ic.personnel_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE ic.checked_out_at > datetime('now', '-' || ? || ' days')
      GROUP BY department, i.category
      ORDER BY total_value DESC
    `).all(days)
    res.json({ days, rows })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

// Heatmap: gun bazli hareket sayilari ve toplam tuketim degeri (son N gun)
analyticsRouter.get('/heatmap', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const days = +req.query.days || 30
    const rows = db.prepare(`
      SELECT
        date(sm.created_at) as date,
        COUNT(*) as movements,
        SUM(CASE WHEN sm.type IN ('out','request_fulfill','damage','loss') THEN ABS(sm.delta) ELSE 0 END) as out_qty,
        SUM(CASE WHEN sm.type = 'in' OR sm.type = 'po_receive' THEN sm.delta ELSE 0 END) as in_qty,
        SUM(CASE WHEN sm.type IN ('out','request_fulfill','damage','loss') THEN ABS(sm.delta) * COALESCE(i.unit_price, 0) ELSE 0 END) as out_value
      FROM stock_movements sm
      JOIN inventory i ON i.id = sm.item_id
      WHERE sm.created_at > datetime('now', '-' || ? || ' days')
      GROUP BY date(sm.created_at)
      ORDER BY date
    `).all(days)
    res.json({ days, rows })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})
