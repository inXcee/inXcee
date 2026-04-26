import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
})

describe('Users Module', () => {
  let newUserId

  it('lists all users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    // Should not expose password_hash
    expect(res.body[0]).not.toHaveProperty('password_hash')
  })

  it('creates a new user', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'testuser', password: 'test1234', role: 'technical', full_name: 'Test Kullanici' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    newUserId = res.body.id
  })

  it('rejects duplicate username', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'testuser', password: 'test1234', role: 'technical', full_name: 'Duplikat' })
    expect(res.status).toBe(409)
  })

  it('rejects short password (7 chars)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'shortpw', password: 'abc1234', role: 'technical', full_name: 'Short PW' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/8 karakter/)
  })

  it('rejects invalid role', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'badrole', password: 'test123', role: 'superadmin', full_name: 'Bad Role' })
    expect(res.status).toBe(400)
  })

  it('updates a user', async () => {
    const res = await request(app)
      .put(`/api/users/${newUserId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'laundry', full_name: 'Guncellenmis Kullanici' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('changes password', async () => {
    const res = await request(app)
      .patch(`/api/users/${newUserId}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'yenisifre123' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // Verify new password works
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'testuser', password: 'yenisifre123' })
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.token).toBeTruthy()
  })

  it('deletes a user', async () => {
    const res = await request(app)
      .delete(`/api/users/${newUserId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('requires campus_manager role', async () => {
    // Login as non-admin
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })
    const techToken = loginRes.body.token

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${techToken}`)
    expect(res.status).toBe(403)
  })
})
