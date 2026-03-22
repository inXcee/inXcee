import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { createPDF, addTable } from '../../shared/pdf/generator.js'
import * as service from './service.js'

export const reportsRouter = Router()
const mgrAccess = requireRole('campus_manager', 'shift_supervisor')

reportsRouter.get('/housekeeping', ...mgrAccess, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0]
    const { tasks, total, done, skipped, pending } = service.getHousekeepingReport(date)

    const doc = createPDF(res, `Gunluk Temizlik Raporu — ${date}`)
    doc.fontSize(10).text(`Toplam: ${total} | Tamamlanan: ${done} | Atlanan: ${skipped} | Bekleyen: ${pending}`)
    doc.moveDown(1)

    addTable(doc,
      ['Alan', 'Blok', 'Kat', 'Durum', 'Temizlikci', 'Aciklama'],
      tasks.map(t => [t.area, t.block || '-', t.floor || '-', t.durum, t.temizlikci, t.aciklama]),
      [150, 40, 30, 70, 90, 120]
    )
    doc.end()
  } catch (e) { res.status(500).json({ error: e.message }) }
})

reportsRouter.get('/maintenance', ...mgrAccess, (req, res) => {
  try {
    const { requests, total, open, closed, overdue } = service.getMaintenanceReport()

    const doc = createPDF(res, 'Haftalik Bakim Ozeti')
    doc.fontSize(10).text(`Son 7 Gun — Toplam: ${total} | Acik: ${open} | Kapanan: ${closed} | SLA Asilan: ${overdue}`)
    doc.moveDown(1)

    addTable(doc,
      ['#', 'Konum', 'Oncelik', 'Durum', 'Teknisyen', 'SLA', 'Tarih'],
      requests.map(r => [r.id, r.location, r.priority, r.durum, r.teknisyen, r.sla, r.opened_at?.split('T')[0] || '-']),
      [25, 110, 50, 70, 80, 50, 70]
    )
    doc.end()
  } catch (e) { res.status(500).json({ error: e.message }) }
})

reportsRouter.get('/occupancy', ...mgrAccess, (req, res) => {
  try {
    const { blocks, totals, personnel } = service.getOccupancyReport()

    const doc = createPDF(res, 'Aylik Doluluk Raporu')
    doc.fontSize(10).text(`Genel: ${totals.dolu}/${totals.yatak} yatak dolu (%${totals.yatak ? Math.round(totals.dolu / totals.yatak * 100) : 0}) — ${totals.oda} oda`)
    doc.moveDown(1)

    doc.fontSize(11).text('Blok Bazli Doluluk', { underline: true })
    doc.moveDown(0.5)
    addTable(doc,
      ['Blok', 'Oda', 'Toplam Yatak', 'Dolu', 'Bos', 'Doluluk %'],
      blocks.map(b => [b.block, b.oda_sayisi, b.toplam_yatak, b.dolu_yatak, b.toplam_yatak - b.dolu_yatak, `%${b.toplam_yatak ? Math.round(b.dolu_yatak / b.toplam_yatak * 100) : 0}`]),
      [50, 50, 80, 50, 50, 70]
    )

    doc.moveDown(1.5)
    doc.fontSize(11).text('Firma Bazli Personel', { underline: true })
    doc.moveDown(0.5)
    addTable(doc,
      ['Firma', 'Kisi Sayisi'],
      personnel.map(p => [p.company || 'Belirtilmemis', p.kisi]),
      [300, 100]
    )
    doc.end()
  } catch (e) { res.status(500).json({ error: e.message }) }
})

reportsRouter.get('/discipline', ...mgrAccess, (req, res) => {
  try {
    const { records, total } = service.getDisciplineReport()

    const doc = createPDF(res, 'Aylik Disiplin Raporu')
    doc.fontSize(10).text(`Son 30 Gun — Toplam: ${total} kart`)
    doc.moveDown(1)

    addTable(doc,
      ['Personel', 'Firma', 'Kart', 'Sebep', 'Yazan', 'Tarih'],
      records.map(r => [
        r.full_name, r.company || '-',
        r.card_type === 'yellow' ? 'Sari' : 'Kirmizi',
        (r.reason || '-').substring(0, 40),
        r.created_by_name || '-',
        r.created_at?.split('T')[0] || '-',
      ]),
      [90, 70, 40, 120, 70, 60]
    )
    doc.end()
  } catch (e) { res.status(500).json({ error: e.message }) }
})
