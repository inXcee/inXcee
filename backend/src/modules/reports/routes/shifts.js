import { Router } from 'express'
import { createPDF, addTable, addSectionTitle, addKpiRow, addParagraph } from '../../../shared/pdf/generator.js'
import * as service from '../service.js'
import { logger } from '../../../shared/logger.js'
import { mgrAccess } from './shared.js'

export const shiftsReportsRouter = Router()

shiftsReportsRouter.get('/shifts', ...mgrAccess, (req, res) => {
  try {
    const d = service.getShiftsDetailSvc()
    const day = d.distribution.find(x => x.shift_type === 'day')?.n || 0
    const night = d.distribution.find(x => x.shift_type === 'night')?.n || 0
    const toplam = day + night

    const doc = createPDF(res, 'Vardiya Raporu')
    addKpiRow(doc, [
      { label: 'Toplam Aktif', value: toplam },
      { label: 'Gunduz', value: day, color: '#eab308' },
      { label: 'Gece', value: night, color: '#3b82f6' },
      { label: 'Gece Orani', value: `%${toplam ? Math.round(night / toplam * 100) : 0}` },
      { label: 'Vardiyasiz', value: d.noShiftRecord, color: d.noShiftRecord > 0 ? '#f97316' : '#64748b' },
    ])

    if (d.mixedRooms.length > 0) {
      addSectionTitle(doc, '⚠ KURAL IHLALI: Karısık Vardiyali Odalar')
      addParagraph(doc, 'Asagidaki odalarda hem gunduz hem gece vardiyasinda personel atanmis — bu uyku duzeni icin sorundur.', { color: '#ef4444', size: 9 })
      addTable(doc,
        ['Blok', 'Oda', 'Gunduz', 'Gece'],
        d.mixedRooms.map(r => [r.block, r.room_no, r.gunduz, r.gece]),
        [80, 80, 80, 80]
      )
    }

    addSectionTitle(doc, 'Blok x Vardiya Dagilimi')
    addTable(doc,
      ['Blok', 'Gunduz', 'Gece', 'Toplam', 'Gece %'],
      d.byBlockShift.map(b => [
        b.block, b.gunduz, b.gece, b.toplam,
        `%${b.toplam ? Math.round(b.gece / b.toplam * 100) : 0}`,
      ]),
      [80, 80, 80, 80, 80]
    )

    addSectionTitle(doc, 'Kat x Vardiya Detayi')
    addTable(doc,
      ['Blok', 'Kat', 'Gunduz', 'Gece', 'Toplam', 'Gece %'],
      d.byFloorShift.map(f => [
        f.block, f.floor, f.gunduz, f.gece, f.toplam,
        `%${f.toplam ? Math.round(f.gece / f.toplam * 100) : 0}`,
      ]),
      [60, 50, 70, 70, 70, 70]
    )

    addSectionTitle(doc, 'Firma x Vardiya')
    addTable(doc,
      ['Firma', 'Gunduz', 'Gece', 'Toplam', 'Gece %'],
      d.byCompanyShift.map(c => [
        c.company, c.gunduz, c.gece, c.toplam,
        `%${c.toplam ? Math.round(c.gece / c.toplam * 100) : 0}`,
      ]),
      [180, 60, 60, 60, 60]
    )

    if (d.byJobShift.length > 0) {
      addSectionTitle(doc, 'Meslek x Vardiya')
      addTable(doc,
        ['Meslek', 'Gunduz', 'Gece', 'Toplam'],
        d.byJobShift.map(j => [j.job_title, j.gunduz, j.gece, j.toplam]),
        [200, 80, 80, 80]
      )
    }

    if (d.hourPatterns.length > 0) {
      addSectionTitle(doc, 'En Yaygin Vardiya Saatleri')
      addTable(doc,
        ['Vardiya', 'Baslangic', 'Bitis', 'Kisi Sayisi'],
        d.hourPatterns.map(p => [
          p.shift_type === 'night' ? 'Gece' : 'Gunduz',
          `${p.start_hour}:00`, `${p.end_hour}:00`, p.n,
        ]),
        [100, 100, 100, 100]
      )
    }

    addSectionTitle(doc, `Gece Vardiyasindaki Personel (${d.nightShiftList.length})`)
    addTable(doc,
      ['Ad Soyad', 'Firma', 'Meslek', 'Oda', 'Telefon'],
      d.nightShiftList.map(p => [
        p.full_name, p.company || '-', p.job_title || '-',
        p.block ? `${p.block}-${p.room_no}${p.bed_no ? '/' + p.bed_no : ''}` : '-',
        p.phone_number || '-',
      ]),
      [120, 100, 90, 80, 80]
    )

    if (d.noShiftRecord > 0) {
      doc.moveDown(0.5)
      addParagraph(doc,
        `Not: ${d.noShiftRecord} personelin shifts kaydi yok (varsayilan gunduz olarak kabul ediliyor). Vardiyalar sayfasindan duzeltebilirsiniz.`,
        { color: '#f97316', size: 9 })
    }
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

shiftsReportsRouter.get('/shifts/data', ...mgrAccess, (req, res) => {
  try {
    const d = service.getShiftsDetailSvc()
    const day = d.distribution.find(x => x.shift_type === 'day')?.n || 0
    const night = d.distribution.find(x => x.shift_type === 'night')?.n || 0
    res.json({
      total: day + night,
      day,
      night,
      blocks: d.byBlockShift.length,
      night_list_count: d.nightShiftList.length,
    })
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
