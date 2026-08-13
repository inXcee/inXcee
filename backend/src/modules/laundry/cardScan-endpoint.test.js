import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { issuePersonnelKioskSession } from '../../shared/auth/service.js'
import { setCardSetting, AKSIYON } from './cardScan.js'

// Saf çözümleme cardScan.test.js'te. Burada asıl soru: kapı gerçek uçlara
// bağlandı mı, gerçek şemada eşleşme ölçülebiliyor mu, kayıt işlemle birlikte
// yazılıyor mu.

let adminToken, supervisorToken, laundryToken, roomId, block, roomNo, sakinId, digerSakinId
const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  const room = db.prepare("SELECT id, block, room_no FROM rooms WHERE block='M1' LIMIT 1").get()
  roomId = room.id; block = room.block; roomNo = room.room_no

  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login')
    .send({ username: 'vardiya', password: 'admin123' })).body.token
  laundryToken = (await request(app).post('/api/auth/login')
    .send({ username: 'camasir', password: 'admin123' })).body.token

  // Seed'deki sakin sayısına güvenmek testi kırılgan yapar; kendi verimizi kurarız.
  sakinId = db.prepare("INSERT INTO personnel(full_name) VALUES('Kart Sahibi Sakin')").run().lastInsertRowid
  digerSakinId = db.prepare("INSERT INTO personnel(full_name) VALUES('Baska Odanin Sakini')").run().lastInsertRowid
  db.prepare('DELETE FROM room_assignments').run()
  db.prepare('INSERT INTO room_assignments(personnel_id, room_id, bed_no) VALUES(?,?,1)').run(sakinId, roomId)

  db.prepare("INSERT INTO cards(holder_type, holder_id, card_type, code) VALUES('personnel',?,'laundry','AVS-C:SAKIN')").run(sakinId)
  db.prepare("INSERT INTO cards(holder_type, holder_id, card_type, code) VALUES('personnel',?,'laundry','AVS-C:YABANCI')").run(digerSakinId)
})

beforeEach(() => {
  const db = getDB()
  db.prepare('DELETE FROM laundry_card_scans').run()
  db.prepare('DELETE FROM laundry_delivery_batch_garments').run()
  db.prepare('DELETE FROM laundry_delivery_batches').run()
  db.prepare('DELETE FROM premium_garment_deliveries').run()
  db.prepare('DELETE FROM laundry_items').run()
  setCardSetting(AKSIYON.INTAKE, false, db)
  setCardSetting(AKSIYON.DELIVERY, false, db)
})

describe('amir okutma raporu', () => {
  it('yönetici ve vardiya amiri görebilir, çamaşır rolü göremez', async () => {
    const manager = await request(app).get('/api/laundry/card-scans').set(auth())
    const supervisor = await request(app).get('/api/laundry/card-scans').set(auth(supervisorToken))
    const laundry = await request(app).get('/api/laundry/card-scans').set(auth(laundryToken))

    expect(manager.status).toBe(200)
    expect(supervisor.status).toBe(200)
    expect(laundry.status).toBe(403)
  })

  it('sonuç filtresini API üzerinden uygular', async () => {
    const db = getDB()
    db.prepare(`INSERT INTO laundry_card_scans(action,result,room_id,scanned_code) VALUES('delivery','mismatch',?,'AVS-C:YABANCI')`).run(roomId)
    db.prepare(`INSERT INTO laundry_card_scans(action,result,room_id,scanned_code) VALUES('intake','unknown_card',?,'YOK')`).run(roomId)

    const response = await request(app).get('/api/laundry/card-scans?result=mismatch').set(auth(supervisorToken))
    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0].result).toBe('mismatch')
  })
})

const torbaBirak = (govde = {}) => request(app).post('/api/self-service/laundry-kiosk/bag')
  .set(auth())
  .field('block', block).field('room_no', roomNo).field('item_count', '3')
  .field('intake_signature', 'imza')
  .field('card_code', govde.card_code ?? '')
  .field('card_override_reason', govde.card_override_reason ?? '')

const okutmalar = () => getDB().prepare('SELECT * FROM laundry_card_scans ORDER BY id').all()

describe('giriş (teslim alma) kapısı', () => {
  it('kapalıyken kartsız torba kabul edilir, okutma kaydı yazılmaz', async () => {
    const res = await torbaBirak()
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('201')
    expect(okutmalar()).toHaveLength(0)
  })

  it('açıkken kartsız torba 409 döner ve deneme kaydedilir', async () => {
    setCardSetting(AKSIYON.INTAKE, true, getDB())
    const res = await torbaBirak()
    expect(res.status).toBe(409)
    expect(res.body.card_gate).toMatchObject({ code: 'card_required', required: true })
    expect(getDB().prepare('SELECT COUNT(*) c FROM laundry_items').get().c).toBe(0)
  })

  it('açıkken geçerli kartla torba açılır ve okutma torbaya bağlanır', async () => {
    setCardSetting(AKSIYON.INTAKE, true, getDB())
    const res = await torbaBirak({ card_code: 'AVS-C:SAKIN' })
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('201')

    const kayitlar = okutmalar()
    expect(kayitlar).toHaveLength(1)
    expect(kayitlar[0]).toMatchObject({ action: 'intake', result: 'ok', item_id: res.body.id, personnel_id: sakinId })
  })

  // Kilit değil kapı: kartını kaybeden sakin çamaşırhaneyi durdurmamalı.
  it('gerekçeli geçiş kabul edilir ve gerekçe kaydedilir', async () => {
    setCardSetting(AKSIYON.INTAKE, true, getDB())
    const res = await torbaBirak({ card_override_reason: 'Kart kayıp, kimlikle doğrulandı' })
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('201')
    expect(okutmalar()[0]).toMatchObject({ result: 'override', override_reason: 'Kart kayıp, kimlikle doğrulandı' })
  })

  // Engellenen işlemde torba yazılmadıysa okutma da torbasız kalmalı, ama
  // deneme kaybolmamalı.
  it('tanınmayan kart engellenir, deneme torbasız kaydedilir', async () => {
    setCardSetting(AKSIYON.INTAKE, true, getDB())
    const res = await torbaBirak({ card_code: 'AVS-C:YOK' })
    expect(res.status).toBe(409)
    expect(okutmalar()[0]).toMatchObject({ result: 'unknown_card', item_id: null, scanned_code: 'AVS-C:YOK' })
  })
})

describe('teslim etme kapısı', () => {
  const hazirTorba = async () => {
    const { body } = await torbaBirak()
    const db = getDB()
    db.prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(body.id)
    db.prepare('DELETE FROM laundry_card_scans').run()
    return body.id
  }

  const teslimEt = (id, govde = {}) => request(app)
    .post(`/api/self-service/laundry-kiosk/bags/${id}/deliver`)
    .set(auth())
    .send({ delivered_name: 'Alan Kişi', signature: 'imza', ...govde })

  it('kapalıyken kartsız teslim yapılır', async () => {
    const res = await teslimEt(await hazirTorba())
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
  })

  it('açıkken kartsız teslim 409 döner, torba teslim edilmez', async () => {
    const id = await hazirTorba()
    setCardSetting(AKSIYON.DELIVERY, true, getDB())
    const res = await teslimEt(id)
    expect(res.status).toBe(409)
    expect(getDB().prepare('SELECT status FROM laundry_items WHERE id=?').get(id).status).toBe('ready')
  })

  it('doğru kartla teslim tamamlanır ve okutma kaydedilir', async () => {
    const id = await hazirTorba()
    setCardSetting(AKSIYON.DELIVERY, true, getDB())
    const res = await teslimEt(id, { card_code: 'AVS-C:SAKIN' })
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(res.body.card_warning).toBeNull()
    expect(okutmalar()[0]).toMatchObject({ action: 'delivery', result: 'ok', item_id: id })
  })

  // Asıl yakalanmak istenen durum. Teslim edilir (kişi kapıda bekliyor) ama
  // uyarı döner ve kayda geçer. Bu testin çalışması için teslim ucunun torbanın
  // room_id'sini okuması şart — okumazsa eşleşme sessizce hep "temiz" çıkar.
  it('başkasının kartı teslimi durdurmaz ama uyarır ve kaydeder', async () => {
    const id = await hazirTorba()
    setCardSetting(AKSIYON.DELIVERY, true, getDB())
    const res = await teslimEt(id, { card_code: 'AVS-C:YABANCI' })
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(res.body.card_warning).toMatch(/sakini değil/)
    expect(okutmalar()[0]).toMatchObject({ result: 'mismatch', personnel_id: digerSakinId, room_id: roomId })
  })

  it('giriş zorunluyken teslim zorunlu olmaz — iki ayar bağımsız', async () => {
    const id = await hazirTorba()
    setCardSetting(AKSIYON.INTAKE, true, getDB())
    const res = await teslimEt(id)
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
  })
})

describe('ayar ve rapor uçları', () => {
  it('ayarları okur ve yönetici değiştirir', async () => {
    const once = await request(app).get('/api/laundry/card-settings').set(auth())
    expect(once.body).toMatchObject({ available: true, intake_required: false })

    const yaz = await request(app).put('/api/laundry/card-settings')
      .send({ action: 'intake', required: true }).set(auth())
    expect(`${yaz.status} ${JSON.stringify(yaz.body).slice(0, 200)}`).toContain('200')
    expect(yaz.body.intake_required).toBe(true)
  })

  it('geçersiz gövdeyi reddeder', async () => {
    expect((await request(app).put('/api/laundry/card-settings')
      .send({ action: 'baska', required: true }).set(auth())).status).toBe(400)
    // required boolean olmalı: "1" göndermek sessizce açık saymamalı.
    expect((await request(app).put('/api/laundry/card-settings')
      .send({ action: 'intake', required: '1' }).set(auth())).status).toBe(400)
  })

  it('sorunlu okutmaları listeler, temizleri listeye almaz', async () => {
    const id = (await torbaBirak({ card_code: 'AVS-C:SAKIN' })).body.id
    getDB().prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(id)
    await request(app).post(`/api/self-service/laundry-kiosk/bags/${id}/deliver`)
      .set(auth()).send({ delivered_name: 'X', signature: 'i', card_code: 'AVS-C:YABANCI' })

    const { body } = await request(app).get('/api/laundry/card-scans').set(auth())
    expect(body.available).toBe(true)
    expect(body.items.map(i => i.result)).toEqual(['mismatch'])
  })

  it('istatistiği sonuç kırılımıyla verir', async () => {
    const { body } = await request(app).get('/api/laundry/card-scan-stats').set(auth())
    expect(body.available).toBe(true)
    expect(body).toHaveProperty('mismatch')
    expect(body).toHaveProperty('success_ratio')
  })
})

describe('ortak masaüstü ve kiosk kart kapısı', () => {
  const masaustuKaydi = (body = {}) => request(app).post('/api/laundry/items').set(auth()).send({
    room_id: roomId,
    item_count: 2,
    ...body,
  })

  const hazirMasaustuKaydi = async (targetRoomId = roomId, extra = {}) => {
    const res = await masaustuKaydi({ room_id: targetRoomId, ...extra })
    expect(res.status).toBe(201)
    getDB().prepare("UPDATE laundry_items SET status='ready' WHERE id=?").run(res.body.id)
    return res.body.id
  }

  it('doğrulama uçları anında sonucu döndürür fakat audit yazmaz', async () => {
    setCardSetting(AKSIYON.DELIVERY, true, getDB())
    const standard = await request(app).post('/api/laundry/card-verify').set(auth()).send({
      action: 'delivery', room_id: roomId, card_code: 'AVS-C:SAKIN',
    })
    expect(standard.status).toBe(200)
    expect(standard.body).toMatchObject({ allowed: true, code: 'ok', card_warning: null })

    const kiosk = await request(app).post('/api/self-service/laundry-kiosk/card-verify').set(auth()).send({
      action: 'delivery', room_id: roomId, card_code: 'AVS-C:YABANCI',
    })
    expect(kiosk.status).toBe(200)
    expect(kiosk.body).toMatchObject({ allowed: true, code: 'mismatch' })
    expect(okutmalar()).toHaveLength(0)
  })

  it('kiosk kart ayarını yetkili oturuma salt okunur verir', async () => {
    setCardSetting(AKSIYON.INTAKE, true, getDB())
    const res = await request(app).get('/api/self-service/laundry-kiosk/card-settings').set(auth())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ intake_required: true, delivery_required: false })
  })

  it('masaüstü kabulde zorunluluğu uygular ve doğru kartı kayda bağlar', async () => {
    setCardSetting(AKSIYON.INTAKE, true, getDB())
    const blocked = await masaustuKaydi()
    expect(blocked.status).toBe(409)
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM laundry_items').get().count).toBe(0)

    const accepted = await masaustuKaydi({ card_code: 'AVS-C:SAKIN' })
    expect(accepted.status).toBe(201)
    expect(accepted.body.card.holder_name).toBe('Kart Sahibi Sakin')
    expect(okutmalar().at(-1)).toMatchObject({ action: 'intake', result: 'ok', item_id: accepted.body.id })
  })

  it('masaüstü tekli teslimde mismatch uyarısıyla işlemi tamamlar', async () => {
    const id = await hazirMasaustuKaydi()
    getDB().prepare('DELETE FROM laundry_card_scans').run()
    setCardSetting(AKSIYON.DELIVERY, true, getDB())
    const res = await request(app).patch(`/api/laundry/items/${id}/deliver`).set(auth()).send({
      delivered_to: 'Teslim Alan', card_code: 'AVS-C:YABANCI',
    })
    expect(res.status).toBe(200)
    expect(res.body.card_warning).toMatch(/sakini değil/)
    expect(getDB().prepare('SELECT status FROM laundry_items WHERE id=?').get(id).status).toBe('delivered')
    expect(okutmalar()[0]).toMatchObject({ item_id: id, result: 'mismatch' })
  })

  it('kart zorunluyken masaüstü toplu teslimde karışık odaları reddeder', async () => {
    const secondRoom = getDB().prepare('SELECT id FROM rooms WHERE id<>? ORDER BY id LIMIT 1').get(roomId)
    const first = await hazirMasaustuKaydi(roomId)
    const second = await hazirMasaustuKaydi(secondRoom.id)
    setCardSetting(AKSIYON.DELIVERY, true, getDB())
    const blocked = await request(app).post('/api/laundry/items/batch-deliver').set(auth()).send({
      item_ids: [first, second], delivered_to: 'Teslim Alan', card_code: 'AVS-C:SAKIN',
    })
    expect(blocked.status).toBe(400)
    expect(blocked.body.code).toBe('mixed_rooms')

    setCardSetting(AKSIYON.DELIVERY, false, getDB())
    const legacy = await request(app).post('/api/laundry/items/batch-deliver').set(auth()).send({
      item_ids: [first, second], delivered_to: 'Teslim Alan',
    })
    expect(legacy.status).toBe(200)
    expect(legacy.body).toMatchObject({ delivered: 2, errors: [] })
  })

  it('oda toplu tesliminde aynı okutmayı her torbanın audit kaydına bağlar', async () => {
    const first = await hazirMasaustuKaydi()
    const second = await hazirMasaustuKaydi()
    getDB().prepare('DELETE FROM laundry_card_scans').run()
    setCardSetting(AKSIYON.DELIVERY, true, getDB())
    const res = await request(app).post('/api/self-service/laundry-kiosk/deliver-room').set(auth()).send({
      block, room_no: roomNo, delivered_name: 'Teslim Alan', signature: 'imza', card_code: 'AVS-C:SAKIN',
    })
    expect(res.status).toBe(200)
    expect(res.body.delivered).toBe(2)
    expect(okutmalar().map(row => row.item_id).sort()).toEqual([first, second].sort())
  })

  it('audit yazılamazsa kabul kaydını da rollback eder', async () => {
    const db = getDB()
    setCardSetting(AKSIYON.INTAKE, true, db)
    db.exec(`
      CREATE TRIGGER fail_laundry_scan BEFORE INSERT ON laundry_card_scans
      BEGIN SELECT RAISE(ABORT, 'scan write failed'); END;
    `)
    try {
      const res = await masaustuKaydi({ card_code: 'AVS-C:SAKIN' })
      expect(res.status).toBe(400)
      expect(db.prepare('SELECT COUNT(*) AS count FROM laundry_items').get().count).toBe(0)
    } finally {
      db.exec('DROP TRIGGER IF EXISTS fail_laundry_scan')
    }
  })

  it('audit yazılamazsa teslimi ve teslim kaydını da rollback eder', async () => {
    const id = await hazirMasaustuKaydi()
    const db = getDB()
    setCardSetting(AKSIYON.DELIVERY, true, db)
    db.exec(`
      CREATE TRIGGER fail_laundry_scan BEFORE INSERT ON laundry_card_scans
      BEGIN SELECT RAISE(ABORT, 'scan write failed'); END;
    `)
    try {
      const res = await request(app).patch(`/api/laundry/items/${id}/deliver`).set(auth()).send({
        delivered_to: 'Teslim Alan', card_code: 'AVS-C:SAKIN',
      })
      expect(res.status).toBe(400)
      expect(db.prepare('SELECT status FROM laundry_items WHERE id=?').get(id).status).toBe('ready')
      expect(db.prepare('SELECT COUNT(*) AS count FROM laundry_deliveries WHERE item_id=?').get(id).count).toBe(0)
    } finally {
      db.exec('DROP TRIGGER IF EXISTS fail_laundry_scan')
    }
  })

  it('legacy kiosk kıyafet kabul ucu da kart kapısından geçer', async () => {
    setCardSetting(AKSIYON.INTAKE, true, getDB())
    const blocked = await request(app).post('/api/self-service/laundry-kiosk/garment').set(auth()).send({
      block,
      room_no: roomNo,
      clothing_items: [{ type: 'Gömlek', count: 1 }],
      intake_signature: 'imza',
    })
    expect(blocked.status).toBe(409)
    const accepted = await request(app).post('/api/self-service/laundry-kiosk/garment').set(auth()).send({
      block,
      room_no: roomNo,
      clothing_items: [{ type: 'Gömlek', count: 1 }],
      intake_signature: 'imza',
      card_code: 'AVS-C:SAKIN',
    })
    expect(accepted.status).toBe(201)
    expect(okutmalar().at(-1)).toMatchObject({ item_id: accepted.body.id, action: 'intake' })
  })

  it('premium tekli ve toplu teslim uçları kartı ortak transaction ile kaydeder', async () => {
    const singleItem = await hazirMasaustuKaydi(roomId, {
      item_count: 1,
      garments: [{ garment_type: 'Gömlek', count: 1 }],
    })
    const db = getDB()
    const singleGarment = db.prepare('SELECT id FROM premium_garments WHERE item_id=?').get(singleItem)
    db.prepare("UPDATE premium_garments SET status='ready' WHERE item_id=?").run(singleItem)
    setCardSetting(AKSIYON.DELIVERY, true, db)

    const blocked = await request(app).patch(`/api/laundry/garments/${singleGarment.id}/deliver`).set(auth()).send({
      delivered_to: 'Teslim Alan',
    })
    expect(blocked.status).toBe(409)
    const single = await request(app).patch(`/api/laundry/garments/${singleGarment.id}/deliver`).set(auth()).send({
      delivered_to: 'Teslim Alan', card_code: 'AVS-C:SAKIN',
    })
    expect(single.status).toBe(200)
    expect(okutmalar().at(-1)).toMatchObject({ item_id: singleItem, action: 'delivery' })

    setCardSetting(AKSIYON.DELIVERY, false, db)
    const bulkItem = await hazirMasaustuKaydi(roomId, {
      item_count: 2,
      garments: [{ garment_type: 'Pantolon', count: 2 }],
    })
    const bulkGarments = db.prepare('SELECT id FROM premium_garments WHERE item_id=?').all(bulkItem)
    db.prepare("UPDATE premium_garments SET status='ready' WHERE item_id=?").run(bulkItem)
    setCardSetting(AKSIYON.DELIVERY, true, db)
    const bulk = await request(app).post(`/api/laundry/items/${bulkItem}/premium-deliver`).set(auth()).send({
      garment_ids: bulkGarments.map(row => row.id),
      delivered_to: 'Teslim Alan',
      card_code: 'AVS-C:SAKIN',
    })
    expect(bulk.status).toBe(200)
    expect(bulk.body.delivered).toBe(2)
    expect(okutmalar().at(-1)).toMatchObject({ item_id: bulkItem, action: 'delivery' })
  })

  it('kısmi kiosk teslimi kart zorunluluğunu uygular', async () => {
    const itemId = await hazirMasaustuKaydi(roomId, {
      item_count: 2,
      garments: [{ garment_type: 'Gömlek', count: 2 }],
    })
    const db = getDB()
    const garment = db.prepare('SELECT id FROM premium_garments WHERE item_id=? ORDER BY id LIMIT 1').get(itemId)
    db.prepare("UPDATE premium_garments SET status='ready' WHERE item_id=?").run(itemId)
    setCardSetting(AKSIYON.DELIVERY, true, db)

    const partial = cardCode => request(app).post('/api/self-service/laundry-kiosk/deliver-partial').set(auth())
      .field('item_id', String(itemId))
      .field('garment_ids', JSON.stringify([garment.id]))
      .field('delivered_name', 'Teslim Alan')
      .field('recipient_type', 'owner')
      .field('signature', 'imza')
      .field('card_code', cardCode || '')

    expect((await partial()).status).toBe(409)
    const accepted = await partial('AVS-C:SAKIN')
    expect(accepted.status).toBe(200)
    expect(accepted.body.delivered_count).toBe(1)
    expect(okutmalar().at(-1)).toMatchObject({ item_id: itemId, action: 'delivery' })
  })

  it('sakin self-service tesliminde kartı nihai işlemde yeniden doğrular', async () => {
    const itemId = await hazirMasaustuKaydi()
    const residentToken = issuePersonnelKioskSession(sakinId).token
    setCardSetting(AKSIYON.DELIVERY, true, getDB())

    const settings = await request(app).get('/api/self-service/laundry-kiosk/card-settings')
      .set({ Authorization: `Bearer ${residentToken}` })
    expect(settings.status).toBe(200)
    expect(settings.body.delivery_required).toBe(true)
    const verified = await request(app).post('/api/self-service/laundry-kiosk/card-verify')
      .set({ Authorization: `Bearer ${residentToken}` })
      .send({ action: 'delivery', item_id: itemId, card_code: 'AVS-C:SAKIN' })
    expect(verified.status).toBe(200)
    expect(verified.body.code).toBe('ok')
    expect(okutmalar()).toHaveLength(0)

    const blocked = await request(app).post(`/api/self-service/laundry-kiosk/deliver-resident/${itemId}`)
      .set({ Authorization: `Bearer ${residentToken}` }).send({ signature: 'imza' })
    expect(blocked.status).toBe(409)
    const accepted = await request(app).post(`/api/self-service/laundry-kiosk/deliver-resident/${itemId}`)
      .set({ Authorization: `Bearer ${residentToken}` })
      .send({ signature: 'imza', card_code: 'AVS-C:SAKIN' })
    expect(accepted.status).toBe(200)
    expect(getDB().prepare('SELECT status FROM laundry_items WHERE id=?').get(itemId).status).toBe('delivered')
    expect(okutmalar().at(-1)).toMatchObject({ item_id: itemId, result: 'ok' })
  })
})
