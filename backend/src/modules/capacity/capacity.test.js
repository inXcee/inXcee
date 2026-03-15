import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = r.body.token
})

describe('Capacity', () => {
  it('lists rooms by block', async () => {
    const res = await request(app).get('/api/capacity/rooms?block=M1').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
  it('updates active beds', async () => {
    const rooms = await request(app).get('/api/capacity/rooms?block=M1').set('Authorization', `Bearer ${token}`)
    const roomId = rooms.body[0].id
    const res = await request(app)
      .patch(`/api/capacity/rooms/${roomId}/beds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active_beds: 4 })
    expect(res.status).toBe(200)
  })
  it('quarantines a room', async () => {
    const rooms = await request(app).get('/api/capacity/rooms?block=M1').set('Authorization', `Bearer ${token}`)
    const roomId = rooms.body[0].id
    const res = await request(app)
      .patch(`/api/capacity/rooms/${roomId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'quarantine' })
    expect(res.status).toBe(200)
  })
  it('blocks assignment to quarantined room', async () => {
    const rooms = await request(app).get('/api/capacity/rooms?block=M1&status=quarantine').set('Authorization', `Bearer ${token}`)
    if (!rooms.body.length) return
    const roomId = rooms.body[0].id
    const p = (await import('../../shared/db/index.js')).getDB()
      .prepare("INSERT INTO personnel(tc_no,full_name) VALUES('99999','Test')").run()
    const res = await request(app)
      .post('/api/checkin/assign-room')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: p.lastInsertRowid, room_id: roomId })
    expect(res.status).toBe(400)
  })
})
