import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
let routeId
let vehicleId
let driverId
const auth = call => call.set('Authorization', `Bearer ${token}`)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  token = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  vehicleId = db.prepare(`
    INSERT INTO transport_vehicles(plate,label,capacity) VALUES('67 KPI 1','KPI Aracı',10)
  `).run().lastInsertRowid
  driverId = db.prepare(`
    INSERT INTO transport_drivers(full_name,phone) VALUES('KPI Şoförü','05321110000')
  `).run().lastInsertRowid
  routeId = db.prepare(`
    INSERT INTO routes(name,capacity,is_active,default_vehicle_id,default_driver_id)
    VALUES('KPI Hattı',10,1,?,?)
  `).run(vehicleId, driverId).lastInsertRowid
  const staff = db.prepare('SELECT id FROM staff WHERE is_active=1 ORDER BY id LIMIT 8').all()

  const tripInsert = db.prepare(`
    INSERT INTO transport_trips(
      route_id,work_date,direction,scheduled_departure,status,vehicle_id,driver_id,
      capacity_snapshot,source,published_at,departed_at,completed_at,cancelled_at,cancellation_reason
    ) VALUES(?,?,?,?,?,?,?,?, 'manual',?,?,?,?,?)
  `)
  const completed = tripInsert.run(
    routeId, '2099-10-01', 'outbound', '2099-10-01T07:00', 'completed',
    vehicleId, driverId, 10, '2099-10-01 06:00:00', '2099-10-01 07:03:00',
    '2099-10-01 08:00:00', null, null,
  ).lastInsertRowid
  const cancelled = tripInsert.run(
    routeId, '2099-10-02', 'inbound', '2099-10-02T18:00', 'cancelled',
    vehicleId, driverId, 10, '2099-10-01 12:00:00', null,
    null, '2099-10-02 17:00:00', 'Araç arızası',
  ).lastInsertRowid
  const assignmentInsert = db.prepare(`
    INSERT INTO transport_trip_assignments(trip_id,staff_id,status,source)
    VALUES(?,?,?,'manual')
  `)
  staff.slice(0, 6).forEach((person, index) => {
    assignmentInsert.run(completed, person.id, index < 5 ? 'boarded' : 'no_show')
  })
  staff.slice(6, 8).forEach(person => assignmentInsert.run(cancelled, person.id, 'cancelled'))
})

describe('Transport V2 analytics and exports', () => {
  it('calculates operational KPIs and drilldowns with filters', async () => {
    const response = await auth(request(app).get(
      `/api/transport/analytics?start=2099-10-01&end=2099-10-31&route_id=${routeId}`,
    ))
    expect(response.status).toBe(200)
    expect(response.body.kpis).toMatchObject({
      trips: 2,
      occupancy_pct: 30,
      boarding_pct: 83,
      no_show_pct: 17,
      on_time_pct: 100,
      cancellation_pct: 50,
    })
    expect(response.body.by_route[0]).toMatchObject({ label: 'KPI Hattı', trips: 2 })
    expect(response.body.by_vehicle[0].label).toBe('KPI Aracı')
    expect(response.body.by_driver[0].label).toBe('KPI Şoförü')
    expect(response.body.people).toHaveLength(6)
    expect(response.body.daily).toHaveLength(2)

    const outbound = await auth(request(app).get(
      '/api/transport/analytics?start=2099-10-01&end=2099-10-31&direction=outbound',
    ))
    expect(outbound.body.kpis.trips).toBe(1)
    expect(outbound.body.kpis.cancellation_pct).toBe(0)
  })

  it('exports the filtered dataset as CSV', async () => {
    const path = '/api/transport/analytics/export'
    const query = `?start=2099-10-01&end=2099-10-31&route_id=${routeId}`
    const csv = await auth(request(app).get(`${path}/csv${query}`))
    expect(csv.status).toBe(200)
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.text).toContain('KPI Hattı')
  })

  it('exports the filtered dataset as Excel', async () => {
    const path = '/api/transport/analytics/export'
    const query = `?start=2099-10-01&end=2099-10-31&route_id=${routeId}`
    const xlsx = await auth(request(app).get(`${path}/xlsx${query}`))
      .buffer(true).parse((res, callback) => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(xlsx.status).toBe(200)
    expect(xlsx.body.subarray(0, 2).toString()).toBe('PK')
  })

  it('exports the filtered dataset as PDF', async () => {
    const path = '/api/transport/analytics/export'
    const query = `?start=2099-10-01&end=2099-10-31&route_id=${routeId}`
    const pdf = await auth(request(app).get(`${path}/pdf${query}`))
      .buffer(true).parse((res, callback) => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(pdf.status).toBe(200)
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF')
  })
})
