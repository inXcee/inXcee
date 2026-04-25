import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let adminToken, otherToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r1 = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  adminToken = r1.body.token
  const r2 = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
  otherToken = r2.body.token
})

describe('Announcements', () => {
  let createdId

  it('campus_manager duyuru oluşturabilir', async () => {
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test Duyurusu', body: 'Bu bir test duyurusudur' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    createdId = res.body.id
  })

  it('duyurular listelenir', async () => {
    const res = await request(app)
      .get('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('expires_at ile duyuru oluşturulur', async () => {
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Geçici Duyuru', body: 'Bu duyuru bir hafta geçerlidir', expires_at: expires })
    expect(res.status).toBe(201)
  })

  it('başlık 2 karakterden kısa olursa reddeder', async () => {
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'A', body: 'Bu bir test duyurusudur' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/başlık/i)
  })

  it('içerik 5 karakterden kısa olursa reddeder', async () => {
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Başlık', body: 'Kısa' })
    expect(res.status).toBe(400)
  })

  it('campus_manager duyuru silebilir', async () => {
    const res = await request(app)
      .delete(`/api/announcements/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('yetkisiz rol 403 alır', async () => {
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Test', body: 'Bu bir test duyurusudur' })
    expect(res.status).toBe(403)
  })

  it('token olmadan 401 alır', async () => {
    const res = await request(app).get('/api/announcements')
    expect(res.status).toBe(401)
  })
})
