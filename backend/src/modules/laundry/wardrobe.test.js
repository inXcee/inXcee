import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import {
  garmentSignature, upsertArchiveGarmentsQuery, getRoomWardrobeQuery,
  listArchiveBrandsQuery, insertTrackedGarmentsQuery, insertItemQuery,
  updateGarmentTypeQuery, insertGarmentTypeQuery,
} from './queries.js'
import { resolveIroningPolicy } from './queries/premium.js'

let avsToken, roomId, block, roomNo

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  const room = db.prepare("SELECT id, block, room_no FROM rooms WHERE block='M1' LIMIT 1").get()
  roomId = room.id; block = room.block; roomNo = room.room_no

  const adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  const worker = (await request(app).post('/api/avs-workers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ full_name: 'Dolap Test Personeli', role_label: 'Çamaşırhane Personeli' })).body
  await request(app).put(`/api/avs-workers/${worker.id}/pin`)
    .set('Authorization', `Bearer ${adminToken}`).send({ new_pin: '0000' })
  avsToken = (await request(app).post('/api/auth/avs-login')
    .send({ worker_id: worker.id, pin: '0000' })).body.token
  expect(avsToken).toBeTruthy()
})

beforeEach(() => {
  getDB().prepare('DELETE FROM laundry_garment_archive').run()
})

describe('ütü politikası', () => {
  it("yalnızca 'never' ütüyü kapatır — belirtilmemiş tür ütü açık gelir", () => {
    expect(resolveIroningPolicy('always')).toBe(true)
    expect(resolveIroningPolicy('ask')).toBe(true)
    expect(resolveIroningPolicy(undefined)).toBe(true)
    expect(resolveIroningPolicy('never')).toBe(false)
  })

  it('migration 069 ile 0 kalan türler ask oldu, 1 olanlar always', () => {
    const db = getDB()
    const shirt = db.prepare("SELECT ironing_policy FROM laundry_garment_types WHERE name='Gömlek'").get()
    const socks = db.prepare("SELECT ironing_policy FROM laundry_garment_types WHERE name='Çorap'").get()
    expect(shirt.ironing_policy).toBe('always')
    expect(socks.ironing_policy).toBe('ask')
  })

  it("politika belirtilmemiş türde parça ütü açık kaydedilir (eskiden sessizce kapalıydı)", () => {
    const db = getDB()
    const socks = db.prepare("SELECT id FROM laundry_garment_types WHERE name='Çorap'").get()
    const itemId = insertItemQuery({ room_id: roomId, item_count: 1 })
    const [garment] = insertTrackedGarmentsQuery(itemId, [{ type_id: socks.id, type_name: 'Çorap' }])
    expect(garment.requires_ironing).toBe(1)
  })

  it("never işaretli türde ütü kapalı kalır", () => {
    const db = getDB()
    const socks = db.prepare("SELECT id FROM laundry_garment_types WHERE name='Çorap'").get()
    updateGarmentTypeQuery(socks.id, { ironing_policy: 'never' })
    const itemId = insertItemQuery({ room_id: roomId, item_count: 1 })
    const [garment] = insertTrackedGarmentsQuery(itemId, [{ type_id: socks.id, type_name: 'Çorap' }])
    expect(garment.requires_ironing).toBe(0)
    updateGarmentTypeQuery(socks.id, { ironing_policy: 'ask' })
  })

  it('yeni tür oluştururken politika kaydedilir ve 0/1 alanla senkron kalır', () => {
    const created = insertGarmentTypeQuery({ name: 'Perde', ironing_policy: 'always' })
    expect(created.ironing_policy).toBe('always')
    expect(created.default_requires_ironing).toBe(1)
    const off = updateGarmentTypeQuery(created.id, { ironing_policy: 'never' })
    expect(off.default_requires_ironing).toBe(0)
  })
})

describe('kıyafet arşivi (oda dolabı)', () => {
  const gomlek = { type_name: 'Gömlek', emoji: '👔', brand: 'Nike', size: 'L', color: 'Beyaz', requires_ironing: true }

  it('imza büyük/küçük harf ve boşluktan etkilenmez', () => {
    expect(garmentSignature({ type_name: ' Gömlek ', brand: 'NIKE', size: 'l' }))
      .toBe(garmentSignature({ type_name: 'gömlek', brand: 'nike', size: 'L' }))
  })

  it('aynı kıyafet tekrar gelince yeni satır açmaz, sayaç artar', () => {
    upsertArchiveGarmentsQuery(roomId, 'Ali Veli', [gomlek])
    upsertArchiveGarmentsQuery(roomId, 'Ali Veli', [gomlek])
    const rows = getRoomWardrobeQuery(block, roomNo)
    expect(rows).toHaveLength(1)
    expect(rows[0].times_seen).toBe(2)
    expect(rows[0]).toMatchObject({ brand: 'Nike', size: 'L', requires_ironing: 1 })
  })

  it('farklı beden ayrı satır olur', () => {
    upsertArchiveGarmentsQuery(roomId, 'Ali Veli', [gomlek, { ...gomlek, size: 'M' }])
    expect(getRoomWardrobeQuery(block, roomNo)).toHaveLength(2)
  })

  it('aynı odada farklı kişi ayrı satır olur ve sahibininki öne gelir', () => {
    upsertArchiveGarmentsQuery(roomId, 'Ali Veli', [gomlek])
    upsertArchiveGarmentsQuery(roomId, 'Ali Veli', [gomlek]) // times_seen=2
    upsertArchiveGarmentsQuery(roomId, 'Veli Ali', [{ ...gomlek, brand: 'Adidas' }])
    const forVeli = getRoomWardrobeQuery(block, roomNo, { ownerName: 'Veli Ali' })
    expect(forVeli).toHaveLength(2)
    // times_seen daha düşük olmasına rağmen kişinin kendi parçası ilk sırada
    expect(forVeli[0]).toMatchObject({ owner_name: 'Veli Ali', brand: 'Adidas' })
  })

  it('marka önerileri kullanım sıklığına göre döner', () => {
    upsertArchiveGarmentsQuery(roomId, null, [
      { ...gomlek, brand: 'Nike' },
      { ...gomlek, brand: 'Adidas', size: 'M' },
      { ...gomlek, brand: 'Adidas', size: 'S' },
    ])
    expect(listArchiveBrandsQuery()).toEqual(['Adidas', 'Nike'])
    expect(listArchiveBrandsQuery('ni')).toEqual(['Nike'])
  })

  it('tip adı olmayan giriş atlanır', () => {
    expect(upsertArchiveGarmentsQuery(roomId, null, [{ brand: 'X' }])).toBe(0)
    expect(getRoomWardrobeQuery(block, roomNo)).toHaveLength(0)
  })
})

describe('kiosk arşiv uçları', () => {
  it('torba girişi odanın dolabını doldurur ve uç döner', async () => {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block, room_no: roomNo, item_count: 2,
        intake_signature: 'data:image/png;base64,dGVzdA==',
        garments: [{
          type_name: 'Gömlek', emoji: '👔', count: 2,
          brand: 'Lacoste', size: 'XL', requires_ironing: true,
        }],
      })
    expect(res.status).toBe(201)
    // Künye alanları tekil parçalara yazılır; M/S bloklarında ütü zorla kapalıdır.
    expect(res.body.garments[0]).toMatchObject({ brand: 'Lacoste', size: 'XL', requires_ironing: 0 })

    const wardrobe = await request(app)
      .get(`/api/self-service/laundry-kiosk/room-wardrobe?block=${block}&room_no=${roomNo}`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(wardrobe.status).toBe(200)
    expect(wardrobe.body).toHaveLength(1)
    expect(wardrobe.body[0]).toMatchObject({ type_name: 'Gömlek', brand: 'Lacoste', size: 'XL' })
    expect(wardrobe.body[0].colors).toEqual([])

    const brands = await request(app)
      .get('/api/self-service/laundry-kiosk/brands?q=lac')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(brands.body).toEqual(['Lacoste'])
  })

  it('dolaptan kayıt silinir ve audit düşer', async () => {
    upsertArchiveGarmentsQuery(roomId, null, [{ type_name: 'Kazak', brand: 'X' }])
    const id = getRoomWardrobeQuery(block, roomNo)[0].id
    const res = await request(app)
      .delete(`/api/self-service/laundry-kiosk/wardrobe/${id}`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(getRoomWardrobeQuery(block, roomNo)).toHaveLength(0)
    const audit = getDB().prepare(
      "SELECT worker_id FROM audit_log WHERE action='laundry_kiosk_wardrobe_delete' AND target_id=?"
    ).get(id)
    expect(audit?.worker_id).toBeTruthy()
  })

  it('block/room_no olmadan 400 döner', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/room-wardrobe?block=M1')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(400)
  })

  it('kiosk yetkisi olmayan token 403 alır', async () => {
    const kioskToken = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .get(`/api/self-service/laundry-kiosk/room-wardrobe?block=${block}&room_no=${roomNo}`)
      .set('Authorization', `Bearer ${kioskToken}`)
    expect(res.status).toBe(403)
  })
})
