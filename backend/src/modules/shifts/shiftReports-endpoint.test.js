import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken, supervisorToken, technicalToken
const auth = t => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  supervisorToken = await giris('vardiya')
  technicalToken = await giris('teknik')
})

const rapor = (token, params = {}) => request(app).get('/api/shifts/period-report')
  .query({ period: '2026-04', ...params }).set(auth(token))

describe('GET /api/shifts/period-report', () => {
  it('tum bolumleri gercek semada doner', async () => {
    const res = await rapor(managerToken)
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    for (const k of ['planned_vs_actual', 'coverage_success', 'absence', 'leave_ranking',
      'overtime_ranking', 'project_load', 'approval_times', 'pre_exit_trends']) {
      expect(res.body.sections).toHaveProperty(k)
    }
  })

  // Bolum okunamiyorsa sifir degil, gerekce donmeli.
  it('olculemeyen bolum gerekce ile isaretlenir', async () => {
    const { body } = await rapor(managerToken)
    body.unmeasurable.forEach(u => expect(u.reason).toBeTruthy())
    Object.values(body.sections).forEach(b => {
      if (!b.measurable) expect(b.reason).toBeTruthy()
    })
  })

  it('bozuk donem 400', async () => {
    expect((await rapor(managerToken, { period: '2026-13' })).status).toBe(400)
  })

  it('vardiya amiri gorebilir; yetkisiz rol 403, tokensiz 401', async () => {
    expect((await rapor(supervisorToken)).status).toBe(200)
    expect((await rapor(technicalToken)).status).toBe(403)
    expect((await request(app).get('/api/shifts/period-report').query({ period: '2026-04' })).status).toBe(401)
  })
})
