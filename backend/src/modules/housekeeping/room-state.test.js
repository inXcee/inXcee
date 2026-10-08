import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateDailyTasks, getDNDRooms, ROOM_SKIP } from './queries.js'

let supervisor
let housekeeper
let laundry
const DAY = '2030-01-15'
const roomId = (block, no) => getDB().prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(block, String(no)).id
const task = (qr, day) => getDB().prepare(`SELECT * FROM cleaning_tasks WHERE qr_location=? AND DATE(scheduled_at)=?`).get(qr, day)
const today = () => getDB().prepare("SELECT date('now','localtime') d").get().d
const login = async (u) => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  supervisor = await login('vardiya')
  housekeeper = await login('meydanci')
  laundry = await login('camasir')
})

afterEach(() => { vi.useRealTimers() })

describe('Oda durumu → günlük temizlik üretimi', () => {
  it('kapalı oda görev almaz, kilitli ve temizlik istemeyen oda atlanmış doğar, gececi 19:00', () => {
    const db = getDB()
    db.prepare("UPDATE rooms SET use_state='closed' WHERE block='M2' AND room_no='101'").run()
    db.prepare("UPDATE rooms SET use_state='locked' WHERE block='M2' AND room_no='102'").run()
    db.prepare("UPDATE rooms SET no_clean=1 WHERE block='M2' AND room_no='103'").run()
    db.prepare("UPDATE rooms SET occupant_shift='night' WHERE block='M2' AND room_no='104'").run()
    generateDailyTasks(new Date(`${DAY}T10:00:00`))

    expect(task('M2-101', DAY)).toBeUndefined()
    expect(task('M2-102', DAY)).toMatchObject({ skipped: 1, skip_reason: ROOM_SKIP.locked })
    expect(task('M2-103', DAY)).toMatchObject({ skipped: 1, skip_reason: ROOM_SKIP.noClean })
    expect(task('M2-104', DAY).scheduled_at).toBe(`${DAY} 19:00:00`)
    expect(task('M2-105', DAY)).toMatchObject({ skipped: 0, scheduled_at: `${DAY} 08:00:00` })
  })

  it('bütün odaları kapalı M katının ortak alanı üretilmez, diğer katınki üretilir', () => {
    getDB().prepare("UPDATE rooms SET use_state='closed' WHERE block='M3' AND floor=2").run()
    generateDailyTasks(new Date('2030-01-16T10:00:00'))
    expect(task('M3-2-corridor', '2030-01-16')).toBeUndefined()
    expect(task('M3-1-corridor', '2030-01-16')).toBeTruthy()
  })

  it('bitiş tarihi geçen kilit kendiliğinden açılır', () => {
    getDB().prepare("UPDATE rooms SET use_state='locked', state_until='2030-01-17', state_note='izinde' WHERE block='S1' AND room_no='101'").run()
    generateDailyTasks(new Date('2030-01-17T10:00:00'))
    expect(task('S1-101', '2030-01-17')).toMatchObject({ skipped: 1 }) // son gün hâlâ kilitli
    generateDailyTasks(new Date('2030-01-18T10:00:00'))
    expect(task('S1-101', '2030-01-18')).toMatchObject({ skipped: 0 })
    const r = getDB().prepare("SELECT use_state, state_until, state_note FROM rooms WHERE block='S1' AND room_no='101'").get()
    expect(r).toEqual({ use_state: 'open', state_until: null, state_note: null })
  })
})

describe('Oda durumu API', () => {
  it('vardiya amiri tek odayı kilitler; bugünkü görev atlanır, açınca geri gelir', async () => {
    generateDailyTasks(new Date())
    const id = roomId('S3', 110)
    let res = await request(app).patch(`/api/housekeeping/rooms/${id}/state`).set('Authorization', `Bearer ${supervisor}`)
      .send({ use_state: 'locked', state_note: 'anahtar yok' })
    expect(res.status).toBe(200)
    expect(task('S3-110', today())).toMatchObject({ skipped: 1, skip_reason: ROOM_SKIP.locked })
    res = await request(app).patch(`/api/housekeeping/rooms/${id}/state`).set('Authorization', `Bearer ${supervisor}`)
      .send({ use_state: 'open' })
    expect(res.status).toBe(200)
    expect(task('S3-110', today())).toMatchObject({ skipped: 0, skip_reason: null })
    const room = getDB().prepare('SELECT use_state, state_note FROM rooms WHERE id=?').get(id)
    expect(room).toEqual({ use_state: 'open', state_note: null })
  })

  it('elle atlanmış görev oda durumu değişince geri açılmaz; yapılmış görev hiç değişmez', async () => {
    generateDailyTasks(new Date())
    const db = getDB()
    db.prepare("UPDATE cleaning_tasks SET skipped=1, skip_reason='misafir istemedi' WHERE qr_location='S3-111' AND DATE(scheduled_at)=?").run(today())
    db.prepare("UPDATE cleaning_tasks SET completed_at=datetime('now') WHERE qr_location='S3-112' AND DATE(scheduled_at)=?").run(today())
    for (const no of [111, 112]) {
      await request(app).patch(`/api/housekeeping/rooms/${roomId('S3', no)}/state`).set('Authorization', `Bearer ${supervisor}`)
        .send({ use_state: 'locked' })
      await request(app).patch(`/api/housekeeping/rooms/${roomId('S3', no)}/state`).set('Authorization', `Bearer ${supervisor}`)
        .send({ use_state: 'open' })
    }
    expect(task('S3-111', today())).toMatchObject({ skipped: 1, skip_reason: 'misafir istemedi' })
    expect(task('S3-112', today())).toMatchObject({ skipped: 0 })
    expect(task('S3-112', today()).completed_at).toBeTruthy()
  })

  it('kapalıyken üretilmeyen bugünkü görev oda açılınca eklenir', async () => {
    const db = getDB()
    db.prepare("UPDATE rooms SET use_state='closed' WHERE block='S3' AND room_no='120'").run()
    db.prepare("DELETE FROM cleaning_tasks WHERE qr_location='S3-120' AND DATE(scheduled_at)=?").run(today())
    generateDailyTasks(new Date())
    expect(task('S3-120', today())).toBeUndefined()
    await request(app).patch(`/api/housekeeping/rooms/${roomId('S3', 120)}/state`).set('Authorization', `Bearer ${supervisor}`)
      .send({ use_state: 'open' })
    expect(task('S3-120', today())).toMatchObject({ skipped: 0, task_type: 'room' })
  })

  it('toplu: blok + kat gececi yapılır, denetim kaydı düşer', async () => {
    const res = await request(app).post('/api/housekeeping/rooms/state-bulk').set('Authorization', `Bearer ${housekeeper}`)
      .send({ block: 'S2', floor: 2, occupant_shift: 'night' })
    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(24)
    const n = getDB().prepare("SELECT COUNT(*) n FROM rooms WHERE block='S2' AND floor=2 AND occupant_shift='night'").get().n
    expect(n).toBe(24)
    const audit = getDB().prepare("SELECT detail FROM audit_log WHERE action='room_state_change' ORDER BY id DESC").get()
    expect(audit.detail).toContain('S2 2. kat: gececi')
  })

  it('toplu: oda listesiyle kapatma, olmayan blok 400', async () => {
    let res = await request(app).post('/api/housekeeping/rooms/state-bulk').set('Authorization', `Bearer ${supervisor}`)
      .send({ block: 'S1', room_nos: ['201', '202'], use_state: 'closed', state_note: 'boş' })
    expect(res.body.updated).toBe(2)
    res = await request(app).post('/api/housekeeping/rooms/state-bulk').set('Authorization', `Bearer ${supervisor}`)
      .send({ block: 'ZZ', use_state: 'closed' })
    expect(res.status).toBe(400)
  })

  it('özet blok başına durum ve bugünkü görev sayılarını verir', async () => {
    const res = await request(app).get('/api/housekeeping/rooms/state-summary').set('Authorization', `Bearer ${supervisor}`)
    expect(res.status).toBe(200)
    const s1 = res.body.blocks.find(b => b.block === 'S1')
    expect(s1.closed).toBeGreaterThanOrEqual(2)
    expect(res.body.date).toBe(today())
  })

  it('doğrulama ve yetki: boş gövde 400, geçersiz durum 400, çamaşırhane 403', async () => {
    const id = roomId('S1', 105)
    expect((await request(app).patch(`/api/housekeeping/rooms/${id}/state`).set('Authorization', `Bearer ${supervisor}`).send({})).status).toBe(400)
    expect((await request(app).patch(`/api/housekeeping/rooms/${id}/state`).set('Authorization', `Bearer ${supervisor}`)
      .send({ use_state: 'yikik' })).status).toBe(400)
    expect((await request(app).patch(`/api/housekeeping/rooms/${id}/state`).set('Authorization', `Bearer ${laundry}`)
      .send({ use_state: 'closed' })).status).toBe(403)
  })
})

describe('DND — gececi işaretli oda', () => {
  it('gündüz saatinde odada işaretli gececi DND listesine girer, kapalı oda girmez', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-01-15T10:00:00'))
    getDB().prepare("UPDATE rooms SET occupant_shift='night', use_state='closed' WHERE block='M1' AND room_no='130'").run()
    const dnd = getDNDRooms().map(r => `${r.block}-${r.room_no}`)
    expect(dnd).toContain('M2-104')
    expect(dnd).not.toContain('M1-130')
  })
})
