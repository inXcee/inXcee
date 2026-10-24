import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../db/index.js'
import { seedDev } from '../db/seed.js'

// /saha kişisel oturumu (spec §4, §10): kayıtlı cihaz yokken device_mode:'personal' istenirse
// hareketsizlik kilidi yok ve oturum kiosk_personal_session_days gün açık kalır; PIN değişince de öyle kalır.
let workerId
const PIN = '2580'
const DAY_MS = 24 * 60 * 60 * 1000
const login = body => request(app).post('/api/auth/avs-login').send({ worker_id: workerId, pin: PIN, ...body })
const daysUntil = iso => (Date.parse(iso) - Date.now()) / DAY_MS

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const worker = (await request(app).post('/api/avs-workers').set('Authorization', `Bearer ${adminToken}`)
    .send({ full_name: 'Saha Telefon' })).body
  workerId = worker.id
  await request(app).put(`/api/avs-workers/${workerId}/pin`).set('Authorization', `Bearer ${adminToken}`).send({ new_pin: PIN })
  getDB().prepare("INSERT OR REPLACE INTO system_settings(key, value) VALUES('kiosk_personal_session_days', '30')").run()
})

describe('kiosk kişisel oturum (device_mode)', () => {
  it('device_mode yoksa ortak kural: 2 dk hareketsizlikte kilit', async () => {
    const res = await login({})
    expect(res.status).toBe(200)
    expect(res.body.session).toMatchObject({ mode: 'shared', idle_minutes: 2 })
  })

  it("device_mode 'personal' → kilitsiz kişisel oturum, ~30 gün", async () => {
    const res = await login({ device_mode: 'personal' })
    expect(res.status).toBe(200)
    expect(res.body.session).toMatchObject({ mode: 'personal', idle_minutes: null })
    expect(daysUntil(res.body.session.absolute_expires_at)).toBeGreaterThan(29.9)
    expect(daysUntil(res.body.session.absolute_expires_at)).toBeLessThan(30.1)
    const state = await request(app).get('/api/auth/kiosk-session').set('Authorization', `Bearer ${res.body.token}`)
    expect(state.body.session).toMatchObject({ mode: 'personal', idle_minutes: null })
  })

  it('tanınmayan device_mode ortak kurala düşer', async () => {
    const res = await login({ device_mode: 'admin' })
    expect(res.body.session).toMatchObject({ mode: 'shared', idle_minutes: 2 })
  })

  it('kişisel oturumda PIN değişince dönen yeni token da kişisel kalır', async () => {
    const { token } = (await login({ device_mode: 'personal' })).body
    const change = await request(app).post('/api/avs-self-service/change-pin').set('Authorization', `Bearer ${token}`)
      .send({ current_pin: PIN, new_pin: '3691' })
    expect(change.status).toBe(200)
    const state = await request(app).get('/api/auth/kiosk-session').set('Authorization', `Bearer ${change.body.token}`)
    expect(state.status).toBe(200)
    expect(state.body.session).toMatchObject({ mode: 'personal', idle_minutes: null })
    expect(daysUntil(state.body.session.absolute_expires_at)).toBeGreaterThan(29.9)
  })
})
