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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/maintenance', ...mgrAccess, (req, res) => {
  try {
    const { all, byPriority, byTechnician, hotSpots } = service.getMaintenanceDetailSvc()
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

    addSectionTitle(doc, 'Oncelik Dagilimi')
    addTable(doc,
      ['Oncelik', 'Toplam', 'Kapanan', 'Acik'],
      byPriority.map(p => [p.priority, p.n, p.closed, p.n - p.closed]),
      [120, 90, 90, 90]
    )

    addSectionTitle(doc, 'Teknisyen Performansi')
    addTable(doc,
      ['Teknisyen', 'Toplam', 'Tamamlanan', 'Ort. Saat'],
      byTechnician.map(t => [t.teknisyen, t.toplam, t.tamamlanan, t.ortalama_saat ?? '-']),
      [180, 80, 100, 90]
    )

    if (hotSpots.length > 0) {
      addSectionTitle(doc, 'Sik Ariza Veren Konumlar')
      addTable(doc,
        ['Konum', 'Ariza Sayisi'],
        hotSpots.map(h => [h.location, h.n]),
        [350, 100]
      )
    }

    addSectionTitle(doc, 'Tum Kayitlar')
    addTable(doc,
      ['#', 'Konum', 'Oncelik', 'Durum', 'Teknisyen', 'Saat', 'Acilis'],
      all.slice(0, 100).map(r => [
        r.id, (r.location || '').substring(0, 25), r.priority,
        r.status, r.teknisyen || '-',
        r.hours_elapsed != null ? r.hours_elapsed : '-',
        r.opened_at?.split('T')[0] || '-',
      ]),
      [25, 120, 50, 70, 90, 45, 70]
    )
    doc.end()
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Yeni: Envanter CSV ──

reportsRouter.get('/inventory', ...mgrAccess, (req, res) => {
  try {
    const { items, movements } = service.getInventoryDetailSvc()
    const headers = ['Stok Adi', 'Kategori', 'Lokasyon', 'Miktar', 'Birim', 'Esik', 'Durum',
      'Birim Fiyat', 'Tahmini Deger', 'Son Guncelleme']
    const csv = toCsv(headers, items.map(i => [
      i.item_name, i.category, i.location, i.quantity, i.unit, i.reorder_threshold,
      i.below_threshold ? 'YETERSIZ' : 'NORMAL',
      i.unit_price || 0, i.estimated_value || 0,
      i.last_updated ? i.last_updated.slice(0, 10) : '',
    ]))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="envanter-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send(csv)
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

reportsRouter.get('/inventory/data', ...mgrAccess, (req, res) => {
  try {
    const { items, movements } = service.getInventoryDetailSvc()
    const totalValue = items.reduce((s, i) => s + (i.estimated_value || 0), 0)
    res.json({
      total: items.length,
      below_threshold: items.filter(i => i.below_threshold).length,
      total_value: Math.round(totalValue),
      movements_30d: movements.length,
      items,
    })
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
      { label: 'Teslim Edilen', value: delivered, color: '#22c55e' },
      { label: 'Kayip', value: d.lost, color: '#ef4444' },
      { label: 'Toplam Parca', value: d.total_pieces },
    ])

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

    addSectionTitle(doc, 'Blok Bazli Dagilim')
    addTable(doc,
      ['Blok', 'Islem Sayisi'],
      d.byBlock.map(b => [b.block, b.n]),
      [200, 100]
    )

    addSectionTitle(doc, 'Makine Durumu')
    addTable(doc,
      ['Makine', 'Tip', 'Durum', 'Kapasite (kg)'],
      d.machines.map(m => [m.name, m.type === 'washer' ? 'Camasir' : 'Kurutucu', m.status, m.capacity_kg || '-']),
      [120, 80, 90, 100]
    )

    addSectionTitle(doc, 'Son Islemler')
    addTable(doc,
      ['Tarih', 'Blok-Oda', 'Durum', 'Parca', 'Acil', 'Raf'],
      d.items.slice(0, 80).map(i => [
        i.created_at?.slice(0, 10) || '-',
        i.block && i.room_no ? `${i.block}-${i.room_no}` : '-',
        i.status, i.item_count || 0,
        i.urgent ? 'EVET' : '',
        i.shelf_location || '-',
      ]),
      [70, 80, 80, 50, 50, 70]
    )
    doc.end()
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
    ])

    addSectionTitle(doc, 'Blok x Vardiya Dagilimi')
    addTable(doc,
      ['Blok', 'Gunduz', 'Gece', 'Toplam', 'Gece %'],
      d.byBlockShift.map(b => [
        b.block, b.gunduz, b.gece, b.toplam,
        `%${b.toplam ? Math.round(b.gece / b.toplam * 100) : 0}`,
      ]),
      [80, 80, 80, 80, 80]
    )

    addSectionTitle(doc, 'Firma x Vardiya')
    addTable(doc,
      ['Firma', 'Gunduz', 'Gece', 'Toplam'],
      d.byCompanyShift.map(c => [c.company, c.gunduz, c.gece, c.toplam]),
      [200, 80, 80, 80]
    )

    addSectionTitle(doc, `Gece Vardiyasindaki Personel (${d.nightShiftList.length})`)
    addTable(doc,
      ['Ad Soyad', 'Firma', 'Meslek', 'Oda'],
      d.nightShiftList.map(p => [
        p.full_name, p.company || '-', p.job_title || '-',
        p.block ? `${p.block}-${p.room_no}${p.bed_no ? '/' + p.bed_no : ''}` : '-',
      ]),
      [140, 110, 110, 100]
    )
    doc.end()
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
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
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
