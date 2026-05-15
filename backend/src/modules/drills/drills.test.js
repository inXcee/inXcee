import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = r.body.token
})

describe('Drills', () => {
  it('gecersiz tip reddedilir', async () => {
    const res = await request(app).post('/api/drills')
      .set('Authorization', `Bearer ${token}`)
      .send({ drill_type: 'xyz', drill_date: '2026-01-01' })
    expect(res.status).toBe(400)
  })

  it('tarih olmadan reddedilir', async () => {
    const res = await request(app).post('/api/drills')
      .set('Authorization', `Bearer ${token}`)
      .send({ drill_type: 'fire' })
    expect(res.status).toBe(400)
  })

  it('tatbikat kayit + liste + sil', async () => {
    const create = await request(app).post('/api/drills')
      .set('Authorization', `Bearer ${token}`)
      .send({
        drill_type: 'fire', drill_date: '2026-05-15',
        expected_count: 100, actual_count: 87, duration_minutes: 8,
        missing_names: 'Ali, Veli', findings: 'Sıkışma yaşandı', next_drill_date: '2026-08-15',
      })
    expect(create.status).toBe(201)
    const id = create.body.id

    const list = await request(app).get('/api/drills').set('Authorization', `Bearer ${token}`)
    expect(list.body.some(d => d.id === id)).toBe(true)

    const stats = await request(app).get('/api/drills/stats').set('Authorization', `Bearer ${token}`)
    expect(stats.body.total).toBeGreaterThanOrEqual(1)
    expect(stats.body.upcoming).toBe('2026-08-15')

    const del = await request(app).delete(`/api/drills/${id}`).set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })
})
