import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'

export const drillsRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

const VALID_TYPES = ['fire', 'earthquake', 'security', 'evacuation', 'other']

// Anlık blokta-kim-var listesi — tahliye/yoklama için.
// Tek kişi-tek satır, blok → kat → oda → yatak sırasıyla.
function fetchRoster(block) {
  const db = getDB()
  const params = []
  let where = 'ra.check_out_at IS NULL'
  if (block) { where += ' AND r.block = ?'; params.push(block) }
  return db.prepare(`
    SELECT p.id, p.full_name, p.company, p.phone_number AS phone,
           r.block, r.floor, r.room_no, ra.bed_no
    FROM room_assignments ra
    JOIN personnel p ON p.id = ra.personnel_id
    JOIN rooms r ON r.id = ra.room_id
    WHERE ${where}
    ORDER BY r.block, r.floor, r.room_no, ra.bed_no, p.full_name
  `).all(...params)
}

drillsRouter.get('/', requireAuth, (req, res) => {
  const db = getDB()
  const rows = db.prepare(`
    SELECT d.*, u.full_name AS created_by_name
    FROM drills d LEFT JOIN users u ON u.id=d.created_by
    ORDER BY d.drill_date DESC LIMIT 200
  `).all()
  res.json(rows)
})

drillsRouter.get('/stats', requireAuth, (req, res) => {
  const db = getDB()
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN date(drill_date) >= date('now', '-365 days') THEN 1 ELSE 0 END) AS last_year,
      MAX(drill_date) AS last_drill,
      (SELECT next_drill_date FROM drills WHERE next_drill_date IS NOT NULL ORDER BY drill_date DESC LIMIT 1) AS upcoming
    FROM drills
  `).get()
  res.json(stats)
})

drillsRouter.post('/', ...mgmt, (req, res) => {
  const b = req.body || {}
  if (!VALID_TYPES.includes(b.drill_type)) return res.status(400).json({ error: 'Geçersiz tatbikat tipi' })
  if (!b.drill_date) return res.status(400).json({ error: 'Tarih gerekli' })
  if (b.actual_count != null && b.actual_count < 0) return res.status(400).json({ error: 'Geçersiz katılım sayısı' })
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO drills (drill_type, drill_date, expected_count, actual_count, duration_minutes,
      missing_names, findings, next_action, next_drill_date, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    b.drill_type, b.drill_date,
    b.expected_count ?? null, b.actual_count ?? null, b.duration_minutes ?? null,
    b.missing_names || null, b.findings || null, b.next_action || null, b.next_drill_date || null,
    req.user.id
  )
  logAudit(req.user.id, 'drill_create', 'drills', r.lastInsertRowid, `${b.drill_type} ${b.drill_date}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

drillsRouter.delete('/:id', ...mgmt, (req, res) => {
  const db = getDB()
  const r = db.prepare('DELETE FROM drills WHERE id=?').run(+req.params.id)
  if (r.changes === 0) return res.status(404).json({ error: 'Bulunamadı' })
  logAudit(req.user.id, 'drill_delete', 'drills', +req.params.id, null)
  res.json({ ok: true })
})

// ── Tahliye / yoklama listesi ───────────────────────────────────────────────
// Yangın tatbikatı veya gerçek tahliye anında "kim içeride" sorusunu yanıtlar.
drillsRouter.get('/roster', requireAuth, (req, res) => {
  const block = (req.query.block || '').toString().trim() || null
  const rows = fetchRoster(block)
  // Bloğa göre gruplama — frontend'e kolay render etsin diye
  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.block)) groups.set(row.block, [])
    groups.get(row.block).push(row)
  }
  res.json({
    generated_at: new Date().toISOString(),
    block_filter: block,
    total: rows.length,
    blocks: Array.from(groups.entries()).map(([b, people]) => ({
      block: b,
      count: people.length,
      people,
    })),
  })
})

drillsRouter.get('/roster.pdf', requireAuth, (req, res) => {
  const block = (req.query.block || '').toString().trim() || null
  const rows = fetchRoster(block)

  const doc = new PDFDocument({ size: 'A4', margin: 36 })
  res.setHeader('Content-Type', 'application/pdf')
  const fnameSuffix = block ? `${block}` : 'tum-bloklar'
  const today = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Disposition', `attachment; filename="tahliye-listesi-${fnameSuffix}-${today}.pdf"`)
  doc.pipe(res)

  doc.fontSize(18).font('Helvetica-Bold').text('TAHLİYE / YOKLAMA LİSTESİ', { align: 'center' })
  doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
    .text(`${new Date().toLocaleString('tr-TR')}  ·  ${block ? `Blok: ${block}` : 'Tüm bloklar'}  ·  Toplam: ${rows.length}`, { align: 'center' })
  doc.fillColor('#000').moveDown(0.8)

  // Bloğa göre grupla
  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.block)) groups.set(row.block, [])
    groups.get(row.block).push(row)
  }

  let first = true
  for (const [blk, people] of groups) {
    if (!first) doc.moveDown(0.6)
    first = false
    doc.fontSize(13).font('Helvetica-Bold').text(`BLOK ${blk}  (${people.length} kişi)`)
    doc.moveTo(36, doc.y + 2).lineTo(560, doc.y + 2).strokeColor('#e5e7eb').stroke()
    doc.moveDown(0.4)

    // Sütun başlıkları
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
    const startY = doc.y
    doc.text('Oda', 36, startY, { width: 60 })
    doc.text('Kat', 96, startY, { width: 30 })
    doc.text('Yatak', 126, startY, { width: 40 })
    doc.text('Ad Soyad', 166, startY, { width: 200 })
    doc.text('Firma', 366, startY, { width: 130 })
    doc.text('Tel', 496, startY, { width: 60 })
    doc.fillColor('#000').moveDown(0.3)

    doc.fontSize(9).font('Helvetica')
    for (const p of people) {
      const y = doc.y
      doc.text(p.room_no || '-', 36, y, { width: 60 })
      doc.text(String(p.floor ?? '-'), 96, y, { width: 30 })
      doc.text(String(p.bed_no ?? '-'), 126, y, { width: 40 })
      doc.text(p.full_name || '-', 166, y, { width: 200 })
      doc.text(p.company || '-', 366, y, { width: 130 })
      doc.text(p.phone || '-', 496, y, { width: 60 })
      doc.moveDown(0.25)
      if (doc.y > 770) doc.addPage()
    }
  }

  if (rows.length === 0) {
    doc.fontSize(11).fillColor('#9ca3af').text('Bu filtreye uyan aktif sakin bulunamadı.', { align: 'center' })
  }

  doc.end()
  logAudit(req.user.id, 'roster_pdf', 'drills', null, block ? `block=${block}` : 'all')
})
