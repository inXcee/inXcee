import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import bcrypt from 'bcryptjs'

let adminToken, db
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  db = getDB()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  adminToken = res.body.token
})

describe('Mobile Auth — PIN login', () => {
  let housekeeperId

  it('finds housekeeper user from seed', () => {
    const u = db.prepare("SELECT id FROM users WHERE role='housekeeper' LIMIT 1").get()
    expect(u).toBeTruthy()
    housekeeperId = u.id
  })

  it('sets mobile PIN via admin endpoint', async () => {
    const res = await request(app)
      .patch(`/api/users/${housekeeperId}/mobile-pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pin: '1234' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('verifies PIN is stored as bcrypt hash', () => {
    const u = db.prepare('SELECT mobile_pin FROM users WHERE id=?').get(housekeeperId)
    expect(u.mobile_pin).toBeTruthy()
    expect(bcrypt.compareSync('1234', u.mobile_pin)).toBe(true)
  })

  it('logs in with correct PIN + role', async () => {
    const res = await request(app)
      .post('/api/mobile/auth/login')
      .send({ pin: '1234', role: 'housekeeper' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.role).toBe('housekeeper')
  })

  it('rejects wrong PIN', async () => {
    const res = await request(app)
      .post('/api/mobile/auth/login')
      .send({ pin: '9999', role: 'housekeeper' })
    expect(res.status).toBe(401)
  })

  it('rejects wrong role', async () => {
    const res = await request(app)
      .post('/api/mobile/auth/login')
      .send({ pin: '1234', role: 'campus_manager' })
    expect(res.status).toBe(400)
  })

  it('rejects non-4-digit PIN', async () => {
    const res = await request(app)
      .post('/api/mobile/auth/login')
      .send({ pin: 'abc', role: 'housekeeper' })
    expect(res.status).toBe(400)
  })

  it('GET /me returns user info with valid mobile token', async () => {
    const login = await request(app)
      .post('/api/mobile/auth/login')
      .send({ pin: '1234', role: 'housekeeper' })
    const res = await request(app)
      .get('/api/mobile/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('housekeeper')
  })

  it('clears PIN via admin endpoint', async () => {
    const res = await request(app)
      .patch(`/api/users/${housekeeperId}/mobile-pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pin: '' })
    expect(res.status).toBe(200)
    const u = db.prepare('SELECT mobile_pin FROM users WHERE id=?').get(housekeeperId)
    expect(u.mobile_pin).toBeNull()
  })
})
