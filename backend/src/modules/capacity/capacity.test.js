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
  it('filters empty rooms only', async () => {
    const res = await request(app).get('/api/capacity/rooms?block=M1&empty_only=true').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // all returned rooms should have 0 occupants
    res.body.forEach(r => {
      expect(r.occupied).toBe(0)
    })
  })
  it('swaps two personnel between rooms', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    // Get two active rooms
    const rooms = await request(app).get('/api/capacity/rooms?block=M1').set('Authorization', `Bearer ${token}`)
    const activeRooms = rooms.body.filter(r => r.status === 'active')
    if (activeRooms.length < 2) return
    const roomA = activeRooms[0]
    const roomB = activeRooms[1]

    // Create two personnel and assign them to different rooms
    db.prepare("INSERT INTO personnel(id,tc_no,full_name) VALUES(9001,'88881111','Takas Ali')").run()
    db.prepare("INSERT INTO personnel(id,tc_no,full_name) VALUES(9002,'88882222','Takas Veli')").run()
    db.prepare('INSERT INTO room_assignments(personnel_id,room_id,bed_no,assigned_by) VALUES(9001,?,1,1)').run(roomA.id)
    db.prepare('INSERT INTO room_assignments(personnel_id,room_id,bed_no,assigned_by) VALUES(9002,?,1,1)').run(roomB.id)

    // Perform swap
    const res = await request(app)
      .post('/api/capacity/swap')
      .set('Authorization', `Bearer ${token}`)
      .send({ person_a_id: 9001, person_b_id: 9002 })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // Verify swap: Ali should be in roomB, Veli in roomA
    const aliAssign = db.prepare('SELECT room_id FROM room_assignments WHERE personnel_id=9001 AND check_out_at IS NULL').get()
    const veliAssign = db.prepare('SELECT room_id FROM room_assignments WHERE personnel_id=9002 AND check_out_at IS NULL').get()
    expect(aliAssign.room_id).toBe(roomB.id)
    expect(veliAssign.room_id).toBe(roomA.id)
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
