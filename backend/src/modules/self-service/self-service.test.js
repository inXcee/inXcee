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

describe('P2 — İzin talebi (kiosk self-service)', () => {
  let kioskToken

  beforeAll(() => {
    const db = getDB()
    db.prepare("INSERT INTO staff(full_name, tc_no, is_active) VALUES('Izin Test Staff', '11122233344', 1)").run()
    db.prepare("INSERT INTO personnel(full_name, tc_no) VALUES('Izin Test Personel', '11122233344')").run()
    const pid = db.prepare("SELECT id FROM personnel WHERE tc_no='11122233344'").get().id
    kioskToken = jwt.sign({ personnelId: pid, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
  })

  it('GET /my-leaves bakiye + boş liste döner', async () => {
    const res = await request(app).get('/api/self-service/my-leaves')
      .set('Authorization', `Bearer ${kioskToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.leaves)).toBe(true)
    expect(res.body.balance).toBeTruthy()
    expect(res.body.balance.annual_total).toBeGreaterThan(0)
  })

  it('POST /leave-request talep oluşturur, listede görünür, yönetime bildirim düşer', async () => {
    const res = await request(app).post('/api/self-service/leave-request')
      .set('Authorization', `Bearer ${kioskToken}`)
      .send({ leave_type: 'annual', start_date: '2026-08-10', end_date: '2026-08-14', reason: 'Yıllık izin' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()

    const list = await request(app).get('/api/self-service/my-leaves')
      .set('Authorization', `Bearer ${kioskToken}`)
    const created = list.body.leaves.find(l => l.id === res.body.id)
    expect(created).toBeTruthy()
    expect(created.status).toBe('pending')
    expect(created.total_days).toBe(5)

    const notif = getDB().prepare(
      "SELECT COUNT(*) c FROM notifications WHERE message LIKE 'İzin talebi: Izin Test Staff%'"
    ).get().c
    expect(notif).toBeGreaterThanOrEqual(1)
  })

  it('çakışan tarih aralığı 400', async () => {
    const res = await request(app).post('/api/self-service/leave-request')
      .set('Authorization', `Bearer ${kioskToken}`)
      .send({ leave_type: 'annual', start_date: '2026-08-12', end_date: '2026-08-16' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/zaten var/)
  })

  it('geçersiz izin tipi 400', async () => {
    const res = await request(app).post('/api/self-service/leave-request')
      .set('Authorization', `Bearer ${kioskToken}`)
      .send({ leave_type: 'tatil', start_date: '2026-09-01', end_date: '2026-09-02' })
    expect(res.status).toBe(400)
  })

  it('staff eşleşmesi olmayan personel 404', async () => {
    const db = getDB()
    db.prepare("INSERT INTO personnel(full_name, tc_no) VALUES('Staffsiz Personel', '99988877766')").run()
    const pid = db.prepare("SELECT id FROM personnel WHERE tc_no='99988877766'").get().id
    const t = jwt.sign({ personnelId: pid, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app).post('/api/self-service/leave-request')
      .set('Authorization', `Bearer ${t}`)
      .send({ leave_type: 'annual', start_date: '2026-09-01', end_date: '2026-09-02' })
    expect(res.status).toBe(404)
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
  let avsToken, adminToken, technicalAvsToken

  beforeAll(async () => {
    adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    const w = (await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Kiosk Test Worker', role_label: 'Çamaşırhane Personeli' })).body
    await request(app).put(`/api/avs-workers/${w.id}/pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_pin: '0000' })
    const loginRes = await request(app).post('/api/auth/avs-login').send({ worker_id: w.id, pin: '0000' })
    avsToken = loginRes.body.token

    const technicalWorker = (await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Yetkisiz Teknik Worker', role_label: 'Teknik Personel' })).body
    await request(app).put(`/api/avs-workers/${technicalWorker.id}/pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_pin: '0000' })
    technicalAvsToken = (await request(app)
      .post('/api/auth/avs-login')
      .send({ worker_id: technicalWorker.id, pin: '0000' })).body.token
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

  it('teknik AVS personelini reddeder, kampüs yöneticisini kabul eder', async () => {
    const denied = await request(app)
      .get('/api/self-service/laundry-kiosk/session')
      .set('Authorization', `Bearer ${technicalAvsToken}`)
    expect(denied.status).toBe(403)

    const manager = await request(app)
      .get('/api/self-service/laundry-kiosk/session')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(manager.status).toBe(200)
    expect(manager.body).toMatchObject({
      role: 'campus_manager',
      capabilities: { persistent_offline_queue: false },
    })
  })

  it('tekil giriş parçaları açar ve client_request_id tekrarında torbayı çoğaltmaz', async () => {
    const payload = {
      block: 'A',
      room_no: '101',
      item_count: 3,
      client_request_id: 'bag-request-00000001',
      tracking_mode: 'individual',
      garments: [
        {
          type_id: 1,
          type_name: 'Gömlek',
          emoji: '👔',
          count: 2,
          requires_ironing: true,
        },
        {
          type_id: 2,
          type_name: 'Pantolon',
          emoji: '👖',
          count: 1,
          requires_ironing: true,
        },
      ],
    }
    const created = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send(payload)
    expect(created.status).toBe(201)
    expect(created.body.tracking_mode).toBe('individual')
    expect(created.body.garments).toHaveLength(3)
    expect(new Set(created.body.garments.map(garment => garment.garment_code)).size).toBe(3)

    const repeated = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send(payload)
    expect(repeated.status).toBe(200)
    expect(repeated.body).toMatchObject({ id: created.body.id, idempotent: true })
    const count = getDB().prepare(
      'SELECT COUNT(*) AS count FROM laundry_items WHERE client_request_id=?'
    ).get(payload.client_request_id)
    expect(count.count).toBe(1)
  })

  it('ütü tiki idempotenttir; tekrarında history ve audit çoğalmaz', async () => {
    const created = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'A',
        room_no: '101',
        item_count: 1,
        client_request_id: 'bag-request-iron-0001',
        garments: [{
          type_id: 1,
          type_name: 'Gömlek',
          count: 1,
          requires_ironing: true,
        }],
      })
    expect(created.status).toBe(201)
    const bagId = created.body.id
    const garmentId = created.body.garments[0].id
    const db = getDB()
    db.prepare("UPDATE laundry_items SET status='ironing' WHERE id=?").run(bagId)
    db.prepare("UPDATE premium_garments SET status='ironing' WHERE id=?").run(garmentId)
    const endpoint = `/api/self-service/laundry-kiosk/bags/${bagId}/garments/${garmentId}/ironing`
    const body = { completed: true, client_action_id: 'iron-action-00000001' }

    const first = await request(app)
      .put(endpoint)
      .set('Authorization', `Bearer ${avsToken}`)
      .send(body)
    expect(first.status).toBe(200)
    expect(first.body.garment.status).toBe('ready')
    expect(first.body.idempotent).toBe(false)

    const repeated = await request(app)
      .put(endpoint)
      .set('Authorization', `Bearer ${avsToken}`)
      .send(body)
    expect(repeated.status).toBe(200)
    expect(repeated.body.idempotent).toBe(true)
    expect(db.prepare(
      'SELECT COUNT(*) AS count FROM premium_garment_history WHERE client_action_id=?'
    ).get(body.client_action_id).count).toBe(1)
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM audit_log
      WHERE module='laundry-kiosk' AND action='laundry_garment_ironed' AND target_id=?
    `).get(garmentId).count).toBe(1)

    const completed = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/ironing-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ shelf_location: 'U-01' })
    expect(completed.status).toBe(200)

    const withoutChecklist = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/deliver`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ delivered_name: 'Teslim Alan' })
    expect(withoutChecklist.status).toBe(400)

    const delivered = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/deliver`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        delivered_name: 'Teslim Alan',
        garment_ids: [garmentId],
        signature: 'data:image/png;base64,dGVzdA==',
      })
    expect(delivered.status).toBe(200)
    expect(delivered.body.delivered_count).toBe(1)
    expect(db.prepare(
      'SELECT delivered_by_worker_id FROM laundry_deliveries WHERE item_id=?'
    ).get(bagId).delivered_by_worker_id).toBeTruthy()
  })

  it('hasarlı istisnada fotoğraf ister; eksik parçayı fotoğrafsız kapatır', async () => {
    const created = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'A',
        room_no: '101',
        item_count: 1,
        garments: [{
          type_id: 1,
          type_name: 'Gömlek',
          count: 1,
          requires_ironing: true,
        }],
      })
    const bagId = created.body.id
    const garmentId = created.body.garments[0].id
    const db = getDB()
    db.prepare("UPDATE laundry_items SET status='ironing' WHERE id=?").run(bagId)
    db.prepare("UPDATE premium_garments SET status='ironing' WHERE id=?").run(garmentId)
    const endpoint = `/api/self-service/laundry-kiosk/bags/${bagId}/garments/${garmentId}/exception`

    const damaged = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${avsToken}`)
      .field('reason', 'damaged')
    expect(damaged.status).toBe(400)
    expect(damaged.body.error).toMatch(/fotoğraf/)

    const missing = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${avsToken}`)
      .field('reason', 'missing')
      .field('note', 'Kontrolde bulunamadı')
    expect(missing.status).toBe(201)
    expect(missing.body.garment.status).toBe('lost')

    const detail = await request(app)
      .get(`/api/self-service/laundry-kiosk/bags/${bagId}`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(detail.body.exceptions[0]).toMatchObject({
      reason: 'missing',
      note: 'Kontrolde bulunamadı',
      reported_by_name: 'Kiosk Test Worker',
    })
    expect(detail.body.exceptions[0].created_at).toBeTruthy()

    const list = await request(app)
      .get('/api/self-service/laundry-kiosk/bags?scope=all')
      .set('Authorization', `Bearer ${avsToken}`)
    const listed = list.body.find(item => item.id === bagId)
    expect(listed.latest_garment_lost_note).toBe('Kontrolde bulunamadı')
    expect(listed.latest_garment_lost_by).toBe('Kiosk Test Worker')
    expect(listed.garment_names).toContain('Gömlek')

    const losses = await request(app)
      .get('/api/self-service/laundry-kiosk/losses?scope=open')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(losses.status).toBe(200)
    const incident = losses.body.incidents.find(row => row.garment_id === garmentId)
    expect(incident).toMatchObject({
      kind: 'garment', status: 'open', note: 'Kontrolde bulunamadı',
      reported_by: 'Kiosk Test Worker',
    })
    expect(incident.reported_at).toBeTruthy()
    expect(incident.intake_at).toBeTruthy()

    const overview = await request(app)
      .get('/api/self-service/laundry-kiosk/overview')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(overview.status).toBe(200)
    expect(overview.body.summary.lost_open).toBeGreaterThan(0)
    expect(overview.body.summary.lost_garments).toBeGreaterThan(0)
    expect(overview.body.recent_losses.some(row => row.garment_id === garmentId)).toBe(true)

    const found = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/garments/${garmentId}/found`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({})
    expect(found.status).toBe(200)
    expect(found.body).toMatchObject({ ok: true, garmentId, garmentStatus: 'ironing' })
    expect(db.prepare('SELECT status FROM premium_garments WHERE id=?').get(garmentId).status).toBe('ironing')
    const resolvedException = db.prepare(
      'SELECT resolved_at, resolved_by_worker_id FROM laundry_garment_exceptions WHERE garment_id=? ORDER BY id DESC LIMIT 1'
    ).get(garmentId)
    expect(resolvedException.resolved_at).toBeTruthy()
    expect(resolvedException.resolved_by_worker_id).toBeTruthy()

    const history = await request(app)
      .get('/api/self-service/laundry-kiosk/losses?scope=resolved')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(history.body.incidents.find(row => row.garment_id === garmentId)).toMatchObject({
      kind: 'garment', status: 'resolved', resolved_by: 'Kiosk Test Worker',
    })
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
        intake_signature: 'data:image/png;base64,dGVzdA==',
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

  it('Faz 2 A/B/C bloklarında 1-80 odaları bulunur ve varsayılan hizmet standarttır', async () => {
    const db = getDB()
    for (const block of ['F2A', 'F2B', 'F2C']) {
      expect(db.prepare('SELECT COUNT(*) AS count FROM rooms WHERE block=?').get(block).count).toBe(80)
      expect(db.prepare('SELECT 1 AS ok FROM rooms WHERE block=? AND room_no=?').get(block, '80')).toEqual({ ok: 1 })
    }

    const config = await request(app)
      .get('/api/self-service/laundry-kiosk/block-config')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(config.status).toBe(200)
    expect(config.body.find(row => row.block === 'F2A')).toMatchObject({
      is_premium: 0,
      signature_required: 1,
      locked: false,
    })
  })

  it('standart Faz 2 giriş ve tesliminde imza ister; premium yapılınca imza isteğe bağlı olur', async () => {
    const noSignature = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'F2A', room_no: '80', item_count: 1 })
    expect(noSignature.status).toBe(400)
    expect(noSignature.body.error).toMatch(/imza zorunludur/)

    const created = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'F2A', room_no: '80', item_count: 1,
        intake_signature: 'data:image/png;base64,dGVzdA==',
      })
    expect(created.status).toBe(201)
    getDB().prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(created.body.id)

    const unsignedDelivery = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${created.body.id}/deliver`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ delivered_name: 'Faz 2 Teslim Alan' })
    expect(unsignedDelivery.status).toBe(400)
    expect(unsignedDelivery.body.error).toMatch(/imza zorunludur/)

    const makePremium = await request(app)
      .put('/api/self-service/laundry-kiosk/block-config/F2B')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ is_premium: true })
    expect(makePremium.body).toMatchObject({ is_premium: 1, signature_required: 0 })

    const premiumCreated = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'F2B', room_no: '79', item_count: 1 })
    expect(premiumCreated.status).toBe(201)

    const restoreStandard = await request(app)
      .put('/api/self-service/laundry-kiosk/block-config/F2B')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ is_premium: false })
    expect(restoreStandard.body).toMatchObject({ is_premium: 0, signature_required: 1 })
  })
})

describe('Laundry Kiosk Faz 3 operasyon akışı', () => {
  let adminToken, outgoingToken, outgoingId, incomingId, machineId

  async function createWorker(name, pin) {
    const worker = (await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: name, role_label: 'Çamaşırhane Personeli' })).body
    await request(app).put(`/api/avs-workers/${worker.id}/pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_pin: pin })
    return worker.id
  }

  async function createBag(extra = {}) {
    const response = await request(app).post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${outgoingToken}`)
      .send({
        block: 'M1', room_no: '101', item_count: 3,
        intake_signature: 'data:image/png;base64,dGVzdA==',
        ...extra,
      })
    expect(response.status).toBe(201)
    return response.body.id
  }

  beforeAll(async () => {
    adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    outgoingId = await createWorker('Faz3 Çıkan Personel', '2468')
    incomingId = await createWorker('Faz3 Devralan Personel', '1357')
    outgoingToken = (await request(app).post('/api/auth/avs-login').send({ worker_id: outgoingId, pin: '2468' })).body.token
    const machine = await request(app).post('/api/laundry/machines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Faz3 Akıllı Makine', type: 'washer', capacity_kg: 12 })
    machineId = machine.body.id
  })

  it('kapasite ve bakım grubuna göre açıklanabilir yük önerisi döndürür', async () => {
    const bagId = await createBag({ urgent: true, notes: 'hassas yün' })
    const response = await request(app).get('/api/self-service/laundry-kiosk/load-suggestions')
      .set('Authorization', `Bearer ${outgoingToken}`)
    expect(response.status).toBe(200)
    expect(response.body.items.find(item => item.id === bagId)).toMatchObject({ care: 'delicate' })
    const suggestion = response.body.suggestions.find(row => row.machine_id === machineId)
    expect(suggestion.reasons.length).toBeGreaterThanOrEqual(3)
    expect(suggestion.capacity_kg).toBe(12)
  })

  it('önerilen yükü program ve ağırlık kaydıyla makinede başlatır', async () => {
    const bagId = await createBag({ notes: 'standart koyu renk' })
    const response = await request(app)
      .post(`/api/self-service/laundry-kiosk/machines/${machineId}/start-load`)
      .set('Authorization', `Bearer ${outgoingToken}`)
      .send({
        item_ids: [bagId], program: 'standard', color_group: 'dark',
        fabric_care: 'standard', actual_weight_kg: 1.1, timer_minutes: 45,
      })
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ machine_id: machineId, program: 'standard', selected_count: 1 })
    expect(getDB().prepare('SELECT status,machine_id FROM laundry_items WHERE id=?').get(bagId))
      .toMatchObject({ status: 'washing', machine_id: machineId })
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM laundry_machine_load_items WHERE load_id=?').get(response.body.id).count).toBe(1)
  })

  it('kapasite aşımını gerekçesiz kabul etmez', async () => {
    getDB().prepare("UPDATE laundry_machines SET status='idle', timer_end=NULL WHERE id=?").run(machineId)
    const bagId = await createBag({ item_count: 2 })
    const response = await request(app)
      .post(`/api/self-service/laundry-kiosk/machines/${machineId}/start-load`)
      .set('Authorization', `Bearer ${outgoingToken}`)
      .send({ item_ids: [bagId], program: 'standard', actual_weight_kg: 20 })
    expect(response.status).toBe(409)
    expect(response.body.error).toMatch(/gerekçe/)
  })

  it('offline kuyruk varken vardiya teslimini başlatmaz', async () => {
    const response = await request(app).post('/api/self-service/laundry-kiosk/handovers/start')
      .set('Authorization', `Bearer ${outgoingToken}`)
      .send({ outgoing_pin: '2468', offline_queue_count: 2 })
    expect(response.status).toBe(409)
    expect(response.body.error).toMatch(/offline kuyruk/i)
  })

  it('çıkan ve devralan personelin ayrı PIN doğrulamasıyla vardiyayı kapatır', async () => {
    const started = await request(app).post('/api/self-service/laundry-kiosk/handovers/start')
      .set('Authorization', `Bearer ${outgoingToken}`)
      .send({ outgoing_pin: '2468', offline_queue_count: 0 })
    expect(started.status).toBe(201)
    expect(started.body.summary).toHaveProperty('machines')

    const sameWorker = await request(app)
      .post(`/api/self-service/laundry-kiosk/handovers/${started.body.id}/finalize`)
      .set('Authorization', `Bearer ${outgoingToken}`)
      .send({ incoming_worker_id: outgoingId, incoming_pin: '2468', offline_queue_count: 0 })
    expect(sameWorker.status).toBe(400)

    const finalized = await request(app)
      .post(`/api/self-service/laundry-kiosk/handovers/${started.body.id}/finalize`)
      .set('Authorization', `Bearer ${outgoingToken}`)
      .send({
        incoming_worker_id: incomingId, incoming_pin: '1357', offline_queue_count: 0,
        note: 'Aktif işler ve makineler devredildi.', issues: ['Makine 2 filtre kontrolü'],
      })
    expect(finalized.status).toBe(200)
    expect(finalized.body).toMatchObject({ status: 'completed', incoming_worker: 'Faz3 Devralan Personel' })
    expect(getDB().prepare('SELECT status,incoming_worker_id FROM laundry_shift_handovers WHERE id=?').get(started.body.id))
      .toMatchObject({ status: 'completed', incoming_worker_id: incomingId })
  })
})

describe('Laundry Kiosk makine akışı', () => {
  let avsToken, machineId

  async function createDirtyBag(extra = {}) {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'M1', room_no: '101', item_count: 2,
        intake_signature: 'data:image/png;base64,dGVzdA==',
        ...extra,
      })
    expect(res.status).toBe(201)
    return res.body.id
  }

  beforeAll(async () => {
    const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    const w = (await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Makine Test Worker', role_label: 'Çamaşırhane Personeli' })).body
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

  it('premium blok ayarı kiosk personelince yönetilir; M/S kilitli kalır', async () => {
    const initial = await request(app)
      .get('/api/self-service/laundry-kiosk/block-config')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(initial.status).toBe(200)
    const locked = initial.body.find(row => /^M|^S/.test(row.block))
    expect(locked).toMatchObject({ is_premium: 0, locked: true })

    const lockedUpdate = await request(app)
      .put(`/api/self-service/laundry-kiosk/block-config/${locked.block}`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ is_premium: true })
    expect(lockedUpdate.status).toBe(200)
    expect(lockedUpdate.body).toMatchObject({ is_premium: 0, locked: true })

    const configurable = initial.body.find(row => !row.locked)
    const premiumRoom = getDB().prepare('SELECT room_no FROM rooms WHERE block=? LIMIT 1').get(configurable.block)
    const activeIroning = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: configurable.block,
        room_no: premiumRoom.room_no,
        item_count: 1,
        client_request_id: 'bag-config-disable-iron-001',
        garments: [{ type_name: 'Gömlek', count: 1, requires_ironing: true }],
      })
    getDB().prepare("UPDATE laundry_items SET status='ironing' WHERE id=?").run(activeIroning.body.id)
    getDB().prepare("UPDATE premium_garments SET status='ironing' WHERE item_id=?").run(activeIroning.body.id)
    const standard = await request(app)
      .put(`/api/self-service/laundry-kiosk/block-config/${configurable.block}`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ is_premium: false })
    expect(standard.status).toBe(200)
    expect(standard.body.is_premium).toBe(0)
    expect(getDB().prepare('SELECT status, is_premium, needs_ironing FROM laundry_items WHERE id=?').get(activeIroning.body.id))
      .toEqual({ status: 'ready', is_premium: 0, needs_ironing: 0 })
    expect(getDB().prepare('SELECT status, requires_ironing FROM premium_garments WHERE item_id=?').get(activeIroning.body.id))
      .toEqual({ status: 'ready', requires_ironing: 0 })
    await request(app)
      .put(`/api/self-service/laundry-kiosk/block-config/${configurable.block}`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ is_premium: true })
  })

  it('standart blok girişinde sahte ütü işareti sunucuda temizlenir', async () => {
    const room = getDB().prepare("SELECT block, room_no FROM rooms WHERE block LIKE 'M%' OR block LIKE 'S%' LIMIT 1").get()
    expect(room).toBeTruthy()
    const created = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        ...room,
        item_count: 1,
        client_request_id: 'bag-standard-no-iron-001',
        intake_signature: 'data:image/png;base64,dGVzdA==',
        is_premium: true,
        garments: [{ type_name: 'Gömlek', count: 1, requires_ironing: true }],
      })
    expect(created.status).toBe(201)
    expect(created.body.garments[0].requires_ironing).toBe(0)
    const item = getDB().prepare('SELECT is_premium, needs_ironing FROM laundry_items WHERE id=?').get(created.body.id)
    expect(item).toEqual({ is_premium: 0, needs_ironing: 0 })
  })

  it('start-wash: makine seçmeden yıkamayı başlatır ve zamanı history kaydına işler', async () => {
    const bagId = await createDirtyBag()
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/start-wash`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('washing')
    const db = getDB()
    expect(db.prepare('SELECT status, machine_id FROM laundry_items WHERE id=?').get(bagId))
      .toMatchObject({ status: 'washing', machine_id: null })
    const history = db.prepare(`
      SELECT from_status, to_status, worker_id, created_at
      FROM laundry_history WHERE item_id=? AND to_status='washing'
    `).get(bagId)
    expect(history).toMatchObject({ from_status: 'dirty', to_status: 'washing' })
    expect(history.worker_id).toBeTruthy()
    expect(history.created_at).toBeTruthy()
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
      .send({ block: 'M1', room_no: '102', delivered_name: 'Toplu Teslim Kişi', signature: 'data:image/png;base64,dGVzdA==' })
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

  it('wash-complete kioskta raf konumunu kullanmadan ready yapar', async () => {
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
    expect(item).toMatchObject({ status: 'ready', shelf_location: null })
  })

  it('ironing-complete kioskta raf konumunu kullanmadan ready yapar', async () => {
    const bagId = await createDirtyBag({ block: 'A' })
    getDB().prepare("UPDATE laundry_items SET status='ironing' WHERE id=?").run(bagId)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/ironing-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ shelf_location: 'B-1', verified_count: 2 })
    expect(res.status).toBe(200)
    const item = getDB().prepare('SELECT status, shelf_location FROM laundry_items WHERE id=?').get(bagId)
    expect(item).toMatchObject({ status: 'ready', shelf_location: null })
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
      .send({ delivered_name: 'Parite Test', file_count: 2, signature: 'data:image/png;base64,dGVzdA==' })
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

  it('M/S blok tesliminde imzayı sunucu tarafında zorunlu tutar', async () => {
    const bagId = await createDirtyBag({ room_no: '105' })
    getDB().prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(bagId)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/deliver`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ delivered_name: 'İmzasız Teslim' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/imza zorunludur/i)
    expect(getDB().prepare('SELECT status FROM laundry_items WHERE id=?').get(bagId).status).toBe('ready')
  })

  it('scope=all teslim edilen kaydı kişi, imza ve zaman çizelgesiyle döndürür', async () => {
    const bagId = await createDirtyBag({ room_no: '107' })
    await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/start-wash`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({})
    await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/wash-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({})
    await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/deliver`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ delivered_name: 'Mehmet Kaya', signature: 'data:image/png;base64,dGVzdA==' })

    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/bags?scope=all')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    const record = res.body.find(item => item.id === bagId)
    expect(record).toMatchObject({
      status: 'delivered',
      delivered_to: 'Mehmet Kaya',
      has_delivery_signature: 1,
    })
    expect(record.wash_started_at).toBeTruthy()
    expect(record.washed_at).toBeTruthy()
    expect(record.delivered_at).toBeTruthy()
    expect(record.washed_by).toBeTruthy()
    expect(record.delivered_by).toBeTruthy()
  })

  it('deliver-room: her torba için deliveries kaydı düşer', async () => {
    const id1 = await createDirtyBag({ room_no: '104' })
    const id2 = await createDirtyBag({ room_no: '104' })
    const db = getDB()
    db.prepare("UPDATE laundry_items SET status='ready' WHERE id IN (?,?)").run(id1, id2)
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/deliver-room')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'M1', room_no: '104', delivered_name: 'Toplu Parite', signature: 'data:image/png;base64,dGVzdA==' })
    expect(res.status).toBe(200)
    expect(res.body.delivered).toBe(2)
    const n = db.prepare('SELECT COUNT(*) c FROM laundry_deliveries WHERE item_id IN (?,?)').get(id1, id2)
    expect(n.c).toBe(2)
  })

  it('ironing-complete: history satırı + ready bildirimi düşer (advance üzerinden)', async () => {
    const bagId = await createDirtyBag({ block: 'A' })
    getDB().prepare("UPDATE laundry_items SET status='ironing' WHERE id=?").run(bagId)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/ironing-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ shelf_location: 'C-2', verified_count: 2 })
    expect(res.status).toBe(200)
    const db = getDB()
    expect(db.prepare('SELECT status, shelf_location FROM laundry_items WHERE id=?').get(bagId)).toMatchObject({ status: 'ready', shelf_location: null })
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
    const list = await request(app)
      .get('/api/self-service/laundry-kiosk/bags?scope=all')
      .set('Authorization', `Bearer ${avsToken}`)
    const listed = list.body.find(item => item.id === bagId)
    expect(listed).toMatchObject({ lost_notes: 'Rafta bulunamadı', lost_by: 'Makine Test Worker' })
    expect(listed.lost_at).toBeTruthy()

    const detail = await request(app)
      .get(`/api/self-service/laundry-kiosk/bags/${bagId}`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(detail.body.history.find(row => row.to_status === 'lost').operator_name).toBe('Makine Test Worker')
  })

  it('patlayan oda filesi: kişi ve işaretlenen kıyafetleri kaydeder, ayırt eder ve teslim eder', async () => {
    const created = await request(app)
      .post('/api/self-service/laundry-kiosk/burst-bags')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'A', room_no: '101', file_no: '2', person_name: 'Ali Demir',
        burst_stage: 'washing', found_location: 'Ayırma Masası 2',
        garments: [{ type_name: 'Gömlek', count: 1 }, { type_name: 'Pantolon', count: 1 }],
        notes: 'File yıkama çıkışında patladı',
      })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      source_bag_no: null, source_block: 'A', source_room_no: '101', source_file_no: '2',
      source_person_name: 'Ali Demir', status: 'sorting', piece_waiting: 2,
    })
    expect(created.body.pieces.map(piece => piece.garment_type)).toEqual(['Gömlek', 'Pantolon'])
    expect(created.body.pieces[0].temporary_code).toMatch(/^AYR-/)

    const incidentId = created.body.id
    const pieceId = created.body.pieces[0].id
    const secondPieceId = created.body.pieces[1].id
    const described = await request(app)
      .put(`/api/self-service/laundry-kiosk/burst-bags/${incidentId}/pieces/${pieceId}`)
      .set('Authorization', `Bearer ${avsToken}`)
      .field('garment_type', 'Gömlek')
      .field('brand', 'Mavi')
      .field('size', 'L')
      .field('color', 'Lacivert')
      .field('distinguishing_note', 'Sol manşette beyaz isim etiketi')
    expect(described.status).toBe(200)
    expect(described.body.distinguishing_note).toBe('Sol manşette beyaz isim etiketi')

    const tooEarly = await request(app)
      .post(`/api/self-service/laundry-kiosk/burst-bags/${incidentId}/pieces/${pieceId}/claim`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ claimed_by_name: 'Ali Demir', block: 'A', room_no: '101' })
    expect(tooEarly.status).toBe(409)
    expect(tooEarly.body.error).toMatch(/sahip seçimine açın/i)

    const ready = await request(app)
      .put(`/api/self-service/laundry-kiosk/burst-bags/${incidentId}/status`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ status: 'ready_for_selection' })
    expect(ready.status).toBe(200)
    expect(ready.body.status).toBe('ready_for_selection')

    const center = await request(app)
      .get('/api/self-service/laundry-kiosk/burst-bags?scope=open')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(center.status).toBe(200)
    expect(center.body.summary.waiting_pieces).toBeGreaterThan(0)
    expect(center.body.incidents.find(row => row.id === incidentId).reported_by).toBe('Makine Test Worker')

    const overview = await request(app)
      .get('/api/self-service/laundry-kiosk/overview')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(overview.body.summary.burst_open).toBeGreaterThan(0)
    expect(overview.body.summary.burst_waiting_pieces).toBeGreaterThan(0)
    expect(overview.body.recent_bursts.some(row => row.id === incidentId)).toBe(true)

    const claimed = await request(app)
      .post(`/api/self-service/laundry-kiosk/burst-bags/${incidentId}/pieces/${pieceId}/claim`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        claimed_by_name: 'Ali Demir', block: 'A', room_no: '101',
        claim_note: 'İsim etiketi ve marka ile doğrulandı',
      })
    expect(claimed.status).toBe(200)
    expect(claimed.body.piece).toMatchObject({
      status: 'returned', claimed_by_name: 'Ali Demir', claimed_block: 'A', claimed_room_no: '101',
    })
    expect(claimed.body.piece.claimed_at).toBeTruthy()

    const secondClaimed = await request(app)
      .post(`/api/self-service/laundry-kiosk/burst-bags/${incidentId}/pieces/${secondPieceId}/claim`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ claimed_by_name: 'Ali Demir', block: 'A', room_no: '101' })
    expect(secondClaimed.status).toBe(200)

    const resolved = await request(app)
      .get('/api/self-service/laundry-kiosk/burst-bags?scope=resolved')
      .set('Authorization', `Bearer ${avsToken}`)
    const archived = resolved.body.incidents.find(row => row.id === incidentId)
    expect(archived).toMatchObject({ status: 'resolved', piece_returned: 2, resolution_note: 'Tüm parçalar sahiplerine teslim edildi' })
    expect(archived.pieces[0]).toMatchObject({ claimed_by_name: 'Ali Demir', claim_note: 'İsim etiketi ve marka ile doğrulandı' })
  })

  describe('kiosk audit izi', () => {
    function auditRows(action, targetId) {
      return getDB().prepare(
        "SELECT user_id, worker_id, detail FROM audit_log WHERE module='laundry-kiosk' AND action=? AND target_id=?"
      ).all(action, targetId)
    }

    // AVS operatöründe user_id NULL kalır; "kim yaptı" worker_id'den okunur.
    function expectAvsActor(rows) {
      expect(rows).toHaveLength(1)
      expect(rows[0].user_id).toBe(null)
      expect(rows[0].worker_id).toBeTruthy()
      return JSON.parse(rows[0].detail)
    }

    it('collect audit düşer', async () => {
      const bagId = await createDirtyBag()
      getDB().prepare("UPDATE laundry_items SET status='pending_collection' WHERE id=?").run(bagId)
      const res = await request(app)
        .post(`/api/self-service/laundry-kiosk/bags/${bagId}/collect`)
        .set('Authorization', `Bearer ${avsToken}`)
      expect(res.status).toBe(200)
      expectAvsActor(auditRows('laundry_kiosk_collect', bagId))
      // Regresyon: collected_by FK'si legacy avs_workers'ı gösterdiği için ham
      // staff id yazmak uçta 500'e sebep oluyordu.
      const row = getDB().prepare('SELECT status, last_modified_worker_id FROM laundry_items WHERE id=?').get(bagId)
      expect(row.status).toBe('dirty')
      expect(row.last_modified_worker_id).toBeTruthy()
    })

    it('ütü bayrağı audit düşer', async () => {
      const bagId = await createDirtyBag()
      const res = await request(app)
        .put(`/api/self-service/laundry-kiosk/bags/${bagId}/ironing`)
        .set('Authorization', `Bearer ${avsToken}`)
        .send({ needs_ironing: true })
      expect(res.status).toBe(200)
      expect(expectAvsActor(auditRows('laundry_kiosk_ironing_flag', bagId)).needsIroning).toBe(1)
    })

    it('void audit torba silinmeden önce düşer', async () => {
      const bagId = await createDirtyBag()
      const res = await request(app)
        .post(`/api/self-service/laundry-kiosk/bags/${bagId}/void`)
        .set('Authorization', `Bearer ${avsToken}`)
      expect(res.status).toBe(200)
      expectAvsActor(auditRows('laundry_kiosk_void', bagId))
    })

    it('lost ve found audit düşer', async () => {
      const bagId = await createDirtyBag()
      getDB().prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(bagId)
      await request(app)
        .post(`/api/self-service/laundry-kiosk/bags/${bagId}/lost`)
        .set('Authorization', `Bearer ${avsToken}`)
        .send({ notes: 'Rafta yok' })
      expect(expectAvsActor(auditRows('laundry_kiosk_lost', bagId)).notes).toBe('Rafta yok')

      await request(app)
        .post(`/api/self-service/laundry-kiosk/bags/${bagId}/found`)
        .set('Authorization', `Bearer ${avsToken}`)
      expectAvsActor(auditRows('laundry_kiosk_found', bagId))
    })

    it('batch-assign ve deliver-room audit düşer', async () => {
      const id1 = await createDirtyBag({ room_no: '106' })
      const id2 = await createDirtyBag({ room_no: '106' })
      const assign = await request(app)
        .post(`/api/self-service/laundry-kiosk/machines/${machineId}/batch-assign`)
        .set('Authorization', `Bearer ${avsToken}`)
        .send({ item_ids: [id1, id2] })
      expect(assign.status).toBe(200)
      expect(expectAvsActor(auditRows('laundry_kiosk_batch_assign', machineId)).itemIds)
        .toEqual(assign.body.success)

      getDB().prepare('UPDATE laundry_items SET status=? WHERE id IN (?,?)').run('ready', id1, id2)
      const deliver = await request(app)
        .post('/api/self-service/laundry-kiosk/deliver-room')
        .set('Authorization', `Bearer ${avsToken}`)
        .send({ block: 'M1', room_no: '106', delivered_name: 'Audit Test', signature: 'data:image/png;base64,dGVzdA==' })
      expect(deliver.status).toBe(200)
      const detail = expectAvsActor(auditRows('laundry_kiosk_deliver_room', id1))
      expect(detail.itemIds).toEqual([id1, id2])
      expect(detail.deliveredTo).toBe('Audit Test')
    })

    it('maintenance-done audit düşer', async () => {
      const res = await request(app)
        .post(`/api/self-service/laundry-kiosk/machines/${machineId}/maintenance-done`)
        .set('Authorization', `Bearer ${avsToken}`)
      expect(res.status).toBe(200)
      expectAvsActor(auditRows('laundry_kiosk_maintenance_done', machineId))
    })
  })

  it('sla-config kioska aşama eşiklerini döndürür', async () => {
    getDB().prepare(`
      INSERT INTO laundry_sla_config(stage, warning_hours, critical_hours, whatsapp_notify)
      VALUES('ready', 12, 36, 0)
      ON CONFLICT(stage) DO UPDATE SET warning_hours=12, critical_hours=36
    `).run()
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/sla-config')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    const ready = res.body.find(c => c.stage === 'ready')
    expect(ready).toMatchObject({ warning_hours: 12, critical_hours: 36 })
  })

  it('deterjan eşik altına düşünce yıkama başlatma bildirimi üretir', async () => {
    const db = getDB()
    // makineye bağlı, stoğu zaten kritik eşiğin altında bir deterjan
    const sid = db.prepare(`
      INSERT INTO laundry_supplies(name, unit, current_stock, warning_threshold, critical_threshold)
      VALUES('Test Deterjan Kritik', 'kg', 0.5, 5, 1)
    `).run().lastInsertRowid
    db.prepare('INSERT INTO laundry_machine_supplies(machine_id, supply_id, per_wash_amount) VALUES(?,?,0.2)')
      .run(machineId, sid)
    const bagId = await createDirtyBag()
    const res = await request(app)
      .put(`/api/self-service/laundry-kiosk/machines/${machineId}/assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: bagId })
    expect(res.status).toBe(200)
    const notif = db.prepare(`SELECT message, type FROM notifications WHERE dedup_key='supply_low_${sid}_critical'`).get()
    expect(notif).toBeTruthy()
    expect(notif.type).toBe('critical')
    expect(notif.message).toContain('Test Deterjan Kritik')
  })

  it('maintenance-done: sayaç sıfırlanır, bakımdaki makine boşa döner', async () => {
    const db = getDB()
    db.prepare("UPDATE laundry_machines SET runs_since_maintenance=60, status='maintenance' WHERE id=?").run(machineId)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/machines/${machineId}/maintenance-done`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    const m = db.prepare('SELECT runs_since_maintenance, last_maintenance_at, status FROM laundry_machines WHERE id=?').get(machineId)
    expect(m.runs_since_maintenance).toBe(0)
    expect(m.last_maintenance_at).toBeTruthy()
    expect(m.status).toBe('idle')
  })

  it('machines listesi needs_maintenance bayrağı döndürür', async () => {
    const db = getDB()
    db.prepare("UPDATE laundry_machines SET runs_since_maintenance=55 WHERE id=?").run(machineId)
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/machines')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    const m = res.body.find(x => x.id === machineId)
    expect(m.needs_maintenance).toBe(1)
    db.prepare("UPDATE laundry_machines SET runs_since_maintenance=0 WHERE id=?").run(machineId)
  })

  it('found: kayıp torba hazıra geri döner; kayıp olmayana 400', async () => {
    const bagId = await createDirtyBag()
    getDB().prepare("UPDATE laundry_items SET status='lost' WHERE id=?").run(bagId)
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/found`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(getDB().prepare('SELECT status FROM laundry_items WHERE id=?').get(bagId).status).toBe('ready')

    const bad = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/found`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(bad.status).toBe(400)
  })

  it('yıkama başlatınca koşu kaydı düşer; machines listesi gün sayaçlarını döndürür', async () => {
    const bagId = await createDirtyBag()
    await request(app)
      .put(`/api/self-service/laundry-kiosk/machines/${machineId}/assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: bagId })
    const db = getDB()
    const run = db.prepare('SELECT COUNT(*) c FROM laundry_machine_runs WHERE machine_id=? AND item_id=?').get(machineId, bagId)
    expect(run.c).toBe(1)
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/machines')
      .set('Authorization', `Bearer ${avsToken}`)
    const m = res.body.find(x => x.id === machineId)
    expect(m.runs_today).toBeGreaterThanOrEqual(1)
    expect(m.runs_7d).toBeGreaterThanOrEqual(m.runs_today)
    expect(m.runs_30d).toBeGreaterThanOrEqual(m.runs_7d)
  })

  it('daily-runs gün-gün kırılım döndürür', async () => {
    const res = await request(app)
      .get(`/api/self-service/laundry-kiosk/machines/${machineId}/daily-runs?days=7`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    expect(res.body[0]).toHaveProperty('day')
    expect(res.body[0]).toHaveProperty('runs')
    expect(res.body[0].runs).toBeGreaterThanOrEqual(1)
  })

  it('operator-summary: kiosk işlemleri operatöre yazılır', async () => {
    const bagId = await createDirtyBag()
    await request(app)
      .put(`/api/self-service/laundry-kiosk/machines/${machineId}/assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: bagId })
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/operator-summary')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    const me = res.body.find(o => o.operator === 'Makine Test Worker')
    expect(me).toBeTruthy()
    expect(me.giris).toBeGreaterThanOrEqual(1)   // kiosk bag girişi history'ye düşer
    expect(me.yikama).toBeGreaterThanOrEqual(1)  // assign damgalanır
    expect(me.toplam).toBeGreaterThanOrEqual(2)
  })

  it('REGRESYON: timer cron total_runs artırmaz (çift sayım fix)', async () => {
    const db = getDB()
    const bagId = await createDirtyBag()
    await request(app)
      .put(`/api/self-service/laundry-kiosk/machines/${machineId}/assign`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: bagId, timer_minutes: 30 })
    const before = db.prepare('SELECT total_runs FROM laundry_machines WHERE id=?').get(machineId).total_runs
    db.prepare("UPDATE laundry_machines SET timer_end=datetime('now','-1 minute') WHERE id=?").run(machineId)
    const { checkMachineTimers } = await import('../laundry/sla.js')
    checkMachineTimers()
    const after = db.prepare('SELECT total_runs, status FROM laundry_machines WHERE id=?').get(machineId)
    expect(after.total_runs).toBe(before) // artmamalı — artış sadece yıkama başlangıcında
    expect(after.status).toBe('done')
    db.prepare("UPDATE laundry_machines SET status='idle', timer_end=NULL WHERE id=?").run(machineId)
  })

  it('REGRESYON: bakım cron uyarısı bakım sonrası susar', async () => {
    const db = getDB()
    const { checkMachineMaintenanceAlerts } = await import('../laundry/sla.js')
    // ömür boyu sayaç yüksek ama bakım yeni yapılmış → uyarı YOK
    db.prepare("UPDATE laundry_machines SET total_runs=120, runs_since_maintenance=0 WHERE id=?").run(machineId)
    const silentCount = checkMachineMaintenanceAlerts()
    const stillAlerted = db.prepare(`SELECT COUNT(*) c FROM notifications WHERE dedup_key='maint_alert_${machineId}'`).get().c
    expect(stillAlerted).toBe(0)
    // son bakımdan beri eşik aşılmış → uyarı VAR
    db.prepare("UPDATE laundry_machines SET runs_since_maintenance=55 WHERE id=?").run(machineId)
    checkMachineMaintenanceAlerts()
    const alerted = db.prepare(`SELECT COUNT(*) c FROM notifications WHERE dedup_key='maint_alert_${machineId}'`).get().c
    expect(alerted).toBe(1)
    db.prepare("UPDATE laundry_machines SET runs_since_maintenance=0 WHERE id=?").run(machineId)
  })

  it('hub busyness: 24 saat + 7 gün dolu dizi döndürür, girişler sayılır', async () => {
    await createDirtyBag()
    const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    const res = await request(app)
      .get('/api/laundry/busyness?days=30')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.hours).toHaveLength(24)
    expect(res.body.weekdays).toHaveLength(7)
    const totalIntake = res.body.hours.reduce((s, h) => s + h.intake, 0)
    expect(totalIntake).toBeGreaterThanOrEqual(1)
    // saat ve haftagünü toplamları aynı kayıtları sayar
    expect(res.body.weekdays.reduce((s, d) => s + d.intake, 0)).toBe(totalIntake)
  })

  it('bag: multipart foto ile giriş — photo_url set edilir, string alanlar parse olur', async () => {
    // Geçerli minimal JPEG (magic bytes doğrulamasını geçer)
    const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .field('block', 'M1')
      .field('room_no', '101')
      .field('item_count', '2')
      .field('urgent', 'true')
      .field('intake_signature', 'data:image/png;base64,dGVzdA==')
      .field('garments', JSON.stringify([{ type_name: 'Gömlek', count: 2 }]))
      .attach('photo', jpeg, 'torba.jpg')
    expect(res.status).toBe(201)
    const item = getDB().prepare('SELECT photo_url, urgent, garments_json FROM laundry_items WHERE id=?').get(res.body.id)
    expect(item.photo_url).toMatch(/^\/uploads\//)
    expect(item.urgent).toBe(1)
    expect(JSON.parse(item.garments_json)).toEqual([{
      type_name: 'Gömlek', count: 2, requires_ironing: false,
    }])
  })

  it('bag: fotosuz JSON gövde eskisi gibi çalışır (photo_url null)', async () => {
    const bagId = await createDirtyBag()
    const item = getDB().prepare('SELECT photo_url FROM laundry_items WHERE id=?').get(bagId)
    expect(item.photo_url).toBe(null)
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
