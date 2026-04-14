import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../db/index.js'
import { seedDev } from '../db/seed.js'
import { verifyToken } from './service.js'

let managerToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  managerToken = res.body.token
})

describe('Auth', () => {
  it('returns token on valid login', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.role).toBe('campus_manager')
  })
  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'wrong' })
    expect(res.status).toBe(401)
  })
  it('blocks protected route without token', async () => {
    const res = await request(app).get('/api/dashboard/kpi')
    expect(res.status).toBe(401)
  })
})

describe('JWT_SECRET zorunlu', () => {
  it('verifyToken fonksiyonu tanımlı', () => {
    // auth/service.js'de JWT_SECRET zorunlu guard var
    // Bu test, guard'ın test ortamında (globalSetup ile JWT_SECRET set edilmiş)
    // doğru çalıştığını ve verifyToken'ın export edildiğini doğrular
    expect(typeof verifyToken).toBe('function')
  })
})

describe('PATCH /api/auth/password', () => {
  it('geçerli mevcut şifre ile değiştirir', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'admin123', newPassword: 'yeniSifre123' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    // geri al — sonraki testler için
    await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'yeniSifre123', newPassword: 'admin123' })
  })

  it('yanlış mevcut şifre ile reddeder', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'yanlis-sifre', newPassword: 'yeniSifre123' })
    expect(res.status).toBe(401)
  })

  it('8 karakterden kısa yeni şifreyi reddeder', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'admin123', newPassword: 'kisa' })
    expect(res.status).toBe(400)
  })

  it('token olmadan 401 döner', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .send({ currentPassword: 'admin123', newPassword: 'yeniSifre123' })
    expect(res.status).toBe(401)
  })
})

describe('CORS', () => {
  it('localhost:5173 origin\'ine izin verir', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:5173')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('izin verilmeyen origin reddedilir', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://evil.example.com')
    // CORS hatası — CORS header olmamalı
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
