import { Router } from 'express'
import { createPDF, addTable, addSectionTitle, addKpiRow } from '../../../shared/pdf/generator.js'
import * as service from '../service.js'
import { logger } from '../../../shared/logger.js'
import { mgrAccess } from './shared.js'

export const housekeepingReportsRouter = Router()

housekeepingReportsRouter.get('/housekeeping/data', ...mgrAccess, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format' })
    res.json(service.getHousekeepingReport(date))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

housekeepingReportsRouter.get('/housekeeping', ...mgrAccess, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0]
    const { total, done, skipped, pending } = service.getHousekeepingReport(date)
    const { tasks, byStaff, byBlock } = service.getHousekeepingDetailSvc(date)

    const doc = createPDF(res, `Gunluk Temizlik Raporu — ${date}`)
    addKpiRow(doc, [
      { label: 'Toplam', value: total },
      { label: 'Tamamlandi', value: done, color: '#22c55e' },
      { label: 'Atlandi', value: skipped, color: '#f97316' },
      { label: 'Bekleyen', value: pending, color: '#ef4444' },
    ])

    addSectionTitle(doc, 'Temizlikci Performansi')
    addTable(doc,
      ['Personel', 'Toplam', 'Tamamlanan', 'Atlanan', 'Basari %'],
      byStaff.map(s => [
        s.staff, s.toplam, s.tamamlanan, s.atlanan,
        `%${s.toplam ? Math.round(s.tamamlanan / s.toplam * 100) : 0}`,
      ]),
      [200, 70, 90, 70, 70]
    )

    addSectionTitle(doc, 'Blok Bazli Dagilim')
    addTable(doc,
      ['Blok', 'Toplam', 'Tamamlanan', 'Oran'],
      byBlock.map(b => [b.block, b.toplam, b.tamamlanan, `%${b.toplam ? Math.round(b.tamamlanan / b.toplam * 100) : 0}`]),
      [120, 80, 100, 80]
    )

    addSectionTitle(doc, 'Tum Gorevler')
    addTable(doc,
      ['Alan', 'Blok', 'Kat', 'Durum', 'Temizlikci', 'Aciklama'],
      tasks.map(t => [t.area, t.block || '-', t.floor || '-', t.durum, t.temizlikci, (t.aciklama || '').substring(0, 30)]),
      [120, 40, 30, 70, 100, 140]
    )
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
