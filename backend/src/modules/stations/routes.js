import { Router } from 'express'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { requireRole, requireStation } from '../../shared/auth/middleware.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { isEligible, logMealFromScan, mealTypeForNow, MEAL_TYPES } from '../meals/service.js'
import { createNotification } from '../../shared/notifications/service.js'
import { enqueue } from '../../shared/jobs/index.js'
import { getManagerEmails } from '../email/queries.js'
import { normalizeNfcUid } from '../../shared/nfc.js'
import { validate } from '../../shared/middleware/validate.js'
import { createStationSchema, updateStationSchema } from './schemas.js'

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

// Uygunluk reddi → okutma ekranında gösterilecek insan-okur mesaj
const ELIG_MSG = {
  duplicate: 'Bu öğün zaten alınmış',
  on_leave: 'İzinli — yemek hakkı yok',
  not_scheduled: 'Bugün vardiyada değil',
}

// Kara liste alarmı bildirimi: in-app/push/WA (createNotification) + e-posta (job).
// scan ve manuel giriş ortak kullanır (Faz 5/6.3).
function notifyBlacklist(station, holder, holderId) {
  createNotification({
    message: `Kara listedeki kişi okutma yaptı: ${holder.full_name} — ${station.name}`,
    severity: 'critical', module: 'access', target_role: 'campus_manager',
    entity_type: 'personnel', entity_id: holderId,
    dedup_key: `access_blacklist:${holderId}:${station.id}`,
  })
  const mgrEmails = getManagerEmails()
  if (mgrEmails.length) {
    enqueue('email.send', {
      to: mgrEmails.join(','),
      subject: `[YYS] Kara liste alarmı — ${holder.full_name}`,
      text: `${holder.full_name} adlı kara listedeki kişi "${station.name}" istasyonunda işlem yaptı.\nSebep: ${holder.blacklist_reason || '—'}\nZaman: ${new Date().toISOString()}`,
    })
  }
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
stationsRouter.post('/', ...mgr, validate(createStationSchema), (req, res) => {
  try {
    const { name, station_type, location, capture_photo } = req.validated
    const rawKey = genKey()
    const id = getDB().prepare(`
      INSERT INTO scan_stations(name, station_type, api_key_hash, location, capture_photo, created_by)
      VALUES(?,?,?,?,?,?)
    `).run(name, station_type, bcrypt.hashSync(rawKey, 10),
      location?.trim() || null, capture_photo === false ? 0 : 1, req.user.id).lastInsertRowid
    logAudit(req.user.id, 'station_create', 'stations', id, station_type)
    const s = getDB().prepare('SELECT * FROM scan_stations WHERE id=?').get(id)
    res.status(201).json({ ...publicStation(s), api_key: rawKey }) // key bir kez
  } catch (e) { logger.error('[stations/create]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── İstasyon güncelle (isim/konum/tip/foto/aktiflik) ──
stationsRouter.patch('/:id', ...mgr, validate(updateStationSchema), (req, res) => {
  try {
    const db = getDB()
    const s = db.prepare('SELECT * FROM scan_stations WHERE id=?').get(+req.params.id)
    if (!s) return res.status(404).json({ error: 'İstasyon bulunamadı' })
    const { name, station_type, location, capture_photo, is_active } = req.validated
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
// Filtreler: ?station_id=N · ?result=ok|denied|... · ?only_fail=1 (ok dışı)
stationsRouter.get('/recent-events', ...view, (req, res) => {
  try {
    const limit = Math.min(+req.query.limit || 50, 200)
    const conds = [], params = []
    if (+req.query.station_id) { conds.push('e.station_id = ?'); params.push(+req.query.station_id) }
    if (req.query.result) { conds.push('e.result = ?'); params.push(String(req.query.result)) }
    if (req.query.only_fail === '1') conds.push("e.result != 'ok'")
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const rows = getDB().prepare(`
      SELECT e.id, e.event_type, e.meal_type, e.result, e.photo_url, e.raw_uid, e.scanned_at,
        e.holder_type, e.holder_id,
        st.name AS station_name, st.station_type,
        COALESCE(s.full_name, p.full_name, v.full_name) AS holder_name
      FROM access_events e
      LEFT JOIN scan_stations st ON st.id = e.station_id
      LEFT JOIN staff s ON e.holder_type='staff' AND s.id = e.holder_id
      LEFT JOIN personnel p ON e.holder_type='personnel' AND p.id = e.holder_id
      LEFT JOIN visitors v ON e.holder_type='visitor' AND v.id = e.holder_id
      ${where}
      ORDER BY e.scanned_at DESC, e.id DESC
      LIMIT ?
    `).all(...params, limit)
    res.json(rows)
  } catch (e) { logger.error('[stations/recent]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Bugünkü özet — istasyon başına sayılar + genel sonuç kırılımı ──
// (scanned_at UTC saklanır; gün sınırı 'localtime' ile TR'ye çevrilir)
stationsRouter.get('/stats-today', ...view, (req, res) => {
  try {
    const db = getDB()
    const stations = db.prepare(`
      SELECT st.id, st.name, st.station_type, st.is_active,
        COUNT(e.id) AS total,
        SUM(CASE WHEN e.result='ok' THEN 1 ELSE 0 END) AS ok_count,
        SUM(CASE WHEN e.result NOT IN ('ok') THEN 1 ELSE 0 END) AS fail_count,
        MAX(e.scanned_at) AS last_scan_at
      FROM scan_stations st
      LEFT JOIN access_events e
        ON e.station_id = st.id AND date(e.scanned_at, 'localtime') = date('now', 'localtime')
      GROUP BY st.id
      ORDER BY st.is_active DESC, st.name
    `).all()
    const totals = db.prepare(`
      SELECT result, COUNT(*) AS cnt
      FROM access_events
      WHERE date(scanned_at, 'localtime') = date('now', 'localtime')
      GROUP BY result
    `).all().reduce((acc, r) => ({ ...acc, [r.result]: r.cnt }), {})
    res.json({ stations, totals })
  } catch (e) { logger.error('[stations/stats-today]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── İstasyon kendi kimliğini sorar (kiosk açılışta tip/foto ayarını öğrenir) ──
stationsRouter.get('/me', requireStation, (req, res) => {
  res.json(publicStation(req.station))
})

// ── Kişi arama (kartsız manuel giriş) — isimle, istasyon anahtarıyla.
// ID girmek pratik değildi: operatör artık isim yazıp listeden seçer.
stationsRouter.get('/search-holders', requireStation, (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim()
    if (q.length < 2) return res.json([])
    const like = `%${q}%`
    const db = getDB()
    const staff = db.prepare(`
      SELECT s.id, 'staff' AS holder_type, s.full_name, d.name AS sub
      FROM staff s LEFT JOIN departments d ON d.id = s.department_id
      WHERE s.full_name LIKE ? COLLATE NOCASE AND s.is_active = 1
      ORDER BY s.full_name LIMIT 8
    `).all(like)
    const personnel = db.prepare(`
      SELECT p.id, 'personnel' AS holder_type, p.full_name, p.company AS sub
      FROM personnel p
      WHERE p.full_name LIKE ? COLLATE NOCASE AND p.check_out_date IS NULL
      ORDER BY p.full_name LIMIT 8
    `).all(like)
    res.json([...staff, ...personnel].slice(0, 12))
  } catch (e) { logger.error('[stations/search-holders]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── İstasyonun KENDİ son okutmaları (boşta ekranda canlı liste) ──
stationsRouter.get('/my-events', requireStation, (req, res) => {
  try {
    const limit = Math.min(+req.query.limit || 5, 20)
    const rows = getDB().prepare(`
      SELECT e.id, e.event_type, e.meal_type, e.result, e.scanned_at,
        COALESCE(s.full_name, p.full_name, v.full_name) AS holder_name
      FROM access_events e
      LEFT JOIN staff s ON e.holder_type='staff' AND s.id = e.holder_id
      LEFT JOIN personnel p ON e.holder_type='personnel' AND p.id = e.holder_id
      LEFT JOIN visitors v ON e.holder_type='visitor' AND v.id = e.holder_id
      WHERE e.station_id = ?
      ORDER BY e.scanned_at DESC, e.id DESC
      LIMIT ?
    `).all(req.station.id, limit)
    res.json(rows)
  } catch (e) { logger.error('[stations/my-events]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Kart okut (insansız istasyon) — UID/kod eşle, hareket + opsiyonel foto kaydet ──
stationsRouter.post('/scan', requireStation, upload.single('photo'), verifyMagicBytes, (req, res) => {
  try {
    const db = getDB()
    const station = req.station
    const map = TYPE_MAP[station.station_type] || TYPE_MAP.generic
    const rawUid = normalizeNfcUid(req.body?.raw_uid)
    const code = (req.body?.code || '').toString().trim() || null
    const mealType = station.station_type === 'cafeteria' ? (req.body?.meal_type || null) : null
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null

    // Faz 7a — Turnike kapı sinyali: her okutma yanıtına access_granted ekle
    // (result==='ok' → kapı açılır). Fiziksel turnike denetleyicisi bu alanı
    // okuyup rölesini sürer; reddedilen/duplicate/alarm durumunda kapı kapalı kalır.
    const _json = res.json.bind(res)
    res.json = (body) => _json(
      body && typeof body === 'object' && 'result' in body
        ? { ...body, access_granted: body.result === 'ok' }
        : body,
    )

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

    // Sahip bilgisi — staff: diet_flags (yemek uyarısı); personnel: blacklist (güvenlik alarmı)
    let holder = { full_name: 'Bilinmiyor', department_name: null, photo_url: null, diet_flags: null, is_blacklisted: 0 }
    if (card.holder_type === 'staff') {
      holder = { ...holder, ...(db.prepare(`
        SELECT s.full_name, s.photo_url, s.diet_flags, d.name AS department_name
        FROM staff s LEFT JOIN departments d ON d.id = s.department_id WHERE s.id=?
      `).get(card.holder_id) || {}) }
    } else if (card.holder_type === 'personnel') {
      holder = { ...holder, ...(db.prepare(`
        SELECT p.full_name, p.company AS department_name, p.is_blacklisted, p.blacklist_reason
        FROM personnel p WHERE p.id=?
      `).get(card.holder_id) || {}) }
    } else if (card.holder_type === 'visitor') {
      holder = { ...holder, ...(db.prepare('SELECT full_name FROM visitors WHERE id=?').get(card.holder_id) || {}) }
    }

    // İptal/kayıp kart
    if (card.status !== 'active') {
      log('denied', 'denied', card.id, card.holder_type, card.holder_id)
      return res.json({ result: 'denied', reason: card.status === 'lost' ? 'Kart kayıp bildirildi' : 'Kart iptal', holder })
    }

    // Faz 5b — süreli kart (ziyaretçi): geçerlilik bitmişse reddet
    if (card.valid_until && new Date(card.valid_until.replace(' ', 'T')) < new Date()) {
      log('denied', 'denied', card.id, card.holder_type, card.holder_id)
      return res.json({ result: 'denied', reason_code: 'expired', reason: 'Kart süresi dolmuş', holder })
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

    // Faz 5 — Güvenlik: kara listedeki personel okutursa alarm + kritik bildirim.
    // (Yemekhane dışı erişim istasyonlarında; meal hakkı zaten ayrı gate'li.)
    if (card.holder_type === 'personnel' && holder.is_blacklisted && station.station_type !== 'cafeteria') {
      const eventId = log('alarm', 'denied', card.id, card.holder_type, card.holder_id)
      logAudit(null, 'station_blacklist_alarm', 'stations', eventId, `${station.name}:${card.holder_id}`)
      notifyBlacklist(station, holder, card.holder_id)
      return res.json({ result: 'alarm', reason: holder.blacklist_reason || 'Kara liste', holder, station: station.name })
    }

    // Faz 4 — Yemekhane: öğün hakkı (entitlement) kontrolü + meal_logs entegrasyonu.
    // Yalnızca staff sahipli yemek kartlarına uygulanır (personnel/visitor kartları muaf).
    if (station.station_type === 'cafeteria' && card.holder_type === 'staff') {
      const mt = MEAL_TYPES.includes(mealType) ? mealType : mealTypeForNow()
      const date = new Date().toISOString().slice(0, 10)
      const elig = isEligible(db, card.holder_id, mt, date)
      if (!elig.eligible) {
        const result = elig.reason === 'duplicate' ? 'duplicate' : 'not_eligible'
        const eventId = log(result, map.event, card.id, card.holder_type, card.holder_id)
        logAudit(null, 'station_scan', 'stations', eventId, `cafeteria:${result}:${elig.reason}`)
        return res.json({ result, reason_code: elig.reason, reason: ELIG_MSG[elig.reason], meal_type: mt, holder })
      }
      logMealFromScan(db, card.holder_id, mt, date)
      const eventId = log('ok', map.event, card.id, card.holder_type, card.holder_id)
      logAudit(null, 'station_scan', 'stations', eventId, `cafeteria:ok:${mt}`)
      return res.json({
        result: 'ok', event_type: map.event, meal_type: mt, holder,
        photo_url: photoUrl, scanned_at: new Date().toISOString(),
      })
    }

    // Başarılı okutma (giriş/çıkış/servis/genel)
    const eventId = log('ok', map.event, card.id, card.holder_type, card.holder_id)
    logAudit(null, 'station_scan', 'stations', eventId, `${station.station_type}:${card.card_type}`)

    // Faz 5b — ziyaretçi çıkışta otomatik kart iptali (tek kullanımlık ziyaret)
    if (card.holder_type === 'visitor' && map.event === 'exit') {
      db.prepare(`UPDATE cards SET status='revoked', revoked_at=datetime('now') WHERE id=?`).run(card.id)
    }
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

// ── Kartsız manuel giriş/çıkış (Faz 7b) — kart unutuldu/yok: operatör kişiyi
// seçer, opsiyonel foto ile kayıt. access_events'e card_id=NULL yazılır.
// Kara listedeki personel için yine alarm üretir. Turnike sinyali (access_granted) döner.
stationsRouter.post('/manual', requireStation, upload.single('photo'), verifyMagicBytes, (req, res) => {
  try {
    const db = getDB()
    const station = req.station
    const map = TYPE_MAP[station.station_type] || TYPE_MAP.generic
    const holderType = (req.body?.holder_type || '').toString()
    const holderId = +req.body?.holder_id
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null

    const _json = res.json.bind(res)
    res.json = (body) => _json(
      body && typeof body === 'object' && 'result' in body
        ? { ...body, access_granted: body.result === 'ok' } : body,
    )

    if (!['staff', 'personnel'].includes(holderType) || !holderId) {
      return res.status(400).json({ error: 'holder_type (staff|personnel) ve holder_id gerekli' })
    }

    let holder = { full_name: null, is_blacklisted: 0, blacklist_reason: null }
    if (holderType === 'staff') {
      holder = { ...holder, ...(db.prepare('SELECT full_name FROM staff WHERE id=?').get(holderId) || {}) }
    } else {
      holder = { ...holder, ...(db.prepare('SELECT full_name, is_blacklisted, blacklist_reason FROM personnel WHERE id=?').get(holderId) || {}) }
    }
    if (!holder.full_name) return res.status(404).json({ error: 'Kişi bulunamadı' })

    const logManual = (result, eventType) => db.prepare(`
      INSERT INTO access_events(card_id, holder_type, holder_id, station_id, event_type, result, photo_url)
      VALUES(NULL,?,?,?,?,?,?)
    `).run(holderType, holderId, station.id, eventType, result, photoUrl).lastInsertRowid

    // Kara liste → alarm (yemekhane dışı)
    if (holderType === 'personnel' && holder.is_blacklisted && station.station_type !== 'cafeteria') {
      const eid = logManual('alarm', 'denied')
      logAudit(null, 'station_manual_alarm', 'stations', eid, `${station.name}:${holderId}`)
      notifyBlacklist(station, holder, holderId)
      return res.json({ result: 'alarm', reason: holder.blacklist_reason || 'Kara liste', holder, station: station.name, manual: true })
    }

    const eid = logManual('ok', map.event)
    logAudit(null, 'station_manual', 'stations', eid, `${station.station_type}:${holderType}:${holderId}`)
    return res.json({
      result: 'ok', event_type: map.event, holder, photo_url: photoUrl,
      manual: true, scanned_at: new Date().toISOString(),
    })
  } catch (e) { logger.error('[stations/manual]', e); res.status(500).json({ error: 'Manuel kayıt hatası' }) }
})
