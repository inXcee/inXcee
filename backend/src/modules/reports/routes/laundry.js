import { Router } from 'express'
import { createPDF, addTable, addSectionTitle, addKpiRow } from '../../../shared/pdf/generator.js'
import * as service from '../service.js'
import { logger } from '../../../shared/logger.js'
import { mgrAccess } from './shared.js'

export const laundryReportsRouter = Router()

laundryReportsRouter.get('/laundry', ...mgrAccess, (req, res) => {
  try {
    const d = service.getLaundryDetailSvc()
    const inProgress = (d.byStatus.washing || 0) + (d.byStatus.dirty || 0)
    const delivered = d.byStatus.delivered || 0
    const ready = d.byStatus.ready || 0

    const doc = createPDF(res, 'Camasirhane Raporu (son 30 gun)')
    addKpiRow(doc, [
      { label: 'Toplam Islem', value: d.items.length },
      { label: 'Devam Eden', value: inProgress, color: '#f97316' },
      { label: 'Hazir', value: ready, color: '#eab308' },
      { label: 'Teslim', value: delivered, color: '#22c55e' },
      { label: 'Kayip', value: d.lost, color: '#ef4444' },
      { label: 'Toplam Parca', value: d.total_pieces },
    ])

    addSectionTitle(doc, 'Performans Metrikleri')
    addTable(doc,
      ['Metrik', 'Deger'],
      [
        ['Acil Islem Sayisi', d.urgent_count],
        ['Acil Oranı', `%${d.urgent_pct}`],
        ['Ortalama Teslim Suresi', `${d.avg_delivery_hours} saat`],
        ['Toplam Makine', d.machine_count],
        ['Calisan Makine', d.running_count],
        ['Bos Makine', d.machine_count - d.running_count],
      ],
      [250, 200]
    )

    addSectionTitle(doc, 'Durum Dagilimi')
    addTable(doc,
      ['Durum', 'Adet'],
      Object.entries(d.byStatus).map(([k, v]) => [
        k === 'dirty' ? 'Kirli' : k === 'washing' ? 'Yikamada' : k === 'ready' ? 'Hazir' :
        k === 'delivered' ? 'Teslim' : k === 'lost' ? 'Kayip' : k,
        v,
      ]),
      [200, 100]
    )

    if (d.premium) {
      addSectionTitle(doc, 'Premium Parca Istatistigi')
      addTable(doc,
        ['Metrik', 'Adet'],
        [
          ['Toplam Premium', d.premium.total],
          ['Teslim Edilen', d.premium.delivered],
          ['Kayip', d.premium.lost],
        ],
        [200, 100]
      )
    }

    addSectionTitle(doc, 'Blok Bazli Dagilim (acil ve kayip dahil)')
    addTable(doc,
      ['Blok', 'Islem', 'Parca', 'Acil', 'Kayip'],
      d.byBlock.map(b => [b.block, b.total, b.pieces, b.urgent, b.lost]),
      [80, 80, 80, 80, 80]
    )

    if (d.byMachine.length > 0) {
      addSectionTitle(doc, 'Makine Basina Islem')
      addTable(doc,
        ['Makine', 'Yikama Sayisi', 'Toplam Parca'],
        d.byMachine.map(m => [m.machine, m.runs, m.pieces]),
        [150, 130, 130]
      )
    }

    addSectionTitle(doc, 'Tum Makine Durumu')
    addTable(doc,
      ['Makine', 'Tip', 'Durum', 'Kapasite (kg)', 'Bakim Notu'],
      d.machines.map(m => [
        m.name,
        m.type === 'washer' ? 'Camasir' : 'Kurutucu',
        m.status === 'idle' ? 'Bos' : m.status === 'running' ? 'Calisiyor' : m.status === 'done' ? 'Bitti' : m.status === 'maintenance' ? 'Bakim' : m.status,
        m.capacity_kg || '-',
        (m.maintenance_notes || '').substring(0, 30),
      ]),
      [100, 70, 80, 90, 120]
    )

    if (d.byShelf.length > 0) {
      addSectionTitle(doc, 'Raf Bazli Dagilim (Top 20)')
      addTable(doc,
        ['Raf', 'Parca Sayisi'],
        d.byShelf.map(s => [s.shelf, s.pieces]),
        [200, 150]
      )
    }

    if (d.dailyTrend.length > 0) {
      addSectionTitle(doc, 'Gunluk Trend (son 30 gun)')
      addTable(doc,
        ['Tarih', 'Toplam', 'Teslim', 'Kayip'],
        d.dailyTrend.map(t => [t.day, t.total, t.delivered, t.lost]),
        [100, 80, 80, 80]
      )
    }

    addSectionTitle(doc, 'Son Islemler')
    addTable(doc,
      ['Tarih', 'Blok-Oda', 'Durum', 'Parca', 'Acil', 'Raf', 'Sure (sa)'],
      d.items.slice(0, 100).map(i => [
        i.created_at?.slice(0, 10) || '-',
        i.block && i.room_no ? `${i.block}-${i.room_no}` : '-',
        i.status, i.item_count || 0,
        i.urgent ? 'EVET' : '',
        i.shelf_location || '-',
        i.hours_total != null ? Math.round(i.hours_total) : '-',
      ]),
      [60, 70, 70, 50, 45, 65, 65]
    )
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryReportsRouter.get('/laundry/data', ...mgrAccess, (req, res) => {
  try {
    const d = service.getLaundryDetailSvc()
    res.json({
      total: d.items.length,
      lost: d.lost,
      delivered: d.byStatus.delivered || 0,
      total_pieces: d.total_pieces,
      machine_count: d.machine_count,
      running_count: d.running_count,
    })
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
