import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { cacheFor } from '../../shared/middleware/cache.js'
import { getKPI, getHeatmap, getProjection, getBedOccupancy, getAuditLog, exportPersonnel, exportOccupancy, exportMaintenance, getTrends, getHealthScore } from './queries.js'

export const dashboardRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

dashboardRouter.get('/kpi', ...mgmt, cacheFor(30), (req, res) => {
  try { res.json(getKPI()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

dashboardRouter.get('/heatmap', ...mgmt, cacheFor(60), (req, res) => {
  try { res.json(getHeatmap()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

dashboardRouter.get('/projection', ...mgmt, cacheFor(300), (req, res) => {
  try { res.json(getProjection()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

dashboardRouter.get('/bed-occupancy', ...mgmt, cacheFor(60), (req, res) => {
  try { res.json(getBedOccupancy()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

dashboardRouter.get('/trends', ...mgmt, cacheFor(300), (req, res) => {
  try {
    const days = Math.max(7, Math.min(90, Number(req.query.days) || 30))
    const allMetrics = ['occupancy', 'sla', 'housekeeping', 'checkins']
    const metrics = req.query.metrics
      ? req.query.metrics.split(',').filter(m => allMetrics.includes(m))
      : allMetrics
    res.json(getTrends(metrics, days))
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

dashboardRouter.get('/health', ...mgmt, cacheFor(60), (req, res) => {
  try { res.json(getHealthScore()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

dashboardRouter.get('/audit-log', ...requireRole('campus_manager'), (req, res) => {
  try {
    const limit = Math.min(+(req.query.limit || 50), 200)
    const filters = { action: req.query.action, module: req.query.module, user_id: req.query.user_id ? +req.query.user_id : null, date_from: req.query.date_from, date_to: req.query.date_to, search: req.query.search }
    res.json(getAuditLog(limit, filters))
  }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Data Export (#4) ────────────────────────────────────────────────────────

function toCSV(header, rows) {
  const csv = header + '\n' + rows.map(r =>
    r.map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(',')
  ).join('\n')
  return '\ufeff' + csv // BOM for Excel
}

dashboardRouter.get('/export/personnel', ...requireRole('campus_manager'), (req, res) => {
  try {
    const rows = exportPersonnel()
    const csv = toCSV(
      'Ad Soyad,TC No,Firma,Görev,Memleket,Blok,Kat,Oda,Yatak,Vardiya,Disiplin Puanı,Giriş Tarihi',
      rows.map(r => [
        r.full_name, r.tc_no, r.company, r.job_title, r.hometown,
        r.block, r.floor, r.room_no, r.bed_no,
        r.shift_type === 'night' ? 'Gece' : 'Gündüz',
        r.discipline_points, r.check_in_date,
      ])
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=personel-listesi.csv')
    res.send(csv)
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

dashboardRouter.get('/export/occupancy', ...requireRole('campus_manager'), (req, res) => {
  try {
    const rows = exportOccupancy()
    const csv = toCSV(
      'Blok,Kat,Oda No,Kapasite,Aktif Yatak,Dolu,Boş,Durum',
      rows.map(r => [
        r.block, r.floor, r.room_no, r.capacity, r.active_beds,
        r.occupied, r.active_beds - r.occupied,
        r.status === 'active' ? 'Aktif' : r.status === 'quarantine' ? 'Karantina' : 'Bakım',
      ])
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=oda-doluluk.csv')
    res.send(csv)
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

dashboardRouter.get('/export/maintenance', ...requireRole('campus_manager'), (req, res) => {
  try {
    const rows = exportMaintenance()
    const csv = toCSV(
      'Konum,Açıklama,Durum,Öncelik,Bekleme Nedeni,Açılış,Kapanış,Raporlayan',
      rows.map(r => [
        r.location, r.description,
        r.status === 'open' ? 'Açık' : 'Tamamlandı',
        r.priority === 'high' ? 'Acil' : r.priority === 'medium' ? 'Normal' : 'Düşük',
        r.wait_reason, r.opened_at, r.closed_at, r.reporter,
      ])
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=arizalar.csv')
    res.send(csv)
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
