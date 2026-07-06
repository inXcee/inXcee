import { Router } from 'express'
import { createPDF, addTable, addSectionTitle, addKpiRow } from '../../../shared/pdf/generator.js'
import * as service from '../service.js'
import { logger } from '../../../shared/logger.js'
import { mgrAccess } from './shared.js'

export const occupancyReportsRouter = Router()

occupancyReportsRouter.get('/occupancy/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getOccupancyReport()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

occupancyReportsRouter.get('/occupancy', ...mgrAccess, (req, res) => {
  try {
    const { totals, personnel } = service.getOccupancyReport()
    const detail = service.getOccupancyDetailSvc()
    const pct = totals.yatak ? Math.round(totals.dolu / totals.yatak * 100) : 0

    const doc = createPDF(res, 'Doluluk Raporu')
    addKpiRow(doc, [
      { label: 'Doluluk', value: `%${pct}`, color: pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : '#22c55e' },
      { label: 'Dolu Yatak', value: totals.dolu },
      { label: 'Toplam Yatak', value: totals.yatak },
      { label: 'Bos', value: totals.yatak - totals.dolu, color: '#22c55e' },
      { label: 'Oda', value: totals.oda },
    ])

    addSectionTitle(doc, 'Blok Bazli Doluluk')
    addTable(doc,
      ['Blok', 'Oda', 'Toplam Yatak', 'Dolu', 'Bos', 'Doluluk %', 'Karantina', 'Bakim'],
      detail.byBlock.map(b => [
        b.block, b.oda_sayisi, b.toplam_yatak, b.dolu_yatak,
        b.toplam_yatak - b.dolu_yatak,
        `%${b.toplam_yatak ? Math.round(b.dolu_yatak / b.toplam_yatak * 100) : 0}`,
        b.karantina || 0, b.bakim || 0,
      ]),
      [45, 45, 75, 45, 45, 65, 65, 50]
    )

    addSectionTitle(doc, 'Kat Bazli Doluluk')
    addTable(doc,
      ['Blok', 'Kat', 'Oda', 'Yatak', 'Dolu', '%'],
      detail.byFloor.map(f => [
        f.block, f.floor, f.oda, f.yatak, f.dolu,
        `%${f.yatak ? Math.round(f.dolu / f.yatak * 100) : 0}`,
      ]),
      [60, 50, 60, 70, 60, 60]
    )

    addSectionTitle(doc, 'Vardiya Dagilimi')
    addTable(doc,
      ['Vardiya', 'Kisi'],
      detail.byShift.map(s => [s.shift_type === 'night' ? 'Gece' : 'Gunduz', s.n]),
      [200, 100]
    )

    if (detail.byGender.length > 0) {
      addSectionTitle(doc, 'Cinsiyet Dagilimi')
      addTable(doc,
        ['Cinsiyet', 'Kisi'],
        detail.byGender.map(g => [g.gender === 'male' ? 'Erkek' : g.gender === 'female' ? 'Kadin' : 'Belirsiz', g.n]),
        [200, 100]
      )
    }

    addSectionTitle(doc, 'Firma Bazli Personel')
    addTable(doc,
      ['Firma', 'Kisi Sayisi'],
      personnel.map(p => [p.company || 'Belirtilmemis', p.kisi]),
      [300, 100]
    )

    if (detail.quarantineRooms.length > 0) {
      addSectionTitle(doc, 'Karantina / Bakim Odalari')
      addTable(doc,
        ['Blok', 'Kat', 'Oda', 'Durum'],
        detail.quarantineRooms.map(r => [r.block, r.floor, r.room_no, r.status === 'quarantine' ? 'Karantina' : 'Bakim']),
        [80, 60, 80, 100]
      )
    }

    if (detail.emptyRooms.length > 0) {
      addSectionTitle(doc, `Bos Odalar (${detail.emptyRooms.length})`)
      addTable(doc,
        ['Blok', 'Oda', 'Aktif Yatak'],
        detail.emptyRooms.slice(0, 60).map(r => [r.block, r.room_no, r.active_beds]),
        [80, 100, 100]
      )
    }
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
