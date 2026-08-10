import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Saf mantik elde kurulmus semaya karsi dogrulaniyor; burada asil migration'larla
// olusan sema ve rol yetkileri deneniyor. Kolon adi degisirse burasi duser.

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
  gun = new Date().toLocaleDateString('sv-SE')
})

describe('GET /api/shifts/day-operations', () => {
  it('gercek semada calisir, olculemeyen kaynak birakmaz', async () => {
    const res = await request(app).get('/api/shifts/day-operations').query({ date: gun }).set(auth(managerToken))
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(res.body.unavailable).toEqual([])
    expect(res.body.summary).toHaveProperty('total')
    expect(Array.isArray(res.body.coverage_gaps)).toBe(true)
  })

  // Canlida attendance_logs bos; "0 devamsiz" demek yanlis guven verir.
  it('devam kaydi yoksa sebebini bildirir', async () => {
    const { body } = await request(app).get('/api/shifts/day-operations').query({ date: gun }).set(auth(managerToken))
    expect(body.attendance).toHaveProperty('available')
    if (!body.attendance.available) expect(body.attendance.reason).toBeTruthy()
  })

  it('gecersiz tarih 400', async () => {
    expect((await request(app).get('/api/shifts/day-operations').query({ date: '12.08.2026' }).set(auth(managerToken))).status).toBe(400)
  })
})

describe('GET /api/shifts/day-operations/replacements', () => {
  it('aday listesi doner', async () => {
    const res = await request(app).get('/api/shifts/day-operations/replacements').query({ date: gun }).set(auth(managerToken))
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(Array.isArray(res.body.items)).toBe(true)
    res.body.items.forEach(a => {
      expect(a.full_name).toBeTruthy()
      expect(typeof a.son_7_gun_calisma).toBe('number')
    })
  })

  it('departman filtresi kabul edilir', async () => {
    const res = await request(app).get('/api/shifts/day-operations/replacements')
      .query({ date: gun, department_id: 1, limit: 5 }).set(auth(managerToken))
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeLessThanOrEqual(5)
  })
})

describe('POST /api/shifts/day-operations/handover', () => {
  it('not ekler ve gun ozetinde gorunur', async () => {
    const ekle = await request(app).post('/api/shifts/day-operations/handover')
      .set(auth(managerToken)).send({ date: gun, note: 'Gece 2 kisi eksik kaldi' })
    expect(`${ekle.status} ${JSON.stringify(ekle.body).slice(0, 150)}`).toContain('201')

    const gunOzeti = await request(app).get('/api/shifts/day-operations').query({ date: gun }).set(auth(managerToken))
    expect(gunOzeti.body.handover.some(h => h.note === 'Gece 2 kisi eksik kaldi')).toBe(true)
  })

  it('bos not 400', async () => {
    const res = await request(app).post('/api/shifts/day-operations/handover')
      .set(auth(managerToken)).send({ date: gun, note: '  ' })
    expect(res.status).toBe(400)
  })
})

describe('yetkiler', () => {
  it('vardiya amiri gorebilir ve not ekleyebilir', async () => {
    expect((await request(app).get('/api/shifts/day-operations').query({ date: gun }).set(auth(supervisorToken))).status).toBe(200)
    const r = await request(app).post('/api/shifts/day-operations/handover')
      .set(auth(supervisorToken)).send({ date: gun, note: 'Amir notu' })
    expect(r.status).toBe(201)
  })

  it('yetkisiz rol 403, tokensiz 401', async () => {
    expect((await request(app).get('/api/shifts/day-operations').query({ date: gun }).set(auth(technicalToken))).status).toBe(403)
    expect((await request(app).get('/api/shifts/day-operations').query({ date: gun })).status).toBe(401)
  })
})
