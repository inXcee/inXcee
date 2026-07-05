import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'

export const safetyRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor', 'technical')

// ── IG1: Eğitim oturumları CRUD ──
safetyRouter.get('/sessions', ...view, (req, res) => {
  try {
    const db = getDB()
    let q = `
      SELECT t.*,
        (SELECT COUNT(*) FROM training_attendances WHERE session_id = t.id) as registered_count,
        (SELECT COUNT(*) FROM training_attendances WHERE session_id = t.id AND attended = 1) as attended_count
      FROM training_sessions t
      WHERE 1=1
    `
    const params = []
    if (req.query.category) { q += ' AND t.category = ?'; params.push(req.query.category) }
    if (req.query.status) { q += ' AND t.status = ?'; params.push(req.query.status) }
    if (req.query.from) { q += ' AND t.session_date >= ?'; params.push(req.query.from) }
    if (req.query.to) { q += ' AND t.session_date <= ?'; params.push(req.query.to) }
    q += ' ORDER BY t.session_date DESC LIMIT 200'
    res.json(db.prepare(q).all(...params))
  } catch (e) { console.error('[safety/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.get('/sessions/:id', ...view, (req, res) => {
  try {
    const db = getDB()
    const head = db.prepare('SELECT * FROM training_sessions WHERE id=?').get(+req.params.id)
    if (!head) return res.status(404).json({ error: 'Bulunamadı' })
    const attendances = db.prepare(`
      SELECT a.*, s.full_name, s.tc_no, d.name as dept_name
      FROM training_attendances a
      JOIN staff s ON s.id = a.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE a.session_id = ?
      ORDER BY s.full_name
    `).all(+req.params.id)
    res.json({ ...head, attendances })
  } catch (e) { console.error('[safety/get]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.post('/sessions', ...mgr, (req, res) => {
  try {
    const { title, category, session_date, duration_min, location, instructor, notes } = req.body || {}
    if (!title || !category || !session_date) {
      return res.status(400).json({ error: 'title, category, session_date gerekli' })
    }
    if (!['safety', 'fire', 'first_aid', 'environment', 'quality', 'other'].includes(category)) {
      return res.status(400).json({ error: 'Geçersiz kategori' })
    }
    const id = getDB().prepare(`
      INSERT INTO training_sessions(title, category, session_date, duration_min, location, instructor, notes, created_by)
      VALUES(?,?,?,?,?,?,?,?)
    `).run(title, category, session_date, duration_min || 60, location || null, instructor || null, notes || null, req.user.id).lastInsertRowid
    logAudit(req.user.id, 'training_session_create', 'safety', id, `${title} ${session_date}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.put('/sessions/:id', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const fields = ['title', 'category', 'session_date', 'duration_min', 'location', 'instructor', 'notes', 'status']
    const sets = []
    const params = []
    fields.forEach(f => {
      if (req.body[f] !== undefined) { sets.push(`${f}=?`); params.push(req.body[f] === '' ? null : req.body[f]) }
    })
    if (!sets.length) return res.json({ ok: true })
    params.push(+req.params.id)
    db.prepare(`UPDATE training_sessions SET ${sets.join(',')} WHERE id=?`).run(...params)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.delete('/sessions/:id', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM training_sessions WHERE id=?').run(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Katılım ekleme/güncelleme ──
safetyRouter.post('/sessions/:id/attendances', ...mgr, (req, res) => {
  try {
    const sessionId = +req.params.id
    const { staff_ids, staff_id, attended, score, cert_expires_at } = req.body || {}
    const ids = Array.isArray(staff_ids) ? staff_ids : (staff_id ? [staff_id] : [])
    if (!ids.length) return res.status(400).json({ error: 'staff_id veya staff_ids gerekli' })

    const db = getDB()
    const stmt = db.prepare(`
      INSERT INTO training_attendances(session_id, staff_id, attended, score, cert_expires_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(session_id, staff_id) DO UPDATE SET
        attended = COALESCE(excluded.attended, attended),
        score = COALESCE(excluded.score, score),
        cert_expires_at = COALESCE(excluded.cert_expires_at, cert_expires_at)
    `)
    const tx = db.transaction(() => {
      ids.forEach(sid => stmt.run(sessionId, +sid, attended ? 1 : 0, score ?? null, cert_expires_at || null))
    })
    tx()
    res.json({ ok: true, count: ids.length })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.delete('/attendances/:id', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM training_attendances WHERE id=?').run(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── IG2: Sertifika uyarıları (yakın bitiş) ──
safetyRouter.get('/expiring-certs', ...view, (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30))
    const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
    const rows = getDB().prepare(`
      SELECT a.id as attendance_id, a.cert_expires_at, a.score,
        t.id as session_id, t.title, t.category,
        s.id as staff_id, s.full_name, s.phone,
        d.name as dept_name, d.color_class as dept_color
      FROM training_attendances a
      JOIN training_sessions t ON t.id = a.session_id
      JOIN staff s ON s.id = a.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE a.cert_expires_at IS NOT NULL
        AND a.cert_expires_at <= ?
        AND a.attended = 1
        AND s.is_active = 1
      ORDER BY a.cert_expires_at
    `).all(cutoff)
    res.json(rows)
  } catch (e) { console.error('[safety/expiring]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Personelin sertifika geçmişi
safetyRouter.get('/staff/:id/training', ...view, (req, res) => {
  try {
    const rows = getDB().prepare(`
      SELECT a.id as attendance_id, a.attended, a.score, a.cert_expires_at,
        t.id as session_id, t.title, t.category, t.session_date
      FROM training_attendances a
      JOIN training_sessions t ON t.id = a.session_id
      WHERE a.staff_id = ?
      ORDER BY t.session_date DESC
    `).all(+req.params.id)
    res.json(rows)
  } catch (e) { console.error('[safety/staff-training]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── IG3: KKD zimmet CRUD ──
safetyRouter.get('/kkd', ...view, (req, res) => {
  try {
    const db = getDB()
    let q = `
      SELECT k.*, s.full_name, s.tc_no, d.name as dept_name
      FROM kkd_assignments k
      JOIN staff s ON s.id = k.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE 1=1
    `
    const params = []
    if (req.query.staff_id) { q += ' AND k.staff_id = ?'; params.push(+req.query.staff_id) }
    if (req.query.active === '1') q += ' AND k.returned_at IS NULL'
    if (req.query.active === '0') q += ' AND k.returned_at IS NOT NULL'
    q += ' ORDER BY k.assigned_at DESC LIMIT 200'
    res.json(db.prepare(q).all(...params))
  } catch (e) { console.error('[safety/kkd-list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.post('/kkd', ...mgr, (req, res) => {
  try {
    const { staff_id, item_type, size, serial_no, notes } = req.body || {}
    if (!staff_id || !item_type) return res.status(400).json({ error: 'staff_id ve item_type gerekli' })
    const id = getDB().prepare(`
      INSERT INTO kkd_assignments(staff_id, item_type, size, serial_no, notes, assigned_by)
      VALUES(?,?,?,?,?,?)
    `).run(+staff_id, item_type, size || null, serial_no || null, notes || null, req.user.id).lastInsertRowid
    logAudit(req.user.id, 'kkd_assign', 'safety', id, `${item_type} → staff:${staff_id}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.post('/kkd/:id/return', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const existing = db.prepare('SELECT returned_at FROM kkd_assignments WHERE id=?').get(+req.params.id)
    if (!existing) return res.status(404).json({ error: 'Bulunamadı' })
    if (existing.returned_at) return res.status(400).json({ error: 'Zaten iade edildi' })
    db.prepare(`
      UPDATE kkd_assignments
      SET returned_at = CURRENT_TIMESTAMP, returned_by = ?, condition_on_return = ?
      WHERE id = ?
    `).run(req.user.id, req.body?.condition || null, +req.params.id)
    logAudit(req.user.id, 'kkd_return', 'safety', +req.params.id, req.body?.condition || '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.delete('/kkd/:id', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM kkd_assignments WHERE id=?').run(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── K1: İş kazası kayıt modülü ──
const ACCIDENT_SEVERITIES = ['none', 'first_aid', 'medical', 'lost_time', 'fatal']
const ACCIDENT_STATUSES = ['open', 'investigating', 'closed']
const SEVERITY_TR = {
  none: 'Yaralanma yok', first_aid: 'Ilk yardim', medical: 'Tibbi mudahale',
  lost_time: 'Is gunu kayipli', fatal: 'Olumlu',
}

safetyRouter.get('/accidents', ...view, (req, res) => {
  try {
    const db = getDB()
    let q = `
      SELECT a.*, s.full_name, s.tc_no, d.name as dept_name,
        (SELECT COUNT(*) FROM work_accident_witnesses WHERE accident_id = a.id) as witness_count,
        (SELECT COUNT(*) FROM work_accident_photos WHERE accident_id = a.id) as photo_count
      FROM work_accidents a
      JOIN staff s ON s.id = a.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE 1=1
    `
    const params = []
    if (req.query.status) { q += ' AND a.status = ?'; params.push(req.query.status) }
    if (req.query.severity) { q += ' AND a.severity = ?'; params.push(req.query.severity) }
    if (req.query.staff_id) { q += ' AND a.staff_id = ?'; params.push(+req.query.staff_id) }
    if (req.query.from) { q += ' AND a.accident_date >= ?'; params.push(req.query.from) }
    if (req.query.to) { q += ' AND a.accident_date <= ?'; params.push(req.query.to) }
    q += ' ORDER BY a.accident_date DESC, a.id DESC LIMIT 200'
    res.json(db.prepare(q).all(...params))
  } catch (e) { console.error('[safety/accidents]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.get('/accidents/:id', ...view, (req, res) => {
  try {
    const db = getDB()
    const head = db.prepare(`
      SELECT a.*, s.full_name, s.tc_no, s.position, s.hire_date, d.name as dept_name
      FROM work_accidents a
      JOIN staff s ON s.id = a.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE a.id = ?
    `).get(+req.params.id)
    if (!head) return res.status(404).json({ error: 'Bulunamadı' })
    const witnesses = db.prepare(`
      SELECT w.*, s.full_name as staff_name FROM work_accident_witnesses w
      LEFT JOIN staff s ON s.id = w.staff_id
      WHERE w.accident_id = ? ORDER BY w.id
    `).all(+req.params.id)
    const photos = db.prepare('SELECT * FROM work_accident_photos WHERE accident_id = ? ORDER BY id').all(+req.params.id)
    res.json({ ...head, witnesses, photos })
  } catch (e) { console.error('[safety/accident-get]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.post('/accidents', ...mgr, (req, res) => {
  try {
    const {
      staff_id, accident_date, accident_time, location, description,
      injury_type, body_part, severity, lost_days, actions_taken,
    } = req.body || {}
    if (!staff_id || !accident_date || !description) {
      return res.status(400).json({ error: 'staff_id, accident_date, description gerekli' })
    }
    if (severity && !ACCIDENT_SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: 'Geçersiz severity' })
    }
    const id = getDB().prepare(`
      INSERT INTO work_accidents(staff_id, accident_date, accident_time, location, description,
        injury_type, body_part, severity, lost_days, actions_taken, reported_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      +staff_id, accident_date, accident_time || null, location || null, description,
      injury_type || null, body_part || null, severity || 'first_aid',
      +lost_days || 0, actions_taken || null, req.user.id,
    ).lastInsertRowid
    logAudit(req.user.id, 'accident_create', 'safety', id, `staff:${staff_id} ${accident_date} ${severity || 'first_aid'}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.put('/accidents/:id', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const existing = db.prepare('SELECT id FROM work_accidents WHERE id=?').get(+req.params.id)
    if (!existing) return res.status(404).json({ error: 'Bulunamadı' })
    if (req.body?.severity && !ACCIDENT_SEVERITIES.includes(req.body.severity)) {
      return res.status(400).json({ error: 'Geçersiz severity' })
    }
    if (req.body?.status && !ACCIDENT_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: 'Geçersiz status' })
    }
    const fields = ['accident_date', 'accident_time', 'location', 'description', 'injury_type',
      'body_part', 'severity', 'lost_days', 'sgk_reported', 'sgk_report_date', 'actions_taken', 'status']
    const sets = []
    const params = []
    fields.forEach(f => {
      if (req.body?.[f] !== undefined) { sets.push(`${f}=?`); params.push(req.body[f] === '' ? null : req.body[f]) }
    })
    if (!sets.length) return res.status(400).json({ error: 'Güncellenecek alan yok' })
    params.push(+req.params.id)
    db.prepare(`UPDATE work_accidents SET ${sets.join(',')} WHERE id=?`).run(...params)
    logAudit(req.user.id, 'accident_update', 'safety', +req.params.id, sets.join(','))
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.delete('/accidents/:id', ...mgr, (req, res) => {
  try {
    getDB().prepare('DELETE FROM work_accidents WHERE id=?').run(+req.params.id)
    logAudit(req.user.id, 'accident_delete', 'safety', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.post('/accidents/:id/witnesses', ...mgr, (req, res) => {
  try {
    const { staff_id, full_name, statement } = req.body || {}
    if (!full_name) return res.status(400).json({ error: 'full_name gerekli' })
    const exists = getDB().prepare('SELECT id FROM work_accidents WHERE id=?').get(+req.params.id)
    if (!exists) return res.status(404).json({ error: 'Kaza kaydı bulunamadı' })
    const id = getDB().prepare(`
      INSERT INTO work_accident_witnesses(accident_id, staff_id, full_name, statement)
      VALUES(?,?,?,?)
    `).run(+req.params.id, staff_id ? +staff_id : null, full_name, statement || null).lastInsertRowid
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.delete('/accidents/witnesses/:wid', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM work_accident_witnesses WHERE id=?').run(+req.params.wid); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.post('/accidents/:id/photos', ...mgr, upload.single('photo'), verifyMagicBytes, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'photo dosyası gerekli' })
    const exists = getDB().prepare('SELECT id FROM work_accidents WHERE id=?').get(+req.params.id)
    if (!exists) return res.status(404).json({ error: 'Kaza kaydı bulunamadı' })
    const url = `/uploads/${req.file.filename}`
    const id = getDB().prepare('INSERT INTO work_accident_photos(accident_id, url) VALUES(?,?)')
      .run(+req.params.id, url).lastInsertRowid
    res.status(201).json({ id, url })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.delete('/accidents/photos/:pid', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM work_accident_photos WHERE id=?').run(+req.params.pid); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// K1 — SİF benzeri kaza raporu PDF
safetyRouter.get('/accidents/:id/pdf', ...view, (req, res) => {
  try {
    const db = getDB()
    const a = db.prepare(`
      SELECT a.*, s.full_name, s.tc_no, s.position, s.hire_date, d.name as dept_name,
        u.username as reporter_name
      FROM work_accidents a
      JOIN staff s ON s.id = a.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN users u ON u.id = a.reported_by
      WHERE a.id = ?
    `).get(+req.params.id)
    if (!a) return res.status(404).json({ error: 'Bulunamadı' })
    const witnesses = db.prepare(`
      SELECT w.*, s.full_name as staff_name FROM work_accident_witnesses w
      LEFT JOIN staff s ON s.id = w.staff_id WHERE w.accident_id = ? ORDER BY w.id
    `).all(+req.params.id)

    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="is-kazasi-${a.id}.pdf"`)
    doc.pipe(res)

    doc.fontSize(16).font('Helvetica-Bold').text('IS KAZASI TESPIT TUTANAGI', { align: 'center' })
    doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
      .text(`Kayit No: KAZA-${a.id}  |  Olusturma: ${new Date().toLocaleDateString('tr-TR')}`, { align: 'center' })
    doc.fillColor('#000').moveDown(1.2)

    const section = (title) => {
      doc.moveDown(0.6)
      doc.fontSize(11).font('Helvetica-Bold').text(title, 50)
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#e5e7eb').stroke().strokeColor('#000')
      doc.font('Helvetica').fontSize(9).moveDown(0.4)
    }

    section('Kazazede Bilgileri')
    const iy = doc.y
    doc.text(`Ad Soyad: ${a.full_name}`, 50, iy)
    doc.text(`T.C. Kimlik No: ${a.tc_no || '—'}`, 300, iy)
    doc.text(`Departman: ${a.dept_name || '—'}`, 50, iy + 14)
    doc.text(`Pozisyon: ${a.position || '—'}`, 300, iy + 14)
    doc.text(`Ise Giris: ${a.hire_date || '—'}`, 50, iy + 28)
    doc.y = iy + 46

    section('Kaza Bilgileri')
    const ky = doc.y
    doc.text(`Tarih: ${a.accident_date}${a.accident_time ? ' ' + a.accident_time : ''}`, 50, ky)
    doc.text(`Yer: ${a.location || '—'}`, 300, ky)
    doc.text(`Siddet: ${SEVERITY_TR[a.severity] || a.severity}`, 50, ky + 14)
    doc.text(`Kayip Is Gunu: ${a.lost_days || 0}`, 300, ky + 14)
    doc.text(`Yaralanma Turu: ${a.injury_type || '—'}`, 50, ky + 28)
    doc.text(`Etkilenen Uzuv: ${a.body_part || '—'}`, 300, ky + 28)
    doc.text(`SGK Bildirimi: ${a.sgk_reported ? 'Yapildi' + (a.sgk_report_date ? ' (' + a.sgk_report_date + ')' : '') : 'Yapilmadi'}`, 50, ky + 42)
    doc.y = ky + 60

    section('Kaza Tanimi')
    doc.text(a.description, 50, doc.y, { width: 495, align: 'justify' })
    doc.moveDown(0.5)

    if (a.actions_taken) {
      section('Alinan Onlemler')
      doc.text(a.actions_taken, 50, doc.y, { width: 495, align: 'justify' })
      doc.moveDown(0.5)
    }

    section(`Taniklar (${witnesses.length})`)
    if (!witnesses.length) {
      doc.fillColor('#6b7280').text('Tanik kaydi yok', 50).fillColor('#000')
    } else {
      witnesses.forEach((w, i) => {
        if (doc.y > 700) { doc.addPage(); doc.y = 50 }
        doc.font('Helvetica-Bold').text(`${i + 1}. ${w.full_name}${w.staff_name ? ' (personel)' : ''}`, 50)
        doc.font('Helvetica')
        if (w.statement) doc.fillColor('#374151').text(`Ifade: ${w.statement}`, 60, doc.y, { width: 480 }).fillColor('#000')
        doc.moveDown(0.4)
      })
    }

    if (doc.y > 650) { doc.addPage(); doc.y = 50 }
    doc.moveDown(2)
    const sy = doc.y
    doc.fontSize(9)
    doc.text('Isveren / Yetkili', 60, sy, { width: 150 })
    doc.text('Kazazede', 230, sy, { width: 150 })
    doc.text('Tanik', 400, sy, { width: 150 })
    doc.moveTo(60, sy + 45).lineTo(190, sy + 45).stroke()
    doc.moveTo(230, sy + 45).lineTo(360, sy + 45).stroke()
    doc.moveTo(400, sy + 45).lineTo(530, sy + 45).stroke()

    doc.fontSize(7).fillColor('#9ca3af')
      .text('Bu tutanak 6331 sayili Is Sagligi ve Guvenligi Kanunu kapsaminda ic kayit amaclidir. SGK bildirimi icin resmi SIF formu ayrica duzenlenmelidir.',
        50, doc.page.height - 60, { align: 'center', width: 495 })

    doc.end()
    logAudit(req.user.id, 'accident_pdf', 'safety', a.id, `KAZA-${a.id}`)
  } catch (e) {
    console.error('[safety/accident-pdf]', e)
    if (!res.headersSent) res.status(500).json({ error: 'PDF olusturulamadi' })
  }
})
