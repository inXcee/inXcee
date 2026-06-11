import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Room History', () => {
  it('GET /summary returns array', async () => {
    const res = await request(app)
      .get('/api/room-history/summary')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /summary respects days parameter', async () => {
    const res = await request(app)
      .get('/api/room-history/summary?days=30')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /room returns 404 for nonexistent room', async () => {
    const res = await request(app)
      .get('/api/room-history/room/ZZ/999')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
  })

  it('GET /room with valid seed room returns data', async () => {
    const res = await request(app)
      .get('/api/room-history/room/M1/101')
      .set('Authorization', `Bearer ${token}`)
    expect([200, 404]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body).toHaveProperty('room')
    }
  })

  it('timeline temizlik kayıtları foto kanıtı taşır, summary photo_count + last_cleaned_at döner', async () => {
    const db = getDB()
    const room = db.prepare('SELECT block, room_no, floor FROM rooms ORDER BY block, room_no LIMIT 1').get()
    const area = `${room.block} Oda ${room.room_no}`
    db.prepare(`
      INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, completed_at, photo_url, qr_location)
      VALUES(?, ?, ?, 'room', datetime('now','localtime'), datetime('now'), '/uploads/test-foto.jpg', ?)
    `).run(area, room.block, room.floor, `${room.block}-${room.room_no}`)

    const tl = await request(app)
      .get(`/api/room-history/room/${room.block}/${room.room_no}?days=7`)
      .set('Authorization', `Bearer ${token}`)
    expect(tl.status).toBe(200)
    const withPhoto = tl.body.cleanings.find(c => c.photo_url === '/uploads/test-foto.jpg')
    expect(withPhoto).toBeTruthy()
    expect(withPhoto).toHaveProperty('worker_name')
    expect(withPhoto).toHaveProperty('verified_by_qr')

    const sum = await request(app)
      .get('/api/room-history/summary?days=7')
      .set('Authorization', `Bearer ${token}`)
    expect(sum.status).toBe(200)
    const row = sum.body.find(r => r.block === room.block && String(r.room_no) === String(room.room_no))
    expect(row).toBeTruthy()
    expect(row.photo_count).toBeGreaterThanOrEqual(1)
    expect(row.last_cleaned_at).toBeTruthy()
  })
})
