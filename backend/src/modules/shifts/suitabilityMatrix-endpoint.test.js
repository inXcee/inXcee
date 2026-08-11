import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Gercek migration semasi (097), FK'ler ve rol yetkileri deneniyor.

let managerToken, supervisorToken, technicalToken, personelId, shiftDefId, locationId, gun
const auth = t => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  supervisorToken = await giris('vardiya')
  technicalToken = await giris('teknik')
  const db = getDB()
  personelId = db.prepare('SELECT id FROM staff WHERE is_active = 1 ORDER BY id LIMIT 1').get().id
  shiftDefId = db.prepare('SELECT id FROM shift_definitions ORDER BY id LIMIT 1').get().id
  locationId = db.prepare('SELECT id FROM work_locations ORDER BY id LIMIT 1').get()?.id ?? null
  gun = db.prepare("SELECT date('now', '+420 day') AS g").get().g
})

const matris = (token, params = {}) => request(app).get('/api/shifts/suitability-matrix')
  .query({ date: gun, shift_def_id: shiftDefId, ...params }).set(auth(token))

describe('GET /api/shifts/suitability-matrix', () => {
  it('kadroyu ozet ve satirlarla doner', async () => {
    const res = await matris(managerToken)
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(res.body.summary.total).toBeGreaterThan(0)
    expect(res.body.items.length).toBeGreaterThan(0)
  })

  // Gercek semada hicbir kontrol olculemez kalmamali; kalirsa kolon adi kaymistir.
  it('gercek semada tum kontroller olculebilir', async () => {
    const { body } = await matris(managerToken, { work_location_id: locationId })
    expect(body.summary.not_fully_verified).toBe(0)
  })

  it('yalniz uygunlar suzulse de ozet tami sayar', async () => {
    const { body } = await matris(managerToken, { only_eligible: '1' })
    expect(body.items.every(i => i.eligible)).toBe(true)
    expect(body.summary.total).toBeGreaterThanOrEqual(body.items.length)
  })

  it('bozuk tarih 400', async () => {
    expect((await matris(managerToken, { date: 'x' })).status).toBe(400)
  })

  it('yetkisiz rol 403, tokensiz 401', async () => {
    expect((await matris(supervisorToken)).status).toBe(200)
    expect((await matris(technicalToken)).status).toBe(403)
    expect((await request(app).get('/api/shifts/suitability-matrix').query({ date: gun })).status).toBe(401)
  })
})

describe('calisma kisitlari uclari', () => {
  it('kisit ekler, listeler, siler ve motora yansir', async () => {
    const ekle = await request(app).post('/api/shifts/staff-constraints')
      .send({ staff_id: personelId, constraint_type: 'shift_block', ref_id: shiftDefId, note: 'Gece yasak' })
      .set(auth(managerToken))
    expect(`${ekle.status} ${JSON.stringify(ekle.body).slice(0, 200)}`).toContain('201')

    const liste = await request(app).get(`/api/shifts/staff-constraints/${personelId}`).set(auth(managerToken))
    expect(liste.body.items).toHaveLength(1)

    const uygunluk = await request(app).get('/api/shifts/suitability')
      .query({ staff_id: personelId, date: gun, shift_def_id: shiftDefId }).set(auth(managerToken))
    expect(uygunluk.body.blockers).toContain('shift_constraint')

    const sil = await request(app).delete(`/api/shifts/staff-constraints/${ekle.body.id}`).set(auth(managerToken))
    expect(sil.status).toBe(200)
  })

  it('gecersiz govde 400, olmayan kisit 404', async () => {
    expect((await request(app).post('/api/shifts/staff-constraints')
      .send({ staff_id: personelId, constraint_type: 'location_block' }).set(auth(managerToken))).status).toBe(400)
    expect((await request(app).delete('/api/shifts/staff-constraints/999999').set(auth(managerToken))).status).toBe(404)
  })
})
