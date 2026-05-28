import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

beforeAll(() => { process.env.DB_PATH = ':memory:'; initDB(); seedDev() })

describe('Public stats — /api/public/stats', () => {
  it('auth GEREKTİRMEDEN 200 döner', async () => {
    const res = await request(app).get('/api/public/stats')
    expect(res.status).toBe(200)
  })

  it('sadece güvenli toplu sayılar döner (PII yok)', async () => {
    const res = await request(app).get('/api/public/stats')
    expect(res.body).toHaveProperty('beds_total')
    expect(res.body).toHaveProperty('beds_occupied')
    expect(res.body).toHaveProperty('occupancy_pct')
    expect(res.body).toHaveProperty('open_faults')
    expect(res.body).toHaveProperty('active_staff')
    expect(res.body).toHaveProperty('departments')
    // hepsi sayı
    for (const k of ['beds_total','beds_occupied','occupancy_pct','open_faults','active_staff','departments'])
      expect(typeof res.body[k]).toBe('number')
    // isim/oda gibi alan sızmamalı
    const keys = Object.keys(res.body)
    expect(keys.some(k => /name|room|tc|pin|email|phone/i.test(k))).toBe(false)
  })

  it('occupancy_pct 0–100 aralığında', async () => {
    const res = await request(app).get('/api/public/stats')
    expect(res.body.occupancy_pct).toBeGreaterThanOrEqual(0)
    expect(res.body.occupancy_pct).toBeLessThanOrEqual(100)
  })
})
