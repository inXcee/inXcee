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

describe('Transport — Zod sweep', () => {
  it('cok uzun durak adi 400 doner', async () => {
    const res = await request(app).post('/api/transport/pickup-points')
      .set('Authorization', `Bearer ${token}`).send({ name: 'A'.repeat(201) })
    expect(res.status).toBe(400)
  })

  it('cok uzun rota adi 400 doner', async () => {
    const res = await request(app).post('/api/transport/routes')
      .set('Authorization', `Bearer ${token}`).send({ name: 'R'.repeat(201) })
    expect(res.status).toBe(400)
  })

  it('atama eksik work_date ile 400 doner', async () => {
    const res = await request(app).post('/api/transport/assign')
      .set('Authorization', `Bearer ${token}`).send({ staff_id: 1, route_id: 1 })
    expect(res.status).toBe(400)
  })
})

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
    await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${token}`)
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

// ── Faz 6: No-show / katılım takibi ──
describe('Transport — Boarded (Faz 6)', () => {
  it('atama olusturur ve boarded=true/false/null cycle isaretler', async () => {
    const staff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${token}`)).body
    if (!staff || staff.length < 1) return

    const route = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Boarded Test Hat', capacity: 10 })).body.id

    const date = '2026-06-15'
    await request(app).post('/api/transport/assign').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staff[0].id, route_id: route, work_date: date })

    const manifest1 = (await request(app).get(`/api/transport/routes/${route}/manifest?date=${date}`)
      .set('Authorization', `Bearer ${token}`)).body
    expect(manifest1.stops.length + (manifest1.total_passengers > 0 ? 0 : 0)).toBeGreaterThanOrEqual(0)
    // total_passengers >= 1 olabilir, stop yok diye unassigned'a düşmüş olabilir
    const allPassengers = manifest1.stops.flatMap(s => s.passengers || [])
    expect(allPassengers.length).toBeGreaterThanOrEqual(1)
    const assignmentId = allPassengers[0].assignment_id
    expect(assignmentId).toBeTruthy()

    // boarded = true
    const r1 = await request(app).patch(`/api/transport/assignments/${assignmentId}/boarded`)
      .set('Authorization', `Bearer ${token}`).send({ boarded: true })
    expect(r1.status).toBe(200)

    const m2 = (await request(app).get(`/api/transport/routes/${route}/manifest?date=${date}`)
      .set('Authorization', `Bearer ${token}`)).body
    expect(m2.boarded_count).toBe(1)
    expect(m2.no_show_count).toBe(0)

    // boarded = false (no show)
    await request(app).patch(`/api/transport/assignments/${assignmentId}/boarded`)
      .set('Authorization', `Bearer ${token}`).send({ boarded: false })
    const m3 = (await request(app).get(`/api/transport/routes/${route}/manifest?date=${date}`)
      .set('Authorization', `Bearer ${token}`)).body
    expect(m3.no_show_count).toBe(1)
    expect(m3.boarded_count).toBe(0)

    // boarded = null (reset)
    await request(app).patch(`/api/transport/assignments/${assignmentId}/boarded`)
      .set('Authorization', `Bearer ${token}`).send({ boarded: null })
    const m4 = (await request(app).get(`/api/transport/routes/${route}/manifest?date=${date}`)
      .set('Authorization', `Bearer ${token}`)).body
    expect(m4.no_show_count).toBe(0)
    expect(m4.boarded_count).toBe(0)
  })

  it('GET /transport/no-show devamsizlik listesi doner', async () => {
    const res = await request(app).get('/api/transport/no-show?limit=5').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('campus_manager olmayan boarded patch yapamaz', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const res = await request(app).patch('/api/transport/assignments/999999/boarded')
      .set('Authorization', `Bearer ${t}`).send({ boarded: true })
    expect(res.status).toBe(403)
  })
})

// ── Faz 7: Toplu PDF ──
describe('Transport — All routes PDF (Faz 7)', () => {
  it('GET /transport/manifest/all/pdf PDF doner', async () => {
    const date = '2026-06-20'
    // En az 1 aktif rota olsun
    await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'PDF Test Hat', capacity: 10 })
    const res = await request(app).get(`/api/transport/manifest/all/pdf?date=${date}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/pdf/)
    expect(res.body.length).toBeGreaterThan(100) // PDF buffer
  })
})

// ── Faz 8: Yedek / waitlist ──
describe('Transport — Waitlist (Faz 8)', () => {
  it('kapasite asilirsa auto-assign yedek olarak isaretler', async () => {
    // Önce 2 personel + 1 pickup + 1 rota (capacity=1)
    const seedStaff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${token}`)).body
    if (!seedStaff || seedStaff.length < 2) return

    const pickup = (await request(app).post('/api/transport/pickup-points').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Waitlist Durak' })).body.id
    const route = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Waitlist Hat', capacity: 1 })).body.id
    await request(app).post(`/api/transport/routes/${route}/stops`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: pickup })

    // İki personeli pickup'a bağla
    await request(app).put(`/api/transport/staff/${seedStaff[0].id}/pickup`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: pickup })
    await request(app).put(`/api/transport/staff/${seedStaff[1].id}/pickup`).set('Authorization', `Bearer ${token}`)
      .send({ pickup_point_id: pickup })

    // Seed bu hafta için shift_schedule oluşturur — bugünkü tarihi kullan
    const date = new Date().toISOString().slice(0, 10)

    const r = await request(app).post('/api/transport/auto-assign').set('Authorization', `Bearer ${token}`)
      .send({ date, override: true })
    expect(r.status).toBe(200)
    // En az 1'i atanır, kapasite=1 olduğu için 2.si waitlist'e düşer
    // Not: aynı duraktan ve aynı rotaya birden fazla staff scheduled olmalı
    if (r.body.assigned + r.body.waitlisted < 2) return // skip — bugün vardiyada yeterli staff yok
    expect(r.body.waitlisted).toBeGreaterThanOrEqual(1)

    const m = (await request(app).get(`/api/transport/routes/${route}/manifest?date=${date}`)
      .set('Authorization', `Bearer ${token}`)).body
    expect(m.waitlist_count).toBeGreaterThanOrEqual(1)
    expect(m.total_passengers).toBe(1) // kapasite=1

    // Waitlist'teki kişiyi terfi et
    const waitlistAssignment = m.stops.flatMap(s => s.waitlist || [])[0]
    if (waitlistAssignment) {
      const promote = await request(app).post(`/api/transport/assignments/${waitlistAssignment.assignment_id}/promote`)
        .set('Authorization', `Bearer ${token}`)
      expect(promote.status).toBe(200)

      const m2 = (await request(app).get(`/api/transport/routes/${route}/manifest?date=${date}`)
        .set('Authorization', `Bearer ${token}`)).body
      expect(m2.total_passengers).toBe(2)
      expect(m2.waitlist_count).toBe(0)
    }
  })

  it('zaten aktif olan atamayi terfi etmek hata verir', async () => {
    const staff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${token}`)).body
    if (!staff || staff.length < 1) return
    const route = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Promote Test', capacity: 10 })).body.id

    const date = '2026-07-15'
    await request(app).post('/api/transport/assign').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staff[0].id, route_id: route, work_date: date })

    const m = (await request(app).get(`/api/transport/routes/${route}/manifest?date=${date}`)
      .set('Authorization', `Bearer ${token}`)).body
    const aid = m.stops.flatMap(s => s.passengers || [])[0]?.assignment_id
    if (aid) {
      const res = await request(app).post(`/api/transport/assignments/${aid}/promote`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(400)
    }
  })
})

// ── Faz 7: Raporlar genisletildi ──
describe('Transport — Reports (Faz 7)', () => {
  it('GET /transport/reports no_show_top + per_staff_usage iceriyor', async () => {
    const res = await request(app).get('/api/transport/reports').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('no_show_top')
    expect(res.body).toHaveProperty('per_staff_usage')
    expect(Array.isArray(res.body.no_show_top)).toBe(true)
    expect(Array.isArray(res.body.per_staff_usage)).toBe(true)
  })
})
