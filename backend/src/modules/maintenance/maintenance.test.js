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

describe('Maintenance — assign endpoint', () => {
  let requestId, techId

  it('creates a maintenance request', async () => {
    const res = await request(app)
      .post('/api/maintenance/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ location: 'B Blok 101', description: 'Musluk akıyor', priority: 'medium' })
    expect(res.status).toBe(201)
    requestId = res.body.id
  })

  it('creates a technician', async () => {
    const res = await request(app)
      .post('/api/maintenance/technicians')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Test Teknisyen', phone: '05001234567', specialty: 'tesisat' })
    expect(res.status).toBe(201)
    techId = res.body.id
  })

  it('assigns technician to request', async () => {
    const res = await request(app)
      .patch(`/api/maintenance/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ technician_id: techId })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('verifies assigned_to is persisted', () => {
    const row = db.prepare('SELECT assigned_to FROM maintenance_requests WHERE id=?').get(requestId)
    expect(row.assigned_to).toBe(techId)
  })

  it('rejects assign with missing technician_id', async () => {
    const res = await request(app)
      .patch(`/api/maintenance/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('rejects assign with non-existent technician', async () => {
    const res = await request(app)
      .patch(`/api/maintenance/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ technician_id: 99999 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Teknisyen/)
  })
})

describe('Maintenance — pagination (Y2)', () => {
  beforeAll(() => {
    // 25 ekstra arıza yarat — 5 yuksek, 20 dusuk
    const insert = db.prepare(`
      INSERT INTO maintenance_requests(location, description, priority, status)
      VALUES(?, ?, ?, 'open')
    `)
    db.transaction(() => {
      for (let i = 0; i < 5; i++) insert.run(`Bina-A ${i}`, `yuksek arizasi ${i}`, 'high')
      for (let i = 0; i < 20; i++) insert.run(`Bina-B ${i}`, `dusuk arizasi ${i}`, 'low')
    })()
  })

  it('limit parametresi sayfalama uygular', async () => {
    const res = await request(app)
      .get('/api/maintenance/requests?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeLessThanOrEqual(10)
    expect(res.body.total).toBeGreaterThanOrEqual(25)
    expect(res.body.page).toBe(1)
    expect(res.body.limit).toBe(10)
  })

  it('priority filtresiyle total dogru hesaplanir', async () => {
    const res = await request(app)
      .get('/api/maintenance/requests?page=1&limit=3&priority=high')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    // total: bu testten once 0 high vardi + bu test 5 ekledi = 5
    expect(res.body.total).toBeGreaterThanOrEqual(5)
    expect(res.body.data.length).toBe(3)
    res.body.data.forEach(r => expect(r.priority).toBe('high'))
  })

  it('ikinci sayfa farkli kayitlari donduruyor', async () => {
    const p1 = await request(app)
      .get('/api/maintenance/requests?page=1&limit=5')
      .set('Authorization', `Bearer ${token}`)
    const p2 = await request(app)
      .get('/api/maintenance/requests?page=2&limit=5')
      .set('Authorization', `Bearer ${token}`)
    const ids1 = p1.body.data.map(r => r.id)
    const ids2 = p2.body.data.map(r => r.id)
    expect(ids1).not.toEqual(ids2)
    // overlap olmamali
    const overlap = ids1.filter(id => ids2.includes(id))
    expect(overlap.length).toBe(0)
  })
})
