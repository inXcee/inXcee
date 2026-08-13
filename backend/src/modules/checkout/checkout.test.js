import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, db
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  db = getDB()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
})

describe('Checkout Module', () => {
  let personnelId, roomId, zimmetId, laundryCardId

  it('creates personnel and assigns room', async () => {
    const regRes = await request(app)
      .post('/api/checkin/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tc_no: '55555555555', full_name: 'Checkout Test Kisi', company: 'Test Ltd',
        emergency_name: 'Aile', emergency_phone: '05551234567',
      })
    expect(regRes.status).toBe(201)
    personnelId = regRes.body.id

    const room = db.prepare("SELECT id FROM rooms WHERE status='active' LIMIT 1").get()
    roomId = room.id

    const assignRes = await request(app)
      .post('/api/checkin/assign-room')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: personnelId, room_id: roomId })
    expect(assignRes.status).toBe(200)
  })

  it('adds zimmet items', async () => {
    await request(app)
      .post('/api/checkin/zimmet')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: personnelId, items: [
        { item_name: 'Yatak Takimi', quantity: 1 },
        { item_name: 'Yastik', quantity: 2 },
        { item_name: 'Battaniye', quantity: 1 },
      ] })

    const items = db.prepare('SELECT * FROM zimmet WHERE personnel_id=?').all(personnelId)
    expect(items).toHaveLength(3)
    zimmetId = items[0].id
  })

  it('issues an active laundry card before checkout', async () => {
    const res = await request(app)
      .post(`/api/cards/personnel/${personnelId}/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ card_type: 'laundry' })
    expect(res.status).toBe(201)
    laundryCardId = res.body.id
  })

  it('returns checkout preview with unreturned zimmet', async () => {
    const res = await request(app)
      .get(`/api/checkout/preview/${personnelId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.person.id).toBe(personnelId)
    expect(res.body.unreturned).toHaveLength(3)
    expect(res.body.person.block).toBeTruthy()
  })

  it('returns 404 for non-existent personnel', async () => {
    const res = await request(app)
      .get('/api/checkout/preview/99999')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('rejects checkout when zimmet items are unhandled', async () => {
    const items = db.prepare('SELECT id FROM zimmet WHERE personnel_id=? AND returned_at IS NULL').all(personnelId)
    // Only handle 1 of 3 — should fail
    const res = await request(app)
      .post('/api/checkout/process')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: personnelId, zimmet_actions: [
        { zimmet_id: items[0].id, action: 'return' }
      ] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/zimmet/)
  })

  it('processes checkout with damaged/lost items', async () => {
    const items = db.prepare('SELECT id, item_name FROM zimmet WHERE personnel_id=? AND returned_at IS NULL').all(personnelId)
    const zimmetActions = [
      { zimmet_id: items[0].id, action: 'return' },
      { zimmet_id: items[1].id, action: 'damaged', note: 'Yirtik' },
      { zimmet_id: items[2].id, action: 'lost', note: 'Bulunamadi' },
    ]

    const res = await request(app)
      .post('/api/checkout/process')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: personnelId, zimmet_actions: zimmetActions })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('verifies personnel has check_out_date after checkout', () => {
    const person = db.prepare('SELECT * FROM personnel WHERE id=?').get(personnelId)
    expect(person.check_out_date).toBeTruthy()
  })

  it('verifies room assignment is cleared', () => {
    const active = db.prepare('SELECT * FROM room_assignments WHERE personnel_id=? AND check_out_at IS NULL').get(personnelId)
    expect(active).toBeUndefined()
  })

  it('revokes the active laundry card in the checkout transaction', () => {
    const card = db.prepare('SELECT status, revoked_at FROM cards WHERE id=?').get(laundryCardId)
    expect(card.status).toBe('revoked')
    expect(card.revoked_at).toBeTruthy()
  })

  it('verifies zimmet conditions are recorded correctly', () => {
    const items = db.prepare('SELECT * FROM zimmet WHERE personnel_id=? ORDER BY id').all(personnelId)
    expect(items[0].return_condition).toBe('normal')
    expect(items[0].returned_at).toBeTruthy()
    expect(items[1].return_condition).toBe('damaged')
    expect(items[1].damage_note).toBe('Yirtik')
    expect(items[2].return_condition).toBe('lost')
    expect(items[2].damage_note).toBe('Bulunamadi')
  })

  it('shows recent checkouts', async () => {
    const res = await request(app)
      .get('/api/checkout/recent')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    const found = res.body.find(r => r.id === personnelId)
    expect(found).toBeTruthy()
    expect(found.full_name).toBe('Checkout Test Kisi')
  })

  it('requires personnel_id for process', async () => {
    const res = await request(app)
      .post('/api/checkout/process')
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('rejects invalid zimmet_actions action (Zod)', async () => {
    const res = await request(app)
      .post('/api/checkout/process')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: 1, zimmet_actions: [{ zimmet_id: 5, action: 'bogus' }] })
    expect(res.status).toBe(400)
  })
})
