import { Router } from 'express'
import { randomBytes } from 'crypto'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { validate } from '../../shared/middleware/validate.js'
import { bulkIssueSchema, issueSchema, bindNfcSchema } from './schemas.js'

export const cardsRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor', 'laundry', 'housekeeper', 'technical')

const HOLDER_TYPES = ['staff', 'personnel', 'visitor']
const CARD_TYPES = ['access', 'meal']
// Kart tipi → kod prefix + PDF görünümü (renk + başlık)
const CARD_META = {
  access: { prefix: 'AVS-A:', title: 'GİRİŞ KARTI', accent: '#2563eb', badge: 'GİRİŞ' },
  meal:   { prefix: 'AVS-M:', title: 'YEMEK KARTI', accent: '#ea580c', badge: 'YEMEK' },
}

function genCode(cardType) {
  return CARD_META[cardType].prefix + randomBytes(10).toString('hex') // 20 hex char
}

// Aktif kartı bul (kişi + tip)
function activeCard(db, holderType, holderId, cardType) {
  return db.prepare(
    `SELECT * FROM cards WHERE holder_type=? AND holder_id=? AND card_type=? AND status='active'`
  ).get(holderType, holderId, cardType)
}

// ── Toplu üret: aktif staff'ın eksik kartlarını doldur ──
cardsRouter.post('/bulk-issue', ...mgr, validate(bulkIssueSchema), (req, res) => {
  try {
    const cardType = req.validated.card_type
    const db = getDB()
    const missing = db.prepare(`
      SELECT id FROM staff
      WHERE is_active = 1
        AND id NOT IN (SELECT holder_id FROM cards WHERE holder_type='staff' AND card_type=? AND status='active')
    `).all(cardType)
    const stmt = db.prepare(`INSERT INTO cards(holder_type, holder_id, card_type, code, issued_by) VALUES('staff',?,?,?,?)`)
    const tx = db.transaction(() => { missing.forEach(s => stmt.run(s.id, cardType, genCode(cardType), req.user.id)) })
    tx()
    logAudit(req.user.id, 'card_bulk_issue', 'cards', null, `${cardType}: ${missing.length}`)
    res.json({ generated: missing.length })
  } catch (e) { logger.error('[cards/bulk-issue]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Kart üret (amaç bazında) ──
cardsRouter.post('/:holderType/:holderId/issue', ...mgr, validate(issueSchema), (req, res) => {
  try {
    const { holderType, holderId } = req.params
    const { card_type: cardType, regenerate, nfc_uid, valid_until } = req.validated
    if (!HOLDER_TYPES.includes(holderType)) return res.status(400).json({ error: 'Geçersiz holderType' })

    const db = getDB()
    const existing = activeCard(db, holderType, +holderId, cardType)
    if (existing && !regenerate) {
      return res.json({ id: existing.id, code: existing.code, card_type: existing.card_type, status: existing.status })
    }

    const code = genCode(cardType)
    const nfcUid = nfc_uid || null
    const validUntil = valid_until || null  // Faz 5b: süreli (ziyaretçi) kart; null=süresiz
    const result = db.transaction(() => {
      if (existing) {
        db.prepare(`UPDATE cards SET status='revoked', revoked_at=datetime('now') WHERE id=?`).run(existing.id)
      }
      return db.prepare(`
        INSERT INTO cards(holder_type, holder_id, card_type, code, nfc_uid, valid_until, issued_by)
        VALUES(?,?,?,?,?,?,?)
      `).run(holderType, +holderId, cardType, code, nfcUid, validUntil, req.user.id).lastInsertRowid
    })()
    logAudit(req.user.id, 'card_issue', 'cards', result, `${holderType}:${holderId} ${cardType}`)
    res.status(201).json({ id: result, code, card_type: cardType, status: 'active' })
  } catch (e) {
    if (e.message?.includes('UNIQUE') && e.message?.includes('nfc_uid')) {
      return res.status(409).json({ error: 'Bu NFC etiketi başka karta bağlı' })
    }
    logger.error('[cards/issue]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// ── Kayıp/iptal ──
cardsRouter.patch('/:id/revoke', ...mgr, (req, res) => {
  try {
    const r = getDB().prepare(`UPDATE cards SET status='revoked', revoked_at=datetime('now') WHERE id=?`).run(+req.params.id)
    if (!r.changes) return res.status(404).json({ error: 'Kart bulunamadı' })
    logAudit(req.user.id, 'card_revoke', 'cards', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { logger.error('[cards/revoke]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

cardsRouter.patch('/:id/report-lost', ...mgr, (req, res) => {
  try {
    const r = getDB().prepare(`UPDATE cards SET status='lost', revoked_at=datetime('now') WHERE id=?`).run(+req.params.id)
    if (!r.changes) return res.status(404).json({ error: 'Kart bulunamadı' })
    logAudit(req.user.id, 'card_lost', 'cards', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { logger.error('[cards/report-lost]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── NFC UID bağla (Faz 2 enrollment) ──
cardsRouter.patch('/:id/bind-nfc', ...mgr, validate(bindNfcSchema), (req, res) => {
  try {
    const uid = req.validated.nfc_uid
    const r = getDB().prepare(`UPDATE cards SET nfc_uid=? WHERE id=?`).run(String(uid).trim(), +req.params.id)
    if (!r.changes) return res.status(404).json({ error: 'Kart bulunamadı' })
    logAudit(req.user.id, 'card_bind_nfc', 'cards', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Bu NFC etiketi başka karta bağlı' })
    logger.error('[cards/bind-nfc]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// ── Karta özel PDF (giriş = mavi, yemek = turuncu) ──
cardsRouter.get('/:id/pdf', ...view, async (req, res) => {
  try {
    const db = getDB()
    const card = db.prepare('SELECT * FROM cards WHERE id=?').get(+req.params.id)
    if (!card) return res.status(404).json({ error: 'Kart bulunamadı' })
    const meta = CARD_META[card.card_type]

    // Sahip bilgisi (şimdilik staff; personnel/visitor genişletilebilir)
    let holder = { full_name: '—', tc_no: null, position: null, phone: null, blood_type: null, dept_name: null }
    if (card.holder_type === 'staff') {
      holder = db.prepare(`
        SELECT s.full_name, s.tc_no, s.position, s.phone, s.blood_type, d.name as dept_name
        FROM staff s LEFT JOIN departments d ON d.id = s.department_id WHERE s.id=?
      `).get(card.holder_id) || holder
    }

    const qrDataUrl = await QRCode.toDataURL(card.code, { width: 300, margin: 1 })
    const cardW = 245, cardH = 154 // ~86x54mm (ID-1)
    const doc = new PDFDocument({ size: [cardW + 40, cardH + 40], margin: 20 })
    res.setHeader('Content-Type', 'application/pdf')
    const safeName = (holder.full_name || 'kart').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 40)
    // filename ASCII olmalı (header) — badge yerine card_type kullan ('access'/'meal')
    res.setHeader('Content-Disposition', `attachment; filename="${card.card_type}-${safeName}.pdf"`)
    doc.pipe(res)

    doc.lineWidth(1).strokeColor('#1f2937').roundedRect(20, 20, cardW, cardH, 8).stroke()
    doc.fillColor(meta.accent).roundedRect(20, 20, 8, cardH, 4).fill()

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(`AVS ${meta.title}`, 40, 30)
    doc.fillColor('#6b7280').font('Helvetica').fontSize(7).text('avskamp.com', 40, 42)

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text(holder.full_name || '—', 40, 58, { width: 150 })
    doc.fillColor('#374151').font('Helvetica').fontSize(8).text(holder.dept_name || '', 40, 78, { width: 150 })
    if (holder.position) doc.text(holder.position, 40, 90, { width: 150 })

    doc.fillColor('#6b7280').fontSize(7)
    if (holder.tc_no) doc.text(`TC: ${holder.tc_no}`, 40, 110)
    if (holder.phone) doc.text(`Tel: ${holder.phone}`, 40, 120)
    if (holder.blood_type) doc.text(`Kan: ${holder.blood_type}`, 40, 130)

    // Tip rozeti
    doc.fillColor(meta.accent).font('Helvetica-Bold').fontSize(8).text(meta.badge, 40, 142)

    doc.image(qrDataUrl, cardW - 70, 40, { width: 80, height: 80 })
    doc.fillColor('#94a3b8').fontSize(6).text(`#${card.code.slice(-6).toUpperCase()}`, cardW - 70, 125, { width: 80, align: 'center' })

    doc.end()
  } catch (e) {
    logger.error('[cards/pdf]', e)
    if (!res.headersSent) res.status(500).json({ error: 'PDF üretilemedi' })
  }
})

// ── Roster: aktif staff + her birinin aktif giriş/yemek kart durumu (admin liste) ──
// Tek sorgu: holder başına amaç başına en fazla 1 aktif kart (idx_cards_one_active),
// bu yüzden LEFT JOIN'ler fan-out yapmaz. Frontend bunu N+1 isteğe gerek kalmadan listeler.
cardsRouter.get('/roster', ...view, (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const params = []
    let where = 's.is_active = 1'
    if (q) { where += ' AND s.full_name LIKE ?'; params.push(`%${q}%`) }
    const rows = getDB().prepare(`
      SELECT s.id, s.full_name, d.name AS department_name,
        ac.id AS access_id, ac.code AS access_code, ac.nfc_uid AS access_nfc,
        mc.id AS meal_id,   mc.code AS meal_code,   mc.nfc_uid AS meal_nfc
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN cards ac ON ac.holder_type='staff' AND ac.holder_id=s.id AND ac.card_type='access' AND ac.status='active'
      LEFT JOIN cards mc ON mc.holder_type='staff' AND mc.holder_id=s.id AND mc.card_type='meal'   AND mc.status='active'
      WHERE ${where}
      ORDER BY s.full_name
    `).all(...params)
    res.json(rows)
  } catch (e) { logger.error('[cards/roster]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Kişinin kartlarını listele (en sona: 2-segment GET fallback) ──
cardsRouter.get('/:holderType/:holderId', ...view, (req, res) => {
  try {
    const { holderType, holderId } = req.params
    if (!HOLDER_TYPES.includes(holderType)) return res.status(400).json({ error: 'Geçersiz holderType' })
    const rows = getDB().prepare(`
      SELECT id, card_type, code, nfc_uid, status, issued_at, revoked_at
      FROM cards WHERE holder_type=? AND holder_id=?
      ORDER BY card_type, issued_at DESC
    `).all(holderType, +holderId)
    res.json(rows)
  } catch (e) { logger.error('[cards/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
