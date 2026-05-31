import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { createPDF, addTable, addSectionTitle, addKpiRow, addParagraph } from '../../shared/pdf/generator.js'
import * as service from './service.js'
import { logger } from '../../shared/logger.js'

export const reportsRouter = Router()
const mgrAccess = requireRole('campus_manager', 'shift_supervisor')

reportsRouter.get('/housekeeping/data', ...mgrAccess, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format' })
    res.json(service.getHousekeepingReport(date))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/maintenance/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getMaintenanceReport()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/occupancy/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getOccupancyReport()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/discipline/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getDisciplineReport()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/housekeeping', ...mgrAccess, (req, res) => {
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

reportsRouter.get('/maintenance', ...mgrAccess, (req, res) => {
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

reportsRouter.get('/occupancy', ...mgrAccess, (req, res) => {
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

// ── Yeni raporlar ──

reportsRouter.get('/companies/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getCompaniesReportSvc()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/companies', ...mgrAccess, (req, res) => {
  try {
    const data = service.getCompaniesReportSvc()
    const doc = createPDF(res, 'Firma & Sozlesme Raporu')
    addKpiRow(doc, [
      { label: 'Toplam Firma', value: data.total },
      { label: 'Aktif', value: data.active, color: '#22c55e' },
      { label: 'Suresi Dolmus', value: data.expired, color: '#ef4444' },
      { label: 'Yaklasan (30g)', value: data.expiring_soon, color: '#f97316' },
    ])
    addParagraph(doc, `Toplam yatak kotasi: ${data.total_quota} · Hesaplanan aylik gelir: ${Math.round(data.total_revenue).toLocaleString('tr-TR')} TL`, { color: '#64748b', size: 9 })
    doc.moveDown(1)
    addSectionTitle(doc, 'Aktif Firmalar')
    addTable(doc,
      ['Firma', 'Yetkili', 'Telefon', 'Yatak', 'Aktif Pers.', 'Sozlesme Bitis', 'Durum'],
      data.companies.filter(c => c.is_active).map(c => [
        c.name, c.contact_name || '-', c.contact_phone || '-',
        c.bed_quota ?? '-', c.active_personnel,
        c.contract_end || '-',
        c.days_left == null ? '-' : c.days_left < 0 ? `${Math.abs(c.days_left)}g GECTI` : `${c.days_left}g`,
      ]),
      [110, 80, 70, 50, 60, 70, 60]
    )
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/surveys/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getSurveysReportSvc()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/surveys', ...mgrAccess, (req, res) => {
  try {
    const { summary, recent } = service.getSurveysReportSvc()
    const doc = createPDF(res, 'Memnuniyet Raporu (son 30 gun)')
    addKpiRow(doc, [
      { label: 'Toplam Cevap', value: summary.total || 0 },
      { label: 'Oda', value: summary.avg_room ?? '-', hint: '/ 5' },
      { label: 'Temizlik', value: summary.avg_cleaning ?? '-', hint: '/ 5' },
      { label: 'Yemek', value: summary.avg_food ?? '-', hint: '/ 5' },
      { label: 'Genel', value: summary.avg_overall ?? '-', hint: '/ 5', color: summary.avg_overall >= 4 ? '#22c55e' : summary.avg_overall >= 3 ? '#f97316' : '#ef4444' },
    ])
    addSectionTitle(doc, 'Son Cevaplar')
    addTable(doc,
      ['Tarih', 'Kisi', 'Genel', 'Oda', 'Tem.', 'Yem.', 'Yorum'],
      recent.slice(0, 40).map(r => [
        r.created_at?.slice(0, 10) || '-',
        r.full_name || 'anonim',
        r.overall_score ?? '-', r.room_score ?? '-', r.cleaning_score ?? '-', r.food_score ?? '-',
        (r.comment || '').substring(0, 35),
      ]),
      [60, 90, 35, 30, 30, 30, 220]
    )
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/drills/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getDrillsReportSvc()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/drills', ...mgrAccess, (req, res) => {
  try {
    const { records, total, avg_attendance_pct } = service.getDrillsReportSvc()
    const doc = createPDF(res, 'Tatbikat Raporu (son 365 gun)')
    addKpiRow(doc, [
      { label: 'Toplam Tatbikat', value: total },
      { label: 'Ortalama Katilim', value: `%${avg_attendance_pct || 0}`, color: avg_attendance_pct >= 90 ? '#22c55e' : '#f97316' },
      { label: 'Son Tatbikat', value: records[0]?.drill_date || '-' },
    ])
    addSectionTitle(doc, 'Tatbikat Detaylari')
    addTable(doc,
      ['Tarih', 'Tip', 'Beklenen', 'Fiili', 'Sure (dk)', 'Bulgular'],
      records.map(r => [
        r.drill_date, r.drill_type,
        r.expected_count ?? '-', r.actual_count ?? '-',
        r.duration_minutes ?? '-',
        (r.findings || '').substring(0, 50),
      ]),
      [60, 60, 60, 50, 50, 215]
    )
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/visitors/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getVisitorsReportSvc()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/visitors', ...mgrAccess, (req, res) => {
  try {
    const { records, total, active, avg_minutes } = service.getVisitorsReportSvc()
    const doc = createPDF(res, 'Ziyaretci Raporu (son 30 gun)')
    addKpiRow(doc, [
      { label: 'Toplam Ziyaretci', value: total },
      { label: 'Su Anda Iceride', value: active, color: active > 0 ? '#22c55e' : '#64748b' },
      { label: 'Ort. Kalis (dk)', value: avg_minutes || '-' },
    ])
    addSectionTitle(doc, 'Ziyaret Kayitlari')
    addTable(doc,
      ['Tarih/Saat', 'Ad Soyad', 'Telefon', 'Sebep', 'Blok', 'Sure (dk)', 'Durum'],
      records.slice(0, 80).map(r => [
        r.check_in_at?.slice(0, 16) || '-',
        r.full_name,
        r.phone || '-',
        (r.purpose || '').substring(0, 25),
        r.visiting_block || '-',
        r.minutes || '-',
        r.check_out_at ? 'Cikti' : 'Iceride',
      ]),
      [80, 95, 70, 90, 40, 50, 60]
    )
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/expenses/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getExpensesReportSvc()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/expenses', ...mgrAccess, (req, res) => {
  try {
    const { summary, by_category, monthly, recent } = service.getExpensesReportSvc()
    const tl = (n) => n != null ? Math.round(n).toLocaleString('tr-TR') + ' TL' : '-'
    const doc = createPDF(res, 'Butce / Maliyet Raporu (son 3 ay)')
    addKpiRow(doc, [
      { label: 'Bu Ay Toplam', value: tl(summary.total) },
      { label: 'Aktif Sakin', value: summary.active_residents || 0 },
      { label: 'Kisi Basi (Bu ay)', value: tl(summary.per_resident), color: '#22c55e' },
    ])
    addSectionTitle(doc, 'Kategori Dagilimi (son 3 ay)')
    addTable(doc,
      ['Kategori', 'Toplam', 'Islem Sayisi'],
      by_category.map(c => [c.category, tl(c.total), c.count]),
      [200, 150, 100]
    )
    addSectionTitle(doc, 'Aylik Trend (son 12 ay)')
    addTable(doc,
      ['Ay', 'Toplam'],
      monthly.map(m => [m.month, tl(m.total)]),
      [120, 150]
    )
    addSectionTitle(doc, 'Son Giderler')
    addTable(doc,
      ['Tarih', 'Kategori', 'Aciklama', 'Firma', 'Fatura No', 'Tutar'],
      recent.slice(0, 50).map(e => [
        e.expense_date, e.category,
        (e.description || '').substring(0, 30),
        e.company_name || '-',
        e.invoice_no || '-',
        tl(e.amount),
      ]),
      [60, 65, 130, 80, 65, 75]
    )
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/executive/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getExecutiveReportSvc()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/executive', ...mgrAccess, (req, res) => {
  try {
    const d = service.getExecutiveReportSvc()
    const tl = (n) => Math.round(n || 0).toLocaleString('tr-TR') + ' TL'
    const doc = createPDF(res, 'Yonetici Ozet Raporu')
    addParagraph(doc, 'Bu rapor tum modullerden derlenmis tek bakista durum ozetini icerir.', { color: '#64748b', size: 9 })
    doc.moveDown(0.5)

    addSectionTitle(doc, 'KONAKLAMA & DOLULUK')
    addKpiRow(doc, [
      { label: 'Doluluk', value: `%${d.occupancy.rate}`, color: d.occupancy.rate >= 90 ? '#ef4444' : d.occupancy.rate >= 70 ? '#f97316' : '#22c55e' },
      { label: 'Dolu Yatak', value: d.occupancy.occupied },
      { label: 'Toplam Yatak', value: d.occupancy.beds },
      { label: 'Bos', value: d.occupancy.beds - d.occupancy.occupied, color: '#22c55e' },
    ])

    addSectionTitle(doc, 'SON 30 GUN HAREKETLER')
    addKpiRow(doc, [
      { label: 'Yeni Giris', value: d.checkins_30d, color: '#22c55e' },
      { label: 'Cikis', value: d.checkouts_30d, color: '#f97316' },
      { label: 'Disiplin Kayit', value: d.discipline_30d },
      { label: 'Kara Listede', value: d.blacklisted, color: d.blacklisted > 0 ? '#ef4444' : '#64748b' },
    ])

    addSectionTitle(doc, 'OPERASYON')
    addKpiRow(doc, [
      { label: 'Acik Ariza', value: d.maintenance_open, color: d.maintenance_open > 5 ? '#ef4444' : '#0369a1' },
      { label: 'Aktif Ziyaretci', value: d.active_visitors },
      { label: 'Memnuniyet (30g)', value: d.satisfaction?.avg ?? '-', hint: `${d.satisfaction?.n || 0} cevap` },
      { label: 'Son Tatbikat', value: d.last_drill || '-' },
    ])

    addSectionTitle(doc, 'FINANS')
    addKpiRow(doc, [
      { label: 'Bu Ay Gider', value: tl(d.expense_this_month) },
      { label: 'Yaklasan Sozlesme', value: d.expiring_contracts, color: d.expiring_contracts > 0 ? '#f97316' : '#22c55e', hint: '30 gun ici' },
    ])

    doc.moveDown(1)
    addParagraph(doc, `Rapor zamani: ${new Date().toLocaleString('tr-TR')}`, { color: '#94a3b8', size: 8 })
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/discipline', ...mgrAccess, (req, res) => {
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

// ── Yeni: Personel CSV ──

function toCsv(headers, rows) {
  const esc = (v) => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes(';') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  return '﻿' + [headers.join(';'), ...rows.map(r => r.map(esc).join(';'))].join('\r\n')
}

// ── Erişim hareketleri (giriş/çıkış/yemek/turnike) CSV export (Faz 10) ──
reportsRouter.get('/access-events.csv', ...mgrAccess, (req, res) => {
  try {
    const from = req.query.from || null
    const to = req.query.to || null
    const limit = Math.min(+req.query.limit || 5000, 50000)
    const rows = getDB().prepare(`
      SELECT e.scanned_at, e.event_type, e.meal_type, e.result, e.holder_type, e.raw_uid,
        st.name AS station_name,
        CASE e.holder_type
          WHEN 'staff' THEN (SELECT full_name FROM staff WHERE id=e.holder_id)
          WHEN 'personnel' THEN (SELECT full_name FROM personnel WHERE id=e.holder_id)
          WHEN 'visitor' THEN (SELECT full_name FROM visitors WHERE id=e.holder_id)
        END AS holder_name
      FROM access_events e
      LEFT JOIN scan_stations st ON st.id = e.station_id
      WHERE (? IS NULL OR date(e.scanned_at) >= ?) AND (? IS NULL OR date(e.scanned_at) <= ?)
      ORDER BY e.scanned_at DESC, e.id DESC
      LIMIT ?
    `).all(from, from, to, to, limit)
    const headers = ['Zaman', 'Kişi', 'Tür', 'Olay', 'Öğün', 'Sonuç', 'İstasyon', 'Ham UID']
    const csv = toCsv(headers, rows.map(r => [
      r.scanned_at, r.holder_name || 'Bilinmiyor', r.holder_type || '',
      r.event_type, r.meal_type || '', r.result, r.station_name || '', r.raw_uid || '',
    ]))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="erisim-hareketleri-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send(csv)
  } catch (e) { logger.error('[reports/access-events]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

reportsRouter.get('/personnel', ...mgrAccess, (req, res) => {
  try {
    const rows = service.getAllActivePersonnelSvc()
    const headers = ['ID', 'Ad Soyad', 'TC', 'Pasaport', 'Firma', 'Meslek', 'Memleket', 'Telefon',
      'Cinsiyet', 'Blok', 'Kat', 'Oda', 'Yatak', 'Vardiya', 'Giris', 'Zimmet', 'Disiplin',
      'Karaliste', 'Acil Kisi', 'Acil Tel']
    const csv = toCsv(headers, rows.map(r => [
      r.id, r.full_name, r.tc_no, r.passport_no, r.company, r.job_title, r.hometown, r.phone_number,
      r.gender === 'female' ? 'K' : r.gender === 'male' ? 'E' : '',
      r.block, r.floor, r.room_no, r.bed_no,
      r.shift_type === 'night' ? 'Gece' : 'Gunduz',
      r.check_in_date ? r.check_in_date.slice(0, 10) : '',
      r.active_zimmet, r.discipline_points || 0,
      r.is_blacklisted ? 'EVET' : '',
      r.emergency_name, r.emergency_phone,
    ]))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="personel-listesi-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send(csv)
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/personnel/data', ...mgrAccess, (req, res) => {
  try {
    const rows = service.getAllActivePersonnelSvc()
    res.json({
      total: rows.length,
      with_room: rows.filter(r => r.block).length,
      blacklisted: rows.filter(r => r.is_blacklisted).length,
      with_zimmet: rows.filter(r => r.active_zimmet > 0).length,
      rows,
    })
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Yeni: Envanter CSV ──

// CSV — tüm kalemler
reportsRouter.get('/inventory.csv', ...mgrAccess, (req, res) => {
  try {
    const { items } = service.getInventoryDetailSvc()
    const headers = ['Stok Adi', 'Kategori', 'Lokasyon', 'Miktar', 'Birim', 'Esik', 'Durum',
      'Birim Fiyat', 'Tahmini Deger', 'Son Guncelleme']
    const csv = toCsv(headers, items.map(i => [
      i.item_name, i.category, i.location, i.quantity, i.unit, i.reorder_threshold,
      i.out_of_stock ? 'STOK YOK' : i.below_threshold ? 'YETERSIZ' : 'NORMAL',
      i.unit_price || 0, i.estimated_value || 0,
      i.last_updated ? i.last_updated.slice(0, 10) : '',
    ]))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="envanter-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send(csv)
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// CSV — son 30 gun hareketler
reportsRouter.get('/inventory/movements.csv', ...mgrAccess, (req, res) => {
  try {
    const { movements } = service.getInventoryDetailSvc()
    const headers = ['Tarih', 'Tip', 'Stok', 'Kategori', 'Birim', 'Miktar', 'Stok Sonrasi', 'Sebep', 'Kullanici']
    const csv = toCsv(headers, movements.map(m => [
      m.created_at ? m.created_at.slice(0, 19).replace('T', ' ') : '',
      m.type === 'in' ? 'GIRIS' : m.type === 'out' ? 'CIKIS' : m.type === 'count' ? 'SAYIM' : m.type,
      m.item_name, m.category, m.unit,
      m.delta, m.quantity_after, m.reason || '',
      m.user_name || '',
    ]))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="envanter-hareketler-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send(csv)
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// PDF — zengin ozet
reportsRouter.get('/inventory', ...mgrAccess, (req, res) => {
  try {
    const d = service.getInventoryDetailSvc()
    const tl = (n) => n != null ? Math.round(n).toLocaleString('tr-TR') + ' TL' : '-'
    const totalValue = d.items.reduce((s, i) => s + (i.estimated_value || 0), 0)

    const doc = createPDF(res, 'Envanter Raporu')
    addKpiRow(doc, [
      { label: 'Toplam Kalem', value: d.items.length },
      { label: 'Yetersiz', value: d.lowStock.length, color: d.lowStock.length > 0 ? '#f97316' : '#22c55e' },
      { label: 'Stok Yok', value: d.outOfStock.length, color: d.outOfStock.length > 0 ? '#ef4444' : '#22c55e' },
      { label: 'Toplam Deger', value: tl(totalValue), color: '#0369a1' },
    ])
    addKpiRow(doc, [
      { label: 'Giris (30g)', value: d.movSummary.in, color: '#22c55e' },
      { label: 'Cikis (30g)', value: d.movSummary.out, color: '#f97316' },
      { label: 'Sayim Duzelt.', value: d.movSummary.count_adj },
      { label: 'Hareket (30g)', value: d.movements.length },
    ])

    addSectionTitle(doc, 'Kategori Bazli Ozet')
    addTable(doc,
      ['Kategori', 'Kalem', 'Yetersiz', 'Stok Yok', 'Tahmini Deger'],
      d.byCategory.map(c => [c.category, c.n, c.below, c.out, tl(c.value)]),
      [120, 60, 70, 70, 130]
    )

    if (d.outOfStock.length > 0) {
      addSectionTitle(doc, `⚠ STOK YOK (${d.outOfStock.length} kalem — ACIL SIPARIS)`)
      addTable(doc,
        ['Stok', 'Kategori', 'Lokasyon', 'Esik', 'Birim'],
        d.outOfStock.map(i => [i.item_name, i.category, i.location || '-', i.reorder_threshold, i.unit]),
        [140, 80, 90, 60, 80]
      )
    }

    if (d.lowStock.length > 0) {
      addSectionTitle(doc, `Yetersiz Stok (${d.lowStock.length} kalem)`)
      addTable(doc,
        ['Stok', 'Kategori', 'Mevcut', 'Esik', 'Eksik', 'Birim'],
        d.lowStock.map(i => [
          i.item_name, i.category, i.quantity, i.reorder_threshold,
          Math.max(0, (i.reorder_threshold - i.quantity)).toFixed(1), i.unit,
        ]),
        [140, 75, 60, 60, 60, 60]
      )
    }

    if (d.topValuable.length > 0) {
      addSectionTitle(doc, 'En Degerli 15 Kalem')
      addTable(doc,
        ['Stok', 'Kategori', 'Miktar', 'Birim Fiyat', 'Deger'],
        d.topValuable.map(i => [
          i.item_name, i.category, i.quantity, tl(i.unit_price), tl(i.estimated_value),
        ]),
        [130, 80, 70, 90, 90]
      )
    }

    if (d.topConsumed.length > 0) {
      addSectionTitle(doc, 'En Cok Tuketilen 15 Kalem (son 30 gun)')
      addTable(doc,
        ['Stok', 'Toplam Cikis', 'Birim'],
        d.topConsumed.map(c => [c.item, c.total_out, c.unit]),
        [250, 120, 80]
      )
    }

    if (d.byLocation.length > 0) {
      addSectionTitle(doc, 'Lokasyon Bazli Dagilim')
      addTable(doc,
        ['Lokasyon', 'Kalem', 'Tahmini Deger'],
        d.byLocation.map(l => [l.location, l.n, tl(l.value)]),
        [180, 80, 130]
      )
    }

    addSectionTitle(doc, 'Tum Kalemler')
    addTable(doc,
      ['Stok', 'Kategori', 'Miktar', 'Birim', 'Esik', 'Durum'],
      d.items.slice(0, 200).map(i => [
        i.item_name, i.category, i.quantity, i.unit, i.reorder_threshold,
        i.out_of_stock ? 'STOK YOK' : i.below_threshold ? 'YETERSIZ' : 'NORMAL',
      ]),
      [140, 80, 60, 60, 60, 80]
    )

    if (d.movements.length > 0) {
      addSectionTitle(doc, 'Son Hareketler (50 kayit)')
      addTable(doc,
        ['Tarih', 'Tip', 'Stok', 'Miktar', 'Sebep'],
        d.movements.slice(0, 50).map(m => [
          m.created_at ? m.created_at.slice(0, 16).replace('T', ' ') : '-',
          m.type === 'in' ? 'GIRIS' : m.type === 'out' ? 'CIKIS' : 'SAYIM',
          (m.item_name || '').substring(0, 25),
          m.delta,
          (m.reason || '').substring(0, 30),
        ]),
        [110, 50, 130, 50, 145]
      )
    }
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/inventory/data', ...mgrAccess, (req, res) => {
  try {
    const d = service.getInventoryDetailSvc()
    const totalValue = d.items.reduce((s, i) => s + (i.estimated_value || 0), 0)
    res.json({
      total: d.items.length,
      below_threshold: d.lowStock.length,
      out_of_stock: d.outOfStock.length,
      total_value: Math.round(totalValue),
      movements_30d: d.movements.length,
      categories: d.byCategory.length,
    })
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Yeni: Camasirhane PDF ──

reportsRouter.get('/laundry', ...mgrAccess, (req, res) => {
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

reportsRouter.get('/laundry/data', ...mgrAccess, (req, res) => {
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

// ── Yeni: Vardiya PDF ──

reportsRouter.get('/shifts', ...mgrAccess, (req, res) => {
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

reportsRouter.get('/shifts/data', ...mgrAccess, (req, res) => {
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

// ── H11 R1: Devamsızlık dashboard (vardiya + transport + disiplin) ──
import { getDB as _getDB } from '../../shared/db/index.js'
reportsRouter.get('/absence-dashboard', ...mgrAccess, (req, res) => {
  try {
    const db = _getDB()
    // 1-365 gün arası, parametre validation
    const days = Math.max(1, Math.min(365, +req.query.days || 30))
    // since'i parameterized olarak SQL'e geç
    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - days)
    const since = sinceDate.toISOString().slice(0, 10)

    const summary = db.prepare(`
      SELECT
        COALESCE((SELECT COUNT(*) FROM shift_schedule WHERE status='absent' AND work_date >= ?), 0) as total_shift_absent,
        COALESCE((SELECT COUNT(*) FROM route_assignments WHERE boarded=0 AND is_waitlist=0 AND work_date >= ?), 0) as total_no_show,
        COALESCE((SELECT COUNT(*) FROM discipline_records WHERE created_at >= ?), 0) as total_discipline,
        COALESCE((SELECT COUNT(DISTINCT staff_id) FROM shift_schedule WHERE status='absent' AND work_date >= ?), 0) as unique_absent_staff
    `).get(since, since, since, since)

    const trend = db.prepare(`
      SELECT work_date as date,
        SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) as shift_absent,
        SUM(CASE WHEN status='worked' OR status='overtime' THEN 1 ELSE 0 END) as worked
      FROM shift_schedule
      WHERE work_date >= ?
      GROUP BY work_date
      ORDER BY work_date
    `).all(since)

    const noShowTrend = db.prepare(`
      SELECT work_date as date,
        SUM(CASE WHEN boarded=0 THEN 1 ELSE 0 END) as no_show,
        SUM(CASE WHEN boarded=1 THEN 1 ELSE 0 END) as boarded
      FROM route_assignments
      WHERE is_waitlist=0 AND work_date >= ?
      GROUP BY work_date
      ORDER BY work_date
    `).all(since)

    const byDept = db.prepare(`
      SELECT d.name as dept_name, d.color_class,
        COALESCE(SUM(CASE WHEN ss.status='absent' THEN 1 ELSE 0 END), 0) as shift_absent,
        COALESCE(SUM(CASE WHEN ss.status IN ('worked','overtime') THEN 1 ELSE 0 END), 0) as worked
      FROM departments d
      LEFT JOIN staff s ON s.department_id = d.id
      LEFT JOIN shift_schedule ss ON ss.staff_id = s.id AND ss.work_date >= ?
      GROUP BY d.id
      HAVING worked + shift_absent > 0
      ORDER BY shift_absent DESC
    `).all(since)

    res.json({ days, summary, trend, no_show_trend: noShowTrend, by_dept: byDept })
  } catch (e) { logger.error('[absence-dash]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── H11 R2: Kişi başı maliyet (oda + servis + yemek + KKD + zimmet kesinti) ──
reportsRouter.get('/cost-per-person', ...mgrAccess, (req, res) => {
  try {
    const db = _getDB()
    const month = req.query.month || new Date().toISOString().slice(0, 7)
    const start = `${month}-01`
    const endDate = new Date(start); endDate.setMonth(endDate.getMonth() + 1)
    const end = endDate.toISOString().slice(0, 10)

    const rows = db.prepare(`
      SELECT s.id, s.full_name, s.salary, d.name as dept_name,
        COALESCE((SELECT SUM(COALESCE(cost, 0)) FROM meal_logs WHERE staff_id = s.id AND meal_date >= ? AND meal_date < ?), 0) as meal_cost,
        COALESCE((SELECT COUNT(*) FROM meal_logs WHERE staff_id = s.id AND meal_date >= ? AND meal_date < ?), 0) as meal_count,
        COALESCE((SELECT COUNT(*) FROM route_assignments WHERE staff_id = s.id AND boarded = 1 AND work_date >= ? AND work_date < ?), 0) as transport_count,
        COALESCE((SELECT SUM(amount) FROM payroll_deductions WHERE staff_id = s.id AND period = ?), 0) as deductions,
        COALESCE((SELECT COUNT(*) FROM kkd_assignments WHERE staff_id = s.id AND assigned_at >= ? AND assigned_at < ?), 0) as kkd_count
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE s.is_active = 1
      ORDER BY meal_cost DESC, s.full_name
    `).all(start, end, start, end, start, end, month, start, end)

    res.json({ month, rows })
  } catch (e) { logger.error('[cost-per-person]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── H11 R3: Karşılaştırma (bu ay vs geçen ay) ──
reportsRouter.get('/comparison', ...mgrAccess, (req, res) => {
  try {
    const db = _getDB()
    const month = req.query.month || new Date().toISOString().slice(0, 7)
    function range(ym) {
      const start = `${ym}-01`
      const e = new Date(start); e.setMonth(e.getMonth() + 1)
      return [start, e.toISOString().slice(0, 10)]
    }
    const prev = (() => {
      const d = new Date(`${month}-01`); d.setMonth(d.getMonth() - 1)
      return d.toISOString().slice(0, 7)
    })()
    const [s0, e0] = range(month)
    const [s1, e1] = range(prev)

    function metrics(s, e) {
      return db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM shift_schedule WHERE status IN ('worked','overtime') AND work_date >= ? AND work_date < ?) as worked,
          (SELECT COUNT(*) FROM shift_schedule WHERE status='absent' AND work_date >= ? AND work_date < ?) as absent,
          (SELECT COUNT(*) FROM route_assignments WHERE boarded=0 AND is_waitlist=0 AND work_date >= ? AND work_date < ?) as no_show,
          (SELECT COUNT(*) FROM discipline_records WHERE created_at >= ? AND created_at < ?) as discipline,
          (SELECT COUNT(*) FROM maintenance_requests WHERE opened_at >= ? AND opened_at < ?) as maintenance,
          (SELECT COUNT(*) FROM meal_logs WHERE meal_date >= ? AND meal_date < ?) as meals,
          (SELECT COUNT(DISTINCT staff_id) FROM shift_schedule WHERE work_date >= ? AND work_date < ?) as active_staff
      `).get(s, e, s, e, s, e, s, e, s, e, s, e, s, e)
    }
    const current = metrics(s0, e0)
    const previous = metrics(s1, e1)

    const delta = {}
    Object.keys(current).forEach(k => {
      delta[k] = {
        current: current[k], previous: previous[k],
        diff: current[k] - previous[k],
        pct: previous[k] > 0 ? Math.round((current[k] - previous[k]) / previous[k] * 100) : null,
      }
    })

    res.json({ month, previous_month: prev, current, previous, delta })
  } catch (e) { logger.error('[comparison]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── H11 R4: Özel rapor builder — basit kolon seçici ──
reportsRouter.get('/staff-builder', ...mgrAccess, (req, res) => {
  try {
    const db = _getDB()
    const cols = (req.query.cols || 'full_name,dept_name,phone').split(',').filter(Boolean)
    const ALLOWED = {
      full_name: 's.full_name',
      tc_no: 's.tc_no',
      phone: 's.phone',
      email: 's.email',
      position: 's.position',
      hire_date: 's.hire_date',
      contract_end: 's.contract_end',
      birth_date: 's.birth_date',
      blood_type: 's.blood_type',
      gender: 's.gender',
      salary: 's.salary',
      dept_name: 'd.name as dept_name',
      pickup_name: 'pp.name as pickup_name',
      company_name: 'c.name as company_name',
    }
    const selects = cols.filter(c => ALLOWED[c]).map(c => ALLOWED[c])
    if (!selects.length) selects.push('s.full_name')

    const rows = db.prepare(`
      SELECT s.id, ${selects.join(', ')}
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
      LEFT JOIN personnel p ON p.tc_no IS NOT NULL AND p.tc_no = s.tc_no
      LEFT JOIN companies c ON c.id = p.company_id
      WHERE s.is_active = 1
      ORDER BY s.full_name
      LIMIT 1000
    `).all()

    res.json({ available_columns: Object.keys(ALLOWED), selected: cols, rows })
  } catch (e) { logger.error('[staff-builder]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
