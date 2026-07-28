import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { getStaffTransport } from './self-service.js'

let managerToken
let routeId
let vehicleId
let driverId
let staff
let activeTripId
const workDate = '2099-09-12'
const auth = call => call.set('Authorization', `Bearer ${managerToken}`)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  const pointId = (await auth(request(app).post('/api/transport/pickup-points'))
    .send({ name: 'Şoför Link Durağı', lat: 41.4, lng: 31.7 })).body.id
  routeId = (await auth(request(app).post('/api/transport/routes'))
    .send({ name: 'Şoför Link Hattı', capacity: 4 })).body.id
  const stopId = (await auth(request(app).post(`/api/transport/routes/${routeId}/stops`))
    .send({ pickup_point_id: pointId, scheduled_time: '07:30' })).body.id
  vehicleId = (await auth(request(app).post('/api/transport/vehicles'))
    .send({ plate: '67 LINK 1', capacity: 4 })).body.id
  driverId = (await auth(request(app).post('/api/transport/drivers'))
    .send({ full_name: 'Link Şoförü', phone: '05320000123' })).body.id
  staff = getDB().prepare('SELECT id, full_name, phone FROM staff WHERE is_active=1 ORDER BY id LIMIT 1').get()
  getDB().prepare('UPDATE staff SET pickup_point_id=? WHERE id=?').run(pointId, staff.id)

  activeTripId = (await auth(request(app).post('/api/transport/trips')).send({
    route_id: routeId,
    work_date: workDate,
    direction: 'outbound',
    scheduled_departure: `${workDate}T07:30`,
    vehicle_id: vehicleId,
    driver_id: driverId,
    capacity_snapshot: 4,
  })).body.id
  await auth(request(app).post(`/api/transport/trips/${activeTripId}/assignments`))
    .send({ staff_id: staff.id, stop_id: stopId })
  await auth(request(app).post(`/api/transport/trips/${activeTripId}/publish`)).send({})
})

describe('Transport driver access, notifications and self-service', () => {
  it('stores only a token hash and hides personnel phones from the driver manifest', async () => {
    const shared = await auth(request(app).post(`/api/transport/trips/${activeTripId}/share-link`))
      .send({ expires_in_hours: 24 })
    expect(shared.status).toBe(201)
    expect(shared.body.token).toHaveLength(43)
    expect(shared.body.qr_data_url).toMatch(/^data:image\/png;base64,/)

    const stored = getDB().prepare(
      'SELECT token_hash, expires_at FROM transport_trip_access_tokens WHERE id=?'
    ).get(shared.body.id)
    expect(stored.token_hash).not.toBe(shared.body.token)
    expect(stored.token_hash).toHaveLength(64)
    expect(new Date(stored.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000)

    const manifest = await request(app).get(`/public/transport/trips/${shared.body.token}`)
    expect(manifest.status).toBe(200)
    expect(manifest.body.manifest[0].full_name).toBe(staff.full_name)
    expect(manifest.body.manifest[0]).not.toHaveProperty('phone')

    const started = (await request(app).post(`/public/transport/trips/${shared.body.token}`)
      .send({ action: 'start' })).body
    expect(started.status).toBe('departed')
    expect(started.transport_revision).toBeGreaterThan(0)
    const completed = (await request(app).post(`/public/transport/trips/${shared.body.token}`)
      .send({ action: 'complete' })).body
    expect(completed.status).toBe('completed')
    expect(completed.transport_revision).toBeGreaterThan(started.transport_revision)
    expect(getDB().prepare(`
      SELECT COUNT(*) AS count FROM transport_trip_events
      WHERE trip_id=? AND actor_type='driver_link'
    `).get(activeTripId).count).toBeGreaterThanOrEqual(3)
  })

  it('rejects revoked and expired links', async () => {
    const createPublishedTrip = async suffix => {
      const id = (await auth(request(app).post('/api/transport/trips')).send({
        route_id: routeId,
        work_date: `2099-09-${suffix}`,
        direction: 'outbound',
        scheduled_departure: `2099-09-${suffix}T12:00`,
        vehicle_id: vehicleId,
        driver_id: driverId,
        capacity_snapshot: 4,
      })).body.id
      await auth(request(app).post(`/api/transport/trips/${id}/publish`)).send({})
      return id
    }

    const revokedTrip = await createPublishedTrip('13')
    const revoked = (await auth(request(app).post(`/api/transport/trips/${revokedTrip}/share-link`))
      .send({ expires_in_hours: 1 })).body
    await auth(request(app).delete(`/api/transport/trips/${revokedTrip}/share-link/${revoked.id}`))
    expect((await request(app).get(`/public/transport/trips/${revoked.token}`)).status).toBe(410)

    const expiredTrip = await createPublishedTrip('14')
    const expired = (await auth(request(app).post(`/api/transport/trips/${expiredTrip}/share-link`))
      .send({ expires_in_hours: 1 })).body
    getDB().prepare("UPDATE transport_trip_access_tokens SET expires_at=datetime('now','-1 minute') WHERE id=?")
      .run(expired.id)
    expect((await request(app).get(`/public/transport/trips/${expired.token}`)).status).toBe(410)
  })

  it('notifies only published trip changes and exposes only the worker own trips', async () => {
    const db = getDB()
    const before = db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE module='transport'").get().count
    const draftId = (await auth(request(app).post('/api/transport/trips')).send({
      route_id: routeId,
      work_date: '2099-09-20',
      direction: 'inbound',
      scheduled_departure: '2099-09-20T18:00',
      vehicle_id: vehicleId,
      driver_id: driverId,
      capacity_snapshot: 4,
    })).body.id
    await auth(request(app).patch(`/api/transport/trips/${draftId}`))
      .send({ notes: 'Taslak değişikliği' })
    expect(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE module='transport'").get().count)
      .toBe(before)

    await auth(request(app).post(`/api/transport/trips/${draftId}/assignments`)).send({ staff_id: staff.id })
    await auth(request(app).post(`/api/transport/trips/${draftId}/publish`)).send({})
    await auth(request(app).patch(`/api/transport/trips/${draftId}`))
      .send({ scheduled_departure: '2099-09-20T18:15', change_reason: 'Vardiya çıkışı' })
    expect(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE module='transport'").get().count)
      .toBeGreaterThan(before)

    const own = getStaffTransport(staff.id, '2099-09-20')
    expect(own.upcoming.some(trip => trip.trip_id === draftId)).toBe(true)
    expect(own.upcoming.every(trip => trip.full_name === undefined)).toBe(true)
  })

  it('rate-limits repeated public link probes', async () => {
    let limited = false
    for (let index = 0; index < 35; index += 1) {
      const response = await request(app).get(`/public/transport/trips/${'x'.repeat(40)}${index}`)
      if (response.status === 429) {
        limited = true
        break
      }
    }
    expect(limited).toBe(true)
  })
})
