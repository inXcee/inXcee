import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
})

describe('Companies — Zod sweep', () => {
  it('cok uzun firma adi 400 doner', async () => {
    const res = await request(app).post('/api/companies')
      .set('Authorization', `Bearer ${token}`).send({ name: 'A'.repeat(201) })
    expect(res.status).toBe(400)
  })
})

describe('Companies — CRUD', () => {
  let id
  it('firma olusturur', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'ACME Yapı A.Ş.',
        contact_name: 'Ali Veli',
        contact_phone: '0532',
        contact_email: 'info@acme.com',
        contract_start: '2026-01-01',
        contract_end: '2026-12-31',
        bed_quota: 50,
        price_per_bed: 250.5,
      })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    id = res.body.id
  })

  it('duplicate ismi reddeder', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ACME Yapı A.Ş.' })
    expect(res.status).toBe(409)
  })

  it('gecersiz e-postayi reddeder', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', contact_email: 'gecersiz' })
    expect(res.status).toBe(400)
  })

  it('bitis tarihi baslangictan once olamaz', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', contract_start: '2026-12-31', contract_end: '2026-01-01' })
    expect(res.status).toBe(400)
  })

  it('liste doner', async () => {
    const res = await request(app)
      .get('/api/companies')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.some(c => c.id === id)).toBe(true)
  })

  it('guncelleme calisir', async () => {
    const res = await request(app)
      .put(`/api/companies/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ACME Yapı A.Ş.', bed_quota: 100 })
    expect(res.status).toBe(200)
    const get = await request(app).get(`/api/companies/${id}`).set('Authorization', `Bearer ${token}`)
    expect(get.body.bed_quota).toBe(100)
  })

  it('expiring endpoint sozlesmesi yaklasanlari doner', async () => {
    // Bugunden 15 gun sonra biten firma ekle
    const future = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
    await request(app).post('/api/companies').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bitiyor', contract_end: future })
    const res = await request(app).get('/api/companies/expiring?days=30').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.some(c => c.name === 'Bitiyor')).toBe(true)
  })

  it('siler', async () => {
    const res = await request(app)
      .delete(`/api/companies/${id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})
