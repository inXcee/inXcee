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

describe('Maintenance — Zod sweep', () => {
  it('cok uzun aciklama 400 doner', async () => {
    const res = await request(app)
      .post('/api/maintenance/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ location: 'B Blok 101', description: 'x'.repeat(2001) })
    expect(res.status).toBe(400)
  })

  it('bos yorum 400 doner', async () => {
    const reqId = db.prepare(`INSERT INTO maintenance_requests(location,description,priority,status)
      VALUES('Zod 1','yorum testi','low','open')`).run().lastInsertRowid
    const res = await request(app)
      .post(`/api/maintenance/requests/${reqId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: '   ' })
    expect(res.status).toBe(400)
  })

  it('cok uzun teknisyen ismi 400 doner', async () => {
    const res = await request(app)
      .post('/api/maintenance/technicians')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'A'.repeat(201) })
    expect(res.status).toBe(400)
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

describe('Maintenance — assigned_user_id filter (M22)', () => {
  let myUserId, otherUserId, myTechId, otherTechId, myReqId, otherReqId

  beforeAll(async () => {
    myUserId = db.prepare("SELECT id FROM users WHERE username='teknik'").get().id
    otherUserId = db.prepare("SELECT id FROM users WHERE username='vardiya'").get().id

    myTechId = db.prepare("INSERT INTO technicians(full_name,user_id) VALUES('Mobile Tech',?)").run(myUserId).lastInsertRowid
    otherTechId = db.prepare("INSERT INTO technicians(full_name,user_id) VALUES('Diger Tech',?)").run(otherUserId).lastInsertRowid

    myReqId = db.prepare(`INSERT INTO maintenance_requests(location,description,priority,assigned_to)
      VALUES('M22 #1','bana atli','high',?)`).run(myTechId).lastInsertRowid
    otherReqId = db.prepare(`INSERT INTO maintenance_requests(location,description,priority,assigned_to)
      VALUES('M22 #2','digerine atli','medium',?)`).run(otherTechId).lastInsertRowid
  })

  it('assigned_user_id parametresi technicians.user_id ile filter eder', async () => {
    const res = await request(app)
      .get(`/api/maintenance/requests?assigned_user_id=${myUserId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const ids = res.body.map(r => r.id)
    expect(ids).toContain(myReqId)
    expect(ids).not.toContain(otherReqId)
  })

  it('assigned_user_id=me JWT user.id ile resolve eder', async () => {
    const techToken = (await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })).body.token
    const res = await request(app)
      .get('/api/maintenance/requests?assigned_user_id=me')
      .set('Authorization', `Bearer ${techToken}`)
    expect(res.status).toBe(200)
    const ids = res.body.map(r => r.id)
    expect(ids).toContain(myReqId)
    expect(ids).not.toContain(otherReqId)
  })

  it('user_id baglantisi yoksa bos liste doner', async () => {
    const orphan = db.prepare("INSERT INTO users(username,password_hash,role,full_name) VALUES('m22orphan','x','technical','Orphan')").run().lastInsertRowid
    const res = await request(app)
      .get(`/api/maintenance/requests?assigned_user_id=${orphan}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('PUT /technicians/:id user_id guncellemeyi destekler', async () => {
    const newUser = db.prepare("INSERT INTO users(username,password_hash,role,full_name) VALUES('m22newuser','x','technical','NU')").run().lastInsertRowid
    const newTech = db.prepare("INSERT INTO technicians(full_name) VALUES('M22 Yeni')").run().lastInsertRowid
    const res = await request(app)
      .put(`/api/maintenance/technicians/${newTech}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: newUser })
    expect(res.status).toBe(200)
    const updated = db.prepare('SELECT user_id FROM technicians WHERE id=?').get(newTech)
    expect(updated.user_id).toBe(newUser)
  })

  it('user_id null ile baglantiyi kaldirir', async () => {
    const res = await request(app)
      .put(`/api/maintenance/technicians/${myTechId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: null })
    expect(res.status).toBe(200)
    const updated = db.prepare('SELECT user_id FROM technicians WHERE id=?').get(myTechId)
    expect(updated.user_id).toBeNull()
  })

  it('assign — bagli teknisyene target_user_id ile push-friendly notification', async () => {
    const userId = db.prepare("SELECT id FROM users WHERE username='teknik'").get().id
    const tech = db.prepare("INSERT INTO technicians(full_name,user_id) VALUES('Push Hedef',?)").run(userId).lastInsertRowid
    const req = db.prepare(`INSERT INTO maintenance_requests(location,description,priority)
      VALUES('M3 305','priz arizasi','high')`).run().lastInsertRowid

    const res = await request(app)
      .patch(`/api/maintenance/requests/${req}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ technician_id: tech })
    expect(res.status).toBe(200)

    const notif = db.prepare(`SELECT * FROM notifications
      WHERE target_user_id=? AND module='maintenance' ORDER BY id DESC LIMIT 1`).get(userId)
    expect(notif).toBeTruthy()
    expect(notif.target_role).toBeNull()
    expect(notif.type).toBe('critical') // high priority
    expect(notif.message).toMatch(/Size yeni ariza atandı|atand[ıi]/i)
  })

  it('assign — user_id bagli olmayan teknisyen icin target_role fallback', async () => {
    const tech = db.prepare("INSERT INTO technicians(full_name) VALUES('Bagsiz Tech')").run().lastInsertRowid
    const req = db.prepare(`INSERT INTO maintenance_requests(location,description,priority)
      VALUES('S1 105','musluk','medium')`).run().lastInsertRowid

    const res = await request(app)
      .patch(`/api/maintenance/requests/${req}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ technician_id: tech })
    expect(res.status).toBe(200)

    const notif = db.prepare(`SELECT * FROM notifications
      WHERE target_role='technical' AND module='maintenance' ORDER BY id DESC LIMIT 1`).get()
    expect(notif).toBeTruthy()
    expect(notif.target_user_id).toBeNull()
  })
})
