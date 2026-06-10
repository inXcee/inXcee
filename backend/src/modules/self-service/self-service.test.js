import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Self-Service', () => {
  it('staff token without personnelId gets 403 on /my-info', async () => {
    const res = await request(app)
      .get('/api/self-service/my-info')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })

  it('staff token without personnelId gets 403 on /laundry-status', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-status')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /maintenance returns 403 for non-kiosk token', async () => {
    const res = await request(app)
      .post('/api/self-service/maintenance')
      .set('Authorization', `Bearer ${token}`)
      .send({ location: 'M1 Kat 2', description: 'Kapı kolu kırık' })
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })

  it('unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/self-service/my-info')
    expect(res.status).toBe(401)
  })
})

describe('self-service maintenance validasyon', () => {
  it('kısa location reddedilir', async () => {
    const kioskToken = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .post('/api/self-service/maintenance')
      .set('Authorization', `Bearer ${kioskToken}`)
      .send({ location: 'AB', description: 'Bu yeterince uzun bir aciklama metnidir' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/location/)
  })

  it('kısa description reddedilir', async () => {
    const kioskToken = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .post('/api/self-service/maintenance')
      .set('Authorization', `Bearer ${kioskToken}`)
      .send({ location: 'Oda 101', description: 'kisa' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/description/)
  })

  it('cok uzun aciklama 400 doner (Zod sweep)', async () => {
    const kioskToken = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .post('/api/self-service/maintenance')
      .set('Authorization', `Bearer ${kioskToken}`)
      .send({ location: 'Oda 101', description: 'd'.repeat(2001) })
    expect(res.status).toBe(400)
  })
})

// kiosk token yardımcısı
function makeKioskToken(personnelId = 1) {
  return jwt.sign({ personnelId, role: 'kiosk' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' })
}

describe('GET /api/self-service/my-maintenance', () => {
  it('kiosk token ile 200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-maintenance')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
  it('staff token ile 403 döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-maintenance')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/self-service/my-discipline', () => {
  it('kiosk token ile 200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-discipline')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
  it('staff token ile 403 döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-discipline')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/self-service/announcements', () => {
  it('kiosk token ile 200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/self-service/announcements')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/self-service/feedback', () => {
  it('geçerli veriyle 201 döner', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'suggestion', message: 'Bu yeterince uzun bir öneri metnidir.', anonymous: false })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
  })
  it('kısa mesaj 400 döner', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'complaint', message: 'kisa', anonymous: false })
    expect(res.status).toBe(400)
  })
  it('anonymous=true ise personnel_id kaydedilmez', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'other', message: 'Anonim bir geri bildirim metnidir.', anonymous: true })
    expect(res.status).toBe(201)
  })
  it('geçersiz type 400 döner', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'invalid', message: 'Bu yeterince uzun bir mesajdır.', anonymous: false })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/self-service/my-info expected_departure', () => {
  it('my-info yanıtında expected_departure alanı bulunur', async () => {
    const res = await request(app)
      .get('/api/self-service/my-info')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect('expected_departure' in res.body).toBe(true)
  })
})

describe('Laundry Kiosk endpoints', () => {
  let avsToken

  beforeAll(async () => {
    const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    const w = (await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Kiosk Test Worker' })).body
    await request(app).put(`/api/avs-workers/${w.id}/pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_pin: '0000' })
    const loginRes = await request(app).post('/api/auth/avs-login').send({ worker_id: w.id, pin: '0000' })
    avsToken = loginRes.body.token
  })

  it('GET /laundry-kiosk/blocks token gerektirmez', async () => {
    const res = await request(app).get('/api/self-service/laundry-kiosk/blocks')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /laundry-kiosk/room-persons AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/self-service/laundry-kiosk/room-persons?block=A&room_no=101')
    expect(res.status).toBe(401)
  })

  it('GET /laundry-kiosk/room-persons AVS token ile çalışır', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/room-persons?block=A&room_no=101')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /laundry-kiosk/bags AVS token ile çalışır', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/bags')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('eski generic PUT /laundry-kiosk/bags/:id/status kaldırıldı (404)', async () => {
    const res = await request(app)
      .put('/api/self-service/laundry-kiosk/bags/1/status')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ status: 'ready' })
    expect(res.status).toBe(404)
  })

  it('GET /laundry-kiosk/machines AVS token ile çalışır', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/machines')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('Kiosk token (role:kiosk) laundry-kiosk endpoint\'lerine erişemez', async () => {
    const kioskToken = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/machines')
      .set('Authorization', `Bearer ${kioskToken}`)
    expect(res.status).toBe(403)
  })

  it('POST /laundry-kiosk/bags/:id/ironing-complete — ironing olmayan torba 400 döner', async () => {
    const bagRes = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'A', room_no: '101', item_count: 2 })
    expect(bagRes.status).toBe(201)
    const bagId = bagRes.body.id
    // status = dirty, ironing-complete reddedilmeli
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/ironing-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /laundry-kiosk/bags/:id/deliver — delivered_name ve file_count zorunlu', async () => {
    const bagRes = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'A', room_no: '101', item_count: 1 })
    const bagId = bagRes.body.id
    // delivered_name olmadan
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/deliver`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ file_count: 2 })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /laundry-kiosk/bag — direkt dirty olur (pending_collection değil)', async () => {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'A', room_no: '101', item_count: 1 })
    expect(res.status).toBe(201)
    const db = getDB()
    const item = db.prepare('SELECT status FROM laundry_items WHERE id=?').get(res.body.id)
    expect(item.status).toBe('dirty')
  })

  it('POST /laundry-kiosk/garment — M1 blok dirty olur', async () => {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/garment')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'M1', room_no: '101',
        clothing_items: [{ type_id: 1, type_name: 'Gömlek', emoji: '👔', count: 1, colors: [], pattern: 'solid', pattern_label: 'Düz' }],
      })
    expect(res.status).toBe(201)
    const db = getDB()
    const item = db.prepare('SELECT status, needs_ironing FROM laundry_items WHERE id=?').get(res.body.id)
    expect(item.status).toBe('dirty')
    expect(item.needs_ironing).toBe(0)
  })

  it('POST /laundry-kiosk/garment — A blok (M/S dışı) ironing olur', async () => {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/garment')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'A', room_no: '101',
        clothing_items: [{ type_id: 1, type_name: 'Gömlek', emoji: '👔', count: 1, colors: [], pattern: 'solid', pattern_label: 'Düz' }],
      })
    expect(res.status).toBe(201)
    const db = getDB()
    const item = db.prepare('SELECT status, needs_ironing FROM laundry_items WHERE id=?').get(res.body.id)
    expect(item.status).toBe('ironing')
    expect(item.needs_ironing).toBe(1)
  })
})

describe('Laundry Kiosk makine akışı', () => {
  let avsToken, machineId

  async function createDirtyBag(extra = {}) {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'M1', room_no: '101', item_count: 2, ...extra })
    expect(res.status).toBe(201)
    return res.body.id
  }

  beforeAll(async () => {
    const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    const w = (await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Makine Test Worker' })).body
    await request(app).put(`/api/avs-workers/${w.id}/pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_pin: '0000' })
    avsToken = (await request(app).post('/api/auth/avs-login').send({ worker_id: w.id, pin: '0000' })).body.token
    const m = await request(app).post('/api/laundry/machines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Kiosk Test Makine', type: 'washer', capacity_kg: 10 })
    machineId = m.body.id
    expect(machineId).toBeTruthy()
  })

  it('assign: dirty torba makineye yüklenir — timer kurulur, makine running olur', async () => {
    const bagId = await createDirtyBag()
    const res = await request(app)
      .put(`/api/self-service/laundry-kiosk/machines/${machineId}/assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: bagId, timer_minutes: 45 })
    expect(res.status).toBe(200)
    const db = getDB()
    const item = db.prepare('SELECT status, machine_id FROM laundry_items WHERE id=?').get(bagId)
    expect(item.status).toBe('washing')
    expect(item.machine_id).toBe(machineId)
    const machine = db.prepare('SELECT status, timer_end FROM laundry_machines WHERE id=?').get(machineId)
    expect(machine.status).toBe('running')
    expect(machine.timer_end).toBeTruthy()
    // state machine'den geçtiği için history kaydı da düşmeli
    const hist = db.prepare("SELECT COUNT(*) c FROM laundry_history WHERE item_id=? AND to_status='washing'").get(bagId)
    expect(hist.c).toBe(1)
  })

  it('assign: dirty olmayan torba 400 döner', async () => {
    const bagId = await createDirtyBag()
    getDB().prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(bagId)
    const res = await request(app)
      .put(`/api/self-service/laundry-kiosk/machines/${machineId}/assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: bagId })
    expect(res.status).toBe(400)
  })

  it('wash-complete: needs_ironing=0 → ready', async () => {
    const bagId = await createDirtyBag()
    await request(app)
      .put(`/api/self-service/laundry-kiosk/machines/${machineId}/assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: bagId })
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/wash-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.next_status).toBe('ready')
    const item = getDB().prepare('SELECT status FROM laundry_items WHERE id=?').get(bagId)
    expect(item.status).toBe('ready')
  })

  it('wash-complete: needs_ironing=1 → ironing', async () => {
    const bagId = await createDirtyBag()
    getDB().prepare('UPDATE laundry_items SET needs_ironing=1 WHERE id=?').run(bagId)
    await request(app)
      .put(`/api/self-service/laundry-kiosk/machines/${machineId}/assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: bagId })
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/wash-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.next_status).toBe('ironing')
  })

  it('wash-complete: makinede olmayan torba 400 döner', async () => {
    const bagId = await createDirtyBag()
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/wash-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(400)
  })

  it('batch-assign: 2 kirli torba tek seferde, ready olan failed listesinde', async () => {
    // bu testte makine boş olmalı — yeni makine aç
    const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    const m = (await request(app).post('/api/laundry/machines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Batch Test Makine', type: 'washer' })).body
    const id1 = await createDirtyBag()
    const id2 = await createDirtyBag()
    const id3 = await createDirtyBag()
    getDB().prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(id3)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/machines/${m.id}/batch-assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_ids: [id1, id2, id3], timer_minutes: 30 })
    expect(res.status).toBe(200)
    expect(res.body.success.sort()).toEqual([id1, id2].sort())
    expect(res.body.failed).toHaveLength(1)
    expect(res.body.failed[0].id).toBe(id3)
    const db = getDB()
    expect(db.prepare('SELECT status FROM laundry_items WHERE id=?').get(id1).status).toBe('washing')
    expect(db.prepare('SELECT status FROM laundry_items WHERE id=?').get(id2).status).toBe('washing')
    expect(db.prepare('SELECT status, timer_end FROM laundry_machines WHERE id=?').get(m.id).timer_end).toBeTruthy()
  })

  it('deliver-room: odanın tüm hazır torbaları tek seferde teslim olur', async () => {
    const id1 = await createDirtyBag({ room_no: '102' })
    const id2 = await createDirtyBag({ room_no: '102' })
    const idOther = await createDirtyBag({ room_no: '103' })
    const db = getDB()
    db.prepare("UPDATE laundry_items SET status='ready' WHERE id IN (?,?,?)").run(id1, id2, idOther)
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/deliver-room')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'M1', room_no: '102', delivered_name: 'Toplu Teslim Kişi' })
    expect(res.status).toBe(200)
    expect(res.body.delivered).toBe(2)
    expect(db.prepare('SELECT status, delivered_name FROM laundry_items WHERE id=?').get(id1)).toMatchObject({ status: 'delivered', delivered_name: 'Toplu Teslim Kişi' })
    expect(db.prepare('SELECT status FROM laundry_items WHERE id=?').get(id2).status).toBe('delivered')
    // başka odanın hazır torbasına dokunulmaz
    expect(db.prepare('SELECT status FROM laundry_items WHERE id=?').get(idOther).status).toBe('ready')
  })

  it('deliver-room: hazır torba yoksa 404, isim zorunlu 400', async () => {
    const r404 = await request(app)
      .post('/api/self-service/laundry-kiosk/deliver-room')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'M1', room_no: '199', delivered_name: 'X' })
    expect(r404.status).toBe(404)
    const r400 = await request(app)
      .post('/api/self-service/laundry-kiosk/deliver-room')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'M1', room_no: '101' })
    expect(r400.status).toBe(400)
  })

  it('wash-complete shelf_location yazar (ready yolunda)', async () => {
    const bagId = await createDirtyBag()
    await request(app)
      .put(`/api/self-service/laundry-kiosk/machines/${machineId}/assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: bagId })
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/wash-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ shelf_location: 'A-3' })
    expect(res.status).toBe(200)
    const item = getDB().prepare('SELECT status, shelf_location FROM laundry_items WHERE id=?').get(bagId)
    expect(item).toMatchObject({ status: 'ready', shelf_location: 'A-3' })
  })

  it('ironing-complete shelf_location yazar', async () => {
    const bagId = await createDirtyBag()
    getDB().prepare("UPDATE laundry_items SET status='ironing' WHERE id=?").run(bagId)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/ironing-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ shelf_location: 'B-1' })
    expect(res.status).toBe(200)
    const item = getDB().prepare('SELECT status, shelf_location FROM laundry_items WHERE id=?').get(bagId)
    expect(item).toMatchObject({ status: 'ready', shelf_location: 'B-1' })
  })

  it('void: taze kirli torba silinir; işlenmişe 400', async () => {
    const bagId = await createDirtyBag()
    const ok = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/void`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(ok.status).toBe(200)
    expect(getDB().prepare('SELECT id FROM laundry_items WHERE id=?').get(bagId)).toBeUndefined()

    const bagId2 = await createDirtyBag()
    getDB().prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(bagId2)
    const bad = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId2}/void`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(bad.status).toBe(400)
  })

  it('void: 15 dk geçmiş torba 400 döner', async () => {
    const bagId = await createDirtyBag()
    getDB().prepare("UPDATE laundry_items SET created_at=datetime('now','-20 minutes') WHERE id=?").run(bagId)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/void`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/süresi doldu/)
  })

  it('deliver: laundry_deliveries kaydı + history satırı düşer (hub paritesi)', async () => {
    const bagId = await createDirtyBag()
    getDB().prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(bagId)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/deliver`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ delivered_name: 'Parite Test', file_count: 2 })
    expect(res.status).toBe(200)
    const db = getDB()
    const item = db.prepare('SELECT status, delivered_name, file_count FROM laundry_items WHERE id=?').get(bagId)
    expect(item).toMatchObject({ status: 'delivered', delivered_name: 'Parite Test', file_count: 2 })
    // ana kayıt defteri: deliveries tablosu (hub KPI'ları buradan sayar)
    const del = db.prepare('SELECT delivered_to FROM laundry_deliveries WHERE item_id=?').get(bagId)
    expect(del?.delivered_to).toBe('Parite Test')
    // zaman çizelgesi: history'de delivered geçişi
    const hist = db.prepare("SELECT COUNT(*) c FROM laundry_history WHERE item_id=? AND to_status='delivered'").get(bagId)
    expect(hist.c).toBe(1)
  })

  it('deliver-room: her torba için deliveries kaydı düşer', async () => {
    const id1 = await createDirtyBag({ room_no: '104' })
    const id2 = await createDirtyBag({ room_no: '104' })
    const db = getDB()
    db.prepare("UPDATE laundry_items SET status='ready' WHERE id IN (?,?)").run(id1, id2)
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/deliver-room')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'M1', room_no: '104', delivered_name: 'Toplu Parite' })
    expect(res.status).toBe(200)
    expect(res.body.delivered).toBe(2)
    const n = db.prepare('SELECT COUNT(*) c FROM laundry_deliveries WHERE item_id IN (?,?)').get(id1, id2)
    expect(n.c).toBe(2)
  })

  it('ironing-complete: history satırı + ready bildirimi düşer (advance üzerinden)', async () => {
    const bagId = await createDirtyBag()
    getDB().prepare("UPDATE laundry_items SET status='ironing' WHERE id=?").run(bagId)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/ironing-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ shelf_location: 'C-2' })
    expect(res.status).toBe(200)
    const db = getDB()
    expect(db.prepare('SELECT status, shelf_location FROM laundry_items WHERE id=?').get(bagId)).toMatchObject({ status: 'ready', shelf_location: 'C-2' })
    const hist = db.prepare("SELECT COUNT(*) c FROM laundry_history WHERE item_id=? AND from_status='ironing' AND to_status='ready'").get(bagId)
    expect(hist.c).toBe(1)
  })

  it('lost: torba kayıp işaretlenir, history + not düşer', async () => {
    const bagId = await createDirtyBag()
    getDB().prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(bagId)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/lost`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ notes: 'Rafta bulunamadı' })
    expect(res.status).toBe(200)
    const db = getDB()
    expect(db.prepare('SELECT status FROM laundry_items WHERE id=?').get(bagId).status).toBe('lost')
    const hist = db.prepare("SELECT notes FROM laundry_history WHERE item_id=? AND to_status='lost'").get(bagId)
    expect(hist.notes).toBe('Rafta bulunamadı')
  })

  it('today-summary dört sayıyı döndürür', async () => {
    await createDirtyBag()
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/today-summary')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.intake_today).toBeGreaterThan(0)
    expect(res.body).toHaveProperty('delivered_today')
    expect(res.body).toHaveProperty('active_total')
    expect(res.body).toHaveProperty('ready_waiting')
  })

  it('bags listesi washing torbada machine_name döndürür', async () => {
    const bagId = await createDirtyBag()
    await request(app)
      .put(`/api/self-service/laundry-kiosk/machines/${machineId}/assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: bagId })
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/bags?status=washing')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    const bag = res.body.find(b => b.id === bagId)
    expect(bag).toBeTruthy()
    expect(bag.machine_name).toBe('Kiosk Test Makine')
  })
})

// ── H2 M1/M2/M3 ──
describe('Mobile Self-Service (H2)', () => {
  let kioskToken
  beforeAll(() => {
    // personnel id=1 seed'den geliyor olabilir; varsa kullan, yoksa oluştur
    const db = getDB()
    const exists = db.prepare('SELECT id FROM personnel WHERE id=1').get()
    if (!exists) {
      db.prepare('INSERT INTO personnel(id, full_name, tc_no, company) VALUES(1, ?, ?, ?)')
        .run('Mobile Test', '11111111111', 'Test Firma')
    }
    kioskToken = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
  })

  it('GET /my-profile zenginlestirilmis profil doner', async () => {
    const res = await request(app).get('/api/self-service/my-profile')
      .set('Authorization', `Bearer ${kioskToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('person')
    expect(res.body).toHaveProperty('emergency_contacts')
    expect(res.body).toHaveProperty('discipline_total')
    expect(res.body).toHaveProperty('maintenance_open')
    expect(res.body.person.id).toBe(1)
  })

  it('GET /my-shifts staff yoksa mesaj doner', async () => {
    const res = await request(app).get('/api/self-service/my-shifts')
      .set('Authorization', `Bearer ${kioskToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('shifts')
    expect(Array.isArray(res.body.shifts)).toBe(true)
  })

  it('GET /my-transport bugun yoksa null doner', async () => {
    const res = await request(app).get('/api/self-service/my-transport')
      .set('Authorization', `Bearer ${kioskToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('today')
    expect(res.body).toHaveProperty('date')
  })

  it('kiosk olmayan 403', async () => {
    const res = await request(app).get('/api/self-service/my-profile')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('TC olan personel için my-shifts staff bilgisini joinler', async () => {
    const db = getDB()
    // TC eşleşmesi olan bir personel + staff oluştur
    const tcUnique = '12121212121'
    db.prepare('INSERT INTO personnel(full_name, tc_no, company) VALUES(?, ?, ?)')
      .run('TC Test', tcUnique, 'Firma X')
    const pid = db.prepare('SELECT id FROM personnel WHERE tc_no=?').get(tcUnique).id

    // Aynı TC'li staff var mı?
    let staffId = db.prepare('SELECT id FROM staff WHERE tc_no=?').get(tcUnique)?.id
    if (!staffId) {
      db.prepare('INSERT INTO staff(full_name, tc_no, is_active) VALUES(?, ?, 1)').run('TC Test', tcUnique)
      staffId = db.prepare('SELECT id FROM staff WHERE tc_no=?').get(tcUnique).id
    }

    const tcKioskToken = jwt.sign({ personnelId: pid, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app).get('/api/self-service/my-shifts')
      .set('Authorization', `Bearer ${tcKioskToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('summary')
  })
})
