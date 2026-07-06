// Personel listesi CSV/JSON + erişim hareketleri CSV (Faz 10)
import { Router } from 'express'
import { getDB } from '../../../shared/db/index.js'
import * as service from '../service.js'
import { logger } from '../../../shared/logger.js'
import { mgrAccess, toCsv } from './shared.js'

export const personnelReportsRouter = Router()

// ── Erişim hareketleri (giriş/çıkış/yemek/turnike) CSV export (Faz 10) ──
personnelReportsRouter.get('/access-events.csv', ...mgrAccess, (req, res) => {
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

personnelReportsRouter.get('/personnel', ...mgrAccess, (req, res) => {
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

personnelReportsRouter.get('/personnel/data', ...mgrAccess, (req, res) => {
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
