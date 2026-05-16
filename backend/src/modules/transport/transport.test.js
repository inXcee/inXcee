import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

const auth = { Authorization: `Bearer ${''}` } // placeholder, gerçek headers her testte token okur

describe('Transport — Pickup Points', () => {
  it('campus_manager olmayan kullanıcı CRUD yapamaz', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const res = await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${t}`).send({ name: 'X' })
    expect(res.status).toBe(403)
  })

  it('CREATE/LIST/UPDATE/DELETE pickup point', async () => {
    const create = await request(app).post('/api/transport/pickup-points')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Eski Sanayi', district: 'Merkez', neighborhood: 'Yeni Mah' })
    expect(create.status).toBe(201)
    const id = create.body.id

    const list = await request(app).get('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    const found = list.body.find(p => p.id === id)
    expect(found.name).toBe('Eski Sanayi')

    const upd = await request(app).put(`/api/transport/pickup-points/${id}`).set('Authorization', `Bearer ${token}`).send({ notes: 'Test' })
    expect(upd.status).toBe(200)

    const del = await request(app).delete(`/api/transport/pickup-points/${id}`).set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })
})

describe('Transport — Routes', () => {
  it('CREATE/LIST route + add stops + manifest', async () => {
    // Önce iki pickup point
    const p1 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Durak A', district: 'Merkez' })).body.id
    const p2 = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Durak B', district: 'Sahil' })).body.id

    const r = await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mavi Hat', capacity: 20, vehicle_plate: '34 ABC 123' })
    expect(r.status).toBe(201)
    const routeId = r.body.id

    const list = await request(app).get('/api/transport/routes').set('Authorization', `Bearer ${token}`)
    expect(list.body.find(x => x.id === routeId).capacity).toBe(20)

    const s1 = await request(app).post(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: p1, scheduled_time: '07:30' })
    expect(s1.status).toBe(201)
    const stopId1 = s1.body.id

    const s2 = await request(app).post(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: p2, scheduled_time: '07:45' })
    expect(s2.status).toBe(201)

    const stops = await request(app).get(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
    expect(stops.body).toHaveLength(2)
    expect(stops.body[0].sequence_order).toBe(1)

    // Reorder
    const reorder = await request(app).post(`/api/transport/routes/${routeId}/reorder-stops`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stop_ids: [s2.body.id, stopId1] })
    expect(reorder.status).toBe(200)

    const stops2 = await request(app).get(`/api/transport/routes/${routeId}/stops`).set('Authorization', `Bearer ${token}`)
    expect(stops2.body[0].id).toBe(s2.body.id)

    // Manifest (boş — atama yok)
    const m = await request(app).get(`/api/transport/routes/${routeId}/manifest?date=2026-05-16`).set('Authorization', `Bearer ${token}`)
    expect(m.status).toBe(200)
    expect(m.body.total_passengers).toBe(0)
    expect(m.body.stops).toHaveLength(2)
  })
})

describe('Transport — Daily Overview', () => {
  it('boş gün için temel veriler döner', async () => {
    const res = await request(app).get('/api/transport/daily?date=2026-05-16').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('on_shift_count')
    expect(res.body).toHaveProperty('assigned_count')
    expect(res.body).toHaveProperty('routes')
    expect(res.body).toHaveProperty('uncovered')
    expect(res.body).toHaveProperty('alerts')
  })
})

describe('Transport — Auto-assign', () => {
  it('vardiyalı + pickup atanmış personeli rotaya bind eder', async () => {
    // Personel pickup'ı set et
    const seedStaff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${token}`)).body
    if (!seedStaff || seedStaff.length === 0) return // skip — seed personel yok

    const pickup = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Durak' })).body.id
    const route = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Hat', capacity: 30 })).body.id
    await request(app).post(`/api/transport/routes/${route}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: pickup })

    const first = seedStaff[0]
    await request(app).put(`/api/transport/staff/${first.id}/pickup`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: pickup })

    // Bugün için bir shift_schedule kaydı oluştur
    const today = new Date().toISOString().slice(0, 10)
    await request(app).post('/api/shifts/schedule/bulk').set('Authorization', `Bearer ${token}`)
      .send({ entries: [{ staff_id: first.id, work_date: today, shift_def_id: 1 }] })

    const res = await request(app).post('/api/transport/auto-assign').set('Authorization', `Bearer ${token}`)
      .send({ date: today })
    expect(res.status).toBe(200)
    expect(res.body.assigned).toBeGreaterThanOrEqual(1)
  })
})

describe('Transport — Manual assignment + clear', () => {
  it('atama + iptal', async () => {
    const staff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${token}`)).body
    if (!staff || staff.length < 2) return

    const route = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Manuel Hat', capacity: 15 })).body.id

    const date = '2026-06-01'
    const setRes = await request(app).post('/api/transport/assign').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staff[1].id, route_id: route, work_date: date })
    expect(setRes.status).toBe(200)

    const overview = (await request(app).get(`/api/transport/daily?date=${date}`).set('Authorization', `Bearer ${token}`)).body
    expect(overview.assigned_count).toBeGreaterThanOrEqual(1)

    const clr = await request(app).delete(`/api/transport/assign/${staff[1].id}?date=${date}`).set('Authorization', `Bearer ${token}`)
    expect(clr.status).toBe(200)
  })
})
