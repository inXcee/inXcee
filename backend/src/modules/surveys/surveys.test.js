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
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
})

describe('Surveys — Zod sweep', () => {
  it('cok uzun yorum 400 doner', async () => {
    const res = await request(app).post('/api/surveys/submit')
      .send({ overall_score: 4, comment: 'c'.repeat(2001) })
    expect(res.status).toBe(400)
  })
})

describe('Surveys', () => {
  it('skor 1-5 disinda reddedilir', async () => {
    const res = await request(app).post('/api/surveys/submit').send({ room_score: 7 })
    expect(res.status).toBe(400)
  })

  it('hicbir alan yoksa reddedilir', async () => {
    const res = await request(app).post('/api/surveys/submit').send({})
    expect(res.status).toBe(400)
  })

  it('anonim gonderim kabul edilir', async () => {
    const res = await request(app).post('/api/surveys/submit')
      .send({ room_score: 5, cleaning_score: 4, overall_score: 5, comment: 'Cok iyi' })
    expect(res.status).toBe(201)
  })

  it('stats ortalama doner', async () => {
    await request(app).post('/api/surveys/submit').send({ overall_score: 3 })
    await request(app).post('/api/surveys/submit').send({ overall_score: 5 })
    const res = await request(app)
      .get('/api/surveys/stats?days=30')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.summary.total).toBeGreaterThanOrEqual(2)
    expect(res.body.summary.avg_overall).toBeGreaterThan(0)
  })
})
