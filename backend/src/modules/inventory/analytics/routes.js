import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { requireRole } from '../../../shared/auth/middleware.js'
import { getDB } from '../../../shared/db/index.js'

export const analyticsRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')

// Yardimci: ay icin verileri topla (cron'dan da kullanilir)
export function buildMonthlyReport(monthStr) {
  const db = getDB()
  // monthStr: 'YYYY-MM'
  const [yearStr, mStr] = monthStr.split('-')
  const start = `${yearStr}-${mStr}-01`
  const next = new Date(+yearStr, +mStr, 1).toISOString().slice(0, 10)

  const movements = db.prepare(`
    SELECT
      SUM(CASE WHEN type IN ('in','po_receive') THEN delta ELSE 0 END) as total_in,
      SUM(CASE WHEN type IN ('out','request_fulfill','damage','loss') THEN ABS(delta) ELSE 0 END) as total_out,
      COUNT(*) as movement_count
    FROM stock_movements
    WHERE date(created_at) >= ? AND date(created_at) < ?
  `).get(start, next)

  const abc = db.prepare(`
    SELECT i.id, i.item_name, i.unit, i.unit_price,
      COALESCE(SUM(ABS(sm.delta)), 0) as total_out,
      COALESCE(SUM(ABS(sm.delta) * i.unit_price), 0) as consumption_value
    FROM inventory i
    LEFT JOIN stock_movements sm ON sm.item_id = i.id
      AND sm.type IN ('out', 'request_fulfill', 'damage', 'loss')
      AND date(sm.created_at) >= ? AND date(sm.created_at) < ?
    GROUP BY i.id
    HAVING consumption_value > 0
    ORDER BY consumption_value DESC
    LIMIT 20
  `).all(start, next)

  const dept = db.prepare(`
    SELECT
      COALESCE(d.name, 'Atanmamis') as department,
      SUM(ic.quantity) as total_qty,
      SUM(ic.quantity * COALESCE(i.unit_price, 0)) as total_value
    FROM inventory_checkouts ic
    JOIN inventory i ON i.id = ic.item_id
    JOIN personnel p ON p.id = ic.personnel_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE date(ic.checked_out_at) >= ? AND date(ic.checked_out_at) < ?
    GROUP BY department
    ORDER BY total_value DESC
  `).all(start, next)

  return { month: monthStr, start, next, movements, abc, dept }
}

export function generateMonthlyPDF(report, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  doc.pipe(stream)

  doc.fontSize(18).text('AYLIK ENVANTER RAPORU', { align: 'center' }).moveDown(0.3)
  doc.fontSize(11).text(report.month, { align: 'center' }).moveDown(1)

  doc.fontSize(11).text('Ozet:', { underline: true }).moveDown(0.3)
  doc.fontSize(10)
    .text(`Toplam giris: ${(report.movements.total_in || 0).toFixed(2)} birim`)
    .text(`Toplam cikis: ${(report.movements.total_out || 0).toFixed(2)} birim`)
    .text(`Toplam hareket: ${report.movements.movement_count || 0}`)
    .moveDown(1)

  doc.fontSize(11).text('Top 20 ABC (Tuketim Degeri):', { underline: true }).moveDown(0.3)
  let y = doc.y
  doc.fontSize(8)
  doc.text('#', 40, y, { width: 20 })
  doc.text('Urun', 60, y, { width: 220 })
  doc.text('Cikis', 280, y, { width: 70, align: 'right' })
  doc.text('Birim', 350, y, { width: 50, align: 'right' })
  doc.text('Birim Fiyat', 400, y, { width: 70, align: 'right' })
  doc.text('Deger (TL)', 470, y, { width: 80, align: 'right' })
  y += 12
  doc.moveTo(40, y).lineTo(555, y).stroke()
  y += 4
  report.abc.forEach((it, i) => {
    if (y > 760) { doc.addPage(); y = 40 }
    doc.text(String(i + 1), 40, y, { width: 20 })
    doc.text(it.item_name, 60, y, { width: 220 })
    doc.text((it.total_out || 0).toFixed(2), 280, y, { width: 70, align: 'right' })
    doc.text(it.unit, 350, y, { width: 50, align: 'right' })
    doc.text((it.unit_price || 0).toFixed(2), 400, y, { width: 70, align: 'right' })
    doc.text((it.consumption_value || 0).toFixed(2), 470, y, { width: 80, align: 'right' })
    y += 11
  })
  y += 6
  doc.moveTo(40, y).lineTo(555, y).stroke()
  y += 12

  doc.fontSize(11).text('Departman Tuketim:', 40, y, { underline: true })
  y = doc.y + 4
  doc.fontSize(8)
  doc.text('Departman', 40, y, { width: 220 })
  doc.text('Miktar', 280, y, { width: 90, align: 'right' })
  doc.text('Toplam Deger (TL)', 380, y, { width: 170, align: 'right' })
  y += 12
  doc.moveTo(40, y).lineTo(555, y).stroke()
  y += 4
  report.dept.forEach(r => {
    if (y > 760) { doc.addPage(); y = 40 }
    doc.text(r.department, 40, y, { width: 220 })
    doc.text((r.total_qty || 0).toFixed(2), 280, y, { width: 90, align: 'right' })
    doc.text((r.total_value || 0).toFixed(2), 380, y, { width: 170, align: 'right' })
    y += 11
  })

  doc.end()
}

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

// Aylik PDF rapor — query: ?month=YYYY-MM (default: gecmis ay)
analyticsRouter.get('/monthly-pdf', ...mgr, (req, res) => {
  try {
    let month = req.query.month
    if (!month) {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Gecerli ay (YYYY-MM) gerekli' })
    const report = buildMonthlyReport(month)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="envanter-${month}.pdf"`)
    generateMonthlyPDF(report, res)
  } catch (e) {
    console.error('[Route] monthly-pdf:', e)
    if (!res.headersSent) res.status(500).json({ error: 'Sunucu hatasi' })
  }
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
