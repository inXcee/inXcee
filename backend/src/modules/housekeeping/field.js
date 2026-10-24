// Saha ekranı — kat hizmetleri telefondan/tabletten oda durumu girer (docs/saha-ekrani.md).
// Temizlik kaydı günlük üretimden değil, sahadan "temizlendi / temizlenemedi" denince açılır
// (cleaning_tasks.origin='field'); doluluk oda bazlıdır (rooms.occupancy). Anahtarlar üretimle aynı:
// oda `BLOK-ODANO`, M bloğu ortak alanı `BLOK-KAT-kod` — Hermes /temizlik ve web aynı kaydı görür.
import { getDB } from '../../shared/db/index.js'
import { BLOCK_BY_NAME } from '../../shared/blocks.js'
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
const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode })

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

const todayTask = (db, key, today) => db.prepare(`
  SELECT * FROM cleaning_tasks WHERE qr_location=? AND DATE(scheduled_at)=? ORDER BY id LIMIT 1
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

// Kiosk oturumunda users kaydı yok: kişi detail.workerId'de (mevcut kiosk denetim kaydı düzeni)
function audit(db, action, taskId, detail) {
  db.prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail) VALUES(NULL, ?, 'avs-self-service', ?, ?)`)
    .run(action, taskId, JSON.stringify(detail))
}

// Temizlendi / temizlenemedi. İkinci "temizlendi" ilk temizleyeni ve saatini ezmez (already: true).
export function markField({ location, action, reason, note, workerId, photoUrls = [] }, db = getDB()) {
  if (action !== 'clean' && action !== 'skip') throw fail('Geçersiz işlem', 400)
  if (action === 'skip' && !FIELD_SKIP_REASONS[reason]) throw fail('Geçersiz temizlenememe nedeni', 400)
  const spot = resolveFieldLocation(location, db)
  if (spot.kind === 'room' && spot.room.use_state === 'closed') throw fail('Oda kapalı', 409)
  const key = spotKey(spot)
  const today = localToday(db)
  return db.transaction(() => {
    let task = todayTask(db, key, today)
    if (task?.completed_at) {
      if (action === 'clean') return { task_id: task.id, status: 'cleaned', at: task.completed_at, already: true }
      throw fail('Tamamlanmış görev temizlenemedi olarak işaretlenemez', 409)
    }
    if (!task) task = openFieldTask(db, spot, key, today)
    const text = String(note ?? '').trim()
    if (action === 'clean') {
      db.prepare(`
        UPDATE cleaning_tasks SET completed_at=datetime('now'), skipped=0, skip_reason=NULL,
          completed_by_worker_id=?, field_worker_id=? WHERE id=?
      `).run(workerId, workerId, task.id)
    } else {
      db.prepare('UPDATE cleaning_tasks SET skipped=1, skip_reason=?, completed_at=NULL, field_worker_id=? WHERE id=?')
        .run(`${FIELD_SKIP_REASONS[reason]}${text ? `: ${text}` : ''}`, workerId, task.id)
    }
    addFieldPhotos(db, task.id, photoUrls, action === 'clean' ? 'sonrasi' : 'genel', workerId)
    audit(db, action === 'clean' ? 'field_clean' : 'field_skip', task.id, {
      workerId, location: key, photoCount: photoUrls.length,
      ...(action === 'skip' ? { reason, note: text || null } : {}),
    })
    const { completed_at } = db.prepare('SELECT completed_at FROM cleaning_tasks WHERE id=?').get(task.id)
    return { task_id: task.id, status: action === 'clean' ? 'cleaned' : 'skipped', at: completed_at, already: false }
  })()
}

// Bugünkü işareti geri alır — yalnız işareti yapan kişi. Sahadan açılmış, fotoğrafsız ve hiçbir kayda
// (arıza, sakin değerlendirmesi) bağlı olmayan görev silinir; diğerleri yerinde işaretsiz yapılır.
export function undoField({ location, workerId }, db = getDB()) {
  const spot = resolveFieldLocation(location, db)
  const key = spotKey(spot)
  const today = localToday(db)
  return db.transaction(() => {
    const task = todayTask(db, key, today)
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
          field_worker_id=NULL WHERE id=?
      `).run(task.id)
    }
    audit(db, 'field_undo', task.id, { workerId, location: key, removed })
    return { ok: true, removed }
  })()
}

function spotState(task, workerId) {
  if (!task) return { status: null, at: null, by: null, skip_reason: null, mine: false }
  const status = task.completed_at ? 'cleaned' : task.skipped ? 'skipped' : null
  return {
    status,
    at: task.completed_at || null,
    by: status ? task.by_name || null : null,
    skip_reason: status === 'skipped' ? task.skip_reason : null,
    mine: Boolean(status && workerId != null && task.field_worker_id === Number(workerId)),
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
  const tasks = new Map(db.prepare(`
    SELECT block, SUM(completed_at IS NOT NULL) AS cleaned, SUM(skipped=1 AND completed_at IS NULL) AS skipped
    FROM cleaning_tasks WHERE DATE(scheduled_at)=? AND task_type='room' GROUP BY block
  `).all(today).map(t => [t.block, t]))
  return blocks.map(b => ({
    ...b,
    type: BLOCK_BY_NAME[b.block]?.type ?? null,
    cleaned: Number(tasks.get(b.block)?.cleaned || 0),
    skipped: Number(tasks.get(b.block)?.skipped || 0),
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
  const todayTasks = new Map(db.prepare(`
    SELECT ct.qr_location, ct.completed_at, ct.skipped, ct.skip_reason, ct.field_worker_id,
           COALESCE(cw.full_name, fw.full_name, u.full_name) AS by_name
    FROM cleaning_tasks ct
    LEFT JOIN staff cw ON cw.id=ct.completed_by_worker_id
    LEFT JOIN staff fw ON fw.id=ct.field_worker_id
    LEFT JOIN users u ON u.id=ct.assigned_to
    WHERE ct.block=? AND DATE(ct.scheduled_at)=?
  `).all(block, today).map(t => [t.qr_location, t]))
  const lastCleaned = new Map(db.prepare(`
    SELECT qr_location, MAX(completed_at) AS at FROM cleaning_tasks
    WHERE block=? AND DATE(scheduled_at)<? AND completed_at IS NOT NULL GROUP BY qr_location
  `).all(block, today).map(r => [r.qr_location, r.at]))

  const spot = (location, extra) => ({
    location, ...extra, ...spotState(todayTasks.get(location), workerId), last_cleaned_at: lastCleaned.get(location) || null,
  })
  const floors = new Map()
  for (const r of rooms) {
    if (!floors.has(r.floor)) floors.set(r.floor, { floor: r.floor, common_areas: [], rooms: [] })
    floors.get(r.floor).rooms.push(spot(`${block}-${r.room_no}`, {
      id: r.id, room_no: r.room_no, use_state: r.use_state, occupant_shift: r.occupant_shift,
      no_clean: Boolean(r.no_clean), occupancy: r.occupancy,
    }))
  }
  if (isMBlock(block)) {
    // Üretimle aynı: katın bütün odaları kapalıysa o katın ortak alanı temizlenmez
    for (const f of floors.values()) {
      if (!f.rooms.some(r => r.use_state !== 'closed')) continue
      f.common_areas = COMMON_AREAS.map(({ code, label }) => spot(`${block}-${f.floor}-${code}`, { code, label }))
    }
  }
  return { block, date: today, type: BLOCK_BY_NAME[block]?.type ?? null, floors: [...floors.values()] }
}
