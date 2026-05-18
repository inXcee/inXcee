import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import * as q from './queries.js'

export const hrRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor')

// ── Checklist CRUD ──
hrRouter.post('/checklists', ...mgr, (req, res) => {
  try {
    const { staff_id, kind } = req.body || {}
    if (!staff_id || !['onboarding', 'offboarding'].includes(kind)) {
      return res.status(400).json({ error: 'staff_id ve kind (onboarding/offboarding) gerekli' })
    }
    const id = q.startChecklist(+staff_id, kind, req.user.id)
    logAudit(req.user.id, `hr_${kind}_start`, 'hr', id, `staff:${staff_id}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

hrRouter.get('/checklists', ...view, (req, res) => {
  try {
    res.json(q.listChecklists({
      kind: req.query.kind,
      status: req.query.status,
      staffId: req.query.staff_id ? +req.query.staff_id : null,
    }))
  } catch (e) { console.error('[hr/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

hrRouter.get('/checklists/:id', ...view, (req, res) => {
  try {
    const cl = q.getChecklist(+req.params.id)
    if (!cl) return res.status(404).json({ error: 'Bulunamadı' })
    res.json(cl)
  } catch (e) { console.error('[hr/get]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

hrRouter.patch('/items/:id/toggle', ...mgr, (req, res) => {
  try {
    q.toggleItem(+req.params.id, !!req.body?.done, req.user.id, req.body?.note)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

hrRouter.post('/checklists/:id/items', ...mgr, (req, res) => {
  try {
    if (!req.body?.label?.trim()) return res.status(400).json({ error: 'Adım metni gerekli' })
    const id = q.addItem(+req.params.id, req.body.label.trim().slice(0, 200))
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

hrRouter.delete('/items/:id', ...mgr, (req, res) => {
  try { q.deleteItem(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

hrRouter.post('/checklists/:id/complete', ...mgr, (req, res) => {
  try {
    q.completeChecklist(+req.params.id, req.user.id, null)
    logAudit(req.user.id, 'hr_checklist_complete', 'hr', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

hrRouter.post('/checklists/:id/cancel', ...mgr, (req, res) => {
  try { q.cancelChecklist(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// HR2 — İbra (offboarding) PDF
hrRouter.get('/checklists/:id/ibra/pdf', ...view, (req, res) => {
  try {
    const cl = q.getChecklist(+req.params.id)
    if (!cl) return res.status(404).json({ error: 'Bulunamadı' })
    if (cl.kind !== 'offboarding') return res.status(400).json({ error: 'Sadece çıkış checklist için' })

    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    res.setHeader('Content-Type', 'application/pdf')
    const safeName = (cl.staff_name || 'personel')
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // diakritikleri at
      .replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50)
    res.setHeader('Content-Disposition', `attachment; filename="ibra-${safeName}-${cl.id}.pdf"`)
    doc.pipe(res)

    doc.fontSize(18).font('Helvetica-Bold').text('IBRA BELGESI', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
      .text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}  |  Belge No: HR-${cl.id}`, { align: 'center' })
    doc.fillColor('#000').moveDown(1.5)

    doc.fontSize(11).font('Helvetica-Bold').text('Personel Bilgileri')
    doc.font('Helvetica').fontSize(10).moveDown(0.3)
    doc.text(`Ad Soyad: ${cl.staff_name || '—'}`)
    doc.text(`T.C. Kimlik No: ${cl.tc_no || '—'}`)
    doc.text(`Telefon: ${cl.phone || '—'}`)
    if (cl.email) doc.text(`E-posta: ${cl.email}`)
    if (cl.dept_name) doc.text(`Departman: ${cl.dept_name}`)
    doc.moveDown(1)

    doc.fontSize(11).font('Helvetica-Bold').text('Cikis Kontrol Listesi')
    doc.font('Helvetica').fontSize(10).moveDown(0.3)
    cl.items.forEach(it => {
      const mark = it.done ? '[X]' : '[ ]'
      doc.text(`${mark}  ${it.label}${it.note ? '   — ' + it.note : ''}`)
    })
    doc.moveDown(1.5)

    doc.fontSize(10).font('Helvetica').text(
      'Yukarida belirtilen kontrol maddelerinin tamamlandigini, sirkete ait demirbas/zimmet ve KKD ekipmanlarinin iade edildigini, alacak-verecek konusunda taraflarin birbirini ibra ettigini beyan ederiz.',
      { align: 'justify' }
    )
    doc.moveDown(3)

    // İmza alanları
    const y = doc.y
    doc.text('Personel Imzasi', 60, y, { width: 200 })
    doc.text('Yetkili Imzasi', 320, y, { width: 200 })
    doc.moveTo(60, y + 50).lineTo(250, y + 50).stroke()
    doc.moveTo(320, y + 50).lineTo(510, y + 50).stroke()

    doc.fontSize(8).fillColor('#9ca3af')
      .text(`Yatakhane Yonetim Sistemi  |  Olusturma: ${new Date().toLocaleString('tr-TR')}`,
        50, doc.page.height - 50, { align: 'center' })

    doc.end()
  } catch (e) {
    console.error('[hr/pdf]', e)
    if (!res.headersSent) res.status(500).json({ error: 'PDF olusturulamadi' })
  }
})

// HR3 — Sözleşme bitiyor
hrRouter.get('/expiring-contracts', ...view, (req, res) => {
  try { res.json(q.getExpiringContracts({ days: Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30)) })) }
  catch (e) { console.error('[hr/expiring]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
