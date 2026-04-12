import { describe, it, expect, beforeAll } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import * as service from './service.js'
import request from 'supertest'
import app from '../../app.js'

let db
let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  db = getDB()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

describe('Reports Service', () => {
  it('returns housekeeping report structure', () => {
    const report = service.getHousekeepingReport(new Date().toISOString().split('T')[0])
    expect(report).toHaveProperty('tasks')
    expect(report).toHaveProperty('total')
    expect(report).toHaveProperty('done')
    expect(report).toHaveProperty('skipped')
    expect(report).toHaveProperty('pending')
    expect(Array.isArray(report.tasks)).toBe(true)
    expect(report.total).toBe(report.done + report.skipped + report.pending)
  })

  it('returns maintenance report structure', () => {
    const report = service.getMaintenanceReport()
    expect(report).toHaveProperty('requests')
    expect(report).toHaveProperty('total')
    expect(report).toHaveProperty('open')
    expect(report).toHaveProperty('closed')
    expect(report).toHaveProperty('overdue')
    expect(report.total).toBe(report.open + report.closed)
  })

  it('returns occupancy report with blocks and totals', () => {
    const report = service.getOccupancyReport()
    expect(report).toHaveProperty('blocks')
    expect(report).toHaveProperty('totals')
    expect(report).toHaveProperty('personnel')
    expect(Array.isArray(report.blocks)).toBe(true)
    expect(report.totals).toHaveProperty('oda')
    expect(report.totals).toHaveProperty('yatak')
    expect(report.totals).toHaveProperty('dolu')
  })

  it('occupancy blocks have expected fields', () => {
    const { blocks } = service.getOccupancyReport()
    if (blocks.length > 0) {
      const b = blocks[0]
      expect(b).toHaveProperty('block')
      expect(b).toHaveProperty('oda_sayisi')
      expect(b).toHaveProperty('toplam_yatak')
      expect(b).toHaveProperty('dolu_yatak')
    }
  })

  it('returns discipline report structure', () => {
    const report = service.getDisciplineReport()
    expect(report).toHaveProperty('records')
    expect(report).toHaveProperty('total')
    expect(Array.isArray(report.records)).toBe(true)
    expect(report.total).toBe(report.records.length)
  })
})

describe('Reports JSON endpoints', () => {
  it('GET /api/reports/housekeeping/data returns JSON summary', async () => {
    const date = new Date().toISOString().split('T')[0]
    const res = await request(app)
      .get(`/api/reports/housekeeping/data?date=${date}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('done')
    expect(res.body).toHaveProperty('skipped')
    expect(res.body).toHaveProperty('pending')
    expect(res.body).toHaveProperty('tasks')
    expect(Array.isArray(res.body.tasks)).toBe(true)
  })

  it('GET /api/reports/maintenance/data returns JSON summary', async () => {
    const res = await request(app)
      .get('/api/reports/maintenance/data')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('open')
    expect(res.body).toHaveProperty('closed')
    expect(res.body).toHaveProperty('overdue')
    expect(res.body).toHaveProperty('requests')
    expect(Array.isArray(res.body.requests)).toBe(true)
  })

  it('GET /api/reports/occupancy/data returns JSON summary', async () => {
    const res = await request(app)
      .get('/api/reports/occupancy/data')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('totals')
    expect(res.body).toHaveProperty('blocks')
    expect(res.body).toHaveProperty('personnel')
  })

  it('GET /api/reports/discipline/data returns JSON summary', async () => {
    const res = await request(app)
      .get('/api/reports/discipline/data')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('records')
    expect(Array.isArray(res.body.records)).toBe(true)
  })

  it('rejects unauthenticated data request', async () => {
    const res = await request(app).get('/api/reports/housekeeping/data')
    expect(res.status).toBe(401)
  })
})
