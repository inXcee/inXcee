import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getKPI, getHeatmap, getProjection, getBedOccupancy, getAuditLog, exportPersonnel, exportOccupancy, exportMaintenance } from './queries.js'

export const dashboardRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

dashboardRouter.get('/kpi', ...mgmt, (req, res) => {
  try { res.json(getKPI()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

dashboardRouter.get('/heatmap', ...mgmt, (req, res) => {
  try { res.json(getHeatmap()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

dashboardRouter.get('/projection', ...mgmt, (req, res) => {
  try { res.json(getProjection()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

dashboardRouter.get('/bed-occupancy', ...mgmt, (req, res) => {
  try { res.json(getBedOccupancy()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

dashboardRouter.get('/audit-log', ...requireRole('campus_manager'), (req, res) => {
  try {
    const limit = Math.min(+(req.query.limit || 50), 200)
    const filters = { action: req.query.action, module: req.query.module, user_id: req.query.user_id ? +req.query.user_id : null, date_from: req.query.date_from, date_to: req.query.date_to, search: req.query.search }
    res.json(getAuditLog(limit, filters))
  }
  catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
})
