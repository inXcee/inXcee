import { Router } from 'express'
import { randomBytes } from 'crypto'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import { createAttendanceLog, updateCheckout } from '../shifts/queries.js'

export const qrRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor', 'laundry', 'housekeeper', 'technical')

function genToken() {
  return randomBytes(10).toString('hex') // 20 hex char, çakışma olasılığı sıfıra yakın
}

// ── Q1: Personel için QR token üret veya getir ──
qrRouter.post('/staff/:id/generate', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const staff = db.prepare('SELECT id, qr_token FROM staff WHERE id = ?').get(+req.params.id)
    if (!staff) return res.status(404).json({ error: 'Personel bulunamadı' })
    let token = staff.qr_token
    if (!token || req.body?.regenerate) {
      token = genToken()
      db.prepare('UPDATE staff SET qr_token = ? WHERE id = ?').run(token, +req.params.id)
      logAudit(req.user.id, 'qr_generate', 'qr', +req.params.id, '')
    }
    res.json({ qr_token: token })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Q1: Toplu üret (tüm aktif personel için eksikleri doldur) ──
qrRouter.post('/bulk-generate', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const missing = db.prepare(`SELECT id FROM staff WHERE is_active = 1 AND (qr_token IS NULL OR qr_token = '')`).all()
    const stmt = db.prepare('UPDATE staff SET qr_token = ? WHERE id = ?')
    const tx = db.transaction(() => {
      missing.forEach(s => stmt.run(genToken(), s.id))
    })
    tx()
    logAudit(req.user.id, 'qr_bulk_generate', 'qr', null, `${missing.length} personel`)
    res.json({ generated: missing.length })
  } catch (e) { console.error('[qr/bulk]', e); res.status(400).json({ error: e.message }) }
})

// ── Q1: Mevcut staff'ın QR'ı (kendisi için) ──
qrRouter.get('/staff/:id', ...view, (req, res) => {
  try {
    const db = getDB()
    const staff = db.prepare(`
      SELECT s.id, s.full_name, s.qr_token, s.tc_no, s.position,
        d.name as dept_name
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE s.id = ?
    `).get(+req.params.id)
    if (!staff) return res.status(404).json({ error: 'Personel bulunamadı' })
    res.json(staff)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Q2: Personel kart PDF ──
qrRouter.get('/staff/:id/card/pdf', ...view, async (req, res) => {
  try {
    const db = getDB()
    const staff = db.prepare(`
      SELECT s.full_name, s.tc_no, s.position, s.phone, s.qr_token, s.blood_type,
        d.name as dept_name, d.color_class as dept_color,
        c.name as company_name
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN personnel p ON p.tc_no IS NOT NULL AND p.tc_no = s.tc_no
      LEFT JOIN companies c ON c.id = p.company_id
      WHERE s.id = ?
    `).get(+req.params.id)
    if (!staff) return res.status(404).json({ error: 'Personel bulunamadı' })
    if (!staff.qr_token) return res.status(400).json({ error: 'QR henüz üretilmemiş — önce QR oluştur' })

    const qrDataUrl = await QRCode.toDataURL(`AVS:${staff.qr_token}`, { width: 300, margin: 1 })

    // Kart: 86 × 54 mm (ID-1 boyutu) — A4'te yatay tek kart üretiyoruz
    const cardW = 245, cardH = 154 // pt (~86x54mm)
    const doc = new PDFDocument({ size: [cardW + 40, cardH + 40], margin: 20 })
    res.setHeader('Content-Type', 'application/pdf')
    const safeName = (staff.full_name || 'kart').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 40)
    res.setHeader('Content-Disposition', `attachment; filename="kart-${safeName}.pdf"`)
    doc.pipe(res)

    // Çerçeve
    doc.lineWidth(1).strokeColor('#1f2937')
    doc.roundedRect(20, 20, cardW, cardH, 8).stroke()

    // Sol şerit (rota rengi yerine accent)
    doc.fillColor('#3b82f6').roundedRect(20, 20, 8, cardH, 4).fill()

    // Başlık
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('AVS PERSONEL KARTI', 40, 30)
    doc.fillColor('#6b7280').font('Helvetica').fontSize(7).text('avskamp.com', 40, 42)

    // Ad + departman
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13)
      .text(staff.full_name || '—', 40, 58, { width: 150 })
    doc.fillColor('#374151').font('Helvetica').fontSize(8)
      .text(staff.dept_name || '', 40, 78, { width: 150 })
    if (staff.position) doc.text(staff.position, 40, 90, { width: 150 })

    // Telefon + TC
    doc.fillColor('#6b7280').fontSize(7)
    if (staff.tc_no) doc.text(`TC: ${staff.tc_no}`, 40, 110)
    if (staff.phone) doc.text(`Tel: ${staff.phone}`, 40, 120)
    if (staff.blood_type) doc.text(`Kan: ${staff.blood_type}`, 40, 130)
    if (staff.company_name) doc.text(staff.company_name, 40, 142, { width: 150 })

    // QR (sağda)
    doc.image(qrDataUrl, cardW - 70, 40, { width: 80, height: 80 })
    doc.fillColor('#94a3b8').fontSize(6).text(`#${staff.qr_token.slice(0, 6).toUpperCase()}`, cardW - 70, 125, { width: 80, align: 'center' })

    doc.end()
  } catch (e) {
    console.error('[qr/card]', e)
    if (!res.headersSent) res.status(500).json({ error: 'PDF üretilemedi' })
  }
})

// ── Q4: QR scan → servis biniş okutma ──
qrRouter.post('/scan/transport', ...view, (req, res) => {
  try {
    const { qr_token, date, route_id } = req.body || {}
    if (!qr_token) return res.status(400).json({ error: 'qr_token gerekli' })
    const cleaned = qr_token.replace(/^AVS:/, '').trim()

    const db = getDB()
    const staff = db.prepare('SELECT id, full_name FROM staff WHERE qr_token = ?').get(cleaned)
    if (!staff) return res.status(404).json({ error: 'Geçersiz QR kod' })

    const workDate = date || new Date().toISOString().slice(0, 10)
    let query = `SELECT id, route_id, boarded FROM route_assignments WHERE staff_id = ? AND work_date = ?`
    const params = [staff.id, workDate]
    if (route_id) { query += ' AND route_id = ?'; params.push(+route_id) }

    const assignment = db.prepare(query).get(...params)
    if (!assignment) return res.status(404).json({
      error: `${staff.full_name}: ${workDate} için servis ataması yok`,
      staff_id: staff.id, staff_name: staff.full_name,
    })

    db.prepare(`
      UPDATE route_assignments
      SET boarded = 1, boarded_marked_at = CURRENT_TIMESTAMP, boarded_marked_by = ?
      WHERE id = ?
    `).run(req.user.id, assignment.id)

    logAudit(req.user.id, 'qr_scan_transport', 'qr', staff.id, `assignment:${assignment.id} bindi`)
    res.json({
      ok: true,
      staff_id: staff.id, staff_name: staff.full_name,
      assignment_id: assignment.id, route_id: assignment.route_id,
      previous_boarded: assignment.boarded,
    })
  } catch (e) { console.error('[qr/scan]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── D1: QR clock-in/out — gerçek mesai giriş/çıkış damgası ──
// Aynı QR: bugün açık kaydı yoksa GİRİŞ, açık kayıt varsa ÇIKIŞ (actual_hours hesaplanır).
// Çift okutma koruması: girişten sonraki 2 dk içinde tekrar okutma çıkış sayılmaz.
qrRouter.post('/scan/clock', ...view, (req, res) => {
  try {
    const { qr_token } = req.body || {}
    if (!qr_token) return res.status(400).json({ error: 'qr_token gerekli' })
    const cleaned = qr_token.replace(/^AVS:/, '').trim()

    const db = getDB()
    const staff = db.prepare('SELECT id, full_name FROM staff WHERE qr_token = ? AND is_active = 1').get(cleaned)
    if (!staff) return res.status(404).json({ error: 'Geçersiz QR kod' })

    const open = db.prepare(`
      SELECT id, check_in_at,
        (julianday('now') - julianday(check_in_at)) * 1440 as age_min
      FROM attendance_logs
      WHERE staff_id = ? AND check_out_at IS NULL AND date(check_in_at) = date('now')
      ORDER BY id DESC LIMIT 1
    `).get(staff.id)

    if (open) {
      if (open.age_min < 2) {
        return res.status(409).json({
          error: `${staff.full_name}: az önce giriş okutuldu — çıkış için en az 2 dk bekleyin`,
          staff_id: staff.id, staff_name: staff.full_name,
        })
      }
      updateCheckout(open.id)
      const done = db.prepare('SELECT actual_hours FROM attendance_logs WHERE id = ?').get(open.id)
      logAudit(req.user.id, 'qr_clock_out', 'qr', staff.id, `log:${open.id} ${done.actual_hours}sa`)
      return res.json({
        ok: true, action: 'out',
        staff_id: staff.id, staff_name: staff.full_name,
        log_id: open.id, actual_hours: done.actual_hours,
      })
    }

    const sched = db.prepare(`
      SELECT id FROM shift_schedule WHERE staff_id = ? AND work_date = date('now')
    `).get(staff.id)
    const logId = createAttendanceLog({ staff_id: staff.id, shift_schedule_id: sched?.id || null })
    logAudit(req.user.id, 'qr_clock_in', 'qr', staff.id, `log:${logId}${sched ? ' shift:' + sched.id : ''}`)
    res.json({
      ok: true, action: 'in',
      staff_id: staff.id, staff_name: staff.full_name, log_id: logId,
    })
  } catch (e) { console.error('[qr/clock]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Mobile self-service: kişinin kendi QR'ı (Q6) ──
// kiosk token gerektirir; staff_self.js gibi ayrı bir endpoint daha hijyenik olurdu
// burada kiosk requireKioskOrStaff'la self-service'te ekliyoruz değil — direkt staff PIN ile yapılır
