import { Router } from 'express'
import { createPDF, addTable, addSectionTitle, addKpiRow } from '../../../shared/pdf/generator.js'
import * as service from '../service.js'
import { logger } from '../../../shared/logger.js'
import { mgrAccess } from './shared.js'

export const maintenanceReportsRouter = Router()

maintenanceReportsRouter.get('/maintenance/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getMaintenanceReport()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

maintenanceReportsRouter.get('/maintenance', ...mgrAccess, (req, res) => {
  try {
    const d = service.getMaintenanceDetailSvc()
    const all = d.all
    const total = all.length
    const open = all.filter(r => r.status !== 'done').length
    const closed = total - open
    const sla = all.filter(r => r.sla_breached).length
    const closedItems = all.filter(r => r.status === 'done')
    const avgHours = closedItems.length ? Math.round(closedItems.reduce((s, r) => s + r.hours_elapsed, 0) / closedItems.length) : 0

    const doc = createPDF(res, 'Bakim / Ariza Raporu (son 90 gun)')
    addKpiRow(doc, [
      { label: 'Toplam Talep', value: total },
      { label: 'Acik', value: open, color: '#f97316' },
      { label: 'Kapanan', value: closed, color: '#22c55e' },
      { label: 'SLA Asilan', value: sla, color: '#ef4444' },
      { label: 'Ort. Cozum (sa)', value: avgHours },
    ])

    addSectionTitle(doc, 'Acik Talep Yas Dilimleri')
    addTable(doc,
      ['Yas', 'Adet'],
      [
        ['0-1 gun', d.ageBuckets['0-1g'] || 0],
        ['1-3 gun', d.ageBuckets['1-3g'] || 0],
        ['3-7 gun', d.ageBuckets['3-7g'] || 0],
        ['7-14 gun', d.ageBuckets['7-14g'] || 0],
        ['14+ gun (KRITIK)', d.ageBuckets['14+g'] || 0],
      ],
      [200, 100]
    )

    addSectionTitle(doc, 'Durum Dagilimi')
    addTable(doc,
      ['Durum', 'Adet'],
      d.byStatus.map(s => [
        s.status === 'open' ? 'Acik' : s.status === 'assigned' ? 'Atanmis' :
        s.status === 'in_progress' ? 'Devam Ediyor' : s.status === 'review' ? 'Inceleme' :
        s.status === 'done' ? 'Tamamlandi' : s.status,
        s.n,
      ]),
      [200, 100]
    )

    addSectionTitle(doc, 'Oncelik Dagilimi (cozum sureleri ile)')
    addTable(doc,
      ['Oncelik', 'Toplam', 'Kapanan', 'Acik', 'Ort. Saat'],
      d.byPriority.map(p => [
        p.priority === 'high' ? 'Yuksek' : p.priority === 'medium' ? 'Orta' : 'Dusuk',
        p.n, p.closed, p.n - p.closed, p.avg_hours ?? '-',
      ]),
      [100, 80, 80, 80, 90]
    )

    addSectionTitle(doc, 'Teknisyen Performansi')
    addTable(doc,
      ['Teknisyen', 'Toplam', 'Tamamlanan', 'Acik', 'SLA Ihlali', 'Ort. Saat'],
      d.byTechnician.map(t => [
        t.teknisyen, t.toplam, t.tamamlanan, t.acik, t.sla_ihlali, t.ortalama_saat ?? '-',
      ]),
      [150, 60, 80, 50, 70, 70]
    )

    if (d.byBlock.length > 0) {
      addSectionTitle(doc, 'Blok Bazli Ariza Yogunlugu')
      addTable(doc,
        ['Blok', 'Toplam', 'Kapanan', 'Acik'],
        d.byBlock.map(b => [b.block, b.toplam, b.kapanan, b.acik]),
        [80, 80, 100, 80]
      )
    }

    if (d.hotSpots.length > 0) {
      addSectionTitle(doc, 'Sik Ariza Veren Konumlar (Hot Spots)')
      addTable(doc,
        ['Konum', 'Sayi', 'Kapanan', 'Ort. Saat'],
        d.hotSpots.map(h => [h.location, h.n, h.closed, h.avg_hours ?? '-']),
        [240, 70, 70, 70]
      )
    }

    if (d.longestOpen.length > 0) {
      addSectionTitle(doc, 'En Uzun Suredir Acik Olan Talepler (Top 10)')
      addTable(doc,
        ['#', 'Konum', 'Oncelik', 'Durum', 'Yas (gun)'],
        d.longestOpen.map(r => [
          r.id, (r.location || '').substring(0, 30), r.priority, r.status, r.age_days,
        ]),
        [30, 170, 70, 90, 90]
      )
    }

    if (d.monthlyTrend.length > 0) {
      addSectionTitle(doc, 'Aylik Trend (son 12 ay)')
      addTable(doc,
        ['Ay', 'Acilan', 'Kapanan'],
        d.monthlyTrend.map(m => [m.month, m.opened, m.closed]),
        [120, 100, 100]
      )
    }

    if (d.topReporters.length > 0) {
      addSectionTitle(doc, 'En Cok Bildirim Yapanlar')
      addTable(doc,
        ['Kullanici', 'Bildirim'],
        d.topReporters.map(r => [r.reporter, r.n]),
        [300, 100]
      )
    }

    addSectionTitle(doc, 'Tum Kayitlar')
    addTable(doc,
      ['#', 'Konum', 'Oncelik', 'Durum', 'Teknisyen', 'Saat', 'Acilis'],
      all.slice(0, 150).map(r => [
        r.id, (r.location || '').substring(0, 25), r.priority,
        r.status, r.teknisyen || '-',
        r.hours_elapsed != null ? r.hours_elapsed : '-',
        r.opened_at?.split('T')[0] || '-',
      ]),
      [25, 120, 50, 70, 90, 45, 70]
    )
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
