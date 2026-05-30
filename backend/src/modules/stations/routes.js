import { Router } from 'express'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { requireRole, requireStation } from '../../shared/auth/middleware.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'

export const stationsRouter = Router()
const mgr = requireRole('campus_manager')
const view = requireRole('campus_manager', 'shift_supervisor')

const STATION_TYPES = ['entry', 'exit', 'cafeteria', 'transport', 'generic']

// İstasyon tipi → hareket tipi (access_events.event_type) ve beklenen kart tipi
const TYPE_MAP = {
  entry:     { event: 'entry',     expect: 'access' },
  exit:      { event: 'exit',      expect: 'access' },
  cafeteria: { event: 'meal',      expect: 'meal'   },
  transport: { event: 'transport', expect: 'access' },
  generic:   { event: 'generic',   expect: null     }, // her kartı kabul et
}

function genKey() {
  return 'ST-' + randomBytes(18).toString('hex') // 36 hex char
}

function publicStation(s) {
  return {
    id: s.id, name: s.name, station_type: s.station_type, location: s.location,
    is_active: s.is_active, capture_photo: s.capture_photo, created_at: s.created_at,
  }
}

// ── İstasyon listesi (aktif + pasif) ──
stationsRouter.get('/', ...view, (req, res) => {
  try {
    const rows = getDB().prepare('SELECT * FROM scan_stations ORDER BY is_active DESC, name').all()
    res.json(rows.map(publicStation))
  } catch (e) { logger.error('[stations/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── İstasyon oluştur — raw key SADECE BİR KEZ döner ──
stationsRouter.post('/', ...mgr, (req, res) => {
  try {
    const { name, station_type, location, capture_photo } = req.body || {}
    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'İsim gerekli' })
    if (!STATION_TYPES.includes(station_type)) return res.status(400).json({ error: 'Geçersiz istasyon tipi' })
    const rawKey = genKey()
    const id = getDB().prepare(`
      INSERT INTO scan_stations(name, station_type, api_key_hash, location, capture_photo, created_by)
      VALUES(?,?,?,?,?,?)
    `).run(String(name).trim(), station_type, bcrypt.hashSync(rawKey, 10),
      location?.trim() || null, capture_photo === false ? 0 : 1, req.user.id).lastInsertRowid
    logAudit(req.user.id, 'station_create', 'stations', id, station_type)
    const s = getDB().prepare('SELECT * FROM scan_stations WHERE id=?').get(id)
    res.status(201).json({ ...publicStation(s), api_key: rawKey }) // key bir kez
  } catch (e) { logger.error('[stations/create]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── İstasyon güncelle (isim/konum/tip/foto/aktiflik) ──
stationsRouter.patch('/:id', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const s = db.prepare('SELECT * FROM scan_stations WHERE id=?').get(+req.params.id)
    if (!s) return res.status(404).json({ error: 'İstasyon bulunamadı' })
    const { name, station_type, location, capture_photo, is_active } = req.body || {}
    if (station_type !== undefined && !STATION_TYPES.includes(station_type)) {
      return res.status(400).json({ error: 'Geçersiz istasyon tipi' })
    }
    db.prepare(`
      UPDATE scan_stations
      SET name = ?, station_type = ?, location = ?, capture_photo = ?, is_active = ?
      WHERE id = ?
    `).run(
      name?.trim() || s.name,
      station_type || s.station_type,
      location !== undefined ? (location?.trim() || null) : s.location,
      capture_photo === undefined ? s.capture_photo : (capture_photo ? 1 : 0),
      is_active === undefined ? s.is_active : (is_active ? 1 : 0),
      s.id,
    )
    logAudit(req.user.id, 'station_update', 'stations', s.id, '')
    res.json(publicStation(db.prepare('SELECT * FROM scan_stations WHERE id=?').get(s.id)))
  } catch (e) { logger.error('[stations/update]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Anahtar yenile — eski anahtar geçersiz olur, yeni raw key bir kez döner ──
stationsRouter.post('/:id/rotate-key', ...mgr, (req, res) => {
  try {
    const rawKey = genKey()
    const r = getDB().prepare('UPDATE scan_stations SET api_key_hash=? WHERE id=?')
      .run(bcrypt.hashSync(rawKey, 10), +req.params.id)
    if (!r.changes) return res.status(404).json({ error: 'İstasyon bulunamadı' })
    logAudit(req.user.id, 'station_rotate_key', 'stations', +req.params.id, '')
    res.json({ id: +req.params.id, api_key: rawKey })
  } catch (e) { logger.error('[stations/rotate]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── İstasyon sil — yalnızca hareket kaydı yoksa; varsa pasife alınmalı ──
stationsRouter.delete('/:id', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const used = db.prepare('SELECT 1 FROM access_events WHERE station_id=? LIMIT 1').get(+req.params.id)
    if (used) return res.status(409).json({ error: 'Bu istasyonun hareket kaydı var — silmek yerine pasife alın' })
    const r = db.prepare('DELETE FROM scan_stations WHERE id=?').run(+req.params.id)
    if (!r.changes) return res.status(404).json({ error: 'İstasyon bulunamadı' })
    logAudit(req.user.id, 'station_delete', 'stations', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { logger.error('[stations/delete]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Son hareketler (admin izleme + Faz 3 zemini) ──
stationsRouter.get('/recent-events', ...view, (req, res) => {
  try {
    const limit = Math.min(+req.query.limit || 50, 200)
    const rows = getDB().prepare(`
      SELECT e.id, e.event_type, e.meal_type, e.result, e.photo_url, e.raw_uid, e.scanned_at,
        e.holder_type, e.holder_id,
        st.name AS station_name, st.station_type,
        CASE WHEN e.holder_type='staff' THEN s.full_name ELSE NULL END AS holder_name
      FROM access_events e
      LEFT JOIN scan_stations st ON st.id = e.station_id
      LEFT JOIN staff s ON e.holder_type='staff' AND s.id = e.holder_id
      ORDER BY e.scanned_at DESC, e.id DESC
      LIMIT ?
    `).all(limit)
    res.json(rows)
  } catch (e) { logger.error('[stations/recent]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── İstasyon kendi kimliğini sorar (kiosk açılışta tip/foto ayarını öğrenir) ──
stationsRouter.get('/me', requireStation, (req, res) => {
  res.json(publicStation(req.station))
})

// ── Kart okut (insansız istasyon) — UID/kod eşle, hareket + opsiyonel foto kaydet ──
stationsRouter.post('/scan', requireStation, upload.single('photo'), verifyMagicBytes, (req, res) => {
  try {
    const db = getDB()
    const station = req.station
    const map = TYPE_MAP[station.station_type] || TYPE_MAP.generic
    const rawUid = (req.body?.raw_uid || '').toString().trim() || null
    const code = (req.body?.code || '').toString().trim() || null
    const mealType = station.station_type === 'cafeteria' ? (req.body?.meal_type || null) : null
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null

    // Kart çözümle: önce NFC UID, yoksa kod (QR/barkod)
    let card = null
    if (rawUid) card = db.prepare('SELECT * FROM cards WHERE nfc_uid=?').get(rawUid)
    if (!card && code) card = db.prepare('SELECT * FROM cards WHERE code=?').get(code)

    function log(result, eventType, cardId, holderType, holderId) {
      return db.prepare(`
        INSERT INTO access_events(card_id, holder_type, holder_id, station_id, event_type, meal_type, result, photo_url, raw_uid)
        VALUES(?,?,?,?,?,?,?,?,?)
      `).run(cardId ?? null, holderType ?? null, holderId ?? null, station.id, eventType, mealType, result, photoUrl, rawUid).lastInsertRowid
    }

    // Eşleşmeyen kart
    if (!card) {
      log('unknown_card', 'denied', null, null, null)
      return res.json({ result: 'unknown_card', message: 'Tanımsız kart', station: station.name })
    }

    // Sahip bilgisi (şimdilik staff)
    let holder = { full_name: 'Bilinmiyor', department_name: null, photo_url: null }
    if (card.holder_type === 'staff') {
      holder = db.prepare(`
        SELECT s.full_name, s.photo_url, d.name AS department_name
        FROM staff s LEFT JOIN departments d ON d.id = s.department_id WHERE s.id=?
      `).get(card.holder_id) || holder
    }

    // İptal/kayıp kart
    if (card.status !== 'active') {
      log('denied', 'denied', card.id, card.holder_type, card.holder_id)
      return res.json({ result: 'denied', reason: card.status === 'lost' ? 'Kart kayıp bildirildi' : 'Kart iptal', holder })
    }

    // Yanlış amaçlı kart (cafeteria'da access kartı vb.)
    if (map.expect && card.card_type !== map.expect) {
      log('not_eligible', 'denied', card.id, card.holder_type, card.holder_id)
      return res.json({
        result: 'not_eligible',
        reason: map.expect === 'meal' ? 'Bu kart yemek kartı değil' : 'Bu kart giriş kartı değil',
        holder,
      })
    }

    // Başarılı okutma — Faz 4: yemekhane uygunluk/sayım (meal_logs) burada genişler
    const eventId = log('ok', map.event, card.id, card.holder_type, card.holder_id)
    logAudit(null, 'station_scan', 'stations', eventId, `${station.station_type}:${card.card_type}`)
    res.json({
      result: 'ok',
      event_type: map.event,
      meal_type: mealType,
      holder,
      photo_url: photoUrl,
      scanned_at: new Date().toISOString(),
    })
  } catch (e) { logger.error('[stations/scan]', e); res.status(500).json({ error: 'Okutma hatası' }) }
})
