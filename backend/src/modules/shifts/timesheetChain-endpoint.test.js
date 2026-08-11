import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Saf mantik elde kurulmus semaya karsi dogrulaniyor; burada asil migration'larla
// olusan sema ve rol yetkileri deneniyor. Kolon adi degisirse burasi duser.

let managerToken, supervisorToken, technicalToken, personelId, gun
const auth = t => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  supervisorToken = await giris('vardiya')
  technicalToken = await giris('teknik')
  const satir = getDB().prepare('SELECT staff_id, work_date FROM shift_schedule ORDER BY work_date DESC LIMIT 1').get()
  personelId = satir.staff_id
  gun = satir.work_date
})

describe('GET /api/shifts/timesheet-chain', () => {
  it('gercek semada alti halkayi da doner', async () => {
    const res = await request(app).get('/api/shifts/timesheet-chain')
      .query({ staff_id: personelId, date: gun }).set(auth(managerToken))
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(res.body.links.map(l => l.key)).toEqual(['schedule', 'evidence', 'leave', 'overtime', 'code', 'approval'])
  })

  it('her halkada durum ve aciklama var', async () => {
    const { body } = await request(app).get('/api/shifts/timesheet-chain')
      .query({ staff_id: personelId, date: gun }).set(auth(managerToken))
    body.links.forEach(l => {
      expect(['ok', 'missing', 'unavailable']).toContain(l.status)
      expect(l.label).toBeTruthy()
      expect(l.detail).toBeTruthy()
    })
  })

  // Kopuk halka gizlenirse zinciri gostermenin anlami kalmaz.
  it('kopuk halkalar gaps listesinde ve explainable ile tutarli', async () => {
    const { body } = await request(app).get('/api/shifts/timesheet-chain')
      .query({ staff_id: personelId, date: gun }).set(auth(managerToken))
    const kopuk = body.links.filter(l => l.status !== 'ok').map(l => l.key)
    expect(body.gaps).toEqual(kopuk)
    expect(body.explainable).toBe(kopuk.length === 0)
  })

  it('olmayan personel 404, gecersiz tarih 400', async () => {
    expect((await request(app).get('/api/shifts/timesheet-chain')
      .query({ staff_id: 999999, date: gun }).set(auth(managerToken))).status).toBe(404)
    expect((await request(app).get('/api/shifts/timesheet-chain')
      .query({ staff_id: personelId, date: '15.06.2026' }).set(auth(managerToken))).status).toBe(400)
  })

  it('vardiya amiri gorebilir; yetkisiz rol 403, tokensiz 401', async () => {
    expect((await request(app).get('/api/shifts/timesheet-chain')
      .query({ staff_id: personelId, date: gun }).set(auth(supervisorToken))).status).toBe(200)
    expect((await request(app).get('/api/shifts/timesheet-chain')
      .query({ staff_id: personelId, date: gun }).set(auth(technicalToken))).status).toBe(403)
    expect((await request(app).get('/api/shifts/timesheet-chain')
      .query({ staff_id: personelId, date: gun })).status).toBe(401)
  })
})
