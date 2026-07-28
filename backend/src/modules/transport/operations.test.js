import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let supervisorToken
let routeId
let pointId
let vehicleId
let driverId
let tripId
let staff
const workDate = '2099-08-20'

const auth = (call, token = supervisorToken) => call.set('Authorization', `Bearer ${token}`)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login')
    .send({ username: 'vardiya', password: 'admin123' })).body.token

  pointId = (await auth(request(app).post('/api/transport/pickup-points'), managerToken)
    .send({ name: 'Operasyon Durağı', lat: 41.45, lng: 31.75 })).body.id
  routeId = (await auth(request(app).post('/api/transport/routes'), managerToken)
    .send({ name: 'Operasyon Hattı', capacity: 2 })).body.id
  await auth(request(app).post(`/api/transport/routes/${routeId}/stops`), managerToken)
    .send({ pickup_point_id: pointId, scheduled_time: '07:00' })
  vehicleId = (await auth(request(app).post('/api/transport/vehicles'), managerToken)
    .send({ plate: '67 OPS 01', capacity: 2 })).body.id
  driverId = (await auth(request(app).post('/api/transport/drivers'), managerToken)
    .send({ full_name: 'Operasyon Şoförü', phone: '05320000055' })).body.id
  staff = getDB().prepare('SELECT id, full_name FROM staff WHERE is_active=1 ORDER BY id LIMIT 3').all()
  staff.forEach((person, index) => {
    getDB().prepare('UPDATE staff SET qr_token=?, pickup_point_id=? WHERE id=?')
      .run(`OPS-QR-${index + 1}`, pointId, person.id)
  })
})

describe('Transport V2 operations', () => {
  it('creates, publishes and starts boarding for a manual trip', async () => {
    const created = await auth(request(app).post('/api/transport/trips')).send({
      route_id: routeId,
      work_date: workDate,
      direction: 'outbound',
      scheduled_departure: `${workDate}T07:00`,
      vehicle_id: vehicleId,
      driver_id: driverId,
      capacity_snapshot: 2,
    })
    expect(created.status).toBe(201)
    expect(created.body.revision).toBeGreaterThan(0)
    tripId = created.body.id

    for (const person of staff) {
      const assignment = await auth(request(app).post(`/api/transport/trips/${tripId}/assignments`))
        .send({ staff_id: person.id })
      expect(assignment.status).toBe(201)
    }
    const detail = await auth(request(app).get(`/api/transport/trips/${tripId}`))
    expect(detail.body.assignments.filter(row => row.status === 'assigned')).toHaveLength(2)
    expect(detail.body.assignments.filter(row => row.status === 'waitlisted')).toHaveLength(1)

    expect((await auth(request(app).post(`/api/transport/trips/${tripId}/publish`)).send({})).status).toBe(200)
    expect((await auth(request(app).post(`/api/transport/trips/${tripId}/boarding`)).send({})).body.status).toBe('boarding')
  })

  it('records QR scans idempotently by client_event_id', async () => {
    const payload = {
      qr_token: 'AVS:OPS-QR-1',
      client_event_id: 'operation-event-0001',
      device_time: '2099-08-20T06:55:00.000Z',
    }
    const first = await auth(request(app).post(`/api/transport/trips/${tripId}/scan`)).send(payload)
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ result: 'boarded', duplicate: false })

    const duplicate = await auth(request(app).post(`/api/transport/trips/${tripId}/scan`)).send(payload)
    expect(duplicate.status).toBe(200)
    expect(duplicate.body).toMatchObject({ result: 'boarded', duplicate: true })
    expect(getDB().prepare(`
      SELECT COUNT(*) AS count FROM transport_scan_events WHERE client_event_id=?
    `).get(payload.client_event_id).count).toBe(1)

    const already = await auth(request(app).post(`/api/transport/trips/${tripId}/scan`)).send({
      ...payload,
      client_event_id: 'operation-event-0002',
    })
    expect(already.body.result).toBe('already_boarded')
  })

  it('promotes the first waitlisted person when capacity opens before departure', async () => {
    const detail = await auth(request(app).get(`/api/transport/trips/${tripId}`))
    const assigned = detail.body.assignments.find(row => row.staff_id === staff[1].id)
    const waiting = detail.body.assignments.find(row => row.staff_id === staff[2].id)

    const changed = await auth(request(app).patch(`/api/transport/trip-assignments/${assigned.id}/status`))
      .send({ status: 'cancelled', reason: 'Servis kullanmayacak' })
    expect(changed.status).toBe(200)
    expect(changed.body.promotion.promoted_assignment_id).toBe(waiting.id)
    expect(getDB().prepare('SELECT status FROM transport_trip_assignments WHERE id=?').get(waiting.id).status)
      .toBe('assigned')
  })

  it('enforces lifecycle transitions, records no-shows and manager-only reopen', async () => {
    expect((await auth(request(app).post(`/api/transport/trips/${tripId}/depart`)).send({ delay_minutes: 8 })).body.status)
      .toBe('departed')
    expect(getDB().prepare(`
      SELECT COUNT(*) AS count FROM transport_trip_assignments WHERE trip_id=? AND status='no_show'
    `).get(tripId).count).toBeGreaterThan(0)

    expect((await auth(request(app).post(`/api/transport/trips/${tripId}/complete`)).send({})).body.status)
      .toBe('completed')
    const locked = await auth(request(app).patch(`/api/transport/trips/${tripId}`))
      .send({ notes: 'Değiştir' })
    expect(locked.status).toBe(409)

    const forbidden = await auth(request(app).post(`/api/transport/trips/${tripId}/reopen`))
      .send({ reason: 'Yanlış tamamlandı' })
    expect(forbidden.status).toBe(403)
    const reopened = await auth(request(app).post(`/api/transport/trips/${tripId}/reopen`), managerToken)
      .send({ reason: 'Yanlış tamamlandı' })
    expect(reopened.body.status).toBe('published')
    expect(getDB().prepare(`
      SELECT COUNT(*) AS count FROM transport_trip_events WHERE trip_id=? AND event_type='reopened'
    `).get(tripId).count).toBe(1)
  })

  it('returns command-center counters and next action', async () => {
    const operations = await auth(request(app)
      .get(`/api/transport/operations?date=${workDate}&direction=outbound`))
    expect(operations.status).toBe(200)
    expect(operations.body.trips).toHaveLength(1)
    expect(operations.body.next_trip.next_action.key).toBe('boarding')
    expect(operations.body).toHaveProperty('revision')
  })
})
