import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { createPDF, addTable, addSectionTitle, addKpiRow, addParagraph } from '../../shared/pdf/generator.js'
import * as service from './service.js'

export const reportsRouter = Router()
const mgrAccess = requireRole('campus_manager', 'shift_supervisor')

reportsRouter.get('/housekeeping/data', ...mgrAccess, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format' })
    res.json(service.getHousekeepingReport(date))
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/maintenance/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getMaintenanceReport()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/occupancy/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getOccupancyReport()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/discipline/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getDisciplineReport()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Yeni raporlar ──

reportsRouter.get('/companies/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getCompaniesReportSvc()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/surveys/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getSurveysReportSvc()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/drills/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getDrillsReportSvc()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/visitors/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getVisitorsReportSvc()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/expenses/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getExpensesReportSvc()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/executive/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getExecutiveReportSvc()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
