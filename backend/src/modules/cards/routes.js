import { Router } from 'express'
import { randomBytes } from 'crypto'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { validate } from '../../shared/middleware/validate.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { normalizeNfcUid } from '../../shared/nfc.js'
import { bulkIssueSchema, issueSchema, bindNfcSchema, enrollNfcSchema } from './schemas.js'
import * as analytics from './analytics.js'

export const cardsRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor', 'laundry', 'housekeeper', 'technical')

const HOLDER_TYPES = ['staff', 'personnel', 'visitor']
const CARD_TYPES = ['access', 'meal', 'laundry']
// Kart tipi → kod prefix + PDF görünümü (renk + başlık)
const CARD_META = {
  access: { prefix: 'AVS-A:', title: 'GİRİŞ KARTI', accent: '#2563eb', badge: 'GİRİŞ' },
  meal:   { prefix: 'AVS-M:', title: 'YEMEK KARTI', accent: '#ea580c', badge: 'YEMEK' },
  laundry:{ prefix: 'AVS-C:', title: 'ÇAMAŞIR KARTI', accent: '#0f9f9a', badge: 'ÇAMAŞIR' },
}

function validHolderCardPair(holderType, cardType) {
  if (cardType === 'laundry') return holderType === 'personnel'
  return true
}

function hasActiveRoom(db, personnelId) {
  return Boolean(db.prepare(`
    SELECT 1 FROM room_assignments
    WHERE personnel_id=? AND check_out_at IS NULL
    LIMIT 1
  `).get(personnelId))
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

// PDF üzerinde gösterilecek kart sahibi bilgisi.
function holderInfo(db, card) {
  const empty = { full_name: '—', tc_no: null, position: null, phone: null, blood_type: null, dept_name: null }
  if (card.holder_type === 'staff') {
    return db.prepare(`
      SELECT s.full_name, s.tc_no, s.position, s.phone, s.blood_type, d.name as dept_name
      FROM staff s LEFT JOIN departments d ON d.id = s.department_id WHERE s.id=?
    `).get(card.holder_id) || empty
  }
  if (card.holder_type === 'personnel') {
    return db.prepare(`
      SELECT p.full_name, p.tc_no, p.job_title AS position,
             p.phone_number AS phone, NULL AS blood_type, p.company AS dept_name
      FROM personnel p WHERE p.id=?
    `).get(card.holder_id) || empty
  }
  return empty
}

// Bir kartı (ox,oy) origin'ine göre çizer — tek-kart ve toplu PDF ortak kullanır.
function drawCard(doc, ox, oy, w, h, { card, holder, meta, qrDataUrl }) {
  doc.lineWidth(1).strokeColor('#1f2937').roundedRect(ox, oy, w, h, 8).stroke()
  doc.fillColor(meta.accent).roundedRect(ox, oy, 8, h, 4).fill()

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(`AVS ${meta.title}`, ox + 20, oy + 10)
  doc.fillColor('#6b7280').font('Helvetica').fontSize(7).text('avskamp.com', ox + 20, oy + 22)

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text(holder.full_name || '—', ox + 20, oy + 38, { width: 150 })
  doc.fillColor('#374151').font('Helvetica').fontSize(8).text(holder.dept_name || '', ox + 20, oy + 58, { width: 150 })
  if (holder.position) doc.text(holder.position, ox + 20, oy + 70, { width: 150 })

  doc.fillColor('#6b7280').fontSize(7)
  if (holder.tc_no) doc.text(`TC: ${holder.tc_no}`, ox + 20, oy + 90)
  if (holder.phone) doc.text(`Tel: ${holder.phone}`, ox + 20, oy + 100)
  if (holder.blood_type) doc.text(`Kan: ${holder.blood_type}`, ox + 20, oy + 110)

  doc.fillColor(meta.accent).font('Helvetica-Bold').fontSize(8).text(meta.badge, ox + 20, oy + 122)

  doc.image(qrDataUrl, ox + w - 90, oy + 20, { width: 80, height: 80 })
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(6).text(`#${card.code.slice(-6).toUpperCase()}`, ox + w - 90, oy + 105, { width: 80, align: 'center' })
}

// ── Toplu üret: aktif çalışanların veya aktif odalı sakinlerin eksik kartları ──
cardsRouter.post('/bulk-issue', ...mgr, validate(bulkIssueSchema), (req, res) => {
  try {
    const { holder_type: holderType, card_type: cardType } = req.validated
    if (!validHolderCardPair(holderType, cardType)) {
      return res.status(400).json({ error: 'Çamaşır kartı yalnız sakinler için üretilebilir' })
    }
    const db = getDB()
    const missing = holderType === 'personnel'
      ? db.prepare(`
          SELECT DISTINCT p.id FROM personnel p
          JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
          WHERE NOT EXISTS (
            SELECT 1 FROM cards c
            WHERE c.holder_type='personnel' AND c.holder_id=p.id
              AND c.card_type=? AND c.status='active'
          )
          ORDER BY p.id
        `).all(cardType)
      : db.prepare(`
          SELECT id FROM staff
          WHERE is_active = 1
            AND id NOT IN (SELECT holder_id FROM cards WHERE holder_type='staff' AND card_type=? AND status='active')
          ORDER BY id
        `).all(cardType)
    const stmt = db.prepare(`INSERT INTO cards(holder_type, holder_id, card_type, code, issued_by) VALUES(?,?,?,?,?)`)
    const tx = db.transaction(() => { missing.forEach(s => stmt.run(holderType, s.id, cardType, genCode(cardType), req.user.id)) })
    tx()
    logAudit(req.user.id, 'card_bulk_issue', 'cards', null, `${holderType}/${cardType}: ${missing.length}`)
    res.json({ generated: missing.length })
  } catch (e) { logger.error('[cards/bulk-issue]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Hızlı seri NFC kayıt: kişinin aktif kartını bul/üret + UID bağla (atomik) ──
cardsRouter.post('/enroll-nfc', ...mgr, validate(enrollNfcSchema), (req, res) => {
  try {
    const { holder_type, holder_id, card_type } = req.validated
    if (!validHolderCardPair(holder_type, card_type)) {
      return res.status(400).json({ error: 'Çamaşır kartı yalnız sakinler için üretilebilir' })
    }
    const uid = normalizeNfcUid(req.validated.nfc_uid)
    if (!uid) return res.status(400).json({ error: 'Geçersiz NFC UID' })
    const db = getDB()
    if (card_type === 'laundry' && !hasActiveRoom(db, holder_id)) {
      return res.status(409).json({ error: 'Sakinin aktif oda ataması yok' })
    }

    const result = db.transaction(() => {
      let card = activeCard(db, holder_type, holder_id, card_type)
      let created = false
      if (!card) {
        const code = genCode(card_type)
        const id = db.prepare(
          `INSERT INTO cards(holder_type, holder_id, card_type, code, nfc_uid, issued_by) VALUES(?,?,?,?,?,?)`
        ).run(holder_type, holder_id, card_type, code, uid, req.user.id).lastInsertRowid
        created = true
        return { card_id: id, code, created }
      }
      db.prepare(`UPDATE cards SET nfc_uid=? WHERE id=?`).run(uid, card.id)
      return { card_id: card.id, code: card.code, created }
    })()

    logAudit(req.user.id, 'card_enroll_nfc', 'cards', result.card_id, `${holder_type}:${holder_id} ${card_type}`)
    res.json({ ...result, card_type, holder_id, nfc_uid: uid })
  } catch (e) {
    if (e.message?.includes('UNIQUE') && e.message?.includes('nfc_uid')) {
      return res.status(409).json({ error: 'Bu NFC etiketi başka karta bağlı' })
    }
    logger.error('[cards/enroll-nfc]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// ── Kart üret (amaç bazında) ──
cardsRouter.post('/:holderType/:holderId/issue', ...mgr, validate(issueSchema), (req, res) => {
  try {
    const { holderType, holderId } = req.params
    const { card_type: cardType, regenerate, nfc_uid, valid_until } = req.validated
    if (!HOLDER_TYPES.includes(holderType)) return res.status(400).json({ error: 'Geçersiz holderType' })
    if (!validHolderCardPair(holderType, cardType)) {
      return res.status(400).json({ error: 'Çamaşır kartı yalnız sakinler için üretilebilir' })
    }

    const db = getDB()
    if (cardType === 'laundry' && !hasActiveRoom(db, +holderId)) {
      return res.status(409).json({ error: 'Sakinin aktif oda ataması yok' })
    }
    const existing = activeCard(db, holderType, +holderId, cardType)
    if (existing && !regenerate) {
      return res.json({ id: existing.id, code: existing.code, card_type: existing.card_type, status: existing.status })
    }

    const code = genCode(cardType)
    const nfcUid = normalizeNfcUid(nfc_uid)
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
    const uid = normalizeNfcUid(req.validated.nfc_uid)
    if (!uid) return res.status(400).json({ error: 'Geçersiz NFC UID' })
    const r = getDB().prepare(`UPDATE cards SET nfc_uid=? WHERE id=?`).run(uid, +req.params.id)
    if (!r.changes) return res.status(404).json({ error: 'Kart bulunamadı' })
    logAudit(req.user.id, 'card_bind_nfc', 'cards', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Bu NFC etiketi başka karta bağlı' })
    logger.error('[cards/bind-nfc]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// ── Kart referans fotoğrafı yükle (telefonla kayıt) ──
cardsRouter.post('/:id/photo', ...mgr, upload.single('photo'), verifyMagicBytes, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fotoğraf gerekli' })
    const photoUrl = `/uploads/${req.file.filename}`
    const r = getDB().prepare(`UPDATE cards SET photo_url=? WHERE id=?`).run(photoUrl, +req.params.id)
    if (!r.changes) return res.status(404).json({ error: 'Kart bulunamadı' })
    logAudit(req.user.id, 'card_photo', 'cards', +req.params.id, '')
    res.json({ photo_url: photoUrl })
  } catch (e) { logger.error('[cards/photo]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Karta özel PDF (giriş = mavi, yemek = turuncu) ──
cardsRouter.get('/:id/pdf', ...view, async (req, res) => {
  try {
    const db = getDB()
    const card = db.prepare('SELECT * FROM cards WHERE id=?').get(+req.params.id)
    if (!card) return res.status(404).json({ error: 'Kart bulunamadı' })
    const meta = CARD_META[card.card_type]
    const holder = holderInfo(db, card)

    const qrDataUrl = await QRCode.toDataURL(card.code, { width: 300, margin: 1 })
    const cardW = 245, cardH = 154 // ~86x54mm (ID-1)
    const doc = new PDFDocument({ size: [cardW + 40, cardH + 40], margin: 20 })
    res.setHeader('Content-Type', 'application/pdf')
    const safeName = (holder.full_name || 'kart').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 40)
    // filename ASCII olmalı (header) — badge yerine card_type kullan ('access'/'meal')
    res.setHeader('Content-Disposition', `attachment; filename="${card.card_type}-${safeName}.pdf"`)
    doc.pipe(res)

    drawCard(doc, 20, 20, cardW, cardH, { card, holder, meta, qrDataUrl })

    doc.end()
  } catch (e) {
    logger.error('[cards/pdf]', e)
    if (!res.headersSent) res.status(500).json({ error: 'PDF üretilemedi' })
  }
})

// ── Toplu kart PDF (A4'te 2×4 = 8 kart/sayfa) ──
cardsRouter.get('/batch-pdf', ...mgr, async (req, res) => {
  try {
    const cardType = String(req.query.card_type || '')
    if (!CARD_TYPES.includes(cardType)) return res.status(400).json({ error: 'Geçersiz card_type' })
    const db = getDB()

    let cards
    const idsRaw = String(req.query.ids || '').trim()
    if (idsRaw) {
      const ids = idsRaw.split(',').map(x => parseInt(x, 10)).filter(Boolean)
      if (!ids.length) return res.status(400).json({ error: 'Yazdırılacak kart yok' })
      const ph = ids.map(() => '?').join(',')
      cards = db.prepare(`SELECT * FROM cards WHERE id IN (${ph}) AND card_type=? AND status='active'`).all(...ids, cardType)
    } else {
      cards = db.prepare(`SELECT * FROM cards WHERE card_type=? AND status='active' ORDER BY id`).all(cardType)
    }
    if (!cards.length) return res.status(400).json({ error: 'Yazdırılacak kart yok' })

    const meta = CARD_META[cardType]
    // A4 portrait, 2 sütun × 4 satır
    const PAGE_W = 595, PAGE_H = 842, MARGIN = 24
    const cardW = 243, cardH = 153, colGap = 20, rowGap = 18
    const COLS = 2, ROWS = 4, PER_PAGE = COLS * ROWS

    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: MARGIN })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="toplu-${cardType}-${cards.length}.pdf"`)
    doc.pipe(res)

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      const slot = i % PER_PAGE
      if (i > 0 && slot === 0) doc.addPage()
      const col = slot % COLS
      const row = Math.floor(slot / COLS)
      const ox = MARGIN + col * (cardW + colGap)
      const oy = MARGIN + row * (cardH + rowGap)
      const holder = holderInfo(db, card)
      const qrDataUrl = await QRCode.toDataURL(card.code, { width: 300, margin: 1 })
      drawCard(doc, ox, oy, cardW, cardH, { card, holder, meta, qrDataUrl })
    }

    doc.end()
  } catch (e) {
    logger.error('[cards/batch-pdf]', e)
    if (!res.headersSent) res.status(500).json({ error: 'PDF üretilemedi' })
  }
})

// ── Kart analitiği (kapsam/NFC ilerlemesi/kullanım) ──
cardsRouter.get('/analytics', ...view, (req, res) => {
  try {
    const db = getDB()
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30))
    res.json({
      days,
      summary: analytics.summary(db),
      usageByDay: analytics.usageByDay(db, Math.min(days, 60)),
      usageByResult: analytics.usageByResult(db, days),
      topStations: analytics.topStations(db, days),
    })
  } catch (e) { logger.error('[cards/analytics]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Roster: aktif staff + her birinin aktif giriş/yemek kart durumu (admin liste) ──
// Tek sorgu: holder başına amaç başına en fazla 1 aktif kart (idx_cards_one_active),
// bu yüzden LEFT JOIN'ler fan-out yapmaz. Frontend bunu N+1 isteğe gerek kalmadan listeler.
cardsRouter.get('/roster', ...view, (req, res) => {
  try {
    const holderType = String(req.query.holder_type || 'staff')
    if (!['staff', 'personnel'].includes(holderType)) {
      return res.status(400).json({ error: 'Geçersiz holder_type' })
    }
    const q = String(req.query.q || '').trim()
    const params = []
    if (holderType === 'personnel') {
      let where = 'ra.check_out_at IS NULL'
      if (q) { where += ' AND p.full_name LIKE ?'; params.push(`%${q}%`) }
      const rows = getDB().prepare(`
        SELECT DISTINCT p.id, p.full_name, p.company, r.block, r.room_no,
          lc.id AS laundry_id, lc.code AS laundry_code,
          lc.nfc_uid AS laundry_nfc, lc.photo_url AS laundry_photo
        FROM personnel p
        JOIN room_assignments ra ON ra.personnel_id=p.id
        JOIN rooms r ON r.id=ra.room_id
        LEFT JOIN cards lc ON lc.holder_type='personnel' AND lc.holder_id=p.id
          AND lc.card_type='laundry' AND lc.status='active'
        WHERE ${where}
        ORDER BY p.full_name
      `).all(...params)
      return res.json(rows)
    }
    let where = 's.is_active = 1'
    if (q) { where += ' AND s.full_name LIKE ?'; params.push(`%${q}%`) }
    const rows = getDB().prepare(`
      SELECT s.id, s.full_name, d.name AS department_name,
        ac.id AS access_id, ac.code AS access_code, ac.nfc_uid AS access_nfc, ac.photo_url AS access_photo,
        mc.id AS meal_id,   mc.code AS meal_code,   mc.nfc_uid AS meal_nfc,   mc.photo_url AS meal_photo
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
      SELECT id, card_type, code, nfc_uid, photo_url, status, issued_at, revoked_at
      FROM cards WHERE holder_type=? AND holder_id=?
      ORDER BY card_type, issued_at DESC
    `).all(holderType, +holderId)
    res.json(rows)
  } catch (e) { logger.error('[cards/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
