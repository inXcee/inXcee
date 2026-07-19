import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { roleGroupOf } from './queries.js'

let managerToken
let locId
let isciLokaliId
let ikramciRoleId
let d1, d2

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  isciLokaliId = db.prepare("SELECT id FROM work_locations WHERE name='Isci Lokali'").get()?.id
  locId = db.prepare("SELECT id FROM work_locations WHERE name='Buyuk Lokal'").get()?.id
  ikramciRoleId = db.prepare("SELECT id FROM staff_roles WHERE name='Ikramci'").get()?.id
  const bulasikRoleId = db.prepare("SELECT id FROM staff_roles WHERE name='Bulasikhane'").get()?.id
  const deptId = db.prepare('SELECT id FROM departments ORDER BY id LIMIT 1').get().id
  const now = new Date()
  d1 = new Date(now.getTime()).toISOString().slice(0, 10)
  d2 = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)

  const unassigned = db.prepare("INSERT INTO staff(full_name, role_id, is_active) VALUES('Atanmamis Kisi', ?, 1)").run(ikramciRoleId).lastInsertRowid
  const bulasikci = db.prepare("INSERT INTO staff(full_name, role_id, is_active) VALUES('Bulasikci Kisi', ?, 1)").run(bulasikRoleId).lastInsertRowid
  const lokalci = db.prepare("INSERT INTO staff(full_name, role_id, is_active) VALUES('Lokal Kisi', ?, 1)").run(ikramciRoleId).lastInsertRowid

  // Atanmamış (nokta yok) → Yemekhane grubu
  db.prepare("INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status) VALUES(?,?,1,?,'scheduled')").run(unassigned, deptId, d1)
  db.prepare("INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status) VALUES(?,?,1,?,'scheduled')").run(bulasikci, deptId, d1)
  // Büyük Lokal: d1'de dolu, d2'de boş → empty_locations'ta d2 çıkmalı
  db.prepare("INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status, work_location_id) VALUES(?,?,1,?,'scheduled',?)").run(lokalci, deptId, d1, locId)
})

describe('roleGroupOf classifier', () => {
  it('separates catering/kitchen from dishwashing', () => {
    expect(roleGroupOf('Ikramci')).toBe('Yemek/İkram')
    expect(roleGroupOf('Asci')).toBe('Yemek/İkram')
    expect(roleGroupOf('Bulasikhane')).toBe('Bulaşıkhane')
    expect(roleGroupOf('Temizlik')).toBe('Diğer')
  })
})

describe('schedule breakdown enhancements', () => {
  it('buckets unassigned scheduled staff into a Yemekhane group and tags role groups', async () => {
    const res = await request(app).get(`/api/shifts/breakdown?from=${d1}&to=${d2}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    const yemekhane = res.body.location_counts.find(l => l.work_location_name === 'Yemekhane' && l.work_date === d1)
    expect(yemekhane).toBeTruthy()
    expect(yemekhane.is_default_area).toBe(true)
    expect(yemekhane.assigned).toBeGreaterThanOrEqual(2)
    // "Noktasız" etiketi artık kullanılmıyor
    expect(res.body.location_counts.some(l => l.work_location_name === 'Noktasiz')).toBe(false)

    const roleGroups = new Set(res.body.role_counts.map(r => r.role_group))
    expect(roleGroups.has('Yemek/İkram')).toBe(true)
    expect(roleGroups.has('Bulaşıkhane')).toBe(true)
  })

  it('flags active locations that fall empty on a day (empty_locations)', async () => {
    const res = await request(app).get(`/api/shifts/breakdown?from=${d1}&to=${d2}`)
      .set('Authorization', `Bearer ${managerToken}`)
    // Büyük Lokal d1'de çalıştı, d2'de boş → d2 empty listesinde
    const empty = res.body.empty_locations.find(e => e.work_location_id === locId && e.work_date === d2)
    expect(empty).toBeTruthy()
    // d1'de dolu olduğu için d1 empty değil
    expect(res.body.empty_locations.some(e => e.work_location_id === locId && e.work_date === d1)).toBe(false)
  })

  it('resolves assignees for the Yemekhane bucket', async () => {
    const res = await request(app).get(`/api/shifts/breakdown/assignees?date=${d1}&dimension=location&value=Yemekhane`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.assignees.length).toBeGreaterThanOrEqual(2)
  })

  it('seeds İşçi Lokali coverage rules (06:15 & 15:00)', async () => {
    const res = await request(app).get(`/api/shifts/coverage?from=${d1}&to=${d2}`)
      .set('Authorization', `Bearer ${managerToken}`)
    const names = res.body.rules.map(r => r.name)
    expect(names.some(n => n.includes('06:15'))).toBe(true)
    expect(names.some(n => n.includes('15:00'))).toBe(true)
    expect(res.body.rules.some(r => r.work_location_id === isciLokaliId)).toBe(true)
  })
})

describe('canlı lokasyon doluluğu (occupancy)', () => {
  it('şu an kim nerede + boş nokta döner; kural saati dışı boşluk uyarı değildir', async () => {
    const db = getDB()
    const deptId = db.prepare('SELECT id FROM departments ORDER BY id LIMIT 1').get().id
    const staffId = db.prepare("INSERT INTO staff(full_name, role_id, is_active) VALUES('Occ Test Kisi', ?, 1)").run(ikramciRoleId).lastInsertRowid
    const schedId = db.prepare("INSERT INTO shift_schedule(staff_id, dept_id, work_date, status, work_location_id) VALUES(?,?,?,'scheduled',?)").run(staffId, deptId, d1, isciLokaliId).lastInsertRowid
    db.prepare("INSERT INTO shift_schedule_segments(schedule_id, sequence_no, work_location_id, role_id, start_time, end_time, status) VALUES(?,?,?,?, '06:15','15:00','planned')").run(schedId, 1, isciLokaliId, ikramciRoleId)

    const res = await request(app).get(`/api/shifts/occupancy?date=${d1}&at=09:00`).set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    const lokal = res.body.rows.find(r => r.work_location_id === isciLokaliId)
    expect(lokal.present.some(p => p.full_name === 'Occ Test Kisi')).toBe(true)
    expect(lokal.understaffed).toBe(false)

    const res2 = await request(app).get(`/api/shifts/occupancy?date=${d1}&at=04:00`).set('Authorization', `Bearer ${managerToken}`)
    const lokal2 = res2.body.rows.find(r => r.work_location_id === isciLokaliId)
    expect(lokal2.count).toBe(0)
    expect(lokal2.empty).toBe(true)
    expect(lokal2.understaffed).toBe(false) // 04:00 hiçbir kural kapsamıyor
  })

  it('kural saatinde boş zorunlu lokal understaffed + alert verir', async () => {
    // d2: İşçi Lokali'ye kimse atanmadı; 09:00 kuralı (06:15-15:00, min 1) → uyarı
    const res = await request(app).get(`/api/shifts/occupancy?date=${d2}&at=09:00`).set('Authorization', `Bearer ${managerToken}`)
    const lokal = res.body.rows.find(r => r.work_location_id === isciLokaliId)
    expect(lokal.required).toBeGreaterThanOrEqual(1)
    expect(lokal.understaffed).toBe(true)
    expect(res.body.alerts.some(a => a.work_location_id === isciLokaliId)).toBe(true)
    expect(res.body.alert_count).toBeGreaterThanOrEqual(1)
  })

  it('date olmadan 400 döner', async () => {
    const res = await request(app).get('/api/shifts/occupancy?at=09:00').set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(400)
  })

  it('supervisor erişebilir, yetkisiz 401/403', async () => {
    const res = await request(app).get(`/api/shifts/occupancy?date=${d1}&at=09:00`)
    expect([401, 403]).toContain(res.status)
  })
})
