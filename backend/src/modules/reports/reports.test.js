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

  it('Envanter PDF + CSV + Hareketler CSV', async () => {
    const pdf = await request(app).get('/api/reports/inventory').set('Authorization', `Bearer ${token}`)
    expect(pdf.status).toBe(200)
    expect(pdf.headers['content-type']).toMatch(/pdf/)

    const csv = await request(app).get('/api/reports/inventory.csv').set('Authorization', `Bearer ${token}`)
    expect(csv.status).toBe(200)
    expect(csv.headers['content-type']).toMatch(/csv/)

    const mov = await request(app).get('/api/reports/inventory/movements.csv').set('Authorization', `Bearer ${token}`)
    expect(mov.status).toBe(200)
    expect(mov.headers['content-type']).toMatch(/csv/)
    expect(mov.text.split('\r\n')[0]).toContain('Tip')
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

// ── H11 İleri raporlar ──
describe('H11 R1 — Absence dashboard', () => {
  it('GET /reports/absence-dashboard döner', async () => {
    const r = await request(app).get('/api/reports/absence-dashboard?days=30').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body).toHaveProperty('summary')
    expect(r.body).toHaveProperty('trend')
    expect(r.body).toHaveProperty('no_show_trend')
    expect(r.body).toHaveProperty('by_dept')
  })
})

describe('H11 R2 — Cost per person', () => {
  it('GET /reports/cost-per-person', async () => {
    const r = await request(app).get('/api/reports/cost-per-person').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body).toHaveProperty('rows')
    r.body.rows.forEach(row => {
      expect(row).toHaveProperty('meal_cost')
      expect(row).toHaveProperty('transport_count')
      expect(row).toHaveProperty('deductions')
    })
  })
})

describe('H11 R3 — Comparison', () => {
  it('GET /reports/comparison', async () => {
    const r = await request(app).get('/api/reports/comparison').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body).toHaveProperty('current')
    expect(r.body).toHaveProperty('previous')
    expect(r.body).toHaveProperty('delta')
    expect(r.body.delta).toHaveProperty('worked')
  })
})

describe('H11 R4 — Staff builder', () => {
  it('default kolonlar', async () => {
    const r = await request(app).get('/api/reports/staff-builder').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body).toHaveProperty('available_columns')
    expect(r.body).toHaveProperty('rows')
  })

  it('özel kolonlar', async () => {
    const r = await request(app).get('/api/reports/staff-builder?cols=full_name,phone,tc_no').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body.selected).toEqual(['full_name', 'phone', 'tc_no'])
  })
})

describe('Erişim hareketleri CSV export (Faz 10)', () => {
  it('GET /api/reports/access-events.csv başlık + kayıt döner', async () => {
    db.prepare("INSERT INTO personnel(full_name) VALUES('CSV Hareket Kisi')").run()
    const pid = db.prepare("SELECT id FROM personnel WHERE full_name='CSV Hareket Kisi'").get().id
    db.prepare(`INSERT INTO access_events(holder_type,holder_id,event_type,result,scanned_at)
      VALUES('personnel',?,'entry','ok',datetime('now'))`).run(pid)
    const res = await request(app).get('/api/reports/access-events.csv').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.text).toContain('CSV Hareket Kisi')
    expect(res.text).toContain('Sonuç') // başlık satırı
  })

  it('yetkisiz 401', async () => {
    const res = await request(app).get('/api/reports/access-events.csv')
    expect(res.status).toBe(401)
  })
})
