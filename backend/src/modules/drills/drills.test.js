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

describe('Drills — Zod sweep', () => {
  it('cok uzun bulgular metni 400 doner', async () => {
    const res = await request(app).post('/api/drills')
      .set('Authorization', `Bearer ${token}`)
      .send({ drill_type: 'fire', drill_date: '2026-06-10', findings: 'f'.repeat(4001) })
    expect(res.status).toBe(400)
  })
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

  it('roster JSON — bloga göre grupla, toplam say', async () => {
    const res = await request(app).get('/api/drills/roster').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('generated_at')
    expect(res.body).toHaveProperty('total')
    expect(Array.isArray(res.body.blocks)).toBe(true)
    // Toplam, bloklardaki sayıların toplamına eşit olmalı
    const sum = res.body.blocks.reduce((s, b) => s + b.count, 0)
    expect(sum).toBe(res.body.total)
  })

  it('roster — block filter sadece o bloğu döner', async () => {
    const res = await request(app).get('/api/drills/roster?block=M1').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.block_filter).toBe('M1')
    // Dönen tüm blocks entry'leri M1 olmalı
    for (const b of res.body.blocks) expect(b.block).toBe('M1')
  })

  it('roster.pdf — application/pdf döner', async () => {
    const res = await request(app).get('/api/drills/roster.pdf').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect(res.headers['content-disposition']).toMatch(/tahliye-listesi/)
  })

  it('roster — auth zorunlu', async () => {
    const res = await request(app).get('/api/drills/roster')
    expect(res.status).toBe(401)
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
