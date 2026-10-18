// Mobil PIN girişinde yalnız HATALI denemeleri sayan sınır (15 dk / 20).
// Limiter'lar test ortamında atlanır; bu dosya NODE_ENV'i istek süresince
// 'development' yapıp gerçek davranışı doğrular.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

const originalEnv = process.env.NODE_ENV
let workerA
let workerB

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  const u = db.prepare("SELECT id FROM users WHERE role='housekeeper' LIMIT 1").get()
  db.prepare('UPDATE users SET mobile_pin=? WHERE id=?').run(bcrypt.hashSync('4321', 4), u.id)
  const addWorker = (name) => Number(db.prepare(
    'INSERT INTO staff(full_name, is_active, kiosk_pin) VALUES(?, 1, ?)',
  ).run(name, bcrypt.hashSync('5678', 4)).lastInsertRowid)
  workerA = addWorker('Limit Kiosk A')
  workerB = addWorker('Limit Kiosk B')
  process.env.NODE_ENV = 'development'
})

afterAll(() => { process.env.NODE_ENV = originalEnv })

const login = (pin) => request(app).post('/api/mobile/auth/login').send({ pin, role: 'housekeeper' })

describe('mobil PIN — hatalı deneme sınırı', () => {
  it('başarılı girişler sayılmaz', async () => {
    for (let i = 0; i < 25; i++) {
      const r = await login('4321')
      expect(r.status).toBe(200)
    }
  })

  it('20 hatalı denemeden sonra 429, doğru PIN de bekler', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await login(String(1000 + i))
      expect(r.status).toBe(401)
    }
    const blocked = await login('9999')
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toMatch(/hatalı PIN/)
    expect((await login('4321')).status).toBe(429)
  })
})

describe('kiosk PIN — kişi başına hatalı deneme sınırı', () => {
  const avs = (workerId, pin) => request(app).post('/api/auth/avs-login').send({ worker_id: workerId, pin })

  it('bir kişiye 10 hatalı denemeden sonra o kişi 429 olur', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await avs(workerA, String(1000 + i))).status).toBe(401)
    }
    const blocked = await avs(workerA, '9999')
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toMatch(/hatalı PIN/)
  })

  it('aynı cihazdan başka kişi etkilenmez', async () => {
    expect((await avs(workerB, '0000')).status).toBe(401)
    expect((await avs(workerB, '5678')).status).toBeLessThan(400)
  })
})
