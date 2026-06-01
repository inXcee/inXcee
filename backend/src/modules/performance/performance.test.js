import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, staffId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  let s = db.prepare('SELECT id FROM staff LIMIT 1').get()
  if (!s) {
    db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?,1)').run('Perf Test')
    s = db.prepare('SELECT id FROM staff WHERE full_name=?').get('Perf Test')
  }
  staffId = s.id
})

describe('Performance — Zod sweep', () => {
  it('gecersiz period formati 400 doner', async () => {
    const r = await request(app).post('/api/performance/reviews').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, period: 'haziran' })
    expect(r.status).toBe(400)
  })

  it('5 ustu puan 400 doner', async () => {
    const r = await request(app).post('/api/performance/reviews').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, period: '2027', productivity: 9 })
    expect(r.status).toBe(400)
  })
})

describe('H9 PE1 — Değerlendirme', () => {
  it('CREATE total_score otomatik hesaplar', async () => {
    const r = await request(app).post('/api/performance/reviews').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, period: '2026',
        productivity: 5, teamwork: 4, attendance: 5, attitude: 4,
        skills: 3, initiative: 4, reliability: 5, communication: 4 })
    expect(r.status).toBe(201)
    expect(r.body.total_score).toBeCloseTo(4.25, 1)
  })

  it('aynı dönem ikinci 409', async () => {
    const r = await request(app).post('/api/performance/reviews').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, period: '2026', productivity: 3 })
    expect(r.status).toBe(409)
  })

  it('GET listele + GET detay', async () => {
    const list = await request(app).get('/api/performance/reviews?period=2026').set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    expect(list.body.length).toBeGreaterThanOrEqual(1)
    const id = list.body[0].id

    const get = await request(app).get(`/api/performance/reviews/${id}`).set('Authorization', `Bearer ${token}`)
    expect(get.body.total_score).toBeTruthy()
  })

  it('PUT skor recalc', async () => {
    const c = await request(app).post('/api/performance/reviews').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, period: '2026-Q1', productivity: 3, teamwork: 3 })
    const id = c.body.id
    await request(app).put(`/api/performance/reviews/${id}`).set('Authorization', `Bearer ${token}`)
      .send({ productivity: 5 })
    const get = await request(app).get(`/api/performance/reviews/${id}`).set('Authorization', `Bearer ${token}`)
    expect(get.body.productivity).toBe(5)
    expect(get.body.total_score).toBeGreaterThan(3)
  })

  it('geçersiz period formatı 400', async () => {
    const r = await request(app).post('/api/performance/reviews').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, period: 'bla' })
    expect(r.status).toBe(400)
  })
})

describe('H9 PE2 — Hedef', () => {
  it('CREATE goal + PATCH status + progress', async () => {
    const c = await request(app).post('/api/performance/goals').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, title: 'X sertifikasını al', target_date: '2026-12-31' })
    expect(c.status).toBe(201)
    const id = c.body.id

    await request(app).patch(`/api/performance/goals/${id}`).set('Authorization', `Bearer ${token}`)
      .send({ progress: 50, status: 'in_progress' })

    const list = await request(app).get('/api/performance/goals?status=in_progress').set('Authorization', `Bearer ${token}`)
    expect(list.body.find(g => g.id === id)?.progress).toBe(50)
  })
})

describe('H9 PE3 — Pozitif puan', () => {
  it('puan ver + listele + toplam', async () => {
    await request(app).post('/api/performance/positive').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, reason: 'Müşteri övgüsü', points: 5 })
    await request(app).post('/api/performance/positive').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, reason: 'İnisiyatif', points: 3 })
    const r = await request(app).get(`/api/performance/positive/${staffId}`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body.total).toBeGreaterThanOrEqual(8)
    expect(r.body.items.length).toBeGreaterThanOrEqual(2)
  })

  it('leaderboard listeler', async () => {
    const r = await request(app).get('/api/performance/leaderboard?days=90').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThanOrEqual(1)
    expect(r.body[0].positive_points).toBeGreaterThan(0)
  })
})

describe('H9 Yetki', () => {
  it('campus_manager olmayan değerlendirme yapamaz', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const r = await request(app).post('/api/performance/reviews').set('Authorization', `Bearer ${t}`)
      .send({ staff_id: staffId, period: '2027' })
    expect(r.status).toBe(403)
  })
})
