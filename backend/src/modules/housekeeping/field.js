// Saha ekranı — kat hizmetleri telefondan/tabletten oda durumu girer (docs/saha-ekrani.md).
// Temizlik kaydı günlük üretimden değil, sahadan "temizlendi / temizlenemedi" denince açılır
// (cleaning_tasks.origin='field'); doluluk oda bazlıdır (rooms.occupancy). Anahtarlar üretimle aynı:
// oda `BLOK-ODANO`, M bloğu ortak alanı `BLOK-KAT-kod` — Hermes /temizlik ve web aynı kaydı görür.
import { getDB } from '../../shared/db/index.js'
import { BLOCK_BY_NAME } from '../../shared/blocks.js'
import { fieldQrEnforcement, findValidFieldScan, labelStates, qrRequiredFor } from '../location-portal/field-scan.js'
import { COMMON_AREAS, localToday } from './queries.js'

// Kiosk "temizlenemedi" sebepleri (mevcut kiosk görev sekmesiyle aynı etiketler)
export const FIELD_SKIP_REASONS = {
  occupied: 'Oda kullanımda',
  dnd: 'Rahatsız etmeyin',
  locked: 'Kapı kilitli',
  fault: 'Arıza nedeniyle',
  other: 'Diğer',
}

const isMBlock = block => BLOCK_BY_NAME[block]?.type === 'M'
const fail = (message, statusCode, code) => Object.assign(new Error(message), { statusCode }, code ? { code } : {})
// Zorunluluk açık ve kapının etiketi doğrulanmışsa (docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md)
const QR_REQUIRED = "Bu kapıda QR etiketi var; işaretlemek için kapıdaki QR'ı okut"

const ROOM_KEY = /^([A-Za-z0-9]+)-([A-Za-z0-9]+)$/
const COMMON_KEY = /^([A-Za-z0-9]+)-(\d+)-([a-z]+)$/

// "Yer" anahtarını çözer: oda `BLOK-ODANO` (yalnız aktif odalar), M bloğu ortak alanı `BLOK-KAT-kod`.
export function resolveFieldLocation(location, db = getDB()) {
  const key = String(location ?? '').trim()
  const common = COMMON_KEY.exec(key)
  if (common) {
    const [, block, floor, code] = common
    const area = COMMON_AREAS.find(a => a.code === code)
    if (!area) throw fail('Geçersiz yer', 400)
    const hasFloor = isMBlock(block) && db.prepare(`SELECT 1 FROM rooms WHERE block=? AND floor=? AND status='active' LIMIT 1`)
      .get(block, Number(floor))
    if (!hasFloor) throw fail('Kat bulunamadı', 404)
    return { kind: 'common', block, floor: Number(floor), code, label: area.label }
  }
  const match = ROOM_KEY.exec(key)
  if (!match) throw fail('Geçersiz yer', 400)
  const room = db.prepare(`
    SELECT id, block, floor, room_no, use_state, occupant_shift, no_clean, occupancy
    FROM rooms WHERE block=? AND room_no=? AND status='active'
  `).get(match[1], match[2])
  if (!room) throw fail('Oda bulunamadı', 404)
  return { kind: 'room', room }
}

const spotKey = spot => (spot.kind === 'room' ? `${spot.room.block}-${spot.room.room_no}` : `${spot.block}-${spot.floor}-${spot.code}`)

// Bugünün geçerli görevi = son görev: sakin şikayetinden doğan takip görevi (cleaning_task_reviews.followup_task_id)
// ilk görevin yerine geçer; pano, işaret, geri alma ve kat toplusu hep bunu görür.
export const currentTask = (db, key, today) => db.prepare(`
  SELECT * FROM cleaning_tasks WHERE qr_location=? AND DATE(scheduled_at)=? ORDER BY id DESC LIMIT 1
`).get(key, today)

// Bugün görevi olmayan yer işaretlenince görev o an açılır (üretimle aynı alan metni ve saat; gececi oda 19:00)
function openFieldTask(db, spot, key, today) {
  const room = spot.kind === 'room' ? spot.room : null
  const area = room ? `${room.block} Oda ${room.room_no}` : `${spot.block} ${spot.floor}.Kat ${spot.label}`
  const at = `${today} ${room?.occupant_shift === 'night' ? '19:00:00' : '08:00:00'}`
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location, origin)
    VALUES(?,?,?,?,?,?,'field')
  `).run(area, room?.block ?? spot.block, room?.floor ?? spot.floor, room ? 'room' : 'common_area', at, key)
  return db.prepare('SELECT * FROM cleaning_tasks WHERE id=?').get(lastInsertRowid)
}

function addFieldPhotos(db, taskId, photoUrls, category, workerId) {
  if (!photoUrls.length) return
  const start = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM cleaning_task_photos WHERE task_id=?').get(taskId).m
  const insert = db.prepare(`
    INSERT INTO cleaning_task_photos(task_id, photo_url, category, sort_order, uploaded_by_staff_id) VALUES(?,?,?,?,?)
  `)
  photoUrls.forEach((url, i) => insert.run(taskId, url, category, start + 1 + i, workerId))
  db.prepare('UPDATE cleaning_tasks SET photo_url=COALESCE(photo_url, ?) WHERE id=?').run(photoUrls[0], taskId)
}

// Kiosk oturumunda users kaydı yok: kişi detail.workerId'de (mevcut kiosk denetim kaydı düzeni);
// web'den (müdür/amir) gelen yazım kullanıcıyla ve housekeeping modülüyle düşer.
function audit(db, action, targetId, detail, userId = null) {
  db.prepare('INSERT INTO audit_log(user_id, action, module, target_id, detail) VALUES(?, ?, ?, ?, ?)')
    .run(userId, action, userId ? 'housekeeping' : 'avs-self-service', targetId, JSON.stringify(detail))
}

// Temizlendi / temizlenemedi. İkinci "temizlendi" ilk temizleyeni ve saatini ezmez (already: true).
// scanId: aynı kişinin bu yerdeki son 60 dk okutması → işaret QR ile doğrulanmış (verified_by_qr). Geçersiz okutma
// sessizce doğrulamasız sayılır; zorunluluk açık ve etiket doğrulanmışsa okutmasız işaret 409 qr_scan_required.
export function markField({ location, action, reason, note, workerId, photoUrls = [], scanId = null }, db = getDB()) {
  if (action !== 'clean' && action !== 'skip') throw fail('Geçersiz işlem', 400)
  if (action === 'skip' && !FIELD_SKIP_REASONS[reason]) throw fail('Geçersiz temizlenememe nedeni', 400)
  const spot = resolveFieldLocation(location, db)
  if (spot.kind === 'room' && spot.room.use_state === 'closed') throw fail('Oda kapalı', 409)
  const key = spotKey(spot)
  const today = localToday(db)
  return db.transaction(() => {
    let task = currentTask(db, key, today)
    if (task?.completed_at) {
      if (action === 'clean') {
        return { task_id: task.id, status: 'cleaned', at: task.completed_at, already: true, verified_by_qr: Boolean(task.verified_by_qr) }
      }
      throw fail('Tamamlanmış görev temizlenemedi olarak işaretlenemez', 409)
    }
    const scan = findValidFieldScan({ scanId, workerId, location: key }, db)
    if (!scan && qrRequiredFor(db, key)) throw fail(QR_REQUIRED, 409, 'qr_scan_required')
    if (!task) task = openFieldTask(db, spot, key, today)
    const text = String(note ?? '').trim()
    const verified = scan ? 1 : 0
    if (action === 'clean') {
      db.prepare(`
        UPDATE cleaning_tasks SET completed_at=datetime('now'), skipped=0, skip_reason=NULL,
          completed_by_worker_id=?, field_worker_id=?, verified_by_qr=?, verified_scan_event_id=? WHERE id=?
      `).run(workerId, workerId, verified, scan?.id ?? null, task.id)
    } else {
      db.prepare(`
        UPDATE cleaning_tasks SET skipped=1, skip_reason=?, completed_at=NULL, field_worker_id=?,
          verified_by_qr=?, verified_scan_event_id=? WHERE id=?
      `).run(`${FIELD_SKIP_REASONS[reason]}${text ? `: ${text}` : ''}`, workerId, verified, scan?.id ?? null, task.id)
    }
    addFieldPhotos(db, task.id, photoUrls, action === 'clean' ? 'sonrasi' : 'genel', workerId)
    audit(db, action === 'clean' ? 'field_clean' : 'field_skip', task.id, {
      workerId, location: key, photoCount: photoUrls.length,
      ...(scan ? { scanId: scan.id } : {}),
      ...(action === 'skip' ? { reason, note: text || null } : {}),
    })
    const { completed_at } = db.prepare('SELECT completed_at FROM cleaning_tasks WHERE id=?').get(task.id)
    return {
      task_id: task.id, status: action === 'clean' ? 'cleaned' : 'skipped', at: completed_at, already: false, verified_by_qr: Boolean(scan),
    }
  })()
}

// Bugünkü işareti geri alır — yalnız işareti yapan kişi. Sahadan açılmış, fotoğrafsız ve hiçbir kayda
// (arıza, sakin değerlendirmesi) bağlı olmayan görev silinir; diğerleri yerinde işaretsiz yapılır.
export function undoField({ location, workerId }, db = getDB()) {
  const spot = resolveFieldLocation(location, db)
  const key = spotKey(spot)
  const today = localToday(db)
  return db.transaction(() => {
    const task = currentTask(db, key, today)
    if (!task || (!task.completed_at && !task.skipped)) throw fail('Bugün geri alınacak işaret yok', 404)
    const owner = task.field_worker_id ?? task.completed_by_worker_id
    if (owner == null || Number(owner) !== Number(workerId)) {
      throw fail('Bu işareti başka biri yaptı; yöneticiniz düzeltebilir', 403)
    }
    const linked = db.prepare(`
      SELECT 1 FROM cleaning_task_photos WHERE task_id=:id
      UNION ALL SELECT 1 FROM maintenance_requests WHERE cleaning_task_id=:id
      UNION ALL SELECT 1 FROM cleaning_task_reviews WHERE task_id=:id OR followup_task_id=:id
      LIMIT 1
    `).get({ id: task.id })
    const removed = task.origin === 'field' && !task.photo_url && !linked
    if (removed) {
      db.prepare('DELETE FROM cleaning_tasks WHERE id=?').run(task.id)
    } else {
      db.prepare(`
        UPDATE cleaning_tasks SET completed_at=NULL, completed_by_worker_id=NULL, skipped=0, skip_reason=NULL,
          field_worker_id=NULL, verified_by_qr=0, verified_scan_event_id=NULL WHERE id=?
      `).run(task.id)
    }
    audit(db, 'field_undo', task.id, { workerId, location: key, removed })
    return { ok: true, removed }
  })()
}

function spotState(task, workerId) {
  if (!task) return { status: null, at: null, by: null, skip_reason: null, mine: false, verified_by_qr: false, complaint: null }
  const status = task.completed_at ? 'cleaned' : task.skipped ? 'skipped' : null
  return {
    status,
    at: task.completed_at || null,
    by: status ? task.by_name || null : null,
    skip_reason: status === 'skipped' ? task.skip_reason : null,
    mine: Boolean(status && workerId != null && task.field_worker_id === Number(workerId)),
    verified_by_qr: Boolean(status && task.verified_by_qr),
    // Geçerli görev sakin şikayetinin takip göreviyse: temizlenene kadar açık
    complaint: task.complaint_comment == null ? null : {
      comment: task.complaint_comment, rating: task.complaint_rating ?? null, created_at: task.complaint_at, open: !task.completed_at,
    },
  }
}

// Blok listesi + bugünkü sayaçlar (yalnız status='active' odalar; temizlik sayaçları oda görevlerinden)
export function boardBlocks(db = getDB()) {
  const today = localToday(db)
  const blocks = db.prepare(`
    SELECT block, COUNT(*) AS rooms,
      SUM(use_state='open') AS open, SUM(use_state='closed') AS closed, SUM(use_state='locked') AS locked,
      SUM(occupancy='occupied') AS occupied, SUM(occupancy='empty') AS empty,
      SUM(occupancy IS NULL AND use_state!='closed') AS unknown
    FROM rooms WHERE status='active' GROUP BY block ORDER BY block
  `).all()
  // Yer başına geçerli (son) görev: şikayet takip görevi aynı odayı ikinci kez saydırmaz
  const tasks = new Map(db.prepare(`
    SELECT block, SUM(completed_at IS NOT NULL) AS cleaned, SUM(skipped=1 AND completed_at IS NULL) AS skipped,
           SUM(completed_at IS NOT NULL AND verified_by_qr=1) AS qr_verified
    FROM cleaning_tasks
    WHERE id IN (SELECT MAX(id) FROM cleaning_tasks WHERE DATE(scheduled_at)=? AND task_type='room' GROUP BY qr_location)
    GROUP BY block
  `).all(today).map(t => [t.block, t]))
  return blocks.map(b => ({
    ...b,
    type: BLOCK_BY_NAME[b.block]?.type ?? null,
    cleaned: Number(tasks.get(b.block)?.cleaned || 0),
    skipped: Number(tasks.get(b.block)?.skipped || 0),
    qr_verified: Number(tasks.get(b.block)?.qr_verified || 0),
  }))
}

// Bir bloğun panosu: katlar → (M ise) ortak alanlar + odalar, bugünkü temizlik durumu ve son temizlik.
export function boardRooms(block, { workerId = null } = {}, db = getDB()) {
  const rooms = db.prepare(`
    SELECT id, floor, room_no, use_state, occupant_shift, no_clean, occupancy
    FROM rooms WHERE block=? AND status='active'
    ORDER BY floor, CAST(room_no AS INTEGER), room_no
  `).all(block)
  if (!rooms.length) return null
  const today = localToday(db)
  // Sırayla okunur, haritada son görev kalır (geçerli görev = currentTask ile aynı kural)
  const todayTasks = new Map(db.prepare(`
    SELECT ct.qr_location, ct.completed_at, ct.skipped, ct.skip_reason, ct.field_worker_id, ct.verified_by_qr,
           COALESCE(cw.full_name, fw.full_name, u.full_name) AS by_name,
           cr.comment AS complaint_comment, cr.rating AS complaint_rating, cr.created_at AS complaint_at
    FROM cleaning_tasks ct
    LEFT JOIN staff cw ON cw.id=ct.completed_by_worker_id
    LEFT JOIN staff fw ON fw.id=ct.field_worker_id
    LEFT JOIN users u ON u.id=ct.assigned_to
    LEFT JOIN cleaning_task_reviews cr ON cr.followup_task_id=ct.id
    WHERE ct.block=? AND DATE(ct.scheduled_at)=?
    ORDER BY ct.id
  `).all(block, today).map(t => [t.qr_location, t]))
  const lastCleaned = new Map(db.prepare(`
    SELECT qr_location, MAX(completed_at) AS at FROM cleaning_tasks
    WHERE block=? AND DATE(scheduled_at)<? AND completed_at IS NOT NULL GROUP BY qr_location
  `).all(block, today).map(r => [r.qr_location, r.at]))
  // Sakinin oda QR'ından açık çamaşır alma talebi (oda başına en çok bir açık talep)
  const pickups = new Map(db.prepare(`
    SELECT sl.qr_location, r.id, r.created_at, r.request_count, r.note
    FROM laundry_pickup_requests r JOIN service_locations sl ON sl.id=r.service_location_id
    WHERE r.status='open' AND sl.block=? AND sl.location_type='room'
  `).all(block).map(({ qr_location: key, ...request }) => [key, request]))
  const enforcement = fieldQrEnforcement(db)
  const keys = rooms.map(r => `${block}-${r.room_no}`)
  if (isMBlock(block)) {
    for (const floor of new Set(rooms.map(r => r.floor))) keys.push(...COMMON_AREAS.map(({ code }) => `${block}-${floor}-${code}`))
  }
  const labels = labelStates(db, keys)

  // qr_label: kapı etiketinin durumu (ortak alanın `label` alanı adıdır, çakışmasın)
  const spot = (location, extra, isRoom) => {
    const qrLabel = labels.get(location) || 'none'
    return {
      location, ...extra, ...spotState(todayTasks.get(location), workerId), last_cleaned_at: lastCleaned.get(location) || null,
      qr_label: qrLabel, qr_required: enforcement === 'verified_labels' && qrLabel === 'verified',
      ...(isRoom ? { pickup_request: pickups.get(location) || null } : {}),
    }
  }
  const floors = new Map()
  for (const r of rooms) {
    if (!floors.has(r.floor)) floors.set(r.floor, { floor: r.floor, common_areas: [], rooms: [] })
    floors.get(r.floor).rooms.push(spot(`${block}-${r.room_no}`, {
      id: r.id, room_no: r.room_no, use_state: r.use_state, occupant_shift: r.occupant_shift,
      no_clean: Boolean(r.no_clean), occupancy: r.occupancy,
    }, true))
  }
  if (isMBlock(block)) {
    // Üretimle aynı: katın bütün odaları kapalıysa o katın ortak alanı temizlenmez
    for (const f of floors.values()) {
      if (!f.rooms.some(r => r.use_state !== 'closed')) continue
      f.common_areas = COMMON_AREAS.map(({ code, label }) => spot(`${block}-${f.floor}-${code}`, { code, label }, false))
    }
  }
  return { block, date: today, type: BLOCK_BY_NAME[block]?.type ?? null, enforcement, floors: [...floors.values()] }
}

// Oda doluluğu: 'occupied' / 'empty' / null (bilinmiyor). Kapalı odada ayarlanamaz. Aynı değer yeniden
// verilince yalnız "son teyit" zamanı tazelenir, denetime satır düşmez.
export function setOccupancy(roomId, occupancy, { workerId = null, userId = null } = {}, db = getDB()) {
  if (occupancy !== null && occupancy !== 'occupied' && occupancy !== 'empty') throw fail('Geçersiz doluluk', 400)
  return db.transaction(() => {
    const room = db.prepare('SELECT id, block, room_no, use_state, occupancy FROM rooms WHERE id=?').get(roomId)
    if (!room) throw fail('Oda bulunamadı', 404)
    if (room.use_state === 'closed') throw fail('Oda kapalı', 409)
    db.prepare(`
      UPDATE rooms SET occupancy=?, occupancy_updated_at=datetime('now'),
        occupancy_updated_by_worker=?, occupancy_updated_by_user=? WHERE id=?
    `).run(occupancy, workerId, userId, room.id)
    if (room.occupancy !== occupancy) {
      audit(db, 'room_occupancy_change', room.id, {
        workerId, location: `${room.block}-${room.room_no}`, before: room.occupancy, after: occupancy,
      }, userId)
    }
    return db.prepare('SELECT id, occupancy, occupancy_updated_at FROM rooms WHERE id=?').get(room.id)
  })()
}

// Toplu doluluk (Telegram "/oda A 101-105 dolu", web toplu seçim): blok zorunlu, kat ve/veya oda numaraları daraltır.
// Kapalı oda atlanır ve sayılır; bulunmayan numara söylenir. Tek odalık kuralla aynı (setOccupancy), tek transaction.
export function setOccupancyBulk({ block, floor = null, room_nos = null, occupancy }, { userId = null, workerId = null } = {}, db = getDB()) {
  if (occupancy !== null && occupancy !== 'occupied' && occupancy !== 'empty') throw fail('Geçersiz doluluk', 400)
  const params = [block]
  let sql = "SELECT id, room_no, use_state, occupancy FROM rooms WHERE block=? AND status='active'"
  if (floor !== null && floor !== undefined) { sql += ' AND floor=?'; params.push(Number(floor)) }
  const wanted = room_nos?.length ? [...new Set(room_nos.map(String))] : null
  if (wanted) { sql += ` AND room_no IN (${wanted.map(() => '?').join(',')})`; params.push(...wanted) }
  return db.transaction(() => {
    const rooms = db.prepare(`${sql} ORDER BY floor, CAST(room_no AS INTEGER), room_no`).all(...params)
    if (!rooms.length) throw fail('Oda bulunamadı', 404)
    const found = new Set(rooms.map(r => r.room_no))
    const result = { updated: 0, unchanged: 0, skipped_closed: [], not_found: wanted ? wanted.filter(no => !found.has(no)) : [] }
    for (const room of rooms) {
      if (room.use_state === 'closed') { result.skipped_closed.push(room.room_no); continue }
      setOccupancy(room.id, occupancy, { userId, workerId }, db)
      if (room.occupancy === occupancy) result.unchanged += 1
      else result.updated += 1
    }
    return result
  })()
}

// "Katın hepsi temizlendi" dışında kalanlar; oda birden çok sebebe uyuyorsa ilk sebepte sayılır
// (önce odanın durumu, en son "bugün zaten işaretli").
function floorExclusion(room, task, qrRequired) {
  if (room.use_state === 'closed') return 'closed'
  if (room.use_state === 'locked') return 'locked'
  if (room.no_clean) return 'no_clean'
  if (room.occupant_shift === 'night') return 'night'
  if (room.occupancy === 'empty') return 'empty'
  if (qrRequired) return 'qr_required'
  if (task && (task.completed_at || task.skipped)) return 'marked'
  return null
}

const isMarked = task => Boolean(task && (task.completed_at || task.skipped))

// Katın uygun bütün yerlerini (işaretsiz açık odalar + M ise işaretsiz ortak alanlar) temizlendi yapar.
// dryRun: hiçbir şey yazmaz, onay penceresi için listeyi ve dışarıda kalanların sayısını verir.
export function cleanFloor({ block, floor, workerId, dryRun = false }, db = getDB()) {
  return db.transaction(() => {
    const rooms = db.prepare(`
      SELECT room_no, use_state, occupant_shift, no_clean, occupancy FROM rooms
      WHERE block=? AND floor=? AND status='active' ORDER BY CAST(room_no AS INTEGER), room_no
    `).all(block, Number(floor))
    if (!rooms.length) throw fail('Kat bulunamadı', 404)
    const today = localToday(db)
    // Yer başına geçerli (son) görev — şikayet takip görevi ilk görevin yerine geçer
    const tasks = new Map(db.prepare(`
      SELECT qr_location, completed_at, skipped FROM cleaning_tasks WHERE block=? AND floor=? AND DATE(scheduled_at)=? ORDER BY id
    `).all(block, Number(floor), today).map(t => [t.qr_location, t]))
    const excluded = { closed: 0, locked: 0, night: 0, empty: 0, no_clean: 0, qr_required: 0, marked: 0 }
    const locations = []
    const commonKeys = isMBlock(block) && rooms.some(r => r.use_state !== 'closed')
      ? COMMON_AREAS.map(({ code }) => `${block}-${floor}-${code}`)
      : []
    const roomKeys = rooms.map(r => `${block}-${r.room_no}`)
    // Zorunluluk açıkken etiketi doğrulanmış kapı toplu işaretlenmez: kanıt kapı kapı okutmayla gelir
    const labels = fieldQrEnforcement(db) === 'verified_labels' ? labelStates(db, [...commonKeys, ...roomKeys]) : new Map()
    const needsQr = key => labels.get(key) === 'verified'
    for (const key of commonKeys) {
      if (needsQr(key)) excluded.qr_required += 1
      else if (isMarked(tasks.get(key))) excluded.marked += 1
      else locations.push(key)
    }
    rooms.forEach((r, i) => {
      const why = floorExclusion(r, tasks.get(roomKeys[i]), needsQr(roomKeys[i]))
      if (why) excluded[why] += 1
      else locations.push(roomKeys[i])
    })
    if (!dryRun) for (const location of locations) markField({ location, action: 'clean', workerId }, db)
    return { locations, excluded }
  })()
}

// Kat toplusunun geri alınışı: dönen yer listesi; yalnız bu kişinin işaretleri geri alınır, gerisi sayılır.
export function undoFloor({ locations, workerId }, db = getDB()) {
  if (!Array.isArray(locations) || !locations.length || locations.length > 200) throw fail('Geçersiz yer listesi', 400)
  return db.transaction(() => {
    let undone = 0
    let skipped = 0
    for (const location of locations) {
      try {
        undoField({ location, workerId }, db)
        undone += 1
      } catch (e) {
        if (!e.statusCode) throw e
        skipped += 1
      }
    }
    return { undone, skipped }
  })()
}
