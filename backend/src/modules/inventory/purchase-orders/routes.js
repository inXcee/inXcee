import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { requireRole } from '../../../shared/auth/middleware.js'
import * as service from './service.js'
import { logger } from '../../../shared/logger.js'

export const poRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')

poRouter.get('/', ...mgr, (req, res) => {
  try { res.json(service.list(req.query.status || null)) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

poRouter.get('/:id', ...mgr, (req, res) => {
  try {
    const po = service.get(+req.params.id)
    if (!po) return res.status(404).json({ error: 'Bulunamadi' })
    res.json(po)
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

poRouter.post('/', ...mgr, (req, res) => {
  try { res.status(201).json(service.create(req.body, req.user.id)) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

poRouter.post('/draft-from-low-stock', ...mgr, (req, res) => {
  try { res.json(service.draftFromLowStock(req.user.id)) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

poRouter.patch('/:id/status', ...mgr, (req, res) => {
  try {
    const { status } = req.body
    service.changeStatus(+req.params.id, status, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

poRouter.post('/:id/receive', ...mgr, (req, res) => {
  try { res.json(service.receive(+req.params.id, req.body.items, req.user.id)) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

poRouter.get('/:id/pdf', ...mgr, (req, res) => {
  try {
    const po = service.get(+req.params.id)
    if (!po) return res.status(404).json({ error: 'Bulunamadi' })
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${po.po_no}.pdf"`)
    doc.pipe(res)

    doc.fontSize(18).text('SATIN ALMA SIPARISI', { align: 'center' }).moveDown(0.3)
    doc.fontSize(11).text(po.po_no, { align: 'center' }).moveDown(1)
    doc.fontSize(10).text(`Tedarikci: ${po.supplier_name}`)
    if (po.supplier_phone) doc.text(`Telefon: ${po.supplier_phone}`)
    if (po.supplier_email) doc.text(`E-posta: ${po.supplier_email}`)
    doc.text(`Olusturulma: ${new Date(po.created_at).toLocaleString('tr-TR')}`)
    if (po.expected_date) doc.text(`Beklenen Teslim: ${po.expected_date}`)
    doc.text(`Durum: ${po.status}`)
    doc.moveDown(1)

    doc.fontSize(11).text('Kalemler:').moveDown(0.3)
    let y = doc.y
    doc.fontSize(9)
    doc.text('Urun', 40, y)
    doc.text('Miktar', 280, y, { width: 60, align: 'right' })
    doc.text('Birim', 340, y, { width: 60, align: 'right' })
    doc.text('Fiyat', 400, y, { width: 70, align: 'right' })
    doc.text('Toplam', 470, y, { width: 80, align: 'right' })
    y += 14
    doc.moveTo(40, y).lineTo(555, y).stroke()
    y += 4
    for (const it of po.items) {
      doc.text(it.item_name, 40, y, { width: 230 })
      doc.text(String(it.qty_ordered), 280, y, { width: 60, align: 'right' })
      doc.text(it.unit, 340, y, { width: 60, align: 'right' })
      doc.text((it.unit_price || 0).toFixed(2), 400, y, { width: 70, align: 'right' })
      doc.text((it.qty_ordered * (it.unit_price || 0)).toFixed(2), 470, y, { width: 80, align: 'right' })
      y += 14
    }
    y += 6
    doc.moveTo(40, y).lineTo(555, y).stroke()
    y += 6
    doc.fontSize(11).text(`Toplam: ${(po.total_value || 0).toLocaleString('tr-TR')} TL`, 40, y, { width: 515, align: 'right' })

    if (po.notes) {
      doc.moveDown(2).fontSize(10).text('Notlar:').moveDown(0.3)
      doc.fontSize(9).text(po.notes)
    }

    doc.end()
  } catch (e) {
    logger.error('[Route] PO PDF:', e)
    if (!res.headersSent) res.status(500).json({ error: 'Sunucu hatasi' })
  }
})
