import { Router } from 'express'
import fs from 'fs'
import PDFDocument from 'pdfkit'
import { requireRole } from '../../shared/auth/middleware.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { getDB } from '../../shared/db/index.js'
import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { logger } from '../../shared/logger.js'
import { validate } from '../../shared/middleware/validate.js'
import {
  createPickupPointSchema, pickupPointUpdateSchema, createRouteSchema, routeUpdateSchema,
  addStopSchema, stopUpdateSchema, setPickupSchema, assignSchema, boardQrSchema, savePathSchema,
} from './schemas.js'
import { enqueue } from '../../shared/jobs/index.js'
import { recomputeRoutePathSync } from './jobs.js'

export const transportRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor', 'laundry', 'housekeeper', 'technical')

// ── Pickup Points ──
transportRouter.get('/pickup-points', ...view, (req, res) => {
  try { res.json(q.listPickupPoints({ activeOnly: req.query.active === '1' })) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.post('/pickup-points', ...mgr, validate(createPickupPointSchema), (req, res) => {
  try {
    const id = q.createPickupPoint(req.validated)
    logAudit(req.user.id, 'pickup_point_create', 'transport', id, req.validated.name)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.put('/pickup-points/:id', ...mgr, validate(pickupPointUpdateSchema), (req, res) => {
  try {
    const affectedRouteIds = q.updatePickupPoint(+req.params.id, req.validated)
    affectedRouteIds.forEach(routeId => enqueue('transport.recompute-path', { routeId }))
    res.json({ ok: true })
  }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.delete('/pickup-points/:id', ...mgr, (req, res) => {
  try { q.deletePickupPoint(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// Durak fotoğrafı yükle
transportRouter.post('/pickup-points/:id/photo', ...mgr, upload.single('photo'), verifyMagicBytes, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Dosya gerekli' })
    const id = +req.params.id
    const db = getDB()
    const pp = db.prepare('SELECT photo_url FROM pickup_points WHERE id=?').get(id)
    if (!pp) {
      try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
      return res.status(404).json({ error: 'Durak bulunamadı' })
    }
    if (pp.photo_url) {
      const oldPath = pp.photo_url.replace(/^\/uploads\//, (process.env.UPLOADS_DIR || 'uploads') + '/')
      try { fs.unlinkSync(oldPath) } catch { /* ignore */ }
    }
    const url = `/uploads/${req.file.filename}`
    db.prepare('UPDATE pickup_points SET photo_url=? WHERE id=?').run(url, id)
    res.json({ photo_url: url })
  } catch (e) {
    try { if (req.file) fs.unlinkSync(req.file.path) } catch { /* ignore */ }
    logger.error('[Route] pickup photo:', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

transportRouter.delete('/pickup-points/:id/photo', ...mgr, (req, res) => {
  try {
    const id = +req.params.id
    const db = getDB()
    const pp = db.prepare('SELECT photo_url FROM pickup_points WHERE id=?').get(id)
    if (!pp) return res.status(404).json({ error: 'Durak bulunamadı' })
    if (pp.photo_url) {
      const path = pp.photo_url.replace(/^\/uploads\//, (process.env.UPLOADS_DIR || 'uploads') + '/')
      try { fs.unlinkSync(path) } catch { /* ignore */ }
      db.prepare('UPDATE pickup_points SET photo_url=NULL WHERE id=?').run(id)
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.get('/pickup-points/:id/staff', ...view, (req, res) => {
  try { res.json(q.getStaffAtPoint(+req.params.id)) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Routes ──
transportRouter.get('/routes', ...view, (req, res) => {
  try {
    res.json(q.listRoutes({
      activeOnly: req.query.active === '1',
      withStops: req.query.with_stops === '1',
      workDate: req.query.work_date || null,
    }))
  }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.get('/routes/:id', ...view, (req, res) => {
  try {
    const r = q.getRoute(+req.params.id)
    if (!r) return res.status(404).json({ error: 'Rota bulunamadı' })
    res.json(r)
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.post('/routes', ...mgr, validate(createRouteSchema), (req, res) => {
  try {
    const id = q.createRoute(req.validated)
    logAudit(req.user.id, 'route_create', 'transport', id, req.validated.name)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.put('/routes/:id', ...mgr, validate(routeUpdateSchema), (req, res) => {
  try { q.updateRoute(+req.params.id, req.validated); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.delete('/routes/:id', ...mgr, (req, res) => {
  try { q.deleteRoute(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Route Stops ──
transportRouter.get('/routes/:id/stops', ...view, (req, res) => {
  try { res.json(q.listRouteStops(+req.params.id)) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.post('/routes/:id/stops', ...mgr, validate(addStopSchema), (req, res) => {
  try {
    const id = q.addRouteStop(+req.params.id, req.validated)
    enqueue('transport.recompute-path', { routeId: +req.params.id })
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.put('/stops/:id', ...mgr, validate(stopUpdateSchema), (req, res) => {
  try {
    q.updateRouteStop(+req.params.id, req.validated)
    const row = getDB().prepare('SELECT route_id FROM route_stops WHERE id=?').get(+req.params.id)
    if (row) enqueue('transport.recompute-path', { routeId: row.route_id })
    res.json({ ok: true })
  }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.delete('/stops/:id', ...mgr, (req, res) => {
  try {
    const routeId = q.deleteRouteStop(+req.params.id)
    if (routeId) enqueue('transport.recompute-path', { routeId })
    res.json({ ok: true })
  }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.post('/routes/:id/reorder-stops', ...mgr, (req, res) => {
  try {
    const ids = req.body?.stop_ids
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'stop_ids dizisi gerekli' })
    q.reorderRouteStops(+req.params.id, ids)
    enqueue('transport.recompute-path', { routeId: +req.params.id })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.put('/routes/:id/path', ...mgr, validate(savePathSchema), (req, res) => {
  try {
    q.saveRoutePath(+req.params.id, req.validated.geometry, { isManual: true })
    logAudit(req.user.id, 'transport_route_path_manual', 'transport', +req.params.id, null)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.post('/routes/:id/recompute-path', ...mgr, async (req, res) => {
  try {
    const geometry = await recomputeRoutePathSync(+req.params.id)
    if (!geometry) return res.status(502).json({ error: 'Yol hesaplanamadı — OSRM ulaşılamadı ya da koordinatlı durak yok' })
    res.json({ ok: true, geometry })
  } catch (e) { logger.error('[Route] recompute-path:', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Staff pickup ──
transportRouter.get('/staff', ...view, (req, res) => {
  try {
    res.json(q.listStaffWithTransport({
      deptId: req.query.dept_id ? +req.query.dept_id : null,
      hasPickup: req.query.has_pickup || null,
    }))
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.put('/staff/:id/pickup', ...mgr, validate(setPickupSchema), (req, res) => {
  try {
    q.setStaffPickup(+req.params.id, req.validated.pickup_point_id ?? null)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Daily ops ──
transportRouter.get('/daily', ...view, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    res.json(q.getDailyOverview(date))
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.get('/routes/:id/manifest', ...view, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const m = q.getRouteManifest(+req.params.id, date)
    if (!m) return res.status(404).json({ error: 'Rota bulunamadı' })
    res.json(m)
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.post('/auto-assign', ...mgr, (req, res) => {
  try {
    const date = req.body?.date || new Date().toISOString().slice(0, 10)
    const override = !!req.body?.override
    const stats = q.autoAssign(date, { overrideExisting: override })
    logAudit(req.user.id, 'transport_auto_assign', 'transport', null, `${date}: ${stats.assigned} atandı`)
    res.json(stats)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.post('/assign', ...mgr, validate(assignSchema), (req, res) => {
  try {
    const { staff_id, route_id, stop_id, work_date } = req.validated
    q.setAssignment({ staffId: staff_id, routeId: route_id, stopId: stop_id ?? null, workDate: work_date, userId: req.user.id })
    logAudit(req.user.id, 'transport_assign', 'transport', staff_id, `route ${route_id} / ${work_date}`)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.get('/staff/:id/detail', ...view, (req, res) => {
  try {
    const d = q.getStaffTransportDetail(+req.params.id)
    if (!d) return res.status(404).json({ error: 'Personel bulunamadı' })
    res.json(d)
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// PDF manifesto
transportRouter.get('/routes/:id/manifest/pdf', ...view, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const m = q.getRouteManifest(+req.params.id, date)
    if (!m) return res.status(404).json({ error: 'Rota bulunamadı' })

    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="manifest-${m.route.name.replace(/\s+/g, '_')}-${date}.pdf"`)
    doc.pipe(res)

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text(m.route.name, { align: 'center' })
    doc.fontSize(11).font('Helvetica').text(`Servis Manifestosu — ${date}`, { align: 'center' })
    doc.moveDown(0.5)

    // Üst bilgi kutusu
    const infoLine = `Arac: ${m.route.vehicle_plate || '—'}  |  Kapasite: ${m.route.capacity}  |  Yolcu: ${m.total_passengers}`
    doc.fontSize(10).font('Helvetica-Bold').text(infoLine, { align: 'center' })
    if (m.route.driver_name) {
      doc.fontSize(10).font('Helvetica').text(
        `Sofor: ${m.route.driver_name}${m.route.driver_phone ? ' — ' + m.route.driver_phone : ''}`,
        { align: 'center' }
      )
    }
    doc.moveDown(1)

    // Duraklar + yolcu listesi
    let i = 0
    for (const stop of m.stops) {
      i++
      // Stop başlığı
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1f2937')
        .text(`${i}. ${stop.scheduled_time ? '[' + stop.scheduled_time + '] ' : ''}${stop.point_name}`)
      if (stop.district) {
        doc.fontSize(9).font('Helvetica').fillColor('#6b7280').text(`   ${stop.district}${stop.neighborhood ? ' / ' + stop.neighborhood : ''}`)
      }
      doc.fillColor('#000000')

      // Yolcular
      if (stop.passengers.length === 0) {
        doc.fontSize(10).font('Helvetica-Oblique').fillColor('#999').text('   (bos durak)')
        doc.fillColor('#000000')
      } else {
        stop.passengers.forEach((p, idx) => {
          doc.fontSize(10).font('Helvetica').text(
            `   ${idx + 1}. ${p.full_name}` +
            (p.dept_name ? `  —  ${p.dept_name}` : '') +
            (p.phone ? `  —  ${p.phone}` : '')
          )
        })
      }
      doc.moveDown(0.7)
    }

    // Hedef
    doc.moveDown(0.3)
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#dc2626')
      .text(`* Filyos Dogal Gaz Isleme Tesisi`, { align: 'center' })

    // Footer
    doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
      .text(`Olusturma: ${new Date().toLocaleString('tr-TR')}`, 40, doc.page.height - 50)

    doc.end()
  } catch (e) {
    logger.error('[Route] manifest pdf:', e)
    if (!res.headersSent) res.status(500).json({ error: 'PDF olusturulamadi' })
  }
})

transportRouter.get('/reports', ...view, (req, res) => {
  try {
    res.json(q.getReports({ startDate: req.query.start, endDate: req.query.end }))
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.delete('/assign/:staff_id', ...mgr, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    q.clearAssignment(+req.params.staff_id, date)
    logAudit(req.user.id, 'transport_assign_clear', 'transport', +req.params.staff_id, date)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// QR ile biniş — kiosk QR kartı okutulur, bugünkü atama boarded işaretlenir.
// Manuel toggle (PATCH /assignments/:id/boarded) ile aynı setBoarded'ı kullanır;
// fark: kişiyi listede aramak yerine staff.qr_token'dan çözer.
transportRouter.post('/board-qr', ...mgr, validate(boardQrSchema), (req, res) => {
  try {
    const db = getDB()
    const token = req.validated.qr_token.replace(/^AVS:/i, '')
    const date = req.validated.work_date || new Date().toISOString().slice(0, 10)

    const staff = db.prepare(`SELECT id, full_name FROM staff WHERE qr_token = ?`).get(token)
    if (!staff) return res.status(404).json({ error: 'QR tanınmadı — personel bulunamadı' })

    const a = db.prepare(`
      SELECT ra.id, ra.boarded, ra.boarded_marked_at, r.name AS route_name, ps.name AS stop_name
      FROM route_assignments ra
      JOIN routes r ON r.id = ra.route_id
      LEFT JOIN route_stops rs ON rs.id = ra.stop_id
      LEFT JOIN pickup_points ps ON ps.id = rs.pickup_point_id
      WHERE ra.staff_id = ? AND ra.work_date = ?
    `).get(staff.id, date)
    if (!a) return res.status(404).json({ error: `${staff.full_name}: bugün servis ataması yok`, staff_name: staff.full_name })

    if (a.boarded === 1) {
      const at = a.boarded_marked_at ? a.boarded_marked_at.slice(11, 16) : ''
      return res.status(409).json({ error: `${staff.full_name} zaten bindi${at ? ` (${at})` : ''}`, staff_name: staff.full_name })
    }

    q.setBoarded(a.id, true, req.user.id)
    logAudit(req.user.id, 'transport_board_qr', 'transport', a.id, `${staff.full_name} → ${a.route_name}`)
    res.json({ ok: true, staff_name: staff.full_name, route_name: a.route_name, stop_name: a.stop_name || null })
  } catch (e) { logger.error('[Route/board-qr]', e); res.status(400).json({ error: e.message }) }
})

// Faz 6: katılım işaretle
transportRouter.patch('/assignments/:id/boarded', ...mgr, (req, res) => {
  try {
    const id = +req.params.id
    const v = req.body?.boarded
    const boarded = v === null || v === undefined ? null : (v === true || v === 1 || v === '1' ? true : false)
    q.setBoarded(id, boarded, req.user.id)
    logAudit(req.user.id, 'transport_boarded', 'transport', id, boarded === null ? 'reset' : boarded ? 'boarded' : 'no_show')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Faz 6: devamsızlık raporu
transportRouter.get('/no-show', ...view, (req, res) => {
  try {
    res.json(q.getNoShowReport({
      startDate: req.query.start,
      endDate: req.query.end,
      limit: req.query.limit ? +req.query.limit : 20,
    }))
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Faz 7: tüm rotaların manifesti tek PDF
transportRouter.get('/manifest/all/pdf', ...view, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const routes = q.listRoutes({ activeOnly: true })
    if (!routes.length) return res.status(404).json({ error: 'Aktif rota yok' })

    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="manifest-all-${date}.pdf"`)
    doc.pipe(res)

    doc.fontSize(20).font('Helvetica-Bold').text(`SERVİS MANIFESTOSU — ${date}`, { align: 'center' })
    doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
      .text(`${routes.length} aktif rota`, { align: 'center' })
    doc.fillColor('#000')
    doc.moveDown(1)

    routes.forEach((r, rIdx) => {
      const m = q.getRouteManifest(r.id, date)
      if (!m) return
      if (rIdx > 0) doc.addPage()
      doc.fontSize(16).font('Helvetica-Bold').text(m.route.name, { align: 'center' })
      doc.fontSize(10).font('Helvetica')
        .text(`Arac: ${m.route.vehicle_plate || '—'}  |  Kapasite: ${m.route.capacity}  |  Yolcu: ${m.total_passengers}`, { align: 'center' })
      if (m.route.driver_name) {
        doc.text(`Sofor: ${m.route.driver_name}${m.route.driver_phone ? ' — ' + m.route.driver_phone : ''}`, { align: 'center' })
      }
      doc.moveDown(0.8)

      let i = 0
      for (const stop of m.stops) {
        i++
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1f2937')
          .text(`${i}. ${stop.scheduled_time ? '[' + stop.scheduled_time + '] ' : ''}${stop.point_name}`)
        if (stop.district) {
          doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
            .text(`   ${stop.district}${stop.neighborhood ? ' / ' + stop.neighborhood : ''}`)
        }
        doc.fillColor('#000')
        if (stop.passengers.length === 0 && (!stop.waitlist || stop.waitlist.length === 0)) {
          doc.fontSize(10).font('Helvetica-Oblique').fillColor('#999').text('   (bos durak)')
          doc.fillColor('#000')
        } else {
          stop.passengers.forEach((p, idx) => {
            doc.fontSize(10).font('Helvetica').text(
              `   ${idx + 1}. ${p.full_name}` +
              (p.dept_name ? `  —  ${p.dept_name}` : '') +
              (p.phone ? `  —  ${p.phone}` : '')
            )
          })
          if (stop.waitlist && stop.waitlist.length > 0) {
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#dc2626').text('   YEDEK:')
            doc.fillColor('#000')
            stop.waitlist.forEach((p, idx) => {
              doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
                .text(`     ${idx + 1}. ${p.full_name}${p.phone ? ' — ' + p.phone : ''}`)
              doc.fillColor('#000')
            })
          }
        }
        doc.moveDown(0.5)
      }
    })

    doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
      .text(`Olusturma: ${new Date().toLocaleString('tr-TR')}`, 40, doc.page.height - 50)

    doc.end()
  } catch (e) {
    logger.error('[Route] manifest all pdf:', e)
    if (!res.headersSent) res.status(500).json({ error: 'PDF olusturulamadi' })
  }
})

// Faz 8: waitlist'ten aktife terfi
transportRouter.post('/assignments/:id/promote', ...mgr, (req, res) => {
  try {
    const id = +req.params.id
    q.promoteFromWaitlist(id)
    logAudit(req.user.id, 'transport_waitlist_promote', 'transport', id, null)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
