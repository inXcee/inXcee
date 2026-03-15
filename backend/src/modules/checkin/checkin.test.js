import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
  token = res.body.token
})

describe('Check-in', () => {
  it('detects blacklisted person', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    db.prepare("INSERT INTO personnel(tc_no,full_name,is_blacklisted,blacklist_reason) VALUES('11111111111','Ali Kara',1,'Kavga')").run()
    const res = await request(app)
      .post('/api/checkin/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send({ tc_no: '11111111111' })
    expect(res.status).toBe(200)
    expect(res.body.is_blacklisted).toBe(1)
  })
  it('checks in new person', async () => {
    const res = await request(app)
      .post('/api/checkin/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ tc_no: '22222222222', full_name: 'Mehmet Demir', company: 'ABC Ltd', hometown: 'Konya' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })
  it('suggests room for group with same company', async () => {
    const res = await request(app)
      .post('/api/checkin/suggest-room')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'ABC Ltd', hometown: 'Konya' })
    expect(res.status).toBe(200)
    expect(res.body.room_id).toBeTruthy()
  })
})
