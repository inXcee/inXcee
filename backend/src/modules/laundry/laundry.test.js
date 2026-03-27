import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

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

  it('history — kayıt geçmişi eklenir ve okunur', async () => {
    const { insertItemQuery, insertHistoryQuery, getItemHistoryQuery } = await import('./queries.js')
    const itemId = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: null, to_status: 'dirty', action_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: 'dirty', to_status: 'washing', action_by: userId })
    const history = getItemHistoryQuery(itemId)
    expect(history.length).toBe(2)
    expect(history[0].to_status).toBe('dirty')
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
