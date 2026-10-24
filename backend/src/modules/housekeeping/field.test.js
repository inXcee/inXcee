import { beforeAll, describe, expect, it } from 'vitest'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { boardBlocks, boardRooms, markField, resolveFieldLocation, undoField } from './field.js'

// Saha ekranı oda panosu (spec: docs/superpowers/specs/2026-10-23-saha-ekrani-design.md).
// FX: M tipi olmayan deneme bloğu — odalar sırasız eklenir ki sıralama sınansın.
let db, today, yesterday, workerId, otherWorkerId

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  today = db.prepare("SELECT date('now','localtime') d").get().d
  yesterday = db.prepare("SELECT date('now','localtime','-1 day') d").get().d
  const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds, use_state) VALUES('FX', ?, ?, 6, 6, ?)`)
  room.run(1, '102', 'open')
  room.run(1, '101', 'open')
  room.run(1, '103', 'closed')
  room.run(2, '201', 'open')
  workerId = db.prepare(`INSERT INTO staff(full_name, is_active) VALUES('Saha Test', 1)`).run().lastInsertRowid
  otherWorkerId = db.prepare(`INSERT INTO staff(full_name, is_active) VALUES('Diğer Kişi', 1)`).run().lastInsertRowid
  const task = db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location, completed_at,
    completed_by_worker_id, field_worker_id, origin) VALUES(?, 'FX', ?, 'room', ?, ?, ?, ?, ?, 'field')`)
  task.run('FX Oda 101', 1, `${today} 08:00:00`, 'FX-101', `${today} 06:15:00`, workerId, workerId)
  task.run('FX Oda 102', 1, `${yesterday} 08:00:00`, 'FX-102', `${yesterday} 07:30:00`, workerId, workerId)
})

const floorOf = (board, n) => board.floors.find(f => f.floor === n)

describe('boardRooms', () => {
  it('odaları kat ve oda numarası sırasıyla, işaretsizi status:null döner; kapalı oda kapalı gelir', () => {
    const board = boardRooms('FX')
    expect(board.block).toBe('FX')
    expect(board.date).toBe(today)
    expect(board.floors.map(f => f.floor)).toEqual([1, 2])
    const rooms = floorOf(board, 1).rooms
    expect(rooms.map(r => r.room_no)).toEqual(['101', '102', '103'])
    expect(rooms.find(r => r.room_no === '103')).toMatchObject({ location: 'FX-103', use_state: 'closed', status: null })
  })

  it('bugün temizlenen oda cleaned + temizleyenin adı; mine yalnız aynı personelde true', () => {
    const mine = floorOf(boardRooms('FX', { workerId }), 1).rooms.find(r => r.room_no === '101')
    expect(mine).toMatchObject({ location: 'FX-101', status: 'cleaned', at: `${today} 06:15:00`, by: 'Saha Test', mine: true })
    const theirs = floorOf(boardRooms('FX', { workerId: otherWorkerId }), 1).rooms.find(r => r.room_no === '101')
    expect(theirs.mine).toBe(false)
  })

  it('dünkü temizlik bugünün durumu değil, son temizlik olarak gelir', () => {
    const room = floorOf(boardRooms('FX'), 1).rooms.find(r => r.room_no === '102')
    expect(room.status).toBeNull()
    expect(room.last_cleaned_at).toBe(`${yesterday} 07:30:00`)
  })

  it('M bloğunda her katın başında 4 ortak alan, M olmayan blokta hiç ortak alan yok', () => {
    const m1 = boardRooms('M1')
    expect(floorOf(m1, 1).common_areas.map(a => a.location)).toEqual(['M1-1-corridor', 'M1-1-toilet', 'M1-1-bathroom', 'M1-1-stairs'])
    expect(floorOf(m1, 1).common_areas[1]).toMatchObject({ code: 'toilet', label: 'Tuvalet / WC', status: null })
    expect(floorOf(boardRooms('FX'), 1).common_areas).toEqual([])
  })

  it('bilinmeyen blokta null döner', () => {
    expect(boardRooms('YOK')).toBeNull()
  })
})

describe('boardBlocks', () => {
  it('aktif oda sayısını, kapalıyı ve bugün temizleneni sayar', () => {
    const fx = boardBlocks().find(b => b.block === 'FX')
    expect(fx).toMatchObject({ rooms: 4, open: 3, closed: 1, locked: 0, cleaned: 1, skipped: 0 })
    expect(boardBlocks().find(b => b.block === 'M1').type).toBe('M')
  })
})

// FZ: saha işaretleri için ayrı deneme bloğu — her test kendi odasını kullanır, birbirini etkilemez.
describe('saha işareti (markField / undoField)', () => {
  beforeAll(() => {
    const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds, use_state, occupant_shift)
                             VALUES('FZ', 1, ?, 6, 6, ?, ?)`)
    room.run('301', 'open', 'night')
    room.run('303', 'closed', null)
    for (const no of ['302', '304', '305', '306', '307', '308', '309', '310', '311', '312', '313']) room.run(no, 'open', null)
  })

  const taskOf = location => db.prepare('SELECT * FROM cleaning_tasks WHERE qr_location=? AND DATE(scheduled_at)=?').get(location, today)
  const errorOf = fn => { try { fn() } catch (e) { return e } return null }

  it('yeri çözer: oda BLOK-ODANO, M ortak alanı BLOK-KAT-kod; biçim hatası 400, olmayan oda/kat 404', () => {
    expect(resolveFieldLocation('FZ-301')).toMatchObject({ kind: 'room', room: { block: 'FZ', floor: 1, room_no: '301' } })
    expect(resolveFieldLocation('M1-2-stairs')).toEqual({ kind: 'common', block: 'M1', floor: 2, code: 'stairs', label: 'Merdiven' })
    expect(errorOf(() => resolveFieldLocation('saçma yer'))).toMatchObject({ statusCode: 400 })
    expect(errorOf(() => resolveFieldLocation('M1-1-garaj'))).toMatchObject({ statusCode: 400 })
    expect(errorOf(() => resolveFieldLocation('FZ-999'))).toMatchObject({ statusCode: 404 })
    expect(errorOf(() => resolveFieldLocation('M1-9-toilet'))).toMatchObject({ statusCode: 404 })
    expect(errorOf(() => resolveFieldLocation('FZ-1-toilet'))).toMatchObject({ statusCode: 404 })
  })

  it('temizlendi: bugün görev yoksa sahadan açar; gececi oda 19:00 planlı, temizleyen = işaretleyen personel', () => {
    const res = markField({ location: 'FZ-301', action: 'clean', workerId })
    expect(res).toMatchObject({ status: 'cleaned', already: false })
    const task = taskOf('FZ-301')
    expect(task).toMatchObject({
      id: res.task_id, origin: 'field', task_type: 'room', area: 'FZ Oda 301', block: 'FZ', floor: 1,
      scheduled_at: `${today} 19:00:00`, completed_by_worker_id: workerId, field_worker_id: workerId, skipped: 0,
    })
    expect(task.completed_at).toBeTruthy()
    expect(res.at).toBe(task.completed_at)
  })

  it('ikinci "temizlendi" ilk temizleyeni ve saati ezmez, yeni görev açmaz (already)', () => {
    const first = markField({ location: 'FZ-302', action: 'clean', workerId })
    const second = markField({ location: 'FZ-302', action: 'clean', workerId: otherWorkerId })
    expect(second).toEqual({ task_id: first.task_id, status: 'cleaned', at: first.at, already: true })
    expect(taskOf('FZ-302')).toMatchObject({ completed_by_worker_id: workerId, field_worker_id: workerId, completed_at: first.at })
    expect(db.prepare("SELECT COUNT(*) n FROM cleaning_tasks WHERE qr_location='FZ-302'").get().n).toBe(1)
  })

  it('temizlenemedi: sebep etiketi + not yazılır; geçersiz sebep/işlem 400, tamamlanmış görevde 409', () => {
    const res = markField({ location: 'FZ-304', action: 'skip', reason: 'dnd', note: ' uyuyor ', workerId })
    expect(res).toMatchObject({ status: 'skipped', already: false })
    expect(taskOf('FZ-304')).toMatchObject({ skipped: 1, skip_reason: 'Rahatsız etmeyin: uyuyor', completed_at: null, field_worker_id: workerId })
    expect(errorOf(() => markField({ location: 'FZ-309', action: 'skip', reason: 'bilmem', workerId }))).toMatchObject({ statusCode: 400 })
    expect(errorOf(() => markField({ location: 'FZ-309', action: 'sil', workerId }))).toMatchObject({ statusCode: 400 })
    expect(taskOf('FZ-309')).toBeUndefined()
    expect(errorOf(() => markField({ location: 'FZ-302', action: 'skip', reason: 'other', workerId }))).toMatchObject({ statusCode: 409 })
    expect(taskOf('FZ-302').completed_at).toBeTruthy()
  })

  it('sabah temizlenemeyen oda sonra başkası tarafından temizlenebilir; işaret artık temizleyenin', () => {
    markField({ location: 'FZ-313', action: 'skip', reason: 'dnd', workerId })
    const res = markField({ location: 'FZ-313', action: 'clean', workerId: otherWorkerId })
    expect(res).toMatchObject({ status: 'cleaned', already: false })
    expect(taskOf('FZ-313')).toMatchObject({ skipped: 0, skip_reason: null, completed_by_worker_id: otherWorkerId, field_worker_id: otherWorkerId })
  })

  it('kapalı odada temizlendi de temizlenemedi de 409 "Oda kapalı", görev açılmaz', () => {
    for (const action of ['clean', 'skip']) {
      expect(errorOf(() => markField({ location: 'FZ-303', action, reason: 'other', workerId })))
        .toMatchObject({ statusCode: 409, message: 'Oda kapalı' })
    }
    expect(taskOf('FZ-303')).toBeUndefined()
  })

  it('fotoğraflar görevin fotoğraflarına eklenir: temizlendi "sonrasi", temizlenemedi "genel"; ilki kapak', () => {
    const clean = markField({ location: 'FZ-307', action: 'clean', workerId, photoUrls: ['/uploads/a.jpg', '/uploads/b.jpg'] })
    expect(taskOf('FZ-307').photo_url).toBe('/uploads/a.jpg')
    const photos = id => db.prepare('SELECT photo_url, category FROM cleaning_task_photos WHERE task_id=? ORDER BY sort_order, id').all(id)
    expect(photos(clean.task_id)).toEqual([
      { photo_url: '/uploads/a.jpg', category: 'sonrasi' },
      { photo_url: '/uploads/b.jpg', category: 'sonrasi' },
    ])
    const skip = markField({ location: 'FZ-312', action: 'skip', reason: 'fault', workerId, photoUrls: ['/uploads/k.jpg'] })
    expect(photos(skip.task_id)).toEqual([{ photo_url: '/uploads/k.jpg', category: 'genel' }])
  })

  it('geri al: kendi fotoğrafsız saha görevi silinir, oda panoda yeniden işaretsiz', () => {
    markField({ location: 'FZ-305', action: 'clean', workerId })
    expect(undoField({ location: 'FZ-305', workerId })).toEqual({ ok: true, removed: true })
    expect(taskOf('FZ-305')).toBeUndefined()
    expect(floorOf(boardRooms('FZ'), 1).rooms.find(r => r.room_no === '305').status).toBeNull()
  })

  it('geri al: başkasının işareti 403, işaret yoksa 404 — hiçbir şey değişmez', () => {
    markField({ location: 'FZ-306', action: 'skip', reason: 'locked', workerId: otherWorkerId })
    expect(errorOf(() => undoField({ location: 'FZ-306', workerId }))).toMatchObject({ statusCode: 403 })
    expect(taskOf('FZ-306')).toMatchObject({ skipped: 1, skip_reason: 'Kapı kilitli' })
    expect(errorOf(() => undoField({ location: 'FZ-309', workerId }))).toMatchObject({ statusCode: 404 })
  })

  it('geri al: fotoğraflı görevin satırı kalır, tamamlanma ve işaretçi kalkar', () => {
    const { task_id } = markField({ location: 'FZ-311', action: 'clean', workerId, photoUrls: ['/uploads/c.jpg'] })
    expect(undoField({ location: 'FZ-311', workerId })).toEqual({ ok: true, removed: false })
    expect(taskOf('FZ-311')).toMatchObject({ id: task_id, completed_at: null, completed_by_worker_id: null, field_worker_id: null, skipped: 0 })
    expect(floorOf(boardRooms('FZ'), 1).rooms.find(r => r.room_no === '311').status).toBeNull()
  })

  it('geri al: arıza kaydına bağlı saha görevi silinmez (arıza kaybolmaz), yerinde geri alınır', () => {
    const { task_id } = markField({ location: 'FZ-308', action: 'skip', reason: 'fault', workerId })
    db.prepare("INSERT INTO maintenance_requests(location, description, cleaning_task_id) VALUES('FZ Oda 308', 'musluk akıtıyor', ?)").run(task_id)
    expect(undoField({ location: 'FZ-308', workerId })).toEqual({ ok: true, removed: false })
    expect(taskOf('FZ-308')).toMatchObject({ id: task_id, skipped: 0, skip_reason: null, field_worker_id: null })
  })

  it('ortak alan M1-1-toilet: common_area görevi, alan metni üretimle aynı, 08:00 planlı', () => {
    const res = markField({ location: 'M1-1-toilet', action: 'clean', workerId })
    expect(db.prepare('SELECT * FROM cleaning_tasks WHERE id=?').get(res.task_id)).toMatchObject({
      task_type: 'common_area', area: 'M1 1.Kat Tuvalet / WC', block: 'M1', floor: 1, qr_location: 'M1-1-toilet',
      origin: 'field', scheduled_at: `${today} 08:00:00`, completed_by_worker_id: workerId,
    })
  })

  it('her saha işlemi audit_log satırı yazar (kullanıcı yok, detail personeli ve yeri taşır)', () => {
    markField({ location: 'FZ-310', action: 'clean', workerId })
    undoField({ location: 'FZ-310', workerId })
    markField({ location: 'FZ-310', action: 'skip', reason: 'occupied', workerId })
    const rows = db.prepare(`
      SELECT action, user_id, json_extract(detail, '$.workerId') AS worker, json_extract(detail, '$.location') AS location
      FROM audit_log WHERE module='avs-self-service' AND json_extract(detail, '$.location')='FZ-310' ORDER BY id
    `).all()
    expect(rows).toEqual([
      { action: 'field_clean', user_id: null, worker: workerId, location: 'FZ-310' },
      { action: 'field_undo', user_id: null, worker: workerId, location: 'FZ-310' },
      { action: 'field_skip', user_id: null, worker: workerId, location: 'FZ-310' },
    ])
  })
})
