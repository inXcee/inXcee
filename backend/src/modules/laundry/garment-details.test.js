import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { getRoomWardrobeQuery, insertItemQuery, insertTrackedGarmentsQuery } from './queries.js'

let avsToken, roomId, block, roomNo

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const room = getDB().prepare("SELECT id, block, room_no FROM rooms WHERE block='M1' LIMIT 1").get()
  roomId = room.id; block = room.block; roomNo = room.room_no

  const adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  const worker = (await request(app).post('/api/avs-workers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ full_name: 'Künye Test Personeli', role_label: 'Çamaşırhane Personeli' })).body
  await request(app).put(`/api/avs-workers/${worker.id}/pin`)
    .set('Authorization', `Bearer ${adminToken}`).send({ new_pin: '0000' })
  avsToken = (await request(app).post('/api/auth/avs-login')
    .send({ worker_id: worker.id, pin: '0000' })).body.token
  expect(avsToken).toBeTruthy()
})

beforeEach(() => {
  getDB().prepare('DELETE FROM laundry_garment_archive').run()
})

// Ütüdeki bir torba + tek parça kurar.
function makeIroningGarment(extra = {}) {
  const itemId = insertItemQuery({
    room_id: roomId, item_count: 1, status: 'ironing',
    intake_name: 'Ali Veli', tracking_mode: 'individual',
  })
  getDB().prepare("UPDATE laundry_items SET status='ironing' WHERE id=?").run(itemId)
  const [garment] = insertTrackedGarmentsQuery(itemId, [{
    type_name: 'Gömlek', emoji: '👔', requires_ironing: true, ...extra,
  }])
  getDB().prepare("UPDATE premium_garments SET status='ironing' WHERE id=?").run(garment.id)
  return { itemId, garment }
}

const put = (bagId, garmentId, body) => request(app)
  .put(`/api/self-service/laundry-kiosk/bags/${bagId}/garments/${garmentId}/details`)
  .set('Authorization', `Bearer ${avsToken}`)
  .send(body)

describe('ütüde parça künyesi', () => {
  it('marka, model, beden ve renk kaydedilir', async () => {
    const { itemId, garment } = makeIroningGarment()
    const res = await put(itemId, garment.id, {
      brand: 'Lacoste', model: 'Slim Fit', size: 'XL',
      colors: [{ key: 'blue', label: 'Mavi' }], pattern: 'striped-h',
      condition_notes: 'yakada leke',
    })
    expect(res.status).toBe(200)
    expect(res.body.garment).toMatchObject({
      brand: 'Lacoste', model: 'Slim Fit', size: 'XL',
      color: 'Mavi', pattern: 'striped-h', condition_notes: 'yakada leke',
    })
    expect(JSON.parse(res.body.garment.colors_json)).toEqual([{ key: 'blue', label: 'Mavi' }])
  })

  it('gönderilmeyen alan korunur, boş gönderilen alan temizlenir', async () => {
    const { itemId, garment } = makeIroningGarment({ brand: 'Nike', size: 'L' })
    await put(itemId, garment.id, { model: 'Dri-Fit' })
    let row = getDB().prepare('SELECT * FROM premium_garments WHERE id=?').get(garment.id)
    expect(row).toMatchObject({ brand: 'Nike', size: 'L', model: 'Dri-Fit' })

    await put(itemId, garment.id, { size: '' })
    row = getDB().prepare('SELECT * FROM premium_garments WHERE id=?').get(garment.id)
    expect(row.size).toBe(null)
    expect(row.brand).toBe('Nike')
  })

  it('künye odanın dolabına da işlenir', async () => {
    const { itemId, garment } = makeIroningGarment()
    await put(itemId, garment.id, { brand: 'Mavi Jeans', size: '32' })

    const wardrobe = getRoomWardrobeQuery(block, roomNo)
    const match = wardrobe.find(row => row.brand === 'Mavi Jeans')
    expect(match).toMatchObject({ type_name: 'Gömlek', size: '32', owner_name: 'Ali Veli' })
  })

  it('audit kaydı düşer ve aktör yazılır', async () => {
    const { itemId, garment } = makeIroningGarment()
    await put(itemId, garment.id, { brand: 'Zara' })
    const audit = getDB().prepare(
      "SELECT user_id, worker_id, detail FROM audit_log WHERE action='laundry_kiosk_garment_details' AND target_id=?"
    ).get(garment.id)
    expect(audit).toBeTruthy()
    expect(audit.user_id).toBe(null)
    expect(audit.worker_id).toBeTruthy()
    expect(JSON.parse(audit.detail).brand).toBe('Zara')
  })

  it('teslim edilmiş parçanın künyesi değiştirilemez', async () => {
    const { itemId, garment } = makeIroningGarment()
    getDB().prepare("UPDATE premium_garments SET status='delivered' WHERE id=?").run(garment.id)
    const res = await put(itemId, garment.id, { brand: 'X' })
    expect(res.status).toBe(409)
  })

  it('başka torbanın parçası üzerinden güncellenemez', async () => {
    const { garment } = makeIroningGarment()
    const other = makeIroningGarment()
    const res = await put(other.itemId, garment.id, { brand: 'X' })
    expect(res.status).toBe(404)
  })

  it('colors dizi değilse 400 döner', async () => {
    const { itemId, garment } = makeIroningGarment()
    const res = await put(itemId, garment.id, { colors: 'mavi' })
    expect(res.status).toBe(400)
  })

  it('çok uzun metin kırpılır (şema taşması olmaz)', async () => {
    const { itemId, garment } = makeIroningGarment()
    const res = await put(itemId, garment.id, { brand: 'A'.repeat(200), condition_notes: 'B'.repeat(600) })
    expect(res.body.garment.brand).toHaveLength(60)
    expect(res.body.garment.condition_notes).toHaveLength(300)
  })
})
