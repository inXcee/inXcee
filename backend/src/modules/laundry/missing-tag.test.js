import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { insertItemQuery, insertTrackedGarmentsQuery, searchPremiumGarmentsQuery } from './queries.js'

let adminToken, avsToken, roomId, block, roomNo

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const room = getDB().prepare("SELECT id, block, room_no FROM rooms WHERE block='M1' LIMIT 1").get()
  roomId = room.id; block = room.block; roomNo = room.room_no

  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  const worker = (await request(app).post('/api/avs-workers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ full_name: 'Künye Kuyruk Personeli', role_label: 'Çamaşırhane Personeli' })).body
  await request(app).put(`/api/avs-workers/${worker.id}/pin`)
    .set('Authorization', `Bearer ${adminToken}`).send({ new_pin: '0000' })
  avsToken = (await request(app).post('/api/auth/avs-login')
    .send({ worker_id: worker.id, pin: '0000' })).body.token
})

beforeEach(() => {
  const db = getDB()
  db.prepare('DELETE FROM premium_garments').run()
  db.prepare('DELETE FROM laundry_items').run()
})

function seedBag(garments, status = 'ironing') {
  const itemId = insertItemQuery({ room_id: roomId, item_count: garments.length, tracking_mode: 'individual' })
  getDB().prepare('UPDATE laundry_items SET status=? WHERE id=?').run(status, itemId)
  insertTrackedGarmentsQuery(itemId, garments)
  getDB().prepare('UPDATE premium_garments SET status=? WHERE item_id=?').run(status, itemId)
  return itemId
}

describe('künyesi eksik parça takibi', () => {
  it('marka/beden/renk üçü de boşsa künyesiz sayılır', () => {
    seedBag([
      { type_name: 'Gömlek' },                              // künyesiz
      { type_name: 'Pantolon', brand: 'Nike' },             // markası var
      { type_name: 'Çorap', size: 'L' },                    // bedeni var
      { type_name: 'Kazak', colors: [{ key: 'blue', label: 'Mavi' }] }, // rengi var
    ])
    const result = searchPremiumGarmentsQuery({ missing_tag: true })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].garment_type).toBe('Gömlek')
  })

  it('yalnızca boşluk içeren künye de eksik sayılır', () => {
    const itemId = seedBag([{ type_name: 'Gömlek' }])
    getDB().prepare("UPDATE premium_garments SET brand='   ', size='  ' WHERE item_id=?").run(itemId)
    expect(searchPremiumGarmentsQuery({ missing_tag: true }).rows).toHaveLength(1)
  })

  it('filtre kapalıyken hepsi döner', () => {
    seedBag([{ type_name: 'Gömlek' }, { type_name: 'Pantolon', brand: 'Nike' }])
    expect(searchPremiumGarmentsQuery({}).rows).toHaveLength(2)
  })

  it('rengi yalnız colors_json içinde olan eski kayıt eksik sayılmaz', () => {
    const itemId = seedBag([{ type_name: 'Gömlek' }])
    // 072 öncesi kayıt deseni: colors_json dolu, tekil color boş
    getDB().prepare(`UPDATE premium_garments SET color=NULL, colors_json='[{"key":"blue","label":"Mavi"}]' WHERE item_id=?`).run(itemId)
    expect(searchPremiumGarmentsQuery({ missing_tag: true }).rows).toHaveLength(0)
  })

  it('bozuk colors_json çökmez, parça eksik sayılır', () => {
    const itemId = seedBag([{ type_name: 'Gömlek' }])
    getDB().prepare("UPDATE premium_garments SET color=NULL, colors_json='bozuk{' WHERE item_id=?").run(itemId)
    expect(searchPremiumGarmentsQuery({ missing_tag: true }).rows).toHaveLength(1)
  })

  it('diğer filtrelerle birlikte çalışır', () => {
    seedBag([{ type_name: 'Gömlek' }, { type_name: 'Pantolon' }])
    const result = searchPremiumGarmentsQuery({ missing_tag: true, garment_type: 'Pantolon' })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].garment_type).toBe('Pantolon')
  })

  it('uç missing_tag=1 ile süzer', async () => {
    seedBag([{ type_name: 'Gömlek' }, { type_name: 'Pantolon', brand: 'Nike' }])
    const res = await request(app)
      .get('/api/laundry/garments/search?missing_tag=1')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.rows).toHaveLength(1)
    expect(res.body.rows[0].garment_type).toBe('Gömlek')
  })
})

describe('kiosk torba listesinde künye rozeti', () => {
  it('garment_untagged künyesiz parça sayısını verir', async () => {
    seedBag([
      { type_name: 'Gömlek' },
      { type_name: 'Pantolon' },
      { type_name: 'Çorap', brand: 'Nike', size: 'L' },
    ])
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/bags?status=ironing')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ garment_total: 3, garment_untagged: 2 })
  })

  it('hepsi künyeliyse rozet 0 olur', async () => {
    seedBag([{ type_name: 'Gömlek', brand: 'Zara', size: 'M' }])
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/bags?status=ironing')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.body[0].garment_untagged).toBe(0)
  })
})
