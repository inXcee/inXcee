import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { setCardSetting, AKSIYON } from './cardScan.js'

// Saf çözümleme cardScan.test.js'te. Burada asıl soru: kapı gerçek uçlara
// bağlandı mı, gerçek şemada eşleşme ölçülebiliyor mu, kayıt işlemle birlikte
// yazılıyor mu.

let adminToken, roomId, block, roomNo, sakinId, digerSakinId
const auth = () => ({ Authorization: `Bearer ${adminToken}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  const room = db.prepare("SELECT id, block, room_no FROM rooms WHERE block='M1' LIMIT 1").get()
  roomId = room.id; block = room.block; roomNo = room.room_no

  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token

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
  db.prepare('DELETE FROM laundry_items').run()
  setCardSetting(AKSIYON.INTAKE, false, db)
  setCardSetting(AKSIYON.DELIVERY, false, db)
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
