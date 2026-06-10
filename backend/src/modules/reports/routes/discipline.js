import { Router } from 'express'
import { createPDF, addTable, addSectionTitle, addKpiRow } from '../../../shared/pdf/generator.js'
import * as service from '../service.js'
import { logger } from '../../../shared/logger.js'
import { mgrAccess } from './shared.js'

export const disciplineReportsRouter = Router()

disciplineReportsRouter.get('/discipline/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getDisciplineReport()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

disciplineReportsRouter.get('/discipline', ...mgrAccess, (req, res) => {
  try {
    const { records, topOffenders, byCompany } = service.getDisciplineDetailSvc()
    const yellow = records.filter(r => r.card_type === 'yellow').length
    const red = records.filter(r => r.card_type === 'red').length

    const doc = createPDF(res, 'Disiplin Raporu (son 90 gun)')
    addKpiRow(doc, [
      { label: 'Toplam Kart', value: records.length },
      { label: 'Sari Kart', value: yellow, color: '#eab308' },
      { label: 'Kirmizi Kart', value: red, color: '#ef4444' },
    ])

    addSectionTitle(doc, 'En Cok Ihlal Yapan Kisiler (Top 15)')
    addTable(doc,
      ['Personel', 'Firma', 'Toplam', 'Sari', 'Kirmizi'],
      topOffenders.map(o => [o.full_name, o.company || '-', o.toplam, o.sari, o.kirmizi]),
      [140, 110, 60, 50, 60]
    )

    addSectionTitle(doc, 'Firma Bazli Dagilim')
    addTable(doc,
      ['Firma', 'Ihlal Sayisi'],
      byCompany.map(c => [c.company, c.n]),
      [300, 100]
    )

    addSectionTitle(doc, 'Tum Kayitlar')
    addTable(doc,
      ['Personel', 'Firma', 'Kart', 'Sebep', 'Yazan', 'Tarih'],
      records.map(r => [
        r.full_name, r.company || '-',
        r.card_type === 'yellow' ? 'Sari' : 'Kirmizi',
        (r.reason || '-').substring(0, 35),
        r.created_by_name || '-',
        r.created_at?.split('T')[0] || '-',
      ]),
      [85, 65, 40, 130, 70, 60]
    )
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
