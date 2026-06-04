import { Router } from 'express'
import QRCode from 'qrcode'
import PDFDocument from 'pdfkit'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { logger } from '../../shared/logger.js'
import { validate } from '../../shared/middleware/validate.js'
import { createNotification } from '../../shared/notifications/service.js'
import { createVisitorSchema, preRegisterSchema, checkinSchema } from './schemas.js'

export const visitorsRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

visitorsRouter.get('/', requireAuth, (req, res) => {
  res.json(q.listVisitors({ active: req.query.active, status: req.query.status }))
})

visitorsRouter.get('/stats', requireAuth, (req, res) => {
  res.json(q.getVisitorStats())
})

visitorsRouter.post('/', ...mgmt, validate(createVisitorSchema), (req, res) => {
  try {
    const id = q.createVisitor(req.validated, req.user.id)
    logAudit(req.user.id, 'visitor_checkin', 'visitors', id, req.validated.full_name)
    res.status(201).json({ id })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Ön-kayıt — beklenen ziyaretçi + QR token.
visitorsRouter.post('/preregister', ...mgmt, validate(preRegisterSchema), (req, res) => {
  try {
    const { id, qr_token } = q.preRegisterVisitor(req.validated, req.user.id)
    logAudit(req.user.id, 'visitor_preregister', 'visitors', id, req.validated.full_name)
    res.status(201).json({ id, qr_token })
  } catch (e) { logger.error('[visitors/preregister]', e); res.status(500).json({ error: e.message }) }
})

// QR ile check-in + ev sahibi bildirimi.
visitorsRouter.post('/checkin', ...mgmt, validate(checkinSchema), (req, res) => {
  try {
    const result = q.checkInByToken(req.validated.qr_token)
    if (!result) return res.status(404).json({ error: 'Geçersiz QR kod' })
    if (!result.ok) return res.status(409).json({ error: 'Bu ziyaretçi zaten işlenmiş', status: result.status })

    const v = result.visitor
    createNotification({
      message: `Ziyaretçi geldi: ${v.full_name} → ${v.visiting_name || '—'}${v.visiting_block ? ` (${v.visiting_block})` : ''}`,
      severity: 'info',
      module: 'visitors',
      target_role: 'shift_supervisor',
      entity_type: 'visitor',
      entity_id: v.id,
      dedup_key: `visitor_checkin_${v.id}`,
    })
    logAudit(req.user.id, 'visitor_checkin_qr', 'visitors', v.id, v.full_name)
    res.json({ ok: true, status: result.status, visitor: v })
  } catch (e) { logger.error('[visitors/checkin]', e); res.status(500).json({ error: e.message }) }
})

visitorsRouter.post('/:id/checkout', ...mgmt, (req, res) => {
  const ok = q.checkOutVisitor(+req.params.id)
  if (!ok) return res.status(404).json({ error: 'Ziyaretçi bulunamadı veya zaten çıkmış' })
  logAudit(req.user.id, 'visitor_checkout', 'visitors', +req.params.id, null)
  res.json({ ok: true })
})

// QR ziyaretçi kartı PDF (qr modülü staff-kartı kalıbı).
visitorsRouter.get('/:id/card/pdf', ...mgmt, async (req, res) => {
  try {
    const v = q.getVisitorById(+req.params.id)
    if (!v) return res.status(404).json({ error: 'Ziyaretçi bulunamadı' })
    if (!v.qr_token) return res.status(400).json({ error: 'Bu ziyaretçinin QR kartı yok (ön-kayıt değil)' })

    const qrDataUrl = await QRCode.toDataURL(`AVS:${v.qr_token}`, { width: 300, margin: 1 })
    const cardW = 245, cardH = 154
    const doc = new PDFDocument({ size: [cardW + 40, cardH + 40], margin: 20 })
    res.setHeader('Content-Type', 'application/pdf')
    const safeName = (v.full_name || 'ziyaretci').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 40)
    res.setHeader('Content-Disposition', `attachment; filename="ziyaretci-${safeName}.pdf"`)
    doc.pipe(res)

    doc.lineWidth(1).strokeColor('#1f2937').roundedRect(20, 20, cardW, cardH, 8).stroke()
    doc.fillColor('#7c3aed').roundedRect(20, 20, 8, cardH, 4).fill()
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('AVS ZİYARETÇİ KARTI', 40, 30)
    doc.fillColor('#6b7280').font('Helvetica').fontSize(7).text('avskamp.com', 40, 42)
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text(v.full_name || '—', 40, 58, { width: 150 })
    doc.fillColor('#374151').font('Helvetica').fontSize(8)
    if (v.purpose) doc.text(`Amaç: ${v.purpose}`, 40, 80, { width: 150 })
    if (v.visiting_name) doc.text(`Ev sahibi: ${v.visiting_name}`, 40, 94, { width: 150 })
    if (v.visiting_block) doc.text(`Blok: ${v.visiting_block}`, 40, 108, { width: 150 })
    if (v.expected_at) doc.fillColor('#6b7280').fontSize(7).text(`Beklenen: ${v.expected_at}`, 40, 130, { width: 150 })

    doc.image(qrDataUrl, cardW - 70, 40, { width: 80, height: 80 })
    doc.fillColor('#94a3b8').fontSize(6).text(`#${v.qr_token.slice(0, 6).toUpperCase()}`, cardW - 70, 125, { width: 80, align: 'center' })
    doc.end()
  } catch (e) {
    logger.error('[visitors/card]', e)
    if (!res.headersSent) res.status(500).json({ error: 'PDF üretilemedi' })
  }
})
