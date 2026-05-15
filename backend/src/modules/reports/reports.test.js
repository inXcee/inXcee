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

  it('rejects unauthenticated data requests', async () => {
    const endpoints = [
      '/api/reports/housekeeping/data',
      '/api/reports/maintenance/data',
      '/api/reports/occupancy/data',
      '/api/reports/discipline/data',
    ]
    for (const endpoint of endpoints) {
      const res = await request(app).get(endpoint)
      expect(res.status).toBe(401)
    }
  })
})

describe('Yeni raporlar', () => {
  it('companies report', async () => {
    const res = await request(app).get('/api/reports/companies/data').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('companies')
    expect(res.body).toHaveProperty('total')
  })

  it('surveys report', async () => {
    const res = await request(app).get('/api/reports/surveys/data').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('summary')
    expect(res.body).toHaveProperty('recent')
  })

  it('drills report', async () => {
    const res = await request(app).get('/api/reports/drills/data').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('records')
    expect(res.body).toHaveProperty('total')
  })

  it('visitors report', async () => {
    const res = await request(app).get('/api/reports/visitors/data').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('records')
    expect(res.body).toHaveProperty('active')
  })

  it('expenses report', async () => {
    const res = await request(app).get('/api/reports/expenses/data').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('summary')
    expect(res.body).toHaveProperty('by_category')
    expect(res.body).toHaveProperty('monthly')
  })

  it('executive summary', async () => {
    const res = await request(app).get('/api/reports/executive/data').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('occupancy')
    expect(res.body.occupancy).toHaveProperty('rate')
    expect(res.body).toHaveProperty('maintenance_open')
    expect(res.body).toHaveProperty('checkins_30d')
  })

  it('PDF endpoints respond with PDF content-type', async () => {
    const pdfs = ['/api/reports/companies', '/api/reports/surveys', '/api/reports/drills', '/api/reports/visitors', '/api/reports/expenses', '/api/reports/executive']
    for (const p of pdfs) {
      const res = await request(app).get(p).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/pdf/)
    }
  })

  it('Genisletilmis Doluluk/Bakim/Disiplin PDF de calisir', async () => {
    for (const p of ['/api/reports/occupancy', '/api/reports/maintenance', '/api/reports/discipline']) {
      const res = await request(app).get(p).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/pdf/)
    }
  })

  it('Personel CSV', async () => {
    const res = await request(app).get('/api/reports/personnel').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/csv/)
    expect(res.text.split('\r\n')[0]).toContain('Ad Soyad')
  })

  it('Envanter CSV', async () => {
    const res = await request(app).get('/api/reports/inventory').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/csv/)
  })

  it('Camasirhane + Vardiya PDF', async () => {
    for (const p of ['/api/reports/laundry', '/api/reports/shifts']) {
      const res = await request(app).get(p).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/pdf/)
    }
  })

  it('Yeni raporlarin /data endpoint\'leri JSON doner', async () => {
    for (const p of ['/api/reports/personnel/data', '/api/reports/inventory/data', '/api/reports/laundry/data', '/api/reports/shifts/data']) {
      const res = await request(app).get(p).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('total')
    }
  })
})
