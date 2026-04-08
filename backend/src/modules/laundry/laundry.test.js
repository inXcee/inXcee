import { describe, it, test, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { batchAssignService, batchLostService, advanceItemService, createVerificationService, getSettingsService, updateSettingService, sendMessageService, getMessagesService, deleteMessageService, createItemService, getBlockConfigService, upsertBlockConfigService, addPremiumGarmentsService, getPremiumGarmentsService, advancePremiumGarmentService, bulkAdvancePremiumGarmentsService, syncParentStatusService, deliverPremiumGarmentService, bulkDeliverPremiumGarmentsService, getPremiumDeliveryReceiptService, searchPremiumGarmentsService, getRoomGarmentHistoryService, getPremiumReportService, exportPremiumGarmentsService, getRoomGarmentsForScanService, scanActionService, revertItemService, lostItemService, reportDamageService, deleteDamageService, deliverItemService } from './service.js'
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

  it('listItemsQuery returns premium_garment_count field', async () => {
    const { listItemsQuery, insertItemQuery, insertPremiumGarmentsQuery } = await import('./queries.js')

    // Insert a new item
    const itemId = insertItemQuery({ room_id: 1, item_count: 1, intake_name: 'PremTest' })

    // Before any premium garments: count should be 0
    let items = listItemsQuery({ status: 'dirty' })
    const before = items.find(i => i.id === itemId)
    expect(before).toBeTruthy()
    expect(before.premium_garment_count).toBe(0)

    // After adding a premium garment: count should be 1
    insertPremiumGarmentsQuery(itemId, [{ garment_type: 'Pantolon', brand: null, model: null, size: null, color: null, pattern: null, condition_notes: null }])
    items = listItemsQuery({ status: 'dirty' })
    const after = items.find(i => i.id === itemId)
    expect(after.premium_garment_count).toBe(1)
  })

  it('listItemsQuery search filters by intake_name', async () => {
    const { listItemsQuery, insertItemQuery } = await import('./queries.js')

    // Insert items with distinct intake names
    const uniqueName = 'TestSearchName_' + Date.now()
    const itemId = insertItemQuery({ room_id: 1, item_count: 1, intake_name: uniqueName })

    // Search by intake_name should find the item
    const results = listItemsQuery({ search: uniqueName })
    const found = results.find(i => i.id === itemId)
    expect(found).toBeDefined()

    // Search with partial name should also work
    const partialResults = listItemsQuery({ search: 'TestSearchName' })
    const foundPartial = partialResults.find(i => i.id === itemId)
    expect(foundPartial).toBeDefined()
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
    const count = await checkSlaViolations()
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

  it('getSlaPreWarningsQuery — SLA yaklaşan öğeyi döner', async () => {
    const { getSlaPreWarningsQuery } = await import('./queries.js')
    const { insertItemQuery } = await import('./queries.js')
    const db = getDB()
    // Pre-warning varsayılan değerinin 2 olduğunu doğrula
    const config = db.prepare("SELECT pre_warning_hours FROM laundry_sla_config WHERE stage='dirty'").get()
    expect(config.pre_warning_hours).toBe(2)
    // dirty için warning_hours=24, pre_warning_hours=2 (default)
    // 23 saat önce oluşturulmuş item → 24-23=1 saat kaldı → pre_warning penceresinde
    const id = insertItemQuery({ room_id: roomId, item_count: 1 })
    db.prepare("UPDATE laundry_items SET updated_at=datetime('now','-23 hours') WHERE id=?").run(id)
    const result = getSlaPreWarningsQuery()
    expect(result.some(v => v.id === id)).toBe(true)
    // Henüz gerçek ihlal değil
    const { getSlaViolationsQuery } = await import('./queries.js')
    const violations = getSlaViolationsQuery()
    expect(violations.some(v => v.id === id)).toBe(false)
  })

  it('checkSlaPreWarnings — bildirim oluşturur ve aynı gün tekrar göndermez', async () => {
    const { checkSlaPreWarnings } = await import('./sla.js')
    const db = getDB()

    // dirty item, 23 saat önce (warning_hours=24 → 1 saat kaldı, pre_warning=2 içinde)
    const itemId = db.prepare(
      'INSERT INTO laundry_items(room_id,item_count,status,created_by) VALUES(?,1,?,?)'
    ).run(roomId, 'dirty', userId).lastInsertRowid
    db.prepare("UPDATE laundry_items SET updated_at=datetime('now','-23 hours') WHERE id=?").run(itemId)

    // Bildirim sayısını kaydet
    const countBefore = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE module='laundry'").get().c

    // İlk çağrı — bildirim oluşturmalı
    checkSlaPreWarnings()
    const countAfter = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE module='laundry'").get().c
    expect(countAfter).toBeGreaterThan(countBefore)

    // Aynı gün ikinci çağrı — dedup yüzünden yeni bildirim oluşturmamalı
    const countAfter2 = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE module='laundry'").get().c
    checkSlaPreWarnings()
    const countAfter3 = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE module='laundry'").get().c
    expect(countAfter3).toBe(countAfter2)

    // Temizlik
    db.prepare('DELETE FROM laundry_items WHERE id=?').run(itemId)
    db.prepare("DELETE FROM laundry_sla_notifications WHERE item_id=?").run(itemId)
  })

  it('checkMachineTimers — tamamlanan makinenin mesajı oda bilgisi içerir', async () => {
    const { checkMachineTimers } = await import('./sla.js')
    const db = getDB()

    // Bir makine oluştur ve timer'ı geçmiş yap
    const machineId = db.prepare(
      "INSERT INTO laundry_machines(name,type,capacity_kg) VALUES('Test W','washer',10)"
    ).run().lastInsertRowid

    // Bu makineye bağlı washing item oluştur
    const itemId = db.prepare(
      'INSERT INTO laundry_items(room_id,item_count,status,machine_id,created_by) VALUES(?,1,?,?,?)'
    ).run(roomId, 'washing', machineId, userId).lastInsertRowid

    db.prepare(
      "UPDATE laundry_machines SET status='running', timer_end=datetime('now','-1 minute') WHERE id=?"
    ).run(machineId)

    checkMachineTimers()

    // Bildirim mesajının oda bilgisi içerip içermediğini kontrol et
    const notif = db.prepare(
      "SELECT * FROM notifications WHERE module='laundry' ORDER BY id DESC LIMIT 1"
    ).get()
    expect(notif.message).toContain('Test W')
    expect(notif.message).toMatch(/[A-Z0-9]+·[0-9]+/) // "BLOK·ODA_NO" formatı

    // Temizlik
    db.prepare('DELETE FROM laundry_items WHERE id=?').run(itemId)
    db.prepare('DELETE FROM laundry_machines WHERE id=?').run(machineId)
  })

  it('checkMachineTimers — total_runs artar', async () => {
    const { checkMachineTimers } = await import('./sla.js')
    const db = getDB()

    const machineId = db.prepare(
      "INSERT INTO laundry_machines(name,type,capacity_kg,total_runs) VALUES('Test W2','washer',10,5)"
    ).run().lastInsertRowid

    db.prepare(
      "UPDATE laundry_machines SET status='running', timer_end=datetime('now','-1 minute') WHERE id=?"
    ).run(machineId)

    checkMachineTimers()

    const m = db.prepare('SELECT * FROM laundry_machines WHERE id=?').get(machineId)
    expect(m.total_runs).toBe(6)

    // Temizlik
    db.prepare('DELETE FROM laundry_machines WHERE id=?').run(machineId)
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

describe('laundry_global_settings', () => {
  test('setting kaydedilir ve okunur', () => {
    updateSettingService('test_key', 'hello')
    const settings = getSettingsService()
    expect(settings.test_key).toBe('hello')
  })

  test('setting güncellenir', () => {
    updateSettingService('test_key', 'world')
    const settings = getSettingsService()
    expect(settings.test_key).toBe('world')
  })

  test('sla_config whatsapp_notify kolonu var', () => {
    const db = getDB()
    const cols = db.prepare('PRAGMA table_info(laundry_sla_config)').all().map(c => c.name)
    expect(cols).toContain('whatsapp_notify')
  })

  test('shared_notes backend sync: kaydedilir ve okunur', () => {
    updateSettingService('shared_notes', 'test notu')
    const settings = getSettingsService()
    expect(settings.shared_notes).toBe('test notu')
  })

  test('clothing_types backend sync: JSON kaydedilir ve okunur', () => {
    const types = ['Pantolon', 'Gömlek', 'Özel Tip']
    updateSettingService('clothing_types', JSON.stringify(types))
    const settings = getSettingsService()
    const parsed = JSON.parse(settings.clothing_types)
    expect(parsed).toContain('Özel Tip')
    expect(parsed).toHaveLength(3)
  })
})

describe('laundry_messages', () => {
  let msgUser

  beforeAll(() => {
    const db = getDB()
    msgUser = db.prepare("SELECT * FROM users WHERE role='laundry' LIMIT 1").get()
  })

  test('sendMessageService mesajı kaydeder, getMessagesService döner', () => {
    const msg = sendMessageService({ message: 'Test mesajı' }, msgUser)
    expect(msg.id).toBeTruthy()
    expect(msg.message).toBe('Test mesajı')
    expect(msg.message_type).toBe('normal')
    const list = getMessagesService()
    expect(list.some(m => m.id === msg.id)).toBe(true)
  })

  test('message_type urgent gönderilince kayıt doğru tipi taşır', () => {
    const msg = sendMessageService({ message: 'Acil durum!', message_type: 'urgent' }, msgUser)
    expect(msg.message_type).toBe('urgent')
  })

  test('kendi olmayan mesajı laundry rolü silmeye çalışırsa 403', () => {
    const db = getDB()
    const otherUser = db.prepare("SELECT * FROM users WHERE role='campus_manager' LIMIT 1").get()
    const msg = sendMessageService({ message: 'manager mesajı' }, otherUser)
    expect(() => deleteMessageService(msg.id, msgUser)).toThrow('Yetkisiz')
  })
})

describe('premium blok altyapısı', () => {
  test('laundry_block_config tablosu oluşur, A1 premium=1 varsayılan', () => {
    const blocks = getBlockConfigService()
    const a1 = blocks.find(b => b.block === 'A1')
    expect(a1).toBeTruthy()
    expect(a1.is_premium).toBe(1)
    const m = blocks.find(b => b.block === 'M')
    expect(m.is_premium).toBe(0)
  })

  test('upsertBlockConfigQuery premium değerini günceller', () => {
    const db = getDB()
    const admin = db.prepare("SELECT id FROM users WHERE role='campus_manager' LIMIT 1").get()
    upsertBlockConfigService('M', 1, admin.id)
    const blocks = getBlockConfigService()
    expect(blocks.find(b => b.block === 'M').is_premium).toBe(1)
    // Geri al
    upsertBlockConfigService('M', 0, admin.id)
  })

  test('createItemService — premium odada is_premium=1 set edilir', () => {
    const db = getDB()
    // A1 bloku premium — A1 bloğunda oda ara
    const room = db.prepare("SELECT id FROM rooms WHERE block='A1' LIMIT 1").get()
    if (!room) return // seed'de A1 bloğu yoksa skip
    const admin = db.prepare("SELECT id FROM users WHERE role='campus_manager' LIMIT 1").get()
    const item = createItemService({ room_id: room.id, item_count: 1 }, admin.id)
    expect(item.is_premium).toBe(1)
  })
})

describe('premium garment CRUD', () => {
  let premiumItemId, adminUser

  beforeAll(() => {
    const db = getDB()
    adminUser = db.prepare("SELECT * FROM users WHERE role='campus_manager' LIMIT 1").get()
    // Premium oda (A1 bloğu)
    const room = db.prepare("SELECT id FROM rooms WHERE block='A1' LIMIT 1").get()
    if (room) {
      const item = createItemService({ room_id: room.id, item_count: 3 }, adminUser.id)
      premiumItemId = item.id
    }
  })

  test('insertPremiumGarmentsQuery — 3 parça, A*-001/002/003 kodları üretilir', () => {
    if (!premiumItemId) return
    const { codes } = addPremiumGarmentsService(premiumItemId, [
      { garment_type: 'Gömlek', brand: 'Polo', size: 'L', color: 'Beyaz' },
      { garment_type: 'Pantolon', brand: 'Levi\'s', size: '32' },
      { garment_type: 'T-Shirt' },
    ], adminUser.id)
    expect(codes).toHaveLength(3)
    expect(codes[0]).toMatch(/-001$/)
    expect(codes[1]).toMatch(/-002$/)
    expect(codes[2]).toMatch(/-003$/)
  })

  test('aynı item\'a 2. ekleme yapılınca numara 004\'ten devam eder', () => {
    if (!premiumItemId) return
    const { codes } = addPremiumGarmentsService(premiumItemId, [
      { garment_type: 'Kazak' },
    ], adminUser.id)
    expect(codes[0]).toMatch(/-004$/)
  })

  test('M1 bloğu için de garment eklenebilir (is_premium zorunlu değil)', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms WHERE block='M1' LIMIT 1").get()
    if (!room) return
    const item = createItemService({ room_id: room.id, item_count: 1 }, adminUser.id)
    const { codes } = addPremiumGarmentsService(item.id, [{ garment_type: 'Gömlek' }], adminUser.id)
    expect(codes).toHaveLength(1)
  })

  test('getPremiumGarmentByCodeQuery kodu doğru parçayı döner', () => {
    if (!premiumItemId) return
    const garments = getPremiumGarmentsService(premiumItemId)
    const first = garments[0]
    const { getPremiumGarmentByCodeQuery } = q
    const found = getPremiumGarmentByCodeQuery(first.garment_code)
    expect(found?.id).toBe(first.id)
  })
})

describe('premium garment state machine', () => {
  let itemId, adminUser

  beforeAll(() => {
    const db = getDB()
    adminUser = db.prepare("SELECT * FROM users WHERE role='campus_manager' LIMIT 1").get()
    const room = db.prepare("SELECT id FROM rooms WHERE block='A1' LIMIT 1").get()
    if (room) {
      const item = createItemService({ room_id: room.id, item_count: 2 }, adminUser.id)
      itemId = item.id
      addPremiumGarmentsService(itemId, [
        { garment_type: 'Gömlek' },
        { garment_type: 'Pantolon' },
      ], adminUser.id)
    }
  })

  test('advancePremiumGarmentService received→ironing geçişi yapar', () => {
    if (!itemId) return
    const garments = getPremiumGarmentsService(itemId)
    const g = garments[0]
    expect(g.status).toBe('received')
    const updated = advancePremiumGarmentService(g.id, adminUser.id)
    expect(updated.status).toBe('ironing')
  })

  test('ironing→ready geçişi çalışır', () => {
    if (!itemId) return
    const garments = getPremiumGarmentsService(itemId)
    const ironingG = garments.find(g => g.status === 'ironing')
    if (!ironingG) return
    const updated = advancePremiumGarmentService(ironingG.id, adminUser.id)
    expect(updated.status).toBe('ready')
  })

  test('bulkAdvancePremiumGarmentsService toplu ilerletme yapar', () => {
    if (!itemId) return
    const garments = getPremiumGarmentsService(itemId)
    const receivedIds = garments.filter(g => g.status === 'received').map(g => g.id)
    if (receivedIds.length === 0) return
    bulkAdvancePremiumGarmentsService(itemId, receivedIds, 'ironing', adminUser.id)
    const after = getPremiumGarmentsService(itemId)
    after.filter(g => receivedIds.includes(g.id)).forEach(g => {
      expect(g.status).toBe('ironing')
    })
  })

  test('syncParentStatusService tüm parça ready→parent ready olur', () => {
    if (!itemId) return
    const db = getDB()
    // Tüm garments'ı ready yap
    db.prepare("UPDATE premium_garments SET status='ready' WHERE item_id=?").run(itemId)
    syncParentStatusService(itemId)
    const item = q.getItemQuery(itemId)
    expect(item.status).toBe('ready')
  })
})

describe('premium garment teslim akışı', () => {
  let itemId, adminUser

  beforeAll(() => {
    const db = getDB()
    adminUser = db.prepare("SELECT * FROM users WHERE role='campus_manager' LIMIT 1").get()
    const room = db.prepare("SELECT id FROM rooms WHERE block='A1' LIMIT 1").get()
    if (room) {
      const item = createItemService({ room_id: room.id, item_count: 2 }, adminUser.id)
      itemId = item.id
      addPremiumGarmentsService(itemId, [
        { garment_type: 'Gömlek' },
        { garment_type: 'Pantolon' },
      ], adminUser.id)
      // Her ikisini ready yap
      const garments = getPremiumGarmentsService(itemId)
      for (const g of garments) {
        q.advancePremiumGarmentQuery(g.id, 'ironing', adminUser.id)
        q.advancePremiumGarmentQuery(g.id, 'ready', adminUser.id)
      }
      syncParentStatusService(itemId)
    }
  })

  test('tüm ready garments teslim → parent delivered olur', () => {
    if (!itemId) return
    const garments = getPremiumGarmentsService(itemId)
    const ids = garments.map(g => g.id)
    bulkDeliverPremiumGarmentsService(itemId, ids, { delivered_to: 'Ahmet Yılmaz', signature_data: null }, adminUser.id)
    const item = q.getItemQuery(itemId)
    expect(item.status).toBe('delivered')
    const after = getPremiumGarmentsService(itemId)
    expect(after.every(g => g.status === 'delivered')).toBe(true)
  })

  test('kısmi teslim — sadece seçili garments delivered, parent ready kalır', () => {
    if (!itemId) return
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms WHERE block='M1' LIMIT 1").get()
    if (!room) return
    const item2 = createItemService({ room_id: room.id, item_count: 2 }, adminUser.id)
    addPremiumGarmentsService(item2.id, [
      { garment_type: 'Kazak' },
      { garment_type: 'Mont' },
    ], adminUser.id)
    const garments2 = getPremiumGarmentsService(item2.id)
    for (const g of garments2) {
      q.advancePremiumGarmentQuery(g.id, 'ironing', adminUser.id)
      q.advancePremiumGarmentQuery(g.id, 'ready', adminUser.id)
    }
    syncParentStatusService(item2.id)
    // Sadece ilkini teslim et
    bulkDeliverPremiumGarmentsService(item2.id, [garments2[0].id], { delivered_to: 'Test Kişi' }, adminUser.id)
    const after = getPremiumGarmentsService(item2.id)
    expect(after.find(g => g.id === garments2[0].id).status).toBe('delivered')
    expect(after.find(g => g.id === garments2[1].id).status).toBe('ready')
    expect(q.getItemQuery(item2.id).status).toBe('ready')
  })

  test('getPremiumDeliveryReceiptService doğru garment kodlarını içerir', () => {
    if (!itemId) return
    const receipt = getPremiumDeliveryReceiptService(itemId)
    expect(receipt.item.id).toBe(itemId)
    expect(Array.isArray(receipt.garments)).toBe(true)
    expect(receipt.garments.length).toBeGreaterThan(0)
    expect(receipt.garments[0]).toHaveProperty('garment_code')
    expect(receipt.garments.every(g => g.garment_code.length > 0)).toBe(true)
  })
})

describe('premium garment arama', () => {
  let adminUser, aRoomId

  beforeAll(() => {
    const db = getDB()
    adminUser = db.prepare("SELECT * FROM users WHERE role='campus_manager' LIMIT 1").get()
    const room = db.prepare("SELECT id FROM rooms WHERE block='M1' LIMIT 1").get()
    if (room) {
      aRoomId = room.id
      const item = createItemService({ room_id: room.id, item_count: 3 }, adminUser.id)
      addPremiumGarmentsService(item.id, [
        { garment_type: 'Gömlek', brand: 'Polo', size: 'M', color: 'Beyaz' },
        { garment_type: 'Pantolon', brand: 'Mavi', size: '32' },
        { garment_type: 'Kazak', status: 'lost' },
      ], adminUser.id)
      // 3. parçayı lost yap
      const garments = getPremiumGarmentsService(item.id)
      q.advancePremiumGarmentQuery(garments[2].id, 'lost', adminUser.id)
    }
  })

  test('searchPremiumGarmentsQuery blok filtresi çalışır', () => {
    const result = searchPremiumGarmentsService({ block: 'M1' })
    expect(result.rows.every(g => g.block === 'M1')).toBe(true)
    expect(result.total).toBeGreaterThan(0)
  })

  test('status=lost filtresi sadece kayıpları döner', () => {
    const result = searchPremiumGarmentsService({ status: 'lost' })
    expect(result.rows.every(g => g.status === 'lost')).toBe(true)
    expect(result.total).toBeGreaterThan(0)
  })

  test('getRoomGarmentHistoryQuery belirli oda için çalışır', () => {
    if (!aRoomId) return
    const history = getRoomGarmentHistoryService(aRoomId, {})
    expect(Array.isArray(history)).toBe(true)
    expect(history.length).toBeGreaterThan(0)
    expect(history[0]).toHaveProperty('garment_code')
    expect(history.every(g => g.item_id != null)).toBe(true)
  })

  test('intake_name filtresi çalışır', () => {
    const db = getDB()
    // intake_name ile item oluştur
    const user = db.prepare("SELECT * FROM users WHERE role='campus_manager' LIMIT 1").get()
    const room = db.prepare("SELECT id FROM rooms WHERE block='M1' LIMIT 1").get()
    const item = createItemService({ room_id: room.id, item_count: 1, intake_name: 'Test Kişi' }, user.id)
    addPremiumGarmentsService(item.id, [{ garment_type: 'Gömlek' }], user.id)
    const result = searchPremiumGarmentsService({ intake_name: 'Test Kişi' })
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows.every(g => g.intake_name === 'Test Kişi')).toBe(true)
  })

  test('pattern filtresi çalışır', () => {
    const db = getDB()
    const user = db.prepare("SELECT * FROM users WHERE role='campus_manager' LIMIT 1").get()
    const room = db.prepare("SELECT id FROM rooms WHERE block='M1' LIMIT 1").get()
    const item = createItemService({ room_id: room.id, item_count: 1 }, user.id)
    addPremiumGarmentsService(item.id, [{ garment_type: 'Gömlek', pattern: 'Çizgili' }], user.id)
    const result = searchPremiumGarmentsService({ pattern: 'Çizgili' })
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows.every(g => g.pattern === 'Çizgili')).toBe(true)
  })
})

describe('premium raporlar', () => {
  test('getPremiumReportQuery kayıp sayısını doğru hesaplar', () => {
    const report = getPremiumReportService({})
    expect(report).toHaveProperty('totals')
    expect(report).toHaveProperty('byBlock')
    expect(report).toHaveProperty('lostList')
    expect(typeof report.totals.total_lost).toBe('number')
    // Daha önce lost parça oluşturuldu (FAZ 5 testinde), kayıp sayısı > 0 olmalı
    expect(report.totals.total_lost).toBeGreaterThan(0)
    expect(report.lostList.every(g => g.garment_code)).toBe(true)
  })

  test('exportPremiumGarmentsQuery garment_code sütununu içerir', () => {
    const rows = exportPremiumGarmentsService({})
    expect(Array.isArray(rows)).toBe(true)
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty('garment_code')
      expect(rows[0]).toHaveProperty('block')
      expect(rows[0]).toHaveProperty('garment_type')
    }
  })

  test('blok config PUT → GET güncel gelir', () => {
    const db = getDB()
    const admin = db.prepare("SELECT id FROM users WHERE role='campus_manager' LIMIT 1").get()
    // M2'yi premium yap
    upsertBlockConfigService('M2', 1, admin.id)
    const blocks = getBlockConfigService()
    expect(blocks.find(b => b.block === 'M2')?.is_premium).toBe(1)
    // Geri al
    upsertBlockConfigService('M2', 0, admin.id)
    const blocks2 = getBlockConfigService()
    expect(blocks2.find(b => b.block === 'M2')?.is_premium).toBe(0)
  })
})

describe('oda tara (room scan)', () => {
  test('getRoomGarmentsForScanService A1 odasını döner', () => {
    const db = getDB()
    const room = db.prepare("SELECT block, room_no FROM rooms WHERE block='A1' LIMIT 1").get()
    if (!room) return
    const result = getRoomGarmentsForScanService(room.block, room.room_no)
    expect(result).toBeTruthy()
    expect(result.block).toBe(room.block)
    expect(result.room_no).toBe(room.room_no)
    expect(Array.isArray(result.garments)).toBe(true)
  })

  test('getRoomGarmentsForScanService geçersiz oda 404 atar', () => {
    expect(() => getRoomGarmentsForScanService('ZZZ', '9999')).toThrow('Oda bulunamadı')
  })

  test('scanActionService advance parçanın durumunu günceller', () => {
    const db = getDB()
    const room = db.prepare("SELECT block, room_no, id FROM rooms WHERE block='A1' LIMIT 1").get()
    if (!room) return

    // Item ve garment oluştur (is_premium zorunlu değil)
    const item = createItemService({ room_id: room.id, item_count: 1, needs_ironing: 0 }, userId)
    addPremiumGarmentsService(item.id, [{ garment_type: 'Gömlek', brand: 'Test', color: 'Mavi' }], userId)
    const garments = getPremiumGarmentsService(item.id)
    const g = garments[0]
    expect(g.status).toBe('received')

    const result = scanActionService(room.block, room.room_no, g.id, 'advance', userId)
    expect(result.status).toBe('ironing')

    // Scan log kaydedildi mi?
    const log = db.prepare("SELECT * FROM garment_scan_log WHERE garment_id=? ORDER BY id DESC LIMIT 1").get(g.id)
    expect(log).toBeTruthy()
    expect(log.action).toBe('advance')
  })
})

describe('Undo — revert genişletilmiş', () => {
  it('delivered → ready geri alınır', async () => {
    const db = getDB()
    const id = createItemService({ room_id: roomId, item_count: 1 }, userId).id
    const machineId = db.prepare("SELECT id FROM laundry_machines WHERE type='washer' LIMIT 1").get()?.id
    if (!machineId) return
    advanceItemService(id, { machine_id: machineId }, userId) // → washing
    advanceItemService(id, {}, userId) // → ready
    const delivered = deliverItemService(id, { delivered_to: 'Test' }, userId)
    expect(delivered.status).toBe('delivered')
    const reverted = revertItemService(id, 'ready', userId)
    expect(reverted.status).toBe('ready')
  })

  it('lost → dirty geri alınır', () => {
    const id = createItemService({ room_id: roomId, item_count: 1 }, userId).id
    lostItemService(id, {}, userId)
    const reverted = revertItemService(id, 'dirty', userId)
    expect(reverted.status).toBe('dirty')
  })

  it('damage silinir', () => {
    const db = getDB()
    const id = createItemService({ room_id: roomId, item_count: 1 }, userId).id
    reportDamageService(id, { description: 'Test hasar' }, userId)
    const damage = db.prepare(`SELECT id FROM laundry_damages WHERE item_id = ? LIMIT 1`).get(id)
    expect(damage).toBeTruthy()
    deleteDamageService(damage.id, userId)
    const after = db.prepare(`SELECT id FROM laundry_damages WHERE id = ?`).get(damage.id)
    expect(after).toBeUndefined()
  })
})
