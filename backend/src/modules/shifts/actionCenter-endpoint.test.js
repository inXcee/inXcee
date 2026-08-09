import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Saf mantik elde kurulmus semaya karsi dogrulaniyor; burada asil migration'larla
// olusan sema ve rol yetkileri deneniyor. Kolon adi degisirse burasi duser.

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

describe('GET /api/shifts/action-center', () => {
  it('mudur icin 200 ve liste doner', async () => {
    const res = await request(app).get('/api/shifts/action-center').set(auth(managerToken))
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(res.body.summary).toHaveProperty('total')
  })

  // Gercek semada hicbir kaynak patlamamali; patlarsa unavailable dolu gelir.
  it('gercek semada olculemeyen kaynak kalmaz', async () => {
    const res = await request(app).get('/api/shifts/action-center').set(auth(managerToken))
    expect(res.body.unavailable).toEqual([])
  })

  it('her kayitta anahtar, onem, zaman dilimi ve yonlendirme var', async () => {
    const res = await request(app).get('/api/shifts/action-center')
      .query({ from: '2020-01-01', to: '2030-01-01' }).set(auth(managerToken))
    res.body.items.forEach(i => {
      expect(i.key).toBeTruthy()
      expect(['critical', 'warning', 'info']).toContain(i.severity)
      expect(['overdue', 'today', 'future', 'unknown']).toContain(i.timeframe)
      expect(i.action?.route).toBeTruthy()
    })
  })

  it('ozet madde sayisiyla tutarli', async () => {
    const { body } = await request(app).get('/api/shifts/action-center')
      .query({ from: '2020-01-01', to: '2030-01-01' }).set(auth(managerToken))
    expect(body.summary.critical + body.summary.warning + body.summary.info).toBe(body.summary.total)
    expect(body.summary.total).toBe(body.items.length)
  })

  it('vardiya amiri gorebilir', async () => {
    expect((await request(app).get('/api/shifts/action-center').set(auth(supervisorToken))).status).toBe(200)
  })

  it('yetkisiz rol 403, tokensiz 401', async () => {
    expect((await request(app).get('/api/shifts/action-center').set(auth(technicalToken))).status).toBe(403)
    expect((await request(app).get('/api/shifts/action-center')).status).toBe(401)
  })

  it('ters tarih araligi 400', async () => {
    const res = await request(app).get('/api/shifts/action-center')
      .query({ from: '2026-08-10', to: '2026-08-01' }).set(auth(managerToken))
    expect(res.status).toBe(400)
  })
})
