import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateDailyTasks } from './queries.js'

// 9 Eki 2026 temizlik taraması: arıza bildirimi SLA'sı, oda arızalarının doğru odaya ait olması,
// ikinci tamamlama ilk temizleyeni ezmemesi, M blok ortak alanı.
let manager
let housekeeper
const db = () => getDB()
const as = (call, token) => call.set('Authorization', `Bearer ${token}`)
const roomId = (block, no) => db().prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(block, no)?.id

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const login = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  manager = await login('mudur')
  housekeeper = await login('meydanci')
})

describe('temizlik ekibinin arıza bildirimi', () => {
  it('bakım kaydı SLA ve oda eşleşmesiyle açılır', async () => {
    const res = await as(request(app).post('/api/housekeeping/fault-report'), housekeeper)
      .send({ location: 'A1 Oda 101', description: 'Lavabo tıkalı, su gitmiyor', priority: 'high' })
    expect(res.status).toBe(201)
    const row = db().prepare('SELECT * FROM maintenance_requests WHERE id=?').get(res.body.id)
    expect(row.sla_deadline).not.toBeNull()   // eskiden NULL: SLA alarmına hiç düşmüyordu
    expect(row.block).toBe('A1')
    expect(row.room_id).toBe(roomId('A1', '101'))
    const h = db().prepare('SELECT ROUND((julianday(sla_deadline)-julianday(opened_at))*24,1) h FROM maintenance_requests WHERE id=?').get(res.body.id).h
    expect(h).toBe(4) // acil = 4 saat
  })
})

describe('oda detayındaki arızalar yalnız o odanın', () => {
  it('A-101 detayında A1-101 ve 1011 benzeri metinler görünmez', async () => {
    const ins = db().prepare(`INSERT INTO maintenance_requests(location, block, room_id, description, priority)
                              VALUES(?,?,?,?, 'medium')`)
    const own = Number(ins.run('A Oda 101', 'A', roomId('A', '101'), 'kendi arızası').lastInsertRowid)
    const legacyOwn = Number(ins.run('A 101', null, null, 'eski kayıt, metinle').lastInsertRowid)
    ins.run('A1 Oda 101', 'A1', roomId('A1', '101'), 'başka blok')
    ins.run('A1 Oda 101 musluk', null, null, 'başka blok, eski metin')
    const res = await as(request(app).get('/api/housekeeping/room-details?block=A&room_no=101'), manager)
    expect(res.status).toBe(200)
    expect(res.body.faults.map(f => f.id).sort()).toEqual([own, legacyOwn].sort())
  })

  it('olmayan oda için arıza listesi boş', async () => {
    const res = await as(request(app).get('/api/housekeeping/room-details?block=A&room_no=999'), manager)
    expect(res.body).toMatchObject({ room: null, faults: [] })
  })
})

describe('ikinci tamamlama', () => {
  it('ilk temizleyen ve saat korunur, QR doğrulaması eklenebilir', async () => {
    const taskId = Number(db().prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location)
      VALUES('S1 Oda 101','S1',1,'room',datetime('now','localtime'),'S1-101')`).run().lastInsertRowid)
    await as(request(app).post(`/api/housekeeping/tasks/${taskId}/complete`), housekeeper).send({})
    db().prepare("UPDATE cleaning_tasks SET completed_at='2026-10-09 08:15:00' WHERE id=?").run(taskId)
    const first = db().prepare('SELECT completed_at, assigned_to FROM cleaning_tasks WHERE id=?').get(taskId)
    await as(request(app).post(`/api/housekeeping/tasks/${taskId}/complete`), manager).send({ via_qr: true })
    const after = db().prepare('SELECT completed_at, assigned_to, verified_by_qr FROM cleaning_tasks WHERE id=?').get(taskId)
    expect(after.completed_at).toBe(first.completed_at)
    expect(after.assigned_to).toBe(first.assigned_to)
    expect(after.verified_by_qr).toBe(1)
  })
})

describe('M blok ortak alanı', () => {
  it('yalnız M tipi bloklara ortak alan görevi açılır', () => {
    generateDailyTasks(new Date(2099, 0, 5))
    const blocks = db().prepare(`SELECT DISTINCT block FROM cleaning_tasks
                                 WHERE task_type='common_area' AND DATE(scheduled_at)='2099-01-05'`).all().map(r => r.block)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every(b => ['M1', 'M2', 'M3'].includes(b))).toBe(true)
  })
})
