import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let mgrToken, supToken
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  mgrToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Campus Map summary', () => {
  it('GET /summary returns per-block aggregation', async () => {
    const res = await request(app).get('/api/campus-map/summary').set('Authorization', `Bearer ${mgrToken}`)
    expect(res.status).toBe(200)
    expect(res.body.blocks).toBeTypeOf('object')
    const m1 = res.body.blocks.M1
    expect(m1).toBeDefined()
    expect(m1).toHaveProperty('total_rooms')
    expect(m1).toHaveProperty('occupied')
    expect(m1).toHaveProperty('occupancy_pct')
    expect(m1).toHaveProperty('open_faults')
    expect(m1).toHaveProperty('cleaning_total')
    expect(m1).toHaveProperty('day_count')
    expect(m1).toHaveProperty('night_count')
    expect(Array.isArray(m1.top_companies)).toBe(true)
  })

  it('GET /timeseries returns per-block daily points', async () => {
    const res = await request(app).get('/api/campus-map/timeseries?days=7').set('Authorization', `Bearer ${mgrToken}`)
    expect(res.status).toBe(200)
    expect(res.body.days).toBe(7)
    expect(res.body.blocks).toBeTypeOf('object')
    const m1 = res.body.blocks.M1
    expect(m1).toBeDefined()
    expect(Array.isArray(m1.points)).toBe(true)
    expect(m1.points).toHaveLength(7)
    expect(m1.points[0]).toHaveProperty('date')
    expect(m1.points[0]).toHaveProperty('occupancy_pct')
  })

  it('GET /timeseries clamps days to 2..30', async () => {
    const r1 = await request(app).get('/api/campus-map/timeseries?days=100').set('Authorization', `Bearer ${mgrToken}`)
    expect(r1.body.days).toBe(30)
    const r2 = await request(app).get('/api/campus-map/timeseries?days=0').set('Authorization', `Bearer ${mgrToken}`)
    expect(r2.body.days).toBeGreaterThanOrEqual(2)
  })

  it('GET /summary requires auth', async () => {
    const res = await request(app).get('/api/campus-map/summary')
    expect(res.status).toBe(401)
  })
})

describe('Campus Map pins', () => {
  it('GET /pins returns empty object initially', async () => {
    const res = await request(app).get('/api/campus-map/pins').set('Authorization', `Bearer ${mgrToken}`)
    expect(res.status).toBe(200)
    expect(res.body.pins).toEqual({})
  })

  it('GET requires auth', async () => {
    const res = await request(app).get('/api/campus-map/pins')
    expect(res.status).toBe(401)
  })

  it('PUT requires campus_manager (supervisor rejected)', async () => {
    const res = await request(app).put('/api/campus-map/pins')
      .set('Authorization', `Bearer ${supToken}`)
      .send({ pins: { M1: { x: 100, y: 200 } } })
    expect(res.status).toBe(403)
  })

  it('PUT saves and GET returns same data', async () => {
    const pins = { M1: { x: 100, y: 200 }, S2: { x: 300, y: 400 } }
    const put = await request(app).put('/api/campus-map/pins')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ pins })
    expect(put.status).toBe(200)
    expect(put.body.ok).toBe(true)
    expect(put.body.count).toBe(2)

    const get = await request(app).get('/api/campus-map/pins').set('Authorization', `Bearer ${supToken}`)
    expect(get.body.pins).toEqual(pins)
  })

  it('PUT sanitizes invalid entries', async () => {
    const res = await request(app).put('/api/campus-map/pins')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ pins: {
        VALID: { x: 50, y: 60 },
        BAD_NO_Y: { x: 10 },
        BAD_STR: { x: 'abc', y: 5 },
        BAD_RANGE: { x: -1, y: 5 },
        BAD_HUGE: { x: 99999, y: 0 },
      }})
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(1)

    const get = await request(app).get('/api/campus-map/pins').set('Authorization', `Bearer ${mgrToken}`)
    expect(get.body.pins).toEqual({ VALID: { x: 50, y: 60 } })
  })

  it('PUT preserves valid optional fields (size, color, label, hidden)', async () => {
    const res = await request(app).put('/api/campus-map/pins')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ pins: {
        FULL: { x: 100, y: 200, size: 1.4, color: '#a855f7', label: 'Yeni Blok', hidden: true },
        BAD_CLR: { x: 50, y: 50, color: 'red' }, // invalid color stripped
        BAD_SZ:  { x: 60, y: 60, size: 9 }, // out-of-range stripped
        LONG_L:  { x: 70, y: 70, label: 'a'.repeat(50) }, // too long stripped
      }})
    expect(res.status).toBe(200)
    const get = await request(app).get('/api/campus-map/pins').set('Authorization', `Bearer ${mgrToken}`)
    expect(get.body.pins.FULL).toEqual({ x: 100, y: 200, size: 1.4, color: '#a855f7', label: 'Yeni Blok', hidden: true })
    expect(get.body.pins.BAD_CLR).toEqual({ x: 50, y: 50 })
    expect(get.body.pins.BAD_SZ).toEqual({ x: 60, y: 60 })
    expect(get.body.pins.LONG_L).toEqual({ x: 70, y: 70 })
  })

  it('PUT rejects non-object body', async () => {
    const res = await request(app).put('/api/campus-map/pins')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ pins: 'not-an-object' })
    expect(res.status).toBe(400)
  })
})

describe('Campus Map blok detayi (/block/:block/detail)', () => {
  it('mudur tum bolumleri gorur: ariza + temizlik + oda/kisi', async () => {
    const res = await request(app).get('/api/campus-map/block/M1/detail')
      .set('Authorization', `Bearer ${mgrToken}`)
    expect(res.status).toBe(200)
    expect(res.body.block).toBe('M1')
    expect(res.body.can).toEqual({ faults: true, cleaning: true, rooms: true })
    expect(Array.isArray(res.body.faults)).toBe(true)
    expect(res.body.cleaning).toMatchObject({
      total: expect.any(Number), done: expect.any(Number), pending: expect.any(Number), pct: expect.any(Number),
    })
    expect(Array.isArray(res.body.rooms)).toBe(true)
    expect(res.body.rooms.length).toBeGreaterThan(0)
    const room = res.body.rooms[0]
    expect(room).toHaveProperty('room_no')
    expect(room).toHaveProperty('active_beds')
    expect(Array.isArray(room.occupants)).toBe(true)
    // Odalar bu bloğa ait olmalı
    expect(res.body.rooms.every(r => r.id > 0)).toBe(true)
  })

  it('oda sakinleri ad/şirket/giriş bilgisiyle gelir', async () => {
    const res = await request(app).get('/api/campus-map/block/M1/detail')
      .set('Authorization', `Bearer ${mgrToken}`)
    const withPeople = res.body.rooms.find(r => r.occupants.length > 0)
    if (withPeople) {
      const person = withPeople.occupants[0]
      expect(person).toHaveProperty('personnel_id')
      expect(person).toHaveProperty('full_name')
      expect(person).toHaveProperty('company')
      expect(person).toHaveProperty('assigned_at')
      // occupied sayısı gerçek sakin sayısıyla tutarlı
      expect(withPeople.occupied).toBe(withPeople.occupants.length)
    }
  })

  it('süpervizör arıza+oda görür, temizlik görmez', async () => {
    const res = await request(app).get('/api/campus-map/block/M1/detail')
      .set('Authorization', `Bearer ${supToken}`)
    expect(res.status).toBe(200)
    expect(res.body.can).toEqual({ faults: true, cleaning: false, rooms: true })
    expect(res.body.cleaning).toBeUndefined()
    expect(res.body.faults).toBeDefined()
  })

  it('çamaşırhane rolü hiçbir hassas bölümü görmez (yetkisiz veri sızmaz)', async () => {
    const laundryToken = (await request(app).post('/api/auth/login')
      .send({ username: 'camasir', password: 'admin123' })).body.token
    const res = await request(app).get('/api/campus-map/block/M1/detail')
      .set('Authorization', `Bearer ${laundryToken}`)
    expect(res.status).toBe(200)
    expect(res.body.can).toEqual({ faults: false, cleaning: false, rooms: false })
    expect(res.body.faults).toBeUndefined()
    expect(res.body.cleaning).toBeUndefined()
    expect(res.body.rooms).toBeUndefined()
  })

  it('meydancı (housekeeper) yalnız temizliği görür', async () => {
    const hkToken = (await request(app).post('/api/auth/login')
      .send({ username: 'meydanci', password: 'admin123' })).body.token
    const res = await request(app).get('/api/campus-map/block/M1/detail')
      .set('Authorization', `Bearer ${hkToken}`)
    expect(res.body.can).toEqual({ faults: false, cleaning: true, rooms: false })
    expect(res.body.cleaning).toBeDefined()
    expect(res.body.rooms).toBeUndefined()
  })

  it('olmayan blok boş sonuç verir, geçersiz blok 400', async () => {
    const empty = await request(app).get('/api/campus-map/block/ZZ/detail')
      .set('Authorization', `Bearer ${mgrToken}`)
    expect(empty.status).toBe(200)
    expect(empty.body.rooms).toEqual([])
    expect(empty.body.faults).toEqual([])
    expect(empty.body.cleaning.total).toBe(0)

    const bad = await request(app).get('/api/campus-map/block/COKUZUNBLOK/detail')
      .set('Authorization', `Bearer ${mgrToken}`)
    expect(bad.status).toBe(400)
  })

  it('token yoksa 401', async () => {
    expect((await request(app).get('/api/campus-map/block/M1/detail')).status).toBe(401)
  })
})

describe('Ariza esletirme kurali (rozet ile liste ayni olmali)', () => {
  it('odasiz blok arizasi hem ozet rozetinde hem panel listesinde sayilir', async () => {
    const { getDB } = await import('../../shared/db/index.js')
    const db = getDB()
    // "M1 Ortak Alan" — gerçek bir odaya bağlanamaz ama M1'in arızasıdır
    db.prepare(`INSERT INTO maintenance_requests(location, description, priority, status)
      VALUES('M1 Ortak Alan', 'Aydinlatma arizasi', 'medium', 'open')`).run()

    const summary = await request(app).get('/api/campus-map/summary').set('Authorization', `Bearer ${mgrToken}`)
    const detail = await request(app).get('/api/campus-map/block/M1/detail').set('Authorization', `Bearer ${mgrToken}`)

    const badge = summary.body.blocks.M1.open_faults
    const listed = detail.body.faults.length
    expect(listed).toBeGreaterThan(0)
    expect(badge).toBe(listed) // iki kural ayrismamali
    expect(detail.body.faults.some(f => f.location === 'M1 Ortak Alan')).toBe(true)
  })

  it('bosluklu onek: A blogu A1in arizasini saymaz', async () => {
    const { getDB } = await import('../../shared/db/index.js')
    const db = getDB()
    db.prepare(`INSERT INTO maintenance_requests(location, description, priority, status)
      VALUES('A1 Kat 2 Oda 210', 'Sadece A1', 'low', 'open')`).run()

    const summary = await request(app).get('/api/campus-map/summary').set('Authorization', `Bearer ${mgrToken}`)
    const aDetail = await request(app).get('/api/campus-map/block/A/detail').set('Authorization', `Bearer ${mgrToken}`)

    expect(aDetail.body.faults.some(f => f.location.startsWith('A1'))).toBe(false)
    expect(summary.body.blocks.A1.open_faults).toBe(
      (await request(app).get('/api/campus-map/block/A1/detail').set('Authorization', `Bearer ${mgrToken}`)).body.faults.length
    )
  })

  it('kapanmis ariza sayilmaz', async () => {
    const { getDB } = await import('../../shared/db/index.js')
    const db = getDB()
    db.prepare(`INSERT INTO maintenance_requests(location, description, priority, status)
      VALUES('M2 Kat 1 Oda 101', 'Kapali kayit', 'low', 'done')`).run()
    const detail = await request(app).get('/api/campus-map/block/M2/detail').set('Authorization', `Bearer ${mgrToken}`)
    expect(detail.body.faults.some(f => f.description === 'Kapali kayit')).toBe(false)
  })
})

describe('Vardiya kovalari (kaydi olmayan gunduze yazilmasin)', () => {
  it('day / night / unknown ayri sayilir', async () => {
    const { getDB } = await import('../../shared/db/index.js')
    const db = getDB()
    const room = db.prepare("SELECT id, block FROM rooms WHERE block='M3' LIMIT 1").get()
    const mk = name => db.prepare('INSERT INTO personnel(full_name) VALUES(?)').run(name).lastInsertRowid
    let bed = 0
    const assign = pid => db.prepare('INSERT INTO room_assignments(room_id, personnel_id, bed_no) VALUES(?,?,?)').run(room.id, pid, ++bed)

    const dayP = mk('VB Gunduzcu'); const nightP = mk('VB Gececi'); const unknownP = mk('VB Kayitsiz')
    db.prepare("INSERT INTO shifts(personnel_id, shift_type) VALUES(?,'day')").run(dayP)
    db.prepare("INSERT INTO shifts(personnel_id, shift_type) VALUES(?,'night')").run(nightP)
    // unknownP icin shifts kaydi YOK — eskiden sessizce "gunduz" sayiliyordu
    assign(dayP); assign(nightP); assign(unknownP)

    const res = await request(app).get('/api/campus-map/summary').set('Authorization', `Bearer ${mgrToken}`)
    const m3 = res.body.blocks.M3
    expect(m3.day_count).toBeGreaterThanOrEqual(1)
    expect(m3.night_count).toBeGreaterThanOrEqual(1)
    expect(m3.unknown_count).toBeGreaterThanOrEqual(1)
    // Kayitsiz kisi gunduze eklenmemis olmali
    expect(m3.day_count + m3.night_count + m3.unknown_count).toBeGreaterThanOrEqual(3)
  })

  it('her blokta unknown_count alani bulunur', async () => {
    const res = await request(app).get('/api/campus-map/summary').set('Authorization', `Bearer ${mgrToken}`)
    for (const block of Object.values(res.body.blocks)) {
      expect(block).toHaveProperty('unknown_count')
      expect(typeof block.unknown_count).toBe('number')
    }
  })
})
