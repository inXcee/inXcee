import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Gercek migration semasi ve rol yetkileri.

let managerToken, supervisorToken, technicalToken, gun
const auth = t => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  supervisorToken = await giris('vardiya')
  technicalToken = await giris('teknik')
  gun = getDB().prepare("SELECT date('now', '+440 day') AS g").get().g
})

describe('planlama uclari', () => {
  it('oneri gercek semada acik ve aday doner', async () => {
    const res = await request(app).get('/api/shifts/planning-suggestions')
      .query({ date: gun }).set(auth(managerToken))
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(res.body).toHaveProperty('gaps')
    expect(res.body).toHaveProperty('summary')
    // Kaynak okunamiyorsa "acik yok" sonucu yanlis olur.
    expect(res.body.unavailable).toEqual([])
  })

  it('senaryo karsilastirmasi uc stratejiyi doner', async () => {
    const { body } = await request(app).get('/api/shifts/planning-scenarios')
      .query({ date: gun }).set(auth(managerToken))
    expect(body.scenarios.map(s => s.strategy)).toEqual(['coverage', 'fairness', 'cost'])
    expect(body.recommendation.note).toMatch(/karar değildir/)
  })

  it('adalet raporu olculebilirligi bildirir', async () => {
    const { body } = await request(app).get('/api/shifts/fairness-report')
      .query({ start: '2026-05-01', end: '2026-05-31' }).set(auth(managerToken))
    expect(body.available).toBe(true)
    expect(typeof body.measurable).toBe('boolean')
  })

  it('gecersiz girdi 400', async () => {
    expect((await request(app).get('/api/shifts/planning-suggestions')
      .query({ date: 'x' }).set(auth(managerToken))).status).toBe(400)
    expect((await request(app).get('/api/shifts/planning-suggestions')
      .query({ date: gun, strategy: 'rastgele' }).set(auth(managerToken))).status).toBe(400)
    expect((await request(app).get('/api/shifts/fairness-report')
      .query({ start: 'x', end: 'y' }).set(auth(managerToken))).status).toBe(400)
  })

  it('vardiya amiri gorebilir; yetkisiz rol 403, tokensiz 401', async () => {
    expect((await request(app).get('/api/shifts/planning-suggestions').query({ date: gun }).set(auth(supervisorToken))).status).toBe(200)
    expect((await request(app).get('/api/shifts/planning-suggestions').query({ date: gun }).set(auth(technicalToken))).status).toBe(403)
    expect((await request(app).get('/api/shifts/planning-scenarios').query({ date: gun })).status).toBe(401)
  })
})
