import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let adminToken, userToken, personnelId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r1 = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  adminToken = r1.body.token
  const r2 = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
  userToken = r2.body.token

  const r = getDB().prepare(`
    INSERT INTO personnel(tc_no, full_name, company) VALUES('12345678901', 'Test Personel', 'TestCo')
  `).run()
  personnelId = r.lastInsertRowid
})

describe('KVKK — policy', () => {
  it('public olarak default metin alınır', async () => {
    const res = await request(app).get('/api/kvkk/policy')
    expect(res.status).toBe(200)
    expect(res.body.text).toMatch(/KVKK/)
    expect(res.body.is_default).toBe(true)
  })

  it('admin metni güncelleyebilir', async () => {
    const newText = 'Bu özelleştirilmiş bir KVKK aydınlatma metnidir. Toplam 50 karakter üstü olmalı.'
    const res = await request(app).put('/api/kvkk/policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ text: newText })
    expect(res.status).toBe(200)

    const get = await request(app).get('/api/kvkk/policy')
    expect(get.body.text).toBe(newText)
    expect(get.body.is_default).toBe(false)
  })

  it('non-admin metni güncelleyemez', async () => {
    const res = await request(app).put('/api/kvkk/policy')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ text: 'x'.repeat(60) })
    expect(res.status).toBe(403)
  })

  it('çok kısa metin reddedilir', async () => {
    const res = await request(app).put('/api/kvkk/policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ text: 'kısa' })
    expect(res.status).toBe(400)
  })
})

describe('KVKK — personnel export', () => {
  it('admin personel verisini export edebilir', async () => {
    const res = await request(app).get(`/api/kvkk/personnel/${personnelId}/export`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.personnel.id).toBe(personnelId)
    expect(res.body.personnel.full_name).toBe('Test Personel')
    expect(res.body.exported_at).toBeTruthy()
    expect(Array.isArray(res.body.room_assignments)).toBe(true)
    expect(res.headers['content-disposition']).toMatch(/attachment/)
  })

  it('var olmayan personel 404 döner', async () => {
    const res = await request(app).get('/api/kvkk/personnel/99999/export')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('non-admin reddedilir', async () => {
    const res = await request(app).get(`/api/kvkk/personnel/${personnelId}/export`)
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})
