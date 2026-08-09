import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let supervisorToken
let technicalToken
const auth = token => ({ Authorization: `Bearer ${token}` })

function createStaff(name, overrides = {}) {
  const db = getDB()
  const tc = String(Math.floor(10000000000 + Math.random() * 89999999999))
  const result = db.prepare(`
    INSERT INTO staff(tc_no,full_name,position,hire_date,is_active,department_id,project_id,exit_date)
    VALUES(?,?,?,?,?,?,?,?)
  `).run(tc, name, 'Drilldown Test', overrides.hire_date || '2026-01-01', overrides.is_active ?? 1,
    overrides.department_id || null, overrides.project_id || null, overrides.exit_date || null)
  return Number(result.lastInsertRowid)
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  technicalToken = (await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })).body.token
})

describe('Personel Takip Merkezi drilldown', () => {
  it('yalnız yönetici rollerine erişim verir ve metriği doğrular', async () => {
    expect((await request(app).get('/api/personnel/tracking/drilldown?metric=active').set(auth(managerToken))).status).toBe(200)
    expect((await request(app).get('/api/personnel/tracking/drilldown?metric=active').set(auth(supervisorToken))).status).toBe(200)
    expect((await request(app).get('/api/personnel/tracking/drilldown?metric=active').set(auth(technicalToken))).status).toBe(403)
    expect((await request(app).get('/api/personnel/tracking/drilldown?metric=unknown').set(auth(managerToken))).status).toBe(400)
  })

  it('izin KPI ve detay toplamını dönem içindeki onaylı günlerle eşleştirir', async () => {
    const db = getDB()
    const staffId = createStaff('Drilldown İzin Kişisi')
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,status,reason) VALUES(?,?,?,?,?,'approved',?)")
      .run(staffId, 'annual', '2026-07-29', '2026-08-03', 6, 'Döneme taşan izin')
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,status,reason) VALUES(?,?,?,?,?,'pending',?)")
      .run(staffId, 'sick', '2026-08-10', '2026-08-11', 2, 'Bekleyen rapor')

    const query = 'from=2026-08-01&to=2026-08-31&q=Drilldown%20%C4%B0zin%20Ki%C5%9Fisi'
    const overview = await request(app).get(`/api/personnel/tracking/overview?${query}`).set(auth(managerToken))
    const approved = await request(app).get(`/api/personnel/tracking/drilldown?metric=leave&view=records&${query}`).set(auth(managerToken))
    const pending = await request(app).get(`/api/personnel/tracking/drilldown?metric=leave&view=records&record_status=pending&${query}`).set(auth(managerToken))
    expect(overview.body.kpis.annual_leave_days).toBe(3)
    expect(approved.body.summary.primary_value).toBe(3)
    expect(approved.body.items).toHaveLength(1)
    expect(approved.body.items[0]).toMatchObject({ staff_id: staffId, quantity: 3, unit: 'day', status: 'approved' })
    expect(pending.body.items[0]).toMatchObject({ staff_id: staffId, quantity: 2, status: 'pending' })
  })

  it('saatlik izni güne çevirmeden ayrı toplamda tutar', async () => {
    const db = getDB()
    const staffId = createStaff('Drilldown Saatlik İzin')
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,leave_hours,status) VALUES(?,?,?,?,?,?,'approved')")
      .run(staffId, 'emergency', '2026-08-12', '2026-08-12', 1, 3.5)
    const query = 'metric=leave&from=2026-08-01&to=2026-08-31&q=Drilldown%20Saatlik%20%C4%B0zin'
    const res = await request(app).get(`/api/personnel/tracking/drilldown?${query}`).set(auth(managerToken))
    expect(res.body.summary).toMatchObject({ primary_value: 0, day_total: 0, hour_total: 3.5 })
  })

  it('mesai kişi ve kayıt görünümlerini aynı saat toplamında tutar', async () => {
    const db = getDB()
    const staffId = createStaff('Drilldown Mesai Kişisi')
    db.prepare('INSERT INTO overtime_records(staff_id,work_date,hours,reason) VALUES(?,?,?,?)').run(staffId, '2026-08-05', 4.5, 'Planlı bakım')
    const base = 'metric=overtime&from=2026-08-01&to=2026-08-31&q=Drilldown%20Mesai%20Ki%C5%9Fisi'
    const records = await request(app).get(`/api/personnel/tracking/drilldown?view=records&${base}`).set(auth(managerToken))
    const people = await request(app).get(`/api/personnel/tracking/drilldown?view=people&${base}`).set(auth(managerToken))
    expect(records.body.summary.primary_value).toBe(4.5)
    expect(records.body.items[0]).toMatchObject({ staff_id: staffId, quantity: 4.5, unit: 'hour' })
    expect(people.body.items[0]).toMatchObject({ staff_id: staffId, hour_total: 4.5, record_count: 1 })
  })

  it('işten çıkanları seçili döneme göre sayar ve tarihsiz eski kayıtları ayırır', async () => {
    createStaff('Drilldown Dönem Çıkışı', { is_active: 0, exit_date: '2026-08-04' })
    createStaff('Drilldown Eski Tarihsiz', { is_active: 0 })
    const periodExit = await request(app)
      .get('/api/personnel/tracking/drilldown?metric=exited&from=2026-08-01&to=2026-08-31&q=Drilldown')
      .set(auth(managerToken))
    expect(periodExit.body.summary).toMatchObject({ primary_value: 1, undated_count: 1 })
    expect(periodExit.body.items[0].full_name).toBe('Drilldown Dönem Çıkışı')
  })

  it('personel hücresi için staff_id kapsamını ve güvenli sıralamayı uygular', async () => {
    const firstId = createStaff('Drilldown Alfa')
    const secondId = createStaff('Drilldown Beta')
    const db = getDB()
    db.prepare('INSERT INTO overtime_records(staff_id,work_date,hours) VALUES(?,?,?)').run(firstId, '2026-08-05', 2)
    db.prepare('INSERT INTO overtime_records(staff_id,work_date,hours) VALUES(?,?,?)').run(secondId, '2026-08-06', 6)
    const scoped = await request(app)
      .get(`/api/personnel/tracking/drilldown?metric=overtime&view=records&from=2026-08-01&to=2026-08-31&staff_id=${firstId}`)
      .set(auth(managerToken))
    expect(scoped.body.items).toHaveLength(1)
    expect(scoped.body.items[0].staff_id).toBe(firstId)
    const deniedSort = await request(app)
      .get('/api/personnel/tracking/drilldown?metric=active&sort=drop_table')
      .set(auth(managerToken))
    expect(deniedSort.status).toBe(400)
  })

  it('ay kovasını hareket kayıtlarına uygular ve sayfalar', async () => {
    const db = getDB()
    const staffId = createStaff('Drilldown Hareket Kişisi')
    for (const [id, date] of [['aug-1', '2026-08-05'], ['aug-2', '2026-08-06'], ['jul-1', '2026-07-20']]) {
      db.prepare(`INSERT INTO personnel_tracking_events(staff_id,event_type,effective_at,source_type,source_id,revision_no,after_json) VALUES(?,?,?,?,?,1,'{}')`)
        .run(staffId, 'shift_changed', date, 'drilldown-test', id)
    }
    const res = await request(app)
      .get('/api/personnel/tracking/drilldown?metric=movement&view=records&from=2026-01-01&to=2026-12-31&bucket=2026-08&limit=1&page=2&q=Drilldown%20Hareket')
      .set(auth(managerToken))
    expect(res.body).toMatchObject({ total: 2, page: 2, limit: 1 })
    expect(res.body.items).toHaveLength(1)
  })

  it('drilldown sorgu indekslerini migration ile kurar', () => {
    const db = getDB()
    const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(row => row.name))
    expect(indexes.has('idx_leave_requests_tracking_period')).toBe(true)
    expect(indexes.has('idx_overtime_records_tracking_period')).toBe(true)
    expect(indexes.has('idx_overtime_requests_tracking_period')).toBe(true)
  })
})
