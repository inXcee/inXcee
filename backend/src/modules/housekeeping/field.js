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
