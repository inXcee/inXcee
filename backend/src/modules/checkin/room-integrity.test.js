// Check-in / check-out / kapasite / oda geçmişi mantık taraması (20 Eki 2026) — regresyon testleri.
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
let pidSeq = 77000

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

const auth = r => r.set('Authorization', `Bearer ${token}`)

function mkRoom(block, roomNo, beds = 3, status = 'active') {
  const db = getDB()
  return Number(db.prepare(
    'INSERT INTO rooms(block, floor, room_no, capacity, active_beds, status) VALUES(?,?,?,?,?,?)'
  ).run(block, 9, roomNo, beds, beds, status).lastInsertRowid)
}

function mkPerson(name = 'Test Kişi') {
  return Number(getDB().prepare("INSERT INTO personnel(full_name, check_in_date) VALUES(?, datetime('now'))")
    .run(`${name} ${++pidSeq}`).lastInsertRowid)
}

function seat(pid, roomId, bedNo) {
  getDB().prepare('INSERT INTO room_assignments(personnel_id, room_id, bed_no, assigned_by) VALUES(?,?,?,1)').run(pid, roomId, bedNo)
}

function activeBeds(roomId) {
  return getDB().prepare(
    'SELECT bed_no FROM room_assignments WHERE room_id=? AND check_out_at IS NULL ORDER BY bed_no'
  ).all(roomId).map(r => r.bed_no)
}

// Oda: 3 yatak, 1 ve 2 dolu → 1 numaralı yatak boşaltılır; boş yatak 1, dolu 2.
function roomWithGap(roomNo) {
  const roomId = mkRoom('M1', roomNo, 3)
  const a = mkPerson(); const b = mkPerson()
  seat(a, roomId, 1); seat(b, roomId, 2)
  getDB().prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE personnel_id=?").run(a)
  return roomId
}

describe('Yatak numarası — boşalan yatak doldurulur, aynı numara iki kişiye verilmez', () => {
  it('check-in /assign-room boşalan yatağı verir', async () => {
    const roomId = roomWithGap('901')
    const res = await auth(request(app).post('/api/checkin/assign-room')).send({ personnel_id: mkPerson(), room_id: roomId })
    expect(res.status).toBe(200)
    expect(res.body.bed_no).toBe(1)
    expect(activeBeds(roomId)).toEqual([1, 2])
  })

  it('kapasite /reassign boşalan yatağı verir', async () => {
    const roomId = roomWithGap('902')
    const res = await auth(request(app).post('/api/capacity/reassign')).send({ personnel_id: mkPerson(), room_id: roomId })
    expect(res.status).toBe(200)
    expect(activeBeds(roomId)).toEqual([1, 2])
  })

  it('kapasite /bulk/assign boşalan yatakları verir', async () => {
    const roomId = roomWithGap('903')
    const res = await auth(request(app).post('/api/capacity/bulk/assign')).send({ personnel_ids: [mkPerson()], room_id: roomId })
    expect(res.status).toBe(200)
    expect(activeBeds(roomId)).toEqual([1, 2])
  })

  it('toplu işlemler /transfer boşalan yatağı verir', async () => {
    const roomId = roomWithGap('904')
    const res = await auth(request(app).post('/api/bulk-actions/transfer')).send({ ids: [mkPerson()], target_room_id: roomId })
    expect(res.status).toBe(200)
    expect(res.body.success[0].bed_no).toBe(1)
    expect(activeBeds(roomId)).toEqual([1, 2])
  })

  it('anonim doldurma (placeholder-batch) boşalan yatakları verir', async () => {
    const roomId = roomWithGap('905')
    const res = await auth(request(app).post('/api/checkin/placeholder-batch')).send({ room_id: roomId, count: 2 })
    expect(res.status).toBe(201)
    expect(activeBeds(roomId)).toEqual([1, 2, 3])
  })
})

describe('Check-in oda ataması kuralları', () => {
  it('bakımdaki odaya atama yapılmaz', async () => {
    const roomId = mkRoom('M1', '911', 3, 'maintenance')
    const res = await auth(request(app).post('/api/checkin/assign-room')).send({ personnel_id: mkPerson(), room_id: roomId })
    expect(res.status).toBe(400)
    expect(activeBeds(roomId)).toEqual([])
  })

  it('daha önce çıkış yapmış kişi tekrar yerleştirilince yeniden aktif olur', async () => {
    const pid = mkPerson('Dönen')
    getDB().prepare("UPDATE personnel SET check_out_date=datetime('now','-30 days') WHERE id=?").run(pid)
    const roomId = mkRoom('M1', '912', 3)
    const res = await auth(request(app).post('/api/checkin/assign-room')).send({ personnel_id: pid, room_id: roomId })
    expect(res.status).toBe(200)
    expect(getDB().prepare('SELECT check_out_date FROM personnel WHERE id=?').get(pid).check_out_date).toBeNull()
  })

  it('zaten odada olan kişi ikinci odaya atanamaz (anlaşılır hata)', async () => {
    const pid = mkPerson()
    const r1 = mkRoom('M1', '913', 3); const r2 = mkRoom('M1', '914', 3)
    seat(pid, r1, 1)
    const res = await auth(request(app).post('/api/checkin/assign-room')).send({ personnel_id: pid, room_id: r2 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/zaten/i)
    expect(activeBeds(r2)).toEqual([])
  })
})

describe('Çıkış', () => {
  it('son çıkışlar listesinde kişi geçmiş oda sayısı kadar tekrarlanmaz', async () => {
    const pid = mkPerson('Çok Odalı')
    const r1 = mkRoom('M1', '921', 3); const r2 = mkRoom('M1', '922', 3)
    seat(pid, r1, 1)
    getDB().prepare("UPDATE room_assignments SET check_out_at=datetime('now','-2 days') WHERE personnel_id=?").run(pid)
    seat(pid, r2, 1)
    const p = await auth(request(app).post('/api/checkout/process')).send({ personnel_id: pid, zimmet_actions: [] })
    expect(p.status).toBe(200)
    const res = await auth(request(app).get('/api/checkout/recent'))
    expect(res.status).toBe(200)
    const rows = res.body.filter(r => r.id === pid)
    expect(rows).toHaveLength(1)
    expect(rows[0].room_no).toBe('922')
  })

  function laundryCard(pid) {
    getDB().prepare(`INSERT INTO cards(holder_type, holder_id, card_type, code, status)
                     VALUES('personnel', ?, 'laundry', ?, 'active')`).run(pid, `TEST-L-${pid}`)
  }
  const cardStatus = pid => getDB().prepare(
    "SELECT status FROM cards WHERE holder_type='personnel' AND holder_id=? AND card_type='laundry'"
  ).get(pid).status

  it('kapasite toplu çıkış çamaşır kartını iptal eder', async () => {
    const pid = mkPerson(); seat(pid, mkRoom('M1', '923', 3), 1); laundryCard(pid)
    const res = await auth(request(app).post('/api/capacity/bulk/checkout')).send({ personnel_ids: [pid] })
    expect(res.status).toBe(200)
    expect(cardStatus(pid)).toBe('revoked')
  })

  it('toplu işlemler çıkışı çamaşır kartını iptal eder', async () => {
    const pid = mkPerson(); seat(pid, mkRoom('M1', '924', 3), 1); laundryCard(pid)
    const res = await auth(request(app).post('/api/bulk-actions/checkout')).send({ ids: [pid] })
    expect(res.status).toBe(200)
    expect(cardStatus(pid)).toBe('revoked')
  })

  it('kapasite toplu çıkış daha önce çıkmış kişinin çıkış tarihini ezmez', async () => {
    const pid = mkPerson()
    getDB().prepare("UPDATE personnel SET check_out_date='2026-01-05 10:00:00' WHERE id=?").run(pid)
    const res = await auth(request(app).post('/api/capacity/bulk/checkout')).send({ personnel_ids: [pid] })
    expect(res.status).toBe(200)
    expect(getDB().prepare('SELECT check_out_date FROM personnel WHERE id=?').get(pid).check_out_date).toBe('2026-01-05 10:00:00')
  })
})

describe('Oda arıza eşleşmesi — yalnız o odanın arızası', () => {
  let aRoom, a1Room, mRoom
  beforeAll(() => {
    const db = getDB()
    aRoom = mkRoom('A', '951', 1)
    a1Room = mkRoom('A1', '951', 1)
    mRoom = mkRoom('M1', '951', 3)
    mkRoom('S1', '951', 3)
    const ins = db.prepare(`INSERT INTO maintenance_requests(location, description, status, priority, opened_at)
                            VALUES(?, ?, 'open', 'low', datetime('now'))`)
    ins.run('A1-951', 'A1 arızası')
    ins.run('A1 Oda 951', 'A1 arızası 2')
    ins.run('S1 Oda 951', 'S1 arızası')
    ins.run('M1-951', 'M1 arızası (kısa biçim)')
  })

  it('oda geçmişi özeti her odayı bir kez döner, komşu bloğun arızasını saymaz', async () => {
    const res = await auth(request(app).get('/api/room-history/summary?days=7'))
    expect(res.status).toBe(200)
    const rowsA = res.body.filter(r => r.id === aRoom)
    expect(rowsA).toHaveLength(1)
    expect(rowsA[0].open_faults).toBe(0)
    expect(rowsA[0].fault_count).toBe(0)
    const rowsA1 = res.body.filter(r => r.id === a1Room)
    expect(rowsA1).toHaveLength(1)
    expect(rowsA1[0].open_faults).toBe(2)
    expect(rowsA1[0].fault_count).toBe(2)
  })

  it('oda zaman çizelgesi başka bloğun aynı numaralı odasının arızasını getirmez', async () => {
    const res = await auth(request(app).get('/api/room-history/room/M1/951?days=7'))
    expect(res.status).toBe(200)
    expect(res.body.faults.map(f => f.description)).toEqual(['M1 arızası (kısa biçim)'])
  })

  it('kapasite oda listesi açık arızayı doğru odaya sayar', async () => {
    const m = await auth(request(app).get('/api/capacity/rooms?block=M1'))
    expect(m.body.find(r => r.id === mRoom).open_fault_count).toBe(1)
    const a = await auth(request(app).get('/api/capacity/rooms?block=A'))
    expect(a.body.find(r => r.id === aRoom).open_fault_count).toBe(0)
  })
})
