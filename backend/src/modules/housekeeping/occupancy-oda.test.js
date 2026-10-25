import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { addDays, istanbulDate } from '../../shared/time.js'

// Telegram /oda ve web oda paneli aynı uçları kullanır: özet ve liste saha doluluğunu verir, toplu doluluk girilir.
// OD: deneme bloğu — kat 1: 101..104 (104 kapalı), kat 2: 201..202.
let db, supervisor, housekeeper
const login = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
const auth = t => ({ Authorization: `Bearer ${t}` })
const occ = no => db.prepare(`SELECT occupancy FROM rooms WHERE block='OD' AND room_no=?`).get(no).occupancy
const bulk = (token, body) => request(app).post('/api/housekeeping/rooms/occupancy-bulk').set(auth(token)).send(body)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds, use_state) VALUES('OD', ?, ?, 6, 6, ?)`)
  for (const [floor, no, state] of [[1, '101', 'open'], [1, '102', 'open'], [1, '103', 'locked'], [1, '104', 'closed'], [2, '201', 'open'], [2, '202', 'open']]) {
    room.run(floor, no, state)
  }
  supervisor = await login('vardiya')
  housekeeper = await login('meydanci')
})

describe('toplu doluluk', () => {
  it('oda numaralarıyla: kapalı oda atlanır, bulunmayan numara söylenir; denetime oda başına düşer', async () => {
    const res = await bulk(supervisor, { block: 'OD', room_nos: ['101', '102', '104', '999'], occupancy: 'occupied' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, updated: 2, unchanged: 0, skipped_closed: ['104'], not_found: ['999'] })
    expect([occ('101'), occ('102'), occ('104')]).toEqual(['occupied', 'occupied', null])
    const audits = db.prepare(`SELECT COUNT(*) c FROM audit_log WHERE action='room_occupancy_change' AND json_extract(detail,'$.location') LIKE 'OD-%'`).get().c
    expect(audits).toBe(2)
  })

  it('kat ile: aynı değer "değişmedi" sayılır; kilitli oda da işaretlenir', async () => {
    const res = await bulk(supervisor, { block: 'OD', floor: 1, occupancy: 'occupied' })
    expect(res.body).toMatchObject({ updated: 1, unchanged: 2, skipped_closed: ['104'], not_found: [] })
    expect(occ('103')).toBe('occupied')
  })

  it('null bilinmiyor yapar; yetki amir/müdür; bilinmeyen blok 404; geçersiz değer 400', async () => {
    expect((await bulk(supervisor, { block: 'OD', room_nos: ['101'], occupancy: null })).body.updated).toBe(1)
    expect(occ('101')).toBeNull()
    expect((await bulk(housekeeper, { block: 'OD', occupancy: 'empty' })).status).toBe(403)
    expect((await bulk(supervisor, { block: 'ZZ', occupancy: 'empty' })).status).toBe(404)
    expect((await bulk(supervisor, { block: 'OD', occupancy: 'dolu' })).status).toBe(400)
  })
})

describe('/oda özeti ve liste', () => {
  it('özet blok başına dolu/boş/bilinmiyor ve oranı; toplamda dünkü görüntüyle fark ve bayat sayısı', async () => {
    await bulk(supervisor, { block: 'OD', floor: 2, occupancy: 'empty' })
    db.prepare(`INSERT INTO room_occupancy_daily(day, block, rooms, closed, occupied, empty, unknown) VALUES(?, 'OD', 6, 1, 1, 1, 3)`)
      .run(addDays(istanbulDate(), -1))
    const res = await request(app).get('/api/housekeeping/rooms/state-summary').set(auth(supervisor))
    expect(res.status).toBe(200)
    const od = res.body.blocks.find(b => b.block === 'OD')
    // 102, 103 dolu; 201, 202 boş; 101 bilinmiyor; 104 kapalı (sayılmaz)
    expect(od).toMatchObject({ occupied: 2, empty: 2, unknown: 1, occupancy_pct: 50 })
    expect(res.body.occupancy).toMatchObject({ occupied: 2, empty: 2, pct: 50, yesterday_pct: 50, change_1d: 0, stale: 0 })
  })

  it('liste odanın doluluğunu ve son teyit zamanını verir; doluluğa göre süzülür', async () => {
    const list = q => request(app).get(`/api/housekeeping/rooms/state?block=OD${q}`).set(auth(supervisor)).then(r => r.body.rooms)
    const all = await list('')
    expect(all.find(r => r.room_no === '102')).toMatchObject({ occupancy: 'occupied' })
    expect(all.find(r => r.room_no === '102').occupancy_updated_at).toBeTruthy()
    expect((await list('&occupancy=empty')).map(r => r.room_no)).toEqual(['201', '202'])
    expect((await list('&occupancy=unknown')).map(r => r.room_no)).toEqual(['101']) // kapalı 104 bilinmiyor sayılmaz
  })
})
