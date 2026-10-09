import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// 9 Eki 2026 ulaşım taraması: çevrimdışı okutma, yedek terfisi, kapasite ve gece yarısı çakışması.
let token
let routeId
let vehicleId
let vehicle2Id
let driverId
let driver2Id
let staff
const W = '2099-09-10'
const auth = call => call.set('Authorization', `Bearer ${token}`)
const db = () => getDB()
const assignmentOf = (tripId, staffId) =>
  db().prepare('SELECT * FROM transport_trip_assignments WHERE trip_id=? AND staff_id=?').get(tripId, staffId)

async function trip({ date = W, time = '07:00', vehicle = vehicleId, driver = driverId, capacity = 2 } = {}) {
  const res = await auth(request(app).post('/api/transport/trips')).send({
    route_id: routeId, work_date: date, direction: 'outbound', scheduled_departure: `${date}T${time}`,
    vehicle_id: vehicle, driver_id: driver, capacity_snapshot: capacity,
  })
  return res
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const pointId = (await auth(request(app).post('/api/transport/pickup-points')).send({ name: 'Düzeltme Durağı', lat: 41.4, lng: 31.7 })).body.id
  routeId = (await auth(request(app).post('/api/transport/routes')).send({ name: 'Düzeltme Hattı', capacity: 2 })).body.id
  await auth(request(app).post(`/api/transport/routes/${routeId}/stops`)).send({ pickup_point_id: pointId, scheduled_time: '07:00' })
  vehicleId = (await auth(request(app).post('/api/transport/vehicles')).send({ plate: '67 FIX 01', capacity: 2 })).body.id
  vehicle2Id = (await auth(request(app).post('/api/transport/vehicles')).send({ plate: '67 FIX 02', capacity: 2 })).body.id
  driverId = (await auth(request(app).post('/api/transport/drivers')).send({ full_name: 'Düzeltme Şoförü', phone: '05320000077' })).body.id
  driver2Id = (await auth(request(app).post('/api/transport/drivers')).send({ full_name: 'Düzeltme Şoförü 2', phone: '05320000078' })).body.id
  staff = db().prepare('SELECT id FROM staff WHERE is_active=1 ORDER BY id LIMIT 3').all()
  staff.forEach((p, i) => db().prepare('UPDATE staff SET qr_token=? WHERE id=?').run(`FIX-QR-${i + 1}`, p.id))
})

describe('çevrimdışı okutma (kalkıştan önce okutulup sonra gelen)', () => {
  let tripId
  beforeAll(async () => {
    tripId = (await trip()).body.id
    for (const p of staff.slice(0, 2)) await auth(request(app).post(`/api/transport/trips/${tripId}/assignments`)).send({ staff_id: p.id })
    await auth(request(app).post(`/api/transport/trips/${tripId}/publish`)).send({})
    await auth(request(app).post(`/api/transport/trips/${tripId}/boarding`)).send({})
    await auth(request(app).post(`/api/transport/trips/${tripId}/depart`)).send({})
    // kalkış saatini sabitle: 06:00 UTC (= 09:00 TR)
    db().prepare("UPDATE transport_trips SET departed_at='2099-09-10 06:00:00' WHERE id=?").run(tripId)
  })

  it('kalkışta "binmedi" yapılan kişi kalkıştan önceki okutmayla bindi sayılır, biniş saati cihaz saati', async () => {
    expect(assignmentOf(tripId, staff[0].id).status).toBe('no_show')
    const res = await auth(request(app).post(`/api/transport/trips/${tripId}/scan`)).send({
      qr_token: 'AVS:FIX-QR-1', client_event_id: 'fix-offline-1', device_time: '2099-09-10T05:58:30.000Z',
    })
    expect(res.status).toBe(200)
    expect(res.body.result).toBe('boarded')
    const a = assignmentOf(tripId, staff[0].id)
    expect(a.status).toBe('boarded')
    expect(a.boarded_at).toBe('2099-09-10 05:58:30')
  })

  it('+03:00 ofsetli cihaz saati de doğru karşılaştırılır', async () => {
    // 08:59 TR = 05:59 UTC → kalkıştan (06:00 UTC) önce
    const res = await auth(request(app).post(`/api/transport/trips/${tripId}/scan`)).send({
      qr_token: 'AVS:FIX-QR-2', client_event_id: 'fix-offline-2', device_time: '2099-09-10T08:59:00+03:00',
    })
    expect(res.body.result).toBe('boarded')
  })

  it('kalkıştan SONRAKİ okutma bindirmez (409)', async () => {
    const res = await auth(request(app).post(`/api/transport/trips/${tripId}/scan`)).send({
      qr_token: 'AVS:FIX-QR-1', client_event_id: 'fix-offline-3', device_time: '2099-09-10T06:05:00.000Z',
    })
    expect(res.status).toBe(409)
  })
})

describe('elle "binmedi" işaretlenen geri bindirilmez', () => {
  it('gerekçesi kalkış toplu işaretlemesi değilse okutma rejected', async () => {
    const tripId = (await trip({ time: '13:00' })).body.id
    await auth(request(app).post(`/api/transport/trips/${tripId}/assignments`)).send({ staff_id: staff[2].id })
    const a = assignmentOf(tripId, staff[2].id)
    await auth(request(app).patch(`/api/transport/trip-assignments/${a.id}/status`)).send({ status: 'no_show', reason: 'Raporlu' })
    await auth(request(app).post(`/api/transport/trips/${tripId}/publish`)).send({})
    await auth(request(app).post(`/api/transport/trips/${tripId}/boarding`)).send({})
    await auth(request(app).post(`/api/transport/trips/${tripId}/depart`)).send({})
    db().prepare("UPDATE transport_trips SET departed_at='2099-09-10 12:00:00' WHERE id=?").run(tripId)
    const res = await auth(request(app).post(`/api/transport/trips/${tripId}/scan`)).send({
      qr_token: 'AVS:FIX-QR-3', client_event_id: 'fix-manual-ns', device_time: '2099-09-10T09:00:00.000Z',
    })
    expect(res.body.result).toBe('rejected')
    expect(assignmentOf(tripId, staff[2].id).status).toBe('no_show')
  })
})

describe('kapasite ve yedek', () => {
  it('dolu seferde "binmedi" işaretlemesi yedeği terfi ettirir', async () => {
    const tripId = (await trip({ time: '18:00', capacity: 2 })).body.id
    for (const p of staff) await auth(request(app).post(`/api/transport/trips/${tripId}/assignments`)).send({ staff_id: p.id })
    expect(assignmentOf(tripId, staff[2].id).status).toBe('waitlisted')
    const first = assignmentOf(tripId, staff[0].id)
    const res = await auth(request(app).patch(`/api/transport/trip-assignments/${first.id}/status`)).send({ status: 'no_show', reason: 'gelmeyecek' })
    expect(res.body.promotion?.promoted_assignment_id).toBe(assignmentOf(tripId, staff[2].id).id)
    expect(assignmentOf(tripId, staff[2].id).status).toBe('assigned')
  })

  it('istemci status:"assigned" gönderse de dolu sefere ana listeden eklenemez (409)', async () => {
    const tripId = (await trip({ time: '21:00', capacity: 1, vehicle: vehicle2Id, driver: driver2Id })).body.id
    await auth(request(app).post(`/api/transport/trips/${tripId}/assignments`)).send({ staff_id: staff[0].id })
    const res = await auth(request(app).post(`/api/transport/trips/${tripId}/assignments`)).send({ staff_id: staff[1].id, status: 'assigned' })
    expect(res.status).toBe(409)
    const ok = await auth(request(app).post(`/api/transport/trips/${tripId}/assignments`)).send({ staff_id: staff[1].id })
    expect(ok.body.status).toBe('waitlisted')
  })
})

describe('toplu plan çakışması (planning resourceConflict)', () => {
  it('gün sınırını aşan yakın seferler çakışır, aynı gün uzak seferler çakışmaz', async () => {
    const { resourceConflict } = await import('./planning-service.js')
    const a = { vehicle_id: 7, work_date: '2099-09-20', scheduled_departure: '2099-09-20T23:30' }
    expect(resourceConflict(a, { vehicle_id: 7, work_date: '2099-09-21', scheduled_departure: '2099-09-21T00:30' }, 'vehicle_id')).toBe(true)
    expect(resourceConflict(a, { vehicle_id: 7, work_date: '2099-09-20', scheduled_departure: '2099-09-20T07:00' }, 'vehicle_id')).toBe(false)
    expect(resourceConflict(a, { vehicle_id: 8, work_date: '2099-09-20', scheduled_departure: '2099-09-20T23:40' }, 'vehicle_id')).toBe(false)
  })
})

describe('gece yarısını aşan çakışma', () => {
  it('23:30 seferindeki araç ertesi gün 00:30 seferine atanamaz', async () => {
    const night = await trip({ date: '2099-09-20', time: '23:30', vehicle: vehicle2Id, driver: driver2Id })
    expect(night.status).toBe(201)
    const after = await trip({ date: '2099-09-21', time: '00:30', vehicle: vehicle2Id, driver: driverId })
    expect(after.status).toBe(409)
    expect(after.body.error).toMatch(/çakışıyor/)
    const farEnough = await trip({ date: '2099-09-21', time: '03:00', vehicle: vehicle2Id, driver: driverId })
    expect(farEnough.status).toBe(201)
  })
})
