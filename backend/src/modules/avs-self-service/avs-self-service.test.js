import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let avsToken
let workerId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token

  // Temizlik departmanlı bir AVS worker oluştur
  const w = (await request(app).post('/api/avs-workers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ full_name: 'AVS Kiosk Test', role_label: 'Temizlik Görevlisi' })).body
  workerId = w.id

  await request(app).put(`/api/avs-workers/${workerId}/pin`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ new_pin: '0000' })

  // Deterministik veri: Temizlik departmanı + M1 blok + bugüne vardiya + pickup
  const db = getDB()
  const temizlikId = db.prepare("SELECT id FROM departments WHERE name='Temizlik'").get().id
  db.prepare('UPDATE staff SET department_id=?, assigned_block=? WHERE id=?')
    .run(temizlikId, 'M1', workerId)
  const shiftDef = db.prepare('SELECT id FROM shift_definitions LIMIT 1').get()
  db.prepare(`INSERT OR IGNORE INTO shift_schedule(staff_id, shift_def_id, work_date, status)
              VALUES(?,?,date('now'),'scheduled')`).run(workerId, shiftDef?.id ?? null)
  const pp = db.prepare(`INSERT INTO pickup_points(name, district, neighborhood)
              VALUES('Merkez Durağı','Çankaya','Kızılay')`).run()
  db.prepare('UPDATE staff SET pickup_point_id=? WHERE id=?').run(pp.lastInsertRowid, workerId)
  // Bugüne bir cleaning task (M1) + bir açık arıza
  db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at)
              VALUES('Koridor','M1',1,'common_area',datetime('now'))`).run()
  db.prepare(`INSERT INTO maintenance_requests(location, description, status, priority)
              VALUES('M1 Kat 1','Musluk akıtıyor','open','high')`).run()
  // Bir aktif duyuru
  db.prepare(`INSERT INTO announcements(title, body) VALUES('Test Duyuru','İçerik')`).run()

  avsToken = (await request(app).post('/api/auth/avs-login')
    .send({ worker_id: workerId, pin: '0000' })).body.token
})

describe('AVS Self-Service — my-shifts', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/my-shifts')
    expect(res.status).toBe(401)
  })

  it('AVS token ile shifts dizisi döner ve bugünkü vardiyayı içerir', async () => {
    const res = await request(app).get('/api/avs-self-service/my-shifts')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.shifts)).toBe(true)
    const today = new Date().toISOString().slice(0, 10)
    expect(res.body.shifts.some(s => s.work_date === today)).toBe(true)
  })
})

describe('AVS Self-Service — my-transport', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/my-transport')
    expect(res.status).toBe(401)
  })

  it('atanmış pickup point döner', async () => {
    const res = await request(app).get('/api/avs-self-service/my-transport')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.pickup).not.toBeNull()
    expect(res.body.pickup.name).toBe('Merkez Durağı')
  })
})

describe('AVS Self-Service — auth', () => {
  it('GET /my-info AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/my-info')
    expect(res.status).toBe(401)
  })

  it('GET /my-info AVS token ile profil döner', async () => {
    const res = await request(app).get('/api/avs-self-service/my-info')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('full_name')
    expect(res.body).toHaveProperty('department_name')
  })
})

describe('AVS Self-Service — my-tasks', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/my-tasks')
    expect(res.status).toBe(401)
  })

  it('Temizlik departmanı housekeeping görev döner', async () => {
    const res = await request(app).get('/api/avs-self-service/my-tasks')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.type).toBe('housekeeping')
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(res.body.items.some(t => t.block === 'M1')).toBe(true)
  })
})

describe('AVS Self-Service — announcements', () => {
  it('aktif duyuru dizisi döner', async () => {
    const res = await request(app).get('/api/avs-self-service/announcements')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(a => a.title === 'Test Duyuru')).toBe(true)
  })
})

describe('AVS Self-Service — maintenance', () => {
  it('geçerli arıza 201 ve id döner + audit_log yazar', async () => {
    const res = await request(app).post('/api/avs-self-service/maintenance')
      .set('Authorization', `Bearer ${avsToken}`)
      .field('location', 'S2 Kat 2 Banyo')
      .field('description', 'Lavabo gideri tıkalı, su birikiyor')
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    const db = getDB()
    const audit = db.prepare(
      "SELECT * FROM audit_log WHERE action='kiosk_avs_maintenance' AND target_id=?"
    ).get(res.body.id)
    expect(audit).toBeTruthy()
  })

  it('kısa açıklama 400 döner', async () => {
    const res = await request(app).post('/api/avs-self-service/maintenance')
      .set('Authorization', `Bearer ${avsToken}`)
      .field('location', 'Oda 101')
      .field('description', 'kisa')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/description/)
  })
})

describe('AVS Self-Service — maintenance foto', () => {
  it('foto olmadan da 201 (regresyon)', async () => {
    const res = await request(app).post('/api/avs-self-service/maintenance')
      .set('Authorization', `Bearer ${avsToken}`)
      .field('location', 'M1 Kat 1')
      .field('description', 'Foto olmadan arıza bildirimi testi')
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
  })
})

describe('AVS Self-Service — task complete', () => {
  it('kendi bloğundaki görevi tamamlar (200 + completed_at)', async () => {
    const db = getDB()
    // Global beforeAll M1'e cleaning_task ekledi; worker assigned_block='M1'
    const task = db.prepare("SELECT id FROM cleaning_tasks WHERE block='M1' AND completed_at IS NULL LIMIT 1").get()
    const res = await request(app).post(`/api/avs-self-service/tasks/${task.id}/complete`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.completed_at).toBeTruthy()
  })

  it('başka bloğun görevinde 403', async () => {
    const db = getDB()
    const other = db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at)
      VALUES('Koridor','S1',1,'common_area',datetime('now'))`).run()
    const res = await request(app).post(`/api/avs-self-service/tasks/${other.lastInsertRowid}/complete`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(403)
  })

  it('olmayan görevde 404', async () => {
    const res = await request(app).post('/api/avs-self-service/tasks/999999/complete')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(404)
  })
})

describe('AVS Self-Service — my-transport schedule', () => {
  it('bugünkü route_assignment ile servis saati + sürücü döner', async () => {
    const db = getDB()
    const { pickup_point_id } = db.prepare('SELECT pickup_point_id FROM staff WHERE id=?').get(workerId)
    const route = db.prepare(`INSERT INTO routes(name, vehicle_plate, driver_name, driver_phone)
      VALUES('Sabah-1','34 ABC 34','Veli Şoför','5551112233')`).run()
    const stop = db.prepare(`INSERT INTO route_stops(route_id, pickup_point_id, scheduled_time)
      VALUES(?,?,'07:30')`).run(route.lastInsertRowid, pickup_point_id)
    db.prepare(`INSERT INTO route_assignments(route_id, stop_id, staff_id, work_date)
      VALUES(?,?,?,date('now'))`).run(route.lastInsertRowid, stop.lastInsertRowid, workerId)

    const res = await request(app).get('/api/avs-self-service/my-transport')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.schedule).not.toBeNull()
    expect(res.body.schedule.time).toBe('07:30')
    expect(res.body.schedule.driver_name).toBe('Veli Şoför')
    expect(res.body.schedule.plate).toBe('34 ABC 34')
    expect(res.body.pickup).not.toBeNull() // geriye uyumlu
  })
})

describe('AVS Self-Service — change-pin', () => {
  it('yanlış mevcut PIN ile 401', async () => {
    const res = await request(app).post('/api/avs-self-service/change-pin')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ current_pin: '9999', new_pin: '1234' })
    expect(res.status).toBe(401)
  })

  it('doğru mevcut PIN ile değişir (ve yeni PIN ile login olunur)', async () => {
    const res = await request(app).post('/api/avs-self-service/change-pin')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ current_pin: '0000', new_pin: '4321' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const relog = await request(app).post('/api/auth/avs-login')
      .send({ worker_id: workerId, pin: '4321' })
    expect(relog.status).toBe(200)
    expect(relog.body.token).toBeTruthy()
  })
})

describe('AVS Self-Service — my-qr', () => {
  it('staff qr_token döner', async () => {
    const db = getDB()
    db.prepare("UPDATE staff SET qr_token='QR-TEST-TOKEN' WHERE id=?").run(workerId)
    const res = await request(app).get('/api/avs-self-service/my-qr')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.qr_token).toBe('QR-TEST-TOKEN')
    expect(res.body.full_name).toBeTruthy()
  })
})

describe('AVS Self-Service — my-maintenance', () => {
  it('kendi bildirdiği arızalar listelenir', async () => {
    await request(app).post('/api/avs-self-service/maintenance')
      .set('Authorization', `Bearer ${avsToken}`)
      .field('location', 'M1 Test Konum')
      .field('description', 'my-maintenance testi için arıza kaydı')
    const res = await request(app).get('/api/avs-self-service/my-maintenance')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(m => m.location === 'M1 Test Konum')).toBe(true)
  })
})

describe('AVS Self-Service — feedback', () => {
  it('geçerli geri bildirim 201 + audit_log', async () => {
    const res = await request(app).post('/api/avs-self-service/feedback')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ type: 'suggestion', message: 'Servis saatleri biraz daha erken olabilir mi acaba' })
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    const db = getDB()
    const audit = db.prepare("SELECT * FROM audit_log WHERE action='kiosk_avs_feedback' AND target_id=?").get(res.body.id)
    expect(audit).toBeTruthy()
  })
  it('kısa mesaj 400', async () => {
    const res = await request(app).post('/api/avs-self-service/feedback')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ type: 'complaint', message: 'kısa' })
    expect(res.status).toBe(400)
  })
})

describe('AVS Self-Service — my-leave', () => {
  it('GET balance + requests döner', async () => {
    const res = await request(app).get('/api/avs-self-service/my-leave')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.balance).toHaveProperty('annual_total')
    expect(Array.isArray(res.body.requests)).toBe(true)
  })
  it('POST geçerli talep 201 + pending + staff_id=worker + total_days', async () => {
    const res = await request(app).post('/api/avs-self-service/my-leave')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ leave_type: 'annual', start_date: '2026-07-01', end_date: '2026-07-05', reason: 'tatil' })
    expect(res.status).toBe(201)
    const row = getDB().prepare('SELECT * FROM leave_requests WHERE id=?').get(res.body.id)
    expect(row.status).toBe('pending')
    expect(row.staff_id).toBe(workerId)
    expect(row.total_days).toBe(5)
  })
  it('POST body staff_id farklı olsa da workerId yazılır (güvenlik)', async () => {
    const res = await request(app).post('/api/avs-self-service/my-leave')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ leave_type: 'sick', start_date: '2026-08-01', end_date: '2026-08-02', staff_id: 999999 })
    expect(res.status).toBe(201)
    const row = getDB().prepare('SELECT staff_id FROM leave_requests WHERE id=?').get(res.body.id)
    expect(row.staff_id).toBe(workerId)
  })
  it('bitiş<başlangıç 400', async () => {
    const res = await request(app).post('/api/avs-self-service/my-leave')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ leave_type: 'annual', start_date: '2026-07-05', end_date: '2026-07-01' })
    expect(res.status).toBe(400)
  })
})

describe('AVS Self-Service — menu/today', () => {
  it('bugünün menüsü dolu öğünleri döner', async () => {
    const db = getDB()
    db.prepare("INSERT INTO meal_menu(meal_date, meal_type, items) VALUES(date('now'),'lunch','Çorba\nKöfte')").run()
    const res = await request(app).get('/api/avs-self-service/menu/today')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.some(m => m.meal_type === 'lunch' && m.items.includes('Köfte'))).toBe(true)
  })
})

describe('AVS Self-Service — inventory/items', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/inventory/items')
    expect(res.status).toBe(401)
  })

  it('worker tüm ürünleri görür (departman gating yok — her kategori dahil)', async () => {
    const db = getDB()
    db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Deterjan',50,'paket','housekeeping')`).run()
    db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Çöp Poşeti',100,'adet','general')`).run()
    db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Matkap Ucu',10,'adet','maintenance')`).run()
    const res = await request(app).get('/api/avs-self-service/inventory/items')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    const names = res.body.items.map(i => i.item_name)
    expect(names).toContain('Deterjan')
    expect(names).toContain('Çöp Poşeti')
    expect(names).toContain('Matkap Ucu') // gating yok → maintenance de görünür
  })

  it('departmanı eşleşmeyen worker da tüm ürünleri görür (200)', async () => {
    const db = getDB()
    // Yeni worker: Güvenlik departmanı (envanter kategorisine eşleşmez ama yine de görür)
    const w2 = (await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${(await request(app).post('/api/auth/login').send({ username:'mudur', password:'admin123' })).body.token}`)
      .send({ full_name: 'Guvenlik Worker' })).body
    const guvenlik = db.prepare("SELECT id FROM departments WHERE name='Güvenlik'").get()
    expect(guvenlik).toBeTruthy()
    db.prepare('UPDATE staff SET department_id=? WHERE id=?').run(guvenlik.id, w2.id)
    const adminToken = (await request(app).post('/api/auth/login').send({ username:'mudur', password:'admin123' })).body.token
    await request(app).put(`/api/avs-workers/${w2.id}/pin`).set('Authorization', `Bearer ${adminToken}`).send({ new_pin: '1111' })
    const token2 = (await request(app).post('/api/auth/avs-login').send({ worker_id: w2.id, pin: '1111' })).body.token
    const res = await request(app).get('/api/avs-self-service/inventory/items')
      .set('Authorization', `Bearer ${token2}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
  })
})

describe('AVS Self-Service — inventory/checkout', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).post('/api/avs-self-service/inventory/checkout').send({ item_id: 1, quantity: 1 })
    expect(res.status).toBe(401)
  })

  it('geçerli checkout → stok düşer, staff_id kaydı + stock_movement out + audit', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Eldiven',30,'kutu','housekeeping')`).run()
    const itemId = item.lastInsertRowid
    const res = await request(app).post('/api/avs-self-service/inventory/checkout')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: itemId, quantity: 2, note: 'M1 kat 1' })
    expect(res.status).toBe(201)
    expect(res.body.quantity).toBe(28)
    const co = db.prepare('SELECT * FROM inventory_checkouts WHERE item_id=? AND staff_id=?').get(itemId, workerId)
    expect(co).toBeTruthy()
    expect(co.quantity).toBe(2)
    const mv = db.prepare("SELECT * FROM stock_movements WHERE item_id=? AND type='out'").get(itemId)
    expect(mv).toBeTruthy()
    const audit = db.prepare("SELECT * FROM audit_log WHERE action='kiosk_avs_inventory_checkout' AND target_id=?").get(itemId)
    expect(audit).toBeTruthy()
  })

  it('yetersiz stok → 400', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Az Stok',1,'adet','housekeeping')`).run()
    const res = await request(app).post('/api/avs-self-service/inventory/checkout')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: item.lastInsertRowid, quantity: 5 })
    expect(res.status).toBe(400)
  })

  it('her kategoriden ürün alınabilir — maintenance dahil (gating yok)', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Teknik Parça',10,'adet','maintenance')`).run()
    const res = await request(app).post('/api/avs-self-service/inventory/checkout')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: item.lastInsertRowid, quantity: 1 })
    expect(res.status).toBe(201)
    expect(res.body.quantity).toBe(9)
  })

  it('geçersiz miktar → 400', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Gecerli Urun',10,'adet','housekeeping')`).run()
    const res = await request(app).post('/api/avs-self-service/inventory/checkout')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: item.lastInsertRowid, quantity: 0 })
    expect(res.status).toBe(400)
  })
})

describe('AVS Self-Service — inventory item locations', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/inventory/items/1/locations')
    expect(res.status).toBe(401)
  })

  it('her ürünün lokasyonları dönebilir — maintenance dahil (gating yok)', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Lokasyon Teknik',5,'adet','maintenance')`).run()
    const res = await request(app).get(`/api/avs-self-service/inventory/items/${item.lastInsertRowid}/locations`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('lokasyon stoğu olan ürün için stoklu lokasyonları döner', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category,track_locations) VALUES('Lokasyonlu',20,'adet','housekeeping',1)`).run()
    const itemId = item.lastInsertRowid
    const loc = db.prepare(`INSERT INTO inventory_locations(name, block) VALUES('Depo A','M1')`).run()
    db.prepare(`INSERT INTO inventory_stock_by_location(item_id, location_id, quantity) VALUES(?,?,?)`)
      .run(itemId, loc.lastInsertRowid, 20)
    const res = await request(app).get(`/api/avs-self-service/inventory/items/${itemId}/locations`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(l => l.name === 'Depo A' && l.quantity === 20)).toBe(true)
  })
})

describe('AVS Self-Service — inventory/my-checkouts', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/inventory/my-checkouts')
    expect(res.status).toBe(401)
  })

  it('worker açık zimmetlerini döner', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Bez',40,'paket','housekeeping')`).run()
    await request(app).post('/api/avs-self-service/inventory/checkout')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: item.lastInsertRowid, quantity: 3 })
    const res = await request(app).get('/api/avs-self-service/inventory/my-checkouts')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(c => c.item_name === 'Bez' && c.quantity === 3)).toBe(true)
  })
})

describe('AVS Self-Service — my-info inventory_category', () => {
  it('Temizlik worker my-info → inventory_category=housekeeping', async () => {
    const res = await request(app).get('/api/avs-self-service/my-info')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.inventory_category).toBe('housekeeping')
  })
})

describe('AVS Self-Service — notifications feed', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/notifications')
    expect(res.status).toBe(401)
  })

  it('feed: onaylı izin + çözülen arıza + duyuru içerir; unread > 0', async () => {
    const db = getDB()
    // Onaylanmış izin kararı
    db.prepare(`INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, status, approved_at)
      VALUES(?, 'annual', '2026-09-01', '2026-09-03', 3, 'approved', datetime('now'))`).run(workerId)
    // Worker'ın bildirdiği, çözülmüş (done) arıza
    const m = db.prepare(`INSERT INTO maintenance_requests(location, description, status, priority, closed_at)
      VALUES('Feed Test Konum', 'Feed testi arıza', 'done', 'medium', datetime('now'))`).run()
    db.prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_maintenance', 'avs-self-service', ?, ?)`)
      .run(m.lastInsertRowid, JSON.stringify({ workerId }))

    const res = await request(app).get('/api/avs-self-service/notifications')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    const kinds = res.body.items.map(i => i.kind)
    expect(kinds).toContain('leave')
    expect(kinds).toContain('maintenance')
    expect(kinds).toContain('announcement')
    expect(res.body.items.some(i => i.kind === 'leave' && i.status === 'approved')).toBe(true)
    expect(res.body.items.some(i => i.kind === 'maintenance' && i.location === 'Feed Test Konum')).toBe(true)
    expect(res.body.unread).toBeGreaterThan(0)
    // pending izin (kullanıcının kendi oluşturduğu) feed'e girmez
    expect(res.body.items.some(i => i.kind === 'leave' && i.status === 'pending')).toBe(false)
  })

  it('seen → unread 0; sonra gelen yeni olay tekrar unread yapar', async () => {
    const seen = await request(app).post('/api/avs-self-service/notifications/seen')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(seen.status).toBe(200)

    let res = await request(app).get('/api/avs-self-service/notifications')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.body.unread).toBe(0)

    // seen'den sonraki bir duyuru (gelecek timestamp → kesinlikle seen_at'ten yeni)
    getDB().prepare(`INSERT INTO announcements(title, body, created_at)
      VALUES('Seen Sonrası Duyuru', 'x', datetime('now', '+1 hour'))`).run()

    res = await request(app).get('/api/avs-self-service/notifications')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.body.unread).toBeGreaterThanOrEqual(1)
    expect(res.body.items[0].kind).toBe('announcement') // en yeni en üstte
  })
})

describe('AVS Self-Service — web-push (opt-in)', () => {
  const sub = { endpoint: 'https://push.example/ep-test', keys: { p256dh: 'p256', auth: 'authk' } }

  it('AVS token olmadan subscribe 401', async () => {
    const res = await request(app).post('/api/avs-self-service/push/subscribe').send(sub)
    expect(res.status).toBe(401)
  })

  it('VAPID yapılandırılmamışsa vapid-public-key 503', async () => {
    const res = await request(app).get('/api/avs-self-service/push/vapid-public-key')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(503)
  })

  it('geçerli subscribe 201 → avs_push_subscriptions worker_id ile kaydeder', async () => {
    const res = await request(app).post('/api/avs-self-service/push/subscribe')
      .set('Authorization', `Bearer ${avsToken}`).send(sub)
    expect(res.status).toBe(201)
    const row = getDB().prepare('SELECT worker_id FROM avs_push_subscriptions WHERE endpoint=?').get(sub.endpoint)
    expect(row).toBeTruthy()
    expect(row.worker_id).toBe(workerId)
  })

  it('eksik keys 400', async () => {
    const res = await request(app).post('/api/avs-self-service/push/subscribe')
      .set('Authorization', `Bearer ${avsToken}`).send({ endpoint: 'https://x/y' })
    expect(res.status).toBe(400)
  })

  it('unsubscribe → kayıt silinir', async () => {
    const res = await request(app).post('/api/avs-self-service/push/unsubscribe')
      .set('Authorization', `Bearer ${avsToken}`).send({ endpoint: sub.endpoint })
    expect(res.status).toBe(200)
    const row = getDB().prepare('SELECT id FROM avs_push_subscriptions WHERE endpoint=?').get(sub.endpoint)
    expect(row).toBeUndefined()
  })
})

describe('AVS Self-Service — my-cards (ayrı giriş/yemek kartı)', () => {
  it('token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/my-cards')
    expect(res.status).toBe(401)
  })

  it('access + meal kartını döner (eksikse lazy üretir)', async () => {
    const res = await request(app).get('/api/avs-self-service/my-cards')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.cards)).toBe(true)
    const byType = Object.fromEntries(res.body.cards.map(c => [c.card_type, c]))
    expect(byType.access?.code).toMatch(/^AVS-A:/)
    expect(byType.meal?.code).toMatch(/^AVS-M:/)
  })

  it('ikinci çağrıda aynı kodları döner (yeniden üretmez)', async () => {
    const r1 = await request(app).get('/api/avs-self-service/my-cards').set('Authorization', `Bearer ${avsToken}`)
    const r2 = await request(app).get('/api/avs-self-service/my-cards').set('Authorization', `Bearer ${avsToken}`)
    const code1 = r1.body.cards.find(c => c.card_type === 'access').code
    const code2 = r2.body.cards.find(c => c.card_type === 'access').code
    expect(code2).toBe(code1)
  })
})

describe('AVS kiosk — ertesi-gün öğün seçimi (Faz 8b)', () => {
  it('PUT my-meal-selection kaydeder, GET yansıtır', async () => {
    const put = await request(app).put('/api/avs-self-service/my-meal-selection')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ meal_date: '2026-12-05', meal_type: 'lunch', attending: true })
    expect(put.status).toBe(200)
    const get = await request(app).get('/api/avs-self-service/my-meal-selection?date=2026-12-05')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(get.status).toBe(200)
    expect(get.body.selections.lunch).toBe(1)
  })

  it('attending=false → 0 olarak güncellenir (upsert)', async () => {
    await request(app).put('/api/avs-self-service/my-meal-selection').set('Authorization', `Bearer ${avsToken}`)
      .send({ meal_date: '2026-12-06', meal_type: 'dinner', attending: true })
    await request(app).put('/api/avs-self-service/my-meal-selection').set('Authorization', `Bearer ${avsToken}`)
      .send({ meal_date: '2026-12-06', meal_type: 'dinner', attending: false })
    const get = await request(app).get('/api/avs-self-service/my-meal-selection?date=2026-12-06')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(get.body.selections.dinner).toBe(0)
  })

  it('geçersiz meal_type 400', async () => {
    const r = await request(app).put('/api/avs-self-service/my-meal-selection')
      .set('Authorization', `Bearer ${avsToken}`).send({ meal_date: '2026-12-05', meal_type: 'brunch' })
    expect(r.status).toBe(400)
  })
})
