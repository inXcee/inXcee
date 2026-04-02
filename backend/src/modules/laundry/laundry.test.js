import { describe, it, test, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { batchAssignService, batchLostService, advanceItemService, createVerificationService } from './service.js'
import * as q from './queries.js'
const { archiveItemsQuery } = q

let token, userId, roomId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })
  token = r.body.token
  const db = getDB()
  userId = db.prepare("SELECT id FROM users WHERE role='laundry' LIMIT 1").get().id
  roomId = db.prepare("SELECT id FROM rooms LIMIT 1").get().id
})

describe('Laundry queries', () => {
  it('item oluşturur ve geri okur', async () => {
    const { insertItemQuery, getItemQuery } = await import('./queries.js')
    const id = insertItemQuery({ room_id: roomId, item_count: 3, notes: 'test', created_by: userId })
    expect(id).toBeTruthy()
    const item = getItemQuery(id)
    expect(item.status).toBe('dirty')
    expect(item.item_count).toBe(3)
    expect(item.room_no).toBeTruthy()
  })

  it('item listeler ve filtreler', async () => {
    const { listItemsQuery } = await import('./queries.js')
    const all = listItemsQuery()
    expect(all.length).toBeGreaterThan(0)
    expect(all[0]).toHaveProperty('hours_in_status')
    const dirty = listItemsQuery({ status: 'dirty' })
    expect(dirty.every(i => i.status === 'dirty')).toBe(true)
  })

  it('makine CRUD çalışıyor', async () => {
    const { listMachinesQuery, getMachineQuery, insertMachineQuery, updateMachineQuery } = await import('./queries.js')
    const machines = listMachinesQuery()
    expect(machines.length).toBe(4)
    const newId = insertMachineQuery({ name: 'Test Makine', type: 'washer', capacity_kg: 5 })
    const m = getMachineQuery(newId)
    expect(m.name).toBe('Test Makine')
    updateMachineQuery(newId, { status: 'running' })
    expect(getMachineQuery(newId).status).toBe('running')
  })

  it('SLA config varsayılan değerlerle döner', async () => {
    const { getSlaConfigQuery } = await import('./queries.js')
    const configs = getSlaConfigQuery()
    expect(configs.length).toBe(3)
    const dirty = configs.find(c => c.stage === 'dirty')
    expect(dirty.warning_hours).toBe(24)
    expect(dirty.critical_hours).toBe(48)
  })

  it('queue — sıraya ekler ve pozisyon doğru', async () => {
    const { insertItemQuery, addToQueueQuery, getQueueQuery, removeFromQueueQuery } = await import('./queries.js')
    const id1 = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
    const id2 = insertItemQuery({ room_id: roomId, item_count: 1, urgent: 1, created_by: userId })
    addToQueueQuery({ item_id: id1, priority: 'normal' })
    addToQueueQuery({ item_id: id2, priority: 'urgent' })
    const queue = getQueueQuery()
    expect(queue[0].priority).toBe('urgent')
    removeFromQueueQuery(queue[0].id)
  })

  it('damage — hasar kaydı oluşturur', async () => {
    const { insertItemQuery, insertDamageQuery, getDamagesForItemQuery } = await import('./queries.js')
    const itemId = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
    insertDamageQuery({ item_id: itemId, description: 'Leke var', reported_by: userId })
    const damages = getDamagesForItemQuery(itemId)
    expect(damages.length).toBe(1)
    expect(damages[0].description).toBe('Leke var')
  })

  it('stats — istatistik sorgusu hata vermez', async () => {
    const { getStatsQuery } = await import('./queries.js')
    const stats = getStatsQuery({})
    expect(stats).toHaveProperty('by_status')
    expect(stats).toHaveProperty('delivered_today')
    expect(stats).toHaveProperty('avg_hours')
    expect(stats).toHaveProperty('sla_violations')
    const filtered = getStatsQuery({ from_date: '2026-01-01', to_date: '2026-12-31' })
    expect(filtered).toHaveProperty('by_status')
  })

  it('getStatsQuery includes weekly_trend array', async () => {
    const { getStatsQuery } = await import('./queries.js')
    const stats = getStatsQuery()
    expect(stats).toHaveProperty('weekly_trend')
    expect(Array.isArray(stats.weekly_trend)).toBe(true)
  })

  it('history — kayıt geçmişi eklenir ve okunur', async () => {
    const { insertItemQuery, insertHistoryQuery, getItemHistoryQuery } = await import('./queries.js')
    const itemId = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: null, to_status: 'dirty', action_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: 'dirty', to_status: 'washing', action_by: userId })
    const history = getItemHistoryQuery(itemId)
    expect(history.length).toBe(2)
    expect(history[0].to_status).toBe('dirty')
  })

  it('history — delivered satırında signature_data ve delivered_to gelir', async () => {
    const { insertItemQuery, insertHistoryQuery, getItemHistoryQuery, insertDeliveryQuery } = await import('./queries.js')
    const itemId = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: null, to_status: 'dirty', action_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: 'dirty', to_status: 'delivered', action_by: userId })
    insertDeliveryQuery({ item_id: itemId, delivered_to: 'Ahmet Yılmaz', signature_data: 'data:image/png;base64,abc', delivered_by: userId })
    const history = getItemHistoryQuery(itemId)
    const deliveredRow = history.find(h => h.to_status === 'delivered')
    expect(deliveredRow).toBeDefined()
    expect(deliveredRow.delivered_to).toBe('Ahmet Yılmaz')
    expect(deliveredRow.signature_data).toBe('data:image/png;base64,abc')
  })

  it('history — delivered_to sadece delivered satırında dolu, dirty satırında NULL', async () => {
    const { insertItemQuery, insertHistoryQuery, getItemHistoryQuery, insertDeliveryQuery } = await import('./queries.js')
    const itemId = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: null, to_status: 'dirty', action_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: 'dirty', to_status: 'washing', action_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: 'washing', to_status: 'delivered', action_by: userId })
    insertDeliveryQuery({ item_id: itemId, delivered_to: 'Test Kişi', signature_data: 'data:image/png;base64,xyz', delivered_by: userId })
    const history = getItemHistoryQuery(itemId)
    expect(history.length).toBe(3)
    const dirtyRow = history.find(h => h.to_status === 'dirty')
    const deliveredRow = history.find(h => h.to_status === 'delivered')
    expect(dirtyRow.delivered_to).toBeNull()
    expect(deliveredRow.delivered_to).toBe('Test Kişi')
    expect(deliveredRow.signature_data).toBe('data:image/png;base64,xyz')
  })

  it('intake_name ve clothing_items ile item oluşturur', async () => {
    const { insertItemQuery, getItemQuery } = await import('./queries.js')
    const clothing = [{ type: 'Tişört', color: 'Beyaz', qty: 2 }, { type: 'Pantolon', color: 'Siyah', qty: 1 }]
    const id = insertItemQuery({
      room_id: roomId, item_count: 3, created_by: userId,
      intake_name: 'Ahmet Yılmaz',
      intake_signature: 'data:image/png;base64,abc123',
      clothing_items: clothing,
    })
    const item = getItemQuery(id)
    expect(item.intake_name).toBe('Ahmet Yılmaz')
    expect(item.intake_signature).toBeTruthy()
    expect(JSON.parse(item.clothing_items)).toHaveLength(2)
    expect(JSON.parse(item.clothing_items)[0].type).toBe('Tişört')
  })

  it('room_active_count doğru sayıyı döner', async () => {
    const { insertItemQuery, listItemsQuery } = await import('./queries.js')
    const r2 = getDB().prepare('SELECT id FROM rooms LIMIT 1 OFFSET 1').get()
    const rid = r2?.id || roomId
    insertItemQuery({ room_id: rid, item_count: 1, created_by: userId })
    insertItemQuery({ room_id: rid, item_count: 1, created_by: userId })
    const items = listItemsQuery({ status: 'dirty' })
    const roomItems = items.filter(i => i.room_id === rid)
    if (roomItems.length >= 2) {
      expect(roomItems[0].room_active_count).toBeGreaterThanOrEqual(2)
    }
  })

  it('getPersonHistoryQuery — kişi geçmişi döner', async () => {
    const { insertItemQuery, getPersonHistoryQuery } = await import('./queries.js')
    insertItemQuery({ room_id: roomId, item_count: 2, intake_name: 'Test Kişi', created_by: userId })
    insertItemQuery({ room_id: roomId, item_count: 1, intake_name: 'Test Kişi', created_by: userId })
    const history = getPersonHistoryQuery('Test Kişi')
    expect(history.length).toBeGreaterThanOrEqual(2)
  })

  it('markFoundQuery — lost → ready geçişi yapar', async () => {
    const { insertItemQuery, markFoundQuery, getItemQuery } = await import('./queries.js')
    const id = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
    // Manuel lost yap
    getDB().prepare("UPDATE laundry_items SET status='lost' WHERE id=?").run(id)
    markFoundQuery(id, userId)
    const item = getItemQuery(id)
    expect(item.status).toBe('ready')
  })

  it('makine total_runs timer başlatınca artar', async () => {
    const { listMachinesQuery, updateMachineQuery, getMachineQuery } = await import('./queries.js')
    const machines = listMachinesQuery()
    const m = machines[0]
    const before = m.total_runs ?? 0
    const timerEnd = new Date(Date.now() + 60 * 60000).toISOString()
    updateMachineQuery(m.id, { status: 'running', timer_end: timerEnd, increment_runs: true })
    const after = getMachineQuery(m.id)
    expect(after.total_runs).toBe(before + 1)
  })

  it('listItemsQuery washing items include timer_end field', async () => {
    const db = getDB()
    const { listItemsQuery, updateItemStatusQuery, insertItemQuery } = await import('./queries.js')
    const machine = db.prepare("INSERT INTO laundry_machines(name, type) VALUES('W1','washer')").run()
    const room = db.prepare("INSERT INTO rooms(block, floor, room_no, capacity, active_beds) VALUES('T',1,'101',4,4)").run()
    const itemId = insertItemQuery({ room_id: room.lastInsertRowid, item_count: 1, created_by: 1 })
    updateItemStatusQuery(itemId, 'washing', { machine_id: machine.lastInsertRowid })
    db.prepare("UPDATE laundry_machines SET status='running', timer_end=datetime('now','+60 minutes') WHERE id=?").run(machine.lastInsertRowid)
    const items = listItemsQuery({ status: 'washing' })
    const found = items.find(i => i.id === itemId)
    expect(found).toBeDefined()
    expect(found).toHaveProperty('timer_end')
    expect(found.timer_end).not.toBeNull()
  })
})

describe('State machine', () => {
  let itemId

  it('yeni item oluşturur (dirty)', async () => {
    const res = await request(app)
      .post('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: roomId, item_count: 2, notes: 'state test' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('dirty')
    itemId = res.body.id
  })

  it('dirty → washing: machine_id olmadan REJECT', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Makine')
  })

  it('dirty → washing: machine_id ile OK', async () => {
    const db = getDB()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ machine_id: machine.id })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('washing')
    const m = db.prepare('SELECT status FROM laundry_machines WHERE id=?').get(machine.id)
    expect(m.status).toBe('running')
  })

  it('dirty → washing: timer_minutes verilince machine.timer_end set edilir', async () => {
    const db = getDB()
    // Yeni bir item oluştur
    const itemRes = await request(app)
      .post('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: roomId, item_count: 1, notes: 'timer test' })
    expect(itemRes.status).toBe(201)
    const newItemId = itemRes.body.id

    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()
    const before = new Date()

    const res = await request(app)
      .patch(`/api/laundry/items/${newItemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ machine_id: machine.id, timer_minutes: 45 })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('washing')

    const m = db.prepare('SELECT timer_end, timer_started_at FROM laundry_machines WHERE id=?').get(machine.id)
    expect(m.timer_end).toBeTruthy()
    expect(m.timer_started_at).toBeTruthy()

    const timerEnd = new Date(m.timer_end)
    const timerStarted = new Date(m.timer_started_at)
    const diffMinutes = (timerEnd - timerStarted) / 60000
    expect(Math.round(diffMinutes)).toBe(45)
    expect(timerStarted.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('washing → ready: shelf_location ile OK', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shelf_location: '2. Kat Raf A' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
    expect(res.body.shelf_location).toBe('2. Kat Raf A')
  })

  it('ready → delivered: isim olmadan REJECT', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/deliver`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('zorunlu')
  })

  it('ready → delivered: isim ile OK', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/deliver`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delivered_to: 'Ahmet Yılmaz' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('delivered')
  })

  it('delivered itemdan advance REJECT', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('herhangi durumdan → lost', async () => {
    const create = await request(app)
      .post('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: roomId, item_count: 1 })
    const res = await request(app)
      .patch(`/api/laundry/items/${create.body.id}/lost`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Bulunamadı' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('lost')
  })

  it('sadece dirty olan silinebilir', async () => {
    const create = await request(app)
      .post('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: roomId, item_count: 1 })
    const del = await request(app)
      .delete(`/api/laundry/items/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })

  it('toplu teslim çalışıyor', async () => {
    const ids = []
    for (let i = 0; i < 2; i++) {
      const c = await request(app).post('/api/laundry/items').set('Authorization', `Bearer ${token}`).send({ room_id: roomId, item_count: 1 })
      const db = getDB()
      const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()
      if (machine) {
        await request(app).patch(`/api/laundry/items/${c.body.id}/advance`).set('Authorization', `Bearer ${token}`).send({ machine_id: machine.id })
        await request(app).patch(`/api/laundry/items/${c.body.id}/advance`).set('Authorization', `Bearer ${token}`).send({ shelf_location: 'Raf' })
        ids.push(c.body.id)
      }
    }
    if (ids.length >= 2) {
      const res = await request(app)
        .post('/api/laundry/items/batch-deliver')
        .set('Authorization', `Bearer ${token}`)
        .send({ item_ids: ids, delivered_to: 'Mehmet Kaya' })
      expect(res.status).toBe(200)
      expect(res.body.delivered).toBe(ids.length)
    }
  })
})

describe('Laundry routes — yetki kontrolleri', () => {
  it('401 — token yok', async () => {
    const res = await request(app).get('/api/laundry/items')
    expect(res.status).toBe(401)
  })

  it('403 — teknik rolü items göremez', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })
    const res = await request(app)
      .get('/api/laundry/items')
      .set('Authorization', `Bearer ${r.body.token}`)
    expect(res.status).toBe(403)
  })

  it('200 — shift_supervisor items listesi görür (sadece okuma)', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
    const list = await request(app)
      .get('/api/laundry/items')
      .set('Authorization', `Bearer ${r.body.token}`)
    expect(list.status).toBe(200)
    const create = await request(app)
      .post('/api/laundry/items')
      .set('Authorization', `Bearer ${r.body.token}`)
      .send({ room_id: roomId, item_count: 1 })
    expect(create.status).toBe(403)
  })

  it('200 — laundry rolü items listesi + CRUD tam yetki', async () => {
    const list = await request(app)
      .get('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body)).toBe(true)
  })

  it('200 — machines listesi', async () => {
    const res = await request(app)
      .get('/api/laundry/machines')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('200 — queue listesi', async () => {
    const res = await request(app)
      .get('/api/laundry/queue')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('200 — SLA config', async () => {
    const res = await request(app)
      .get('/api/laundry/sla-config')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(3)
  })

  it('200 — reports stats', async () => {
    const res = await request(app)
      .get('/api/laundry/reports/stats')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('by_status')
  })

  it('CSV export indirilebilir', async () => {
    const res = await request(app)
      .get('/api/laundry/reports/export')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
  })
})

describe('SLA engine', () => {
  it('checkSlaViolations hata vermez', async () => {
    const { checkSlaViolations } = await import('./sla.js')
    const count = checkSlaViolations()
    expect(typeof count).toBe('number')
  })

  it('checkMachineTimers hata vermez', async () => {
    const { checkMachineTimers } = await import('./sla.js')
    const count = checkMachineTimers()
    expect(typeof count).toBe('number')
  })

  it('checkMachineMaintenanceAlerts does not throw', async () => {
    const { checkMachineMaintenanceAlerts } = await import('./sla.js')
    getDB().prepare("INSERT INTO laundry_machines(name, type, total_runs) VALUES('W99','washer',55)").run()
    expect(() => checkMachineMaintenanceAlerts()).not.toThrow()
  })

  it('süresi dolan makine done olur', async () => {
    const db = getDB()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()
    if (machine) {
      db.prepare("UPDATE laundry_machines SET status='running', timer_end=datetime('now','-1 minute') WHERE id=?").run(machine.id)
      const { checkMachineTimers } = await import('./sla.js')
      const count = checkMachineTimers()
      expect(count).toBeGreaterThan(0)
      const m = db.prepare('SELECT status FROM laundry_machines WHERE id=?').get(machine.id)
      expect(m.status).toBe('done')
      db.prepare("UPDATE laundry_machines SET status='idle', timer_end=NULL WHERE id=?").run(machine.id)
    }
  })
})

describe('WhatsApp', () => {
  it('WHATSAPP_TOKEN olmadan hata vermiyor', async () => {
    delete process.env.WHATSAPP_TOKEN
    delete process.env.WHATSAPP_PHONE_ID
    const { notifyItemReady } = await import('./whatsapp.js')
    await expect(notifyItemReady(999)).resolves.toBeUndefined()
  })
})

describe('batch-assign', () => {
  test('birden fazla dirty item tek makinaya atanır', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()

    const id1 = q.insertItemQuery({ room_id: room.id, item_count: 2, created_by: 1 })
    const id2 = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })

    const result = batchAssignService([id1, id2], machine.id, null, 1)
    expect(result.success).toHaveLength(2)
    expect(result.failed).toHaveLength(0)

    const item1 = q.getItemQuery(id1)
    expect(item1.status).toBe('washing')
    expect(item1.machine_id).toBe(machine.id)
  })

  test('maintenance makinaya assign reddedilir', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    db.prepare("INSERT INTO laundry_machines(name,type,status) VALUES('TestM','washer','maintenance')").run()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='maintenance' LIMIT 1").get()
    const id1 = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })

    const result = batchAssignService([id1], machine.id, null, 1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].error).toMatch(/bakımda|maintenance/i)
  })
})

describe('batch-lost', () => {
  test('dirty/washing/ready itemlar kayıp işaretlenir', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id1 = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })
    const id2 = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })

    const result = batchLostService([id1, id2], 'test notu', 1)
    expect(result.success).toHaveLength(2)
    expect(q.getItemQuery(id1).status).toBe('lost')
  })

  test('delivered item kayıp işaretlenemez', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id1 = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })
    db.prepare("UPDATE laundry_items SET status='delivered' WHERE id=?").run(id1)

    const result = batchLostService([id1], null, 1)
    expect(result.failed).toHaveLength(1)
  })
})

describe('ironing state machine', () => {
  test('needs_ironing=1 ise washing→ironing geçişi yapılır', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    db.prepare("INSERT INTO laundry_machines(name,type,status) VALUES('IronM1','washer','idle')").run()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()

    const id = q.insertItemQuery({ room_id: room.id, item_count: 2, needs_ironing: 1, created_by: 1 })
    advanceItemService(id, { machine_id: machine.id }, 1)
    advanceItemService(id, {}, 1)
    const item = q.getItemQuery(id)
    expect(item.status).toBe('ironing')
  })

  test('needs_ironing=0 ise washing→ready normal akış', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    db.prepare("INSERT INTO laundry_machines(name,type,status) VALUES('IronM2','washer','idle')").run()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()

    const id = q.insertItemQuery({ room_id: room.id, item_count: 1, needs_ironing: 0, created_by: 1 })
    advanceItemService(id, { machine_id: machine.id }, 1)
    advanceItemService(id, { shelf_location: 'B2' }, 1)
    expect(q.getItemQuery(id).status).toBe('ready')
  })

  test('ironing → ready geçişi advanceItemService ile yapılır', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    db.prepare("INSERT INTO laundry_machines(name,type,status) VALUES('IronM3','washer','idle')").run()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()

    const id = q.insertItemQuery({ room_id: room.id, item_count: 1, needs_ironing: 1, created_by: 1 })
    advanceItemService(id, { machine_id: machine.id }, 1)
    advanceItemService(id, {}, 1) // washing → ironing
    advanceItemService(id, {}, 1) // ironing → ready
    expect(q.getItemQuery(id).status).toBe('ready')
  })
})

describe('verification', () => {
  test('washing_to_ready aşaması kaydedilir', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id = q.insertItemQuery({ room_id: room.id, item_count: 2, created_by: 1 })

    const items = [
      { name: 'Gömlek', count: 1, checked: true },
      { name: 'Pantolon', count: 1, checked: true },
    ]
    const result = createVerificationService(id, {
      stage: 'washing_to_ready',
      items,
      all_present: true,
      missing_notes: null,
    }, 'test_user')

    expect(result.all_present).toBe(1)
    expect(result.item_id).toBe(id)
  })

  test('aynı item+stage için ikinci kayıt hata verir', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })
    const payload = { stage: 'washing_to_ready', items: [{ name: 'X', count: 1, checked: true }], all_present: true, missing_notes: null }
    createVerificationService(id, payload, 'user1')
    expect(() => createVerificationService(id, payload, 'user1')).toThrow()
  })

  test('eksik parça varsa missing_notes zorunlu', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id = q.insertItemQuery({ room_id: room.id, item_count: 2, created_by: 1 })
    expect(() => createVerificationService(id, {
      stage: 'washing_to_ready',
      items: [{ name: 'A', count: 1, checked: false }],
      all_present: false,
      missing_notes: null,
    }, 'user1')).toThrow(/not.*zorunlu/i)
  })
})

describe('archive', () => {
  test('delivered itemlar listelenir', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })
    db.prepare("UPDATE laundry_items SET status='delivered' WHERE id=?").run(id)

    const result = archiveItemsQuery({})
    expect(result.items.some(i => i.id === id)).toBe(true)
  })

  test('tarih filtresi çalışır', () => {
    const result = archiveItemsQuery({ from: '2020-01-01', to: '2020-01-02' })
    expect(Array.isArray(result.items)).toBe(true)
  })

  test('pagination çalışır', () => {
    const r1 = archiveItemsQuery({ page: 1, limit: 2 })
    expect(r1.items.length).toBeLessThanOrEqual(2)
    expect(typeof r1.total).toBe('number')
  })
})
