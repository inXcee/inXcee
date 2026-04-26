import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let adminToken, userToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r1 = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  adminToken = r1.body.token
  const r2 = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
  userToken = r2.body.token
})

beforeEach(() => {
  getDB().prepare('DELETE FROM error_log').run()
})

describe('Error Log — POST /', () => {
  it('anonim kullanıcı hata raporlayabilir', async () => {
    const res = await request(app).post('/api/error-log').send({
      source: 'frontend',
      message: 'Test error',
      stack: 'Error: Test\n  at foo:1:2',
      url: '/test',
    })
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
  })

  it('giriş yapmış kullanıcı user_id ile kaydeder', async () => {
    const res = await request(app).post('/api/error-log')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ source: 'frontend', message: 'User error' })
    expect(res.status).toBe(201)
    const list = await request(app).get('/api/error-log')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.items[0].user_id).toBeTruthy()
  })

  it('mesaj boşsa reddeder', async () => {
    const res = await request(app).post('/api/error-log').send({
      source: 'frontend', message: '',
    })
    expect(res.status).toBe(400)
  })

  it('geçersiz source reddeder', async () => {
    const res = await request(app).post('/api/error-log').send({
      source: 'invalid', message: 'x',
    })
    expect(res.status).toBe(400)
  })

  it('uzun mesajları kırpar (overflow korur)', async () => {
    const longMsg = 'x'.repeat(5000)
    const res = await request(app).post('/api/error-log').send({
      source: 'frontend', message: longMsg,
    })
    expect(res.status).toBe(201)
  })
})

describe('Error Log — GET /', () => {
  beforeEach(async () => {
    await request(app).post('/api/error-log').send({ source: 'frontend', message: 'A' })
    await request(app).post('/api/error-log').send({ source: 'backend', message: 'B' })
  })

  it('admin tüm hataları listeler', async () => {
    const res = await request(app).get('/api/error-log')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBe(2)
    expect(res.body.total).toBe(2)
  })

  it('source filtresi çalışır', async () => {
    const res = await request(app).get('/api/error-log?source=backend')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.body.items.length).toBe(1)
    expect(res.body.items[0].source).toBe('backend')
  })

  it('non-admin reddedilir', async () => {
    const res = await request(app).get('/api/error-log')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})

describe('Error Log — DELETE', () => {
  it('admin tek bir hatayı silebilir', async () => {
    const r = await request(app).post('/api/error-log').send({ source: 'frontend', message: 'X' })
    const id = r.body.id
    const del = await request(app).delete(`/api/error-log/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(del.status).toBe(200)
  })

  it('admin tüm hataları silebilir', async () => {
    await request(app).post('/api/error-log').send({ source: 'frontend', message: 'X' })
    await request(app).post('/api/error-log').send({ source: 'frontend', message: 'Y' })
    const del = await request(app).delete('/api/error-log/all')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(del.status).toBe(200)
    expect(del.body.deleted).toBe(2)
  })
})
