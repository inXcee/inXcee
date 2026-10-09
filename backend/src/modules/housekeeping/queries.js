import { getDB } from '../../shared/db/index.js'
import { createRequest as createMaintenanceRequest } from '../maintenance/queries.js'
import { canonicalMaintenanceRow, resolveMaintenanceLocation } from '../maintenance/location.js'
import { BLOCK_BY_NAME } from '../../shared/blocks.js'

// Oda durumundan doğan atlama gerekçeleri — durum değişince bugünkü görevi geri açmak için de bu metinler aranır
export const ROOM_SKIP = { locked: 'Oda kilitli', noClean: 'Temizlik istenmiyor', closed: 'Oda kapalı' }
const STATE_REASONS = Object.values(ROOM_SKIP)

export function generateDailyTasks(date = new Date()) {
  const db = getDB()
  // YEREL tarih (toISOString UTC döndürür — 00:00-03:00 TR arasında üretim
  // dünün tarihini basardı; sv-SE locale'i YYYY-MM-DD verir)
  const dateStr  = date.toLocaleDateString('sv-SE')
  const scheduled = `${dateStr} 08:00:00`
  const insert = db.prepare(`
    INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location)
    SELECT ?,?,?,?,?,?
    WHERE NOT EXISTS (
      SELECT 1 FROM cleaning_tasks
      WHERE qr_location=? AND DATE(scheduled_at)=?
    )
  `)
  // Oda görevi: kilitli / temizlik istemeyen oda atlanmış doğar (sahada görünür, "bekleyen" şişmez);
  // gececi odası 07–19 uyur → 19:00'a planlanır.
  const insertRoom = db.prepare(`
    INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location, skipped, skip_reason)
    SELECT ?,?,?,'room',?,?,?,?
    WHERE NOT EXISTS (
      SELECT 1 FROM cleaning_tasks
      WHERE qr_location=? AND DATE(scheduled_at)=?
    )
  `)
  let count = 0
  const tx = db.transaction(() => {
    // Süresi dolan kapalı/kilitli durum kendiliğinden açılır (state_until = son gün)
    db.prepare(`UPDATE rooms SET use_state='open', state_until=NULL, state_note=NULL, state_updated_at=datetime('now')
                WHERE use_state!='open' AND state_until IS NOT NULL AND state_until < ?`).run(dateStr)
    // M blokları için ortak alan task'i (sadece M tipi ortak banyo/WC içerir);
    // katın bütün odaları kapalıysa o katın ortak alanı da temizlenmez
    // Blok tipi tek kaynaktan (shared/blocks.js); yalnız aktif odalar sayılır.
    const mFloors = db.prepare(`SELECT block, floor FROM rooms WHERE status='active'
                                GROUP BY block, floor HAVING SUM(use_state!='closed') > 0`).all()
      .filter(({ block }) => BLOCK_BY_NAME[block]?.type === 'M')
    const commonAreas = [
      { code: 'corridor', label: 'Koridor' },
      { code: 'toilet', label: 'Tuvalet / WC' },
      { code: 'bathroom', label: 'Banyo' },
      { code: 'stairs', label: 'Merdiven' },
    ]
    mFloors.forEach(({ block, floor }) => {
      commonAreas.forEach(({ code, label }) => {
        const qrLocation = `${block}-${floor}-${code}`
        count += insert.run(
          `${block} ${floor}.Kat ${label}`, block, floor, 'common_area', scheduled,
          qrLocation, qrLocation, dateStr,
        ).changes
      })
    })
    // Kullanımdaki aktif odalar için bireysel oda task'i (M, S ve Y bloklar dahil); kapalı odaya görev yok
    const allRooms = db.prepare(`SELECT id, block, floor, room_no, use_state, occupant_shift, no_clean
                                 FROM rooms WHERE status='active' AND use_state!='closed'`).all()
    allRooms.forEach(r => {
      const qrLocation = `${r.block}-${r.room_no}`
      const at = `${dateStr} ${r.occupant_shift === 'night' ? '19:00:00' : '08:00:00'}`
      const skipReason = r.use_state === 'locked' ? ROOM_SKIP.locked : (r.no_clean ? ROOM_SKIP.noClean : null)
      count += insertRoom.run(
        `${r.block} Oda ${r.room_no}`, r.block, r.floor, at, qrLocation,
        skipReason ? 1 : 0, skipReason, qrLocation, dateStr,
      ).changes
    })
  })
  tx()
  return count
}

export function getTasks({ assigned_to, date, block, uncleaned } = {}) {
  const db = getDB()
  let q = `SELECT ct.*, u.full_name as assignee_name, w.full_name as worker_name
           FROM cleaning_tasks ct
           LEFT JOIN users u ON u.id=ct.assigned_to
           LEFT JOIN staff w ON w.id=ct.completed_by_worker_id
           WHERE 1=1`
  const params = []
  if (assigned_to) { q += ' AND ct.assigned_to=?'; params.push(assigned_to) }
  if (date)        { q += ' AND DATE(ct.scheduled_at)=?'; params.push(date) }
  if (block)       { q += ' AND ct.block=?'; params.push(block) }
  if (uncleaned)   { q += ' AND ct.completed_at IS NULL AND ct.skipped=0' }
  q += ' ORDER BY ct.scheduled_at'
  return db.prepare(q).all(...params)
}

export function completeTask(taskId, userId, checklist, viaQr = false, photoUrl = null) {
  const db = getDB()
  // Zaten tamamlanmış göreve ikinci okutma/işaretleme ilk temizleyeni ve saatini EZMEZ (performans ve
  // geçmiş "kim temizledi" doğru kalır); QR doğrulaması ve yeni fotoğraf/checklist eklenebilir.
  // (SQLite SET ifadeleri satırın ESKİ değerlerini görür.)
  db.prepare(`
    UPDATE cleaning_tasks
    SET completed_at=COALESCE(completed_at, datetime('now')),
        assigned_to=CASE WHEN completed_at IS NULL THEN ? ELSE assigned_to END,
        verified_by_qr=MAX(COALESCE(verified_by_qr, 0), ?),
        skipped=0, skip_reason=NULL, checklist=COALESCE(?, checklist),
        photo_url=COALESCE(?, photo_url)
    WHERE id=?
  `).run(userId, viaQr ? 1 : 0, checklist ? JSON.stringify(checklist) : null, photoUrl, taskId)
}

export function uncompleteTask(taskId) {
  const db = getDB()
  db.prepare(`
    UPDATE cleaning_tasks
    SET completed_at=NULL, assigned_to=NULL, verified_by_qr=0
    WHERE id=?
  `).run(taskId)
}

// ── Çoklu fotoğraf (cleaning_task_photos) ──────────────────────────────────────
export const CLEANING_PHOTO_CATEGORIES = ['genel', 'oncesi', 'sonrasi', 'detay', 'hasar']

function normalizePhotoCategory(value) {
  const v = String(value || '').trim().toLowerCase()
  return CLEANING_PHOTO_CATEGORIES.includes(v) ? v : 'genel'
}

// Görevin kapak fotoğrafını (cleaning_tasks.photo_url) tablodaki ilk fotoğrafa senkronlar.
export function syncTaskCover(taskId) {
  const db = getDB()
  const first = db.prepare(
    'SELECT photo_url FROM cleaning_task_photos WHERE task_id=? ORDER BY sort_order, id LIMIT 1'
  ).get(taskId)
  db.prepare('UPDATE cleaning_tasks SET photo_url=? WHERE id=?').run(first?.photo_url || null, taskId)
  return first?.photo_url || null
}

export function listTaskPhotos(taskId) {
  return getDB().prepare(`
    SELECT p.id, p.task_id, p.photo_url, p.category, p.caption, p.sort_order,
           p.uploaded_by, p.uploaded_at, u.full_name AS uploaded_by_name
    FROM cleaning_task_photos p
    LEFT JOIN users u ON u.id=p.uploaded_by
    WHERE p.task_id=?
    ORDER BY p.sort_order, p.id
  `).all(taskId)
}

// Bir göreve bir veya birden fazla fotoğraf ekler. photos: [{ photo_url, category, caption }]
export function addTaskPhotos(taskId, photos = [], userId = null) {
  const db = getDB()
  const list = (photos || []).filter(p => p && p.photo_url)
  if (!list.length) return []
  const startRow = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM cleaning_task_photos WHERE task_id=?').get(taskId).m
  const insert = db.prepare(`
    INSERT INTO cleaning_task_photos(task_id, photo_url, category, caption, sort_order, uploaded_by)
    VALUES(?,?,?,?,?,?)
  `)
  const ids = []
  const tx = db.transaction(() => {
    list.forEach((p, i) => {
      const info = insert.run(taskId, p.photo_url, normalizePhotoCategory(p.category), p.caption || null, startRow + 1 + i, userId)
      ids.push(info.lastInsertRowid)
    })
    syncTaskCover(taskId)
  })
  tx()
  return listTaskPhotos(taskId).filter(p => ids.includes(p.id))
}

// Fotoğrafın kategori/açıklamasını günceller. Bulunamazsa null.
export function updateTaskPhoto(taskId, photoId, patch = {}) {
  const db = getDB()
  const row = db.prepare('SELECT * FROM cleaning_task_photos WHERE id=? AND task_id=?').get(photoId, taskId)
  if (!row) return null
  const category = patch.category !== undefined ? normalizePhotoCategory(patch.category) : row.category
  const caption = patch.caption !== undefined ? (patch.caption || null) : row.caption
  db.prepare('UPDATE cleaning_task_photos SET category=?, caption=? WHERE id=?').run(category, caption, photoId)
  return db.prepare('SELECT * FROM cleaning_task_photos WHERE id=?').get(photoId)
}

// Fotoğrafı siler; silinen kaydı döner (çağıran dosyayı diskten kaldırır). Kapak resenkronlanır.
export function deleteTaskPhoto(taskId, photoId) {
  const db = getDB()
  const row = db.prepare('SELECT * FROM cleaning_task_photos WHERE id=? AND task_id=?').get(photoId, taskId)
  if (!row) return null
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM cleaning_task_photos WHERE id=?').run(photoId)
    syncTaskCover(taskId)
  })
  tx()
  return row
}

export function skipTask(taskId, reason, userId) {
  const db = getDB()
  db.prepare(`
    UPDATE cleaning_tasks
    SET skipped=1, skip_reason=?, assigned_to=?, completed_at=NULL
    WHERE id=?
  `).run(reason || null, userId, taskId)
}

export function unskipTask(taskId) {
  const db = getDB()
  db.prepare(`UPDATE cleaning_tasks SET skipped=0, skip_reason=NULL WHERE id=?`).run(taskId)
}

export function getFloorTaskPreview(block, floor, date) {
  const db = getDB()
  return db.prepare(`
    SELECT id, area, task_type
    FROM cleaning_tasks
    WHERE block=? AND floor=? AND DATE(scheduled_at)=? AND completed_at IS NULL AND skipped=0
    ORDER BY area
  `).all(block, floor, date)
}

export function completeFloorTasks(block, floor, date, userId) {
  const db = getDB()
  const r = db.prepare(`
    UPDATE cleaning_tasks
    SET completed_at=datetime('now'), assigned_to=?, skipped=0, skip_reason=NULL
    WHERE block=? AND floor=? AND DATE(scheduled_at)=? AND completed_at IS NULL AND skipped=0
  `).run(userId, block, floor, date)
  return r.changes
}

// Oda/ortak alan temizlik geçmişi — qr_location üretimle aynı anahtar:
// oda `M1-205`, ortak alan `M1-1-common` (generateDailyTasks)
export function getTaskHistory(qrLocation, days = 30) {
  const db = getDB()
  const offset = `-${Math.max(1, Math.min(180, days)) - 1} days`
  return db.prepare(`
    SELECT ct.id, ct.area, ct.task_type, ct.scheduled_at, ct.completed_at,
           ct.skipped, ct.skip_reason, ct.photo_url, ct.verified_by_qr,
           (SELECT COUNT(*) FROM cleaning_task_photos p WHERE p.task_id=ct.id) AS photo_count,
           u.full_name as assignee_name, w.full_name as worker_name
    FROM cleaning_tasks ct
    LEFT JOIN users u ON u.id=ct.assigned_to
    LEFT JOIN staff w ON w.id=ct.completed_by_worker_id
    WHERE ct.qr_location = ?
      AND date(ct.scheduled_at) >= date('now', 'localtime', ?)
    ORDER BY ct.scheduled_at DESC
  `).all(qrLocation, offset)
}

export function getPhotoOverview({ days = 7, block, floor } = {}) {
  const db = getDB()
  const safeDays = Math.max(1, Math.min(7, Number(days) || 7))
  const offset = `-${safeDays - 1} days`
  let sql = `
    SELECT ct.id, ct.area, ct.block, ct.floor, ct.task_type, ct.qr_location,
           ct.scheduled_at, ct.completed_at, ct.skipped, ct.skip_reason,
           ct.photo_url, ct.verified_by_qr,
           (SELECT COUNT(*) FROM cleaning_task_photos p WHERE p.task_id=ct.id) AS photo_count,
           (SELECT GROUP_CONCAT(DISTINCT p.category) FROM cleaning_task_photos p WHERE p.task_id=ct.id) AS photo_categories,
           CASE
             WHEN ct.task_type='room' THEN 'room'
             WHEN ct.qr_location LIKE '%-corridor' THEN 'corridor'
             WHEN ct.qr_location LIKE '%-toilet' THEN 'toilet'
             WHEN ct.qr_location LIKE '%-bathroom' THEN 'bathroom'
             WHEN ct.qr_location LIKE '%-stairs' THEN 'stairs'
             ELSE 'common'
           END AS area_code,
           u.full_name AS assignee_name,
           w.full_name AS worker_name
    FROM cleaning_tasks ct
    LEFT JOIN users u ON u.id=ct.assigned_to
    LEFT JOIN staff w ON w.id=ct.completed_by_worker_id
    WHERE DATE(ct.scheduled_at) >= DATE('now', 'localtime', ?)
  `
  const params = [offset]
  if (block) { sql += ' AND ct.block=?'; params.push(block) }
  if (floor !== undefined && floor !== null && floor !== '') {
    sql += ' AND ct.floor=?'; params.push(Number(floor))
  }
  sql += ` ORDER BY DATE(ct.scheduled_at) DESC, ct.block, ct.floor,
           CASE ct.task_type WHEN 'common_area' THEN 0 ELSE 1 END, ct.area`
  return db.prepare(sql).all(...params)
}

export function getDNDRooms() {
  const db = getDB()
  const hour = new Date().getHours()
  // Sadece gece vardiyası gündüz uyur → DND 07:00–19:00
  // Gündüz vardiyası DND yok (gece zaten herkes uyur, temizlik gece yapılmaz)
  const nightShiftSleeping = hour >= 7 && hour < 19

  if (!nightShiftSleeping) return []

  // Sakin kaydından gelen gececiler + sahada "gececi" diye işaretlenmiş odalar (sakin kaydı çoğu zaman yok)
  return db.prepare(`
    SELECT r.id, r.block, r.floor, r.room_no,
      'night_sleeping' as dnd_reason,
      'night' as shift_type,
      COUNT(ra.id) as occupied_count
    FROM rooms r
    JOIN room_assignments ra ON ra.room_id=r.id AND ra.check_out_at IS NULL
    JOIN personnel p ON p.id=ra.personnel_id AND p.check_out_date IS NULL
    JOIN shifts s ON s.personnel_id=p.id AND s.shift_type='night'
    WHERE r.use_state!='closed'
    GROUP BY r.id
    UNION
    SELECT r.id, r.block, r.floor, r.room_no, 'night_sleeping', 'night', 0
    FROM rooms r
    WHERE r.occupant_shift='night' AND r.use_state!='closed'
      AND r.id NOT IN (SELECT ra.room_id FROM room_assignments ra
                       JOIN personnel p ON p.id=ra.personnel_id AND p.check_out_date IS NULL
                       JOIN shifts s ON s.personnel_id=p.id AND s.shift_type='night'
                       WHERE ra.check_out_at IS NULL)
  `).all()
}

export function getRoomWithFaults(block, roomNo) {
  const db = getDB()
  const room = db.prepare(`SELECT * FROM rooms WHERE block=? AND room_no=?`).get(block, roomNo)
  // Yalnız BU odanın arızaları: room_id eşleşmesi, eski kayıtta (room_id yok) konum metni bakım modülünün
  // çözücüsüyle tam odaya çözülürse. Eskiden LIKE '%A%101%' A1-101'i, '%Oda 20%' 201-209'u da getiriyordu.
  const faults = room ? db.prepare(`
    SELECT id, location, block, room_id, description, status, priority, opened_at, closed_at,
           photo_before, photo_url
    FROM maintenance_requests
    WHERE room_id=? OR (room_id IS NULL AND location LIKE ?)
    ORDER BY opened_at DESC
  `).all(room.id, `%${roomNo}%`)
    .filter(f => f.room_id === room.id || canonicalMaintenanceRow(db, f).canonical_room_id === room.id)
    .map(({ block: _b, room_id: _r, ...f }) => f) : []
  const personnel = room ? db.prepare(`
    SELECT p.id, p.full_name, p.company, p.phone_number, ra.bed_no,
      COALESCE(s.shift_type, 'day') as shift_type
    FROM room_assignments ra
    JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN shifts s ON s.personnel_id = p.id
    WHERE ra.room_id = ? AND ra.check_out_at IS NULL AND p.check_out_date IS NULL
    ORDER BY ra.bed_no
  `).all(room.id) : []
  return { room: room || null, faults, personnel }
}

export function toggleNoClean(roomId, value) {
  const db = getDB()
  db.transaction(() => {
    db.prepare(`UPDATE rooms SET no_clean=? WHERE id=?`).run(value ? 1 : 0, roomId)
    syncTodayRoomTask(db, roomId)
  })()
}

// ── Oda kullanım durumu (kapalı / kilitli / gececi) ────────────────────────────

function localToday(db) {
  return db.prepare("SELECT date('now','localtime') d").get().d
}

// Bugünkü oda görevini odanın yeni durumuna uydurur. Yalnız henüz yapılmamış görevlere ve yalnız
// durumdan doğan atlamalara dokunur: elle "misafir istemedi" diye atlanmış görev geri açılmaz.
function syncTodayRoomTask(db, roomId) {
  const r = db.prepare('SELECT id, block, floor, room_no, status, use_state, occupant_shift, no_clean FROM rooms WHERE id=?').get(roomId)
  if (!r) return
  const today = localToday(db)
  const qr = `${r.block}-${r.room_no}`
  const task = db.prepare(`SELECT id, skipped, skip_reason, completed_at FROM cleaning_tasks
                           WHERE qr_location=? AND DATE(scheduled_at)=? AND task_type='room'`).get(qr, today)
  if (task?.completed_at) return
  const reason = r.use_state === 'closed' ? ROOM_SKIP.closed
    : r.use_state === 'locked' ? ROOM_SKIP.locked
      : r.no_clean ? ROOM_SKIP.noClean : null
  const at = `${today} ${r.occupant_shift === 'night' ? '19:00:00' : '08:00:00'}`
  if (!task) {
    // bugün kapalıyken üretilmemiş görev, oda açılınca bugüne eklenir
    if (reason || r.status !== 'active') return
    const hasToday = db.prepare('SELECT 1 FROM cleaning_tasks WHERE DATE(scheduled_at)=? LIMIT 1').get(today)
    if (!hasToday) return // günlük üretim henüz çalışmadı; kendisi üretecek
    db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location)
                VALUES(?,?,?,'room',?,?)`).run(`${r.block} Oda ${r.room_no}`, r.block, r.floor, at, qr)
    return
  }
  if (task.skipped && !STATE_REASONS.includes(task.skip_reason)) return
  db.prepare('UPDATE cleaning_tasks SET skipped=?, skip_reason=?, scheduled_at=? WHERE id=?')
    .run(reason ? 1 : 0, reason, at, task.id)
}

const STATE_FIELDS = ['use_state', 'occupant_shift', 'state_note', 'state_until']

// Tek oda ya da seçili odalar: { use_state?, occupant_shift?, state_note?, state_until? } — verilmeyen alan değişmez.
// Kapalı/kilitliden 'open'a dönünce not ve bitiş tarihi temizlenir.
export function setRoomState(roomIds, data, userId) {
  const db = getDB()
  const sets = []
  const params = []
  for (const f of STATE_FIELDS) {
    if (data[f] !== undefined) { sets.push(`${f}=?`); params.push(data[f] === '' ? null : data[f]) }
  }
  if (data.use_state === 'open') {
    if (data.state_note === undefined) sets.push('state_note=NULL')
    if (data.state_until === undefined) sets.push('state_until=NULL')
  }
  if (!sets.length) return { updated: 0 }
  sets.push("state_updated_at=datetime('now')", 'state_updated_by=?')
  params.push(userId)
  const update = db.prepare(`UPDATE rooms SET ${sets.join(', ')} WHERE id=?`)
  let updated = 0
  db.transaction(() => {
    for (const id of roomIds) {
      updated += update.run(...params, id).changes
      syncTodayRoomTask(db, id)
    }
  })()
  return { updated }
}

// Blok / kat / oda numaralarından oda id'leri (Telegram ve toplu web işlemi için)
export function findRoomIds({ block, floor, room_nos } = {}) {
  const db = getDB()
  let sql = 'SELECT id FROM rooms WHERE block=?'
  const params = [block]
  if (floor !== undefined && floor !== null) { sql += ' AND floor=?'; params.push(Number(floor)) }
  if (room_nos?.length) {
    sql += ` AND room_no IN (${room_nos.map(() => '?').join(',')})`
    params.push(...room_nos.map(String))
  }
  return db.prepare(sql).all(...params).map(r => r.id)
}

// Blok başına durum sayıları + bugünkü temizlik ilerlemesi
export function getRoomStateSummary() {
  const db = getDB()
  const today = localToday(db)
  const blocks = db.prepare(`
    SELECT block, COUNT(*) AS rooms,
      SUM(use_state='open') AS open, SUM(use_state='closed') AS closed, SUM(use_state='locked') AS locked,
      SUM(occupant_shift='night') AS night, SUM(occupant_shift='day') AS day, SUM(occupant_shift='mixed') AS mixed,
      SUM(no_clean=1) AS no_clean
    FROM rooms WHERE status='active' GROUP BY block ORDER BY block`).all()
  const tasks = db.prepare(`
    SELECT block, COUNT(*) AS total, SUM(completed_at IS NOT NULL) AS done, SUM(skipped=1) AS skipped,
      SUM(completed_at IS NULL AND skipped=0) AS pending
    FROM cleaning_tasks WHERE DATE(scheduled_at)=? GROUP BY block`).all(today)
  const byBlock = Object.fromEntries(tasks.map(t => [t.block, t]))
  return { date: today, blocks: blocks.map(b => ({ ...b, tasks: byBlock[b.block] || null })) }
}

export function listRoomsWithState({ block, use_state, occupant_shift } = {}) {
  const db = getDB()
  let sql = `SELECT id, block, floor, room_no, use_state, occupant_shift, no_clean, state_note, state_until, state_updated_at
             FROM rooms WHERE status='active'`
  const params = []
  if (block) { sql += ' AND block=?'; params.push(block) }
  if (use_state) { sql += ' AND use_state=?'; params.push(use_state) }
  if (occupant_shift) { sql += ' AND occupant_shift=?'; params.push(occupant_shift) }
  sql += ' ORDER BY block, floor, CAST(room_no AS INTEGER), room_no'
  return db.prepare(sql).all(...params)
}

export function updateRoomNotes(roomId, notes) {
  const db = getDB()
  db.prepare('UPDATE rooms SET notes=? WHERE id=?').run(notes, roomId)
}

// Bakım modülünün kayıt yoluyla: SLA deadline + blok/oda eşleşmesi gelir. Eskiden doğrudan INSERT
// ediliyordu — sla_deadline NULL kalıyor, temizlik ekibinin bildirdiği arızalar SLA alarmına hiç düşmüyordu.
export function reportFault(location, description, userId, priority, photoBefore) {
  const canonical = resolveMaintenanceLocation(getDB(), { location })
  return createMaintenanceRequest({
    location, description, priority: priority || 'medium', reporterUserId: userId, photoBefore, ...canonical,
  })
}

// ── Cleaning Staff ───────────────────────────────────────────────────────────

export function getStaff(block) {
  const db = getDB()
  let q = 'SELECT * FROM cleaning_staff WHERE is_active=1'
  const params = []
  if (block) { q += ' AND assigned_block=?'; params.push(block) }
  q += ' ORDER BY assigned_block, assigned_floor, full_name'
  return db.prepare(q).all(...params)
}

export function createStaff(fullName, phone) {
  const db = getDB()
  return db.prepare(
    'INSERT INTO cleaning_staff(full_name,phone) VALUES(?,?)'
  ).run(fullName, phone || null).lastInsertRowid
}

export function updateStaff(id, data) {
  const db = getDB()
  const sets = []
  const params = []
  if (data.full_name !== undefined)      { sets.push('full_name=?');      params.push(data.full_name) }
  if (data.phone !== undefined)          { sets.push('phone=?');          params.push(data.phone || null) }
  if (data.assigned_block !== undefined) { sets.push('assigned_block=?'); params.push(data.assigned_block) }
  if (data.assigned_floor !== undefined) { sets.push('assigned_floor=?'); params.push(data.assigned_floor) }
  if (sets.length === 0) return
  params.push(id)
  db.prepare(`UPDATE cleaning_staff SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteStaff(id) {
  const db = getDB()
  db.prepare('UPDATE cleaning_staff SET is_active=0 WHERE id=?').run(id)
}
