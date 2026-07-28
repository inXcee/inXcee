import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let supervisorToken
let vehicleId
let driverId
let routeId
let templateId
const workDate = '2099-06-15'

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login')
    .send({ username: 'vardiya', password: 'admin123' })).body.token

  const point = await request(app).post('/api/transport/pickup-points')
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ name: 'Planlama Durağı', lat: 41.42, lng: 31.78 })
  const route = await request(app).post('/api/transport/routes')
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ name: 'Planlama Hattı', capacity: 2 })
  routeId = route.body.id
  await request(app).post(`/api/transport/routes/${routeId}/stops`)
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ pickup_point_id: point.body.id, scheduled_time: '07:00' })

  const staff = getDB().prepare('SELECT id, department_id FROM staff WHERE is_active=1 ORDER BY id LIMIT 1').get()
  const shift = getDB().prepare('SELECT id FROM shift_definitions ORDER BY id LIMIT 1').get()
  getDB().prepare(`
    INSERT INTO shift_schedule(staff_id,dept_id,shift_def_id,work_date,status)
    VALUES(?,?,?,?, 'scheduled')
  `).run(staff.id, staff.department_id, shift.id, workDate)
  await request(app).put(`/api/transport/staff/${staff.id}/pickup`)
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ pickup_point_id: point.body.id })
})

describe('Transport V2 resources', () => {
  it('allows only campus manager to configure resources', async () => {
    const forbidden = await request(app).post('/api/transport/vehicles')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ plate: '67 PLAN 01', capacity: 20 })
    expect(forbidden.status).toBe(403)

    const vehicle = await request(app).post('/api/transport/vehicles')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ plate: '67 PLAN 01', label: 'Plan Aracı', capacity: 20 })
    expect(vehicle.status).toBe(201)
    expect(vehicle.body.revision).toBeGreaterThan(0)
    vehicleId = vehicle.body.id

    const driver = await request(app).post('/api/transport/drivers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ full_name: 'Plan Şoförü', phone: '05320000044' })
    expect(driver.status).toBe(201)
    driverId = driver.body.id

    const vehicles = await request(app).get('/api/transport/vehicles')
      .set('Authorization', `Bearer ${supervisorToken}`)
    expect(vehicles.status).toBe(200)
    expect(vehicles.body.some(row => row.id === vehicleId)).toBe(true)
  })

  it('records and removes resource unavailability', async () => {
    const created = await request(app).post('/api/transport/resource-unavailability')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        vehicle_id: vehicleId,
        starts_at: '2099-06-16T07:00',
        ends_at: '2099-06-16T10:00',
        reason: 'Kontrol',
      })
    expect(created.status).toBe(201)

    const list = await request(app)
      .get('/api/transport/resource-unavailability?from=2099-06-16&to=2099-06-16')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(list.body).toHaveLength(1)
    expect(list.body[0].vehicle_plate).toBe('67 PLAN 01')

    const removed = await request(app)
      .delete(`/api/transport/resource-unavailability/${created.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(removed.status).toBe(200)
  })
})

describe('Transport V2 plan preview and publish', () => {
  it('creates a recurring template and proposes staff assignments', async () => {
    const created = await request(app).post('/api/transport/trip-templates')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'Sabah Gidiş',
        route_id: routeId,
        direction: 'outbound',
        departure_time: '07:00',
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        default_vehicle_id: vehicleId,
        default_driver_id: driverId,
      })
    expect(created.status).toBe(201)
    templateId = created.body.id

    const preview = await request(app).post('/api/transport/plan/preview')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ start_date: workDate, end_date: workDate, template_ids: [templateId] })
    expect(preview.status).toBe(200)
    expect(preview.body.summary).toMatchObject({
      trip_count: 1,
      assignment_count: 1,
      blocker_count: 0,
    })
    expect(preview.body.trips[0].assignments).toHaveLength(1)
  })

  it('publishes an approved preview and rejects stale revisions', async () => {
    const preview = await request(app).post('/api/transport/plan/preview')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ start_date: workDate, end_date: workDate, template_ids: [templateId] })

    const stale = await request(app).post('/api/transport/plan/publish')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        start_date: workDate,
        end_date: workDate,
        template_ids: [templateId],
        base_revision: preview.body.base_revision - 1,
      })
    expect(stale.status).toBe(409)

    const published = await request(app).post('/api/transport/plan/publish')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        start_date: workDate,
        end_date: workDate,
        template_ids: [templateId],
        base_revision: preview.body.base_revision,
      })
    expect(published.status).toBe(201)
    expect(published.body.trips).toHaveLength(1)

    const trip = getDB().prepare(`
      SELECT * FROM transport_trips WHERE id=?
    `).get(published.body.trips[0].id)
    expect(trip).toMatchObject({ status: 'published', direction: 'outbound', source: 'template' })
    expect(getDB().prepare(`
      SELECT COUNT(*) AS c FROM transport_trip_assignments WHERE trip_id=?
    `).get(trip.id).c).toBe(1)
  })

  it('detects vehicle and driver overlaps as blockers', async () => {
    const second = await request(app).post('/api/transport/trip-templates')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'Çakışan Gidiş',
        route_id: routeId,
        direction: 'outbound',
        departure_time: '08:00',
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        default_vehicle_id: vehicleId,
        default_driver_id: driverId,
      })
    expect(second.status).toBe(201)

    const preview = await request(app).post('/api/transport/plan/preview')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        start_date: '2099-06-17',
        end_date: '2099-06-17',
        template_ids: [templateId, second.body.id],
      })
    expect(preview.status).toBe(200)
    expect(preview.body.blockers.some(row => row.code === 'vehicle_overlap')).toBe(true)
    expect(preview.body.blockers.some(row => row.code === 'driver_overlap')).toBe(true)
  })
})
