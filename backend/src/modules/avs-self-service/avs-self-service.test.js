import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let avsToken
let workerId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token

  // Temizlik departmanlı bir AVS worker oluştur
  const w = (await request(app).post('/api/avs-workers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ full_name: 'AVS Kiosk Test', role_label: 'Temizlik Görevlisi' })).body
  workerId = w.id

  await request(app).put(`/api/avs-workers/${workerId}/pin`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ new_pin: '0000' })

  // Deterministik veri: Temizlik departmanı + M1 blok + bugüne vardiya + pickup
  const db = getDB()
  const temizlikId = db.prepare("SELECT id FROM departments WHERE name='Temizlik'").get().id
  db.prepare('UPDATE staff SET department_id=?, assigned_block=? WHERE id=?')
    .run(temizlikId, 'M1', workerId)
  const shiftDef = db.prepare('SELECT id FROM shift_definitions LIMIT 1').get()
  db.prepare(`INSERT OR IGNORE INTO shift_schedule(staff_id, shift_def_id, work_date, status)
              VALUES(?,?,date('now'),'scheduled')`).run(workerId, shiftDef?.id ?? null)
  const pp = db.prepare(`INSERT INTO pickup_points(name, district, neighborhood)
              VALUES('Merkez Durağı','Çankaya','Kızılay')`).run()
  db.prepare('UPDATE staff SET pickup_point_id=? WHERE id=?').run(pp.lastInsertRowid, workerId)
  // Bugüne bir cleaning task (M1) + bir açık arıza
  db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at)
              VALUES('Koridor','M1',1,'common_area',datetime('now'))`).run()
  db.prepare(`INSERT INTO maintenance_requests(location, description, status, priority)
              VALUES('M1 Kat 1','Musluk akıtıyor','open','high')`).run()
  // Bir aktif duyuru
  db.prepare(`INSERT INTO announcements(title, body) VALUES('Test Duyuru','İçerik')`).run()

  avsToken = (await request(app).post('/api/auth/avs-login')
    .send({ worker_id: workerId, pin: '0000' })).body.token
})

describe('AVS Self-Service — my-shifts', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/my-shifts')
    expect(res.status).toBe(401)
  })

  it('AVS token ile shifts dizisi döner ve bugünkü vardiyayı içerir', async () => {
    const res = await request(app).get('/api/avs-self-service/my-shifts')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.shifts)).toBe(true)
    const today = new Date().toISOString().slice(0, 10)
    expect(res.body.shifts.some(s => s.work_date === today)).toBe(true)
  })
})

describe('AVS Self-Service — my-transport', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/my-transport')
    expect(res.status).toBe(401)
  })

  it('atanmış pickup point döner', async () => {
    const res = await request(app).get('/api/avs-self-service/my-transport')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.pickup).not.toBeNull()
    expect(res.body.pickup.name).toBe('Merkez Durağı')
  })
})

describe('AVS Self-Service — auth', () => {
  it('GET /my-info AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/my-info')
    expect(res.status).toBe(401)
  })

  it('GET /my-info AVS token ile profil döner', async () => {
    const res = await request(app).get('/api/avs-self-service/my-info')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('full_name')
    expect(res.body).toHaveProperty('department_name')
  })
})
