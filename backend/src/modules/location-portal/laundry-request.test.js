import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import Database from 'better-sqlite3'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateMissingQrCodes, updatePortalSettings } from './service.js'
import { listOpenPickupRequests, closePickupRequest } from './laundry-request-action.js'
import { setCardSetting, AKSIYON } from '../laundry/cardScan.js'

// Faz 5 kabul kriterleri (spec):
//   • Aynı açık talebin birleştirilmesi
//   • Farklı konumun ayrı kayıt olması
//   • Çamaşır isteğinin FİZİKSEL TESLİM SAYILMAMASI
//   • Kart kapısının teslim anında tekrar çalışması

let odaToken, digerOdaToken, ortakToken, adminToken
let sayac = 0
const yeniId = () => `req-abcdefgh-${++sayac}`

const talep = (token, govde = {}) => request(app)
  .post(`/api/room-portal/${token}/laundry-requests`)
  .send({ client_request_id: yeniId(), ...govde })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  generateMissingQrCodes({}, null)

  const db = getDB()
  const odalar = db.prepare(`
    SELECT q.token FROM location_qr_codes q JOIN service_locations sl ON sl.id = q.location_id
    WHERE sl.location_type = 'room' AND q.status = 'active' LIMIT 2
  `).all()
  odaToken = odalar[0].token
  digerOdaToken = odalar[1].token
  ortakToken = db.prepare(`
    SELECT q.token FROM location_qr_codes q JOIN service_locations sl ON sl.id = q.location_id
    WHERE sl.location_type = 'common_area' AND q.status = 'active' LIMIT 1
  `).get().token
})

beforeEach(() => {
  const db = getDB()
  db.prepare('DELETE FROM laundry_pickup_requests').run()
  db.prepare('DELETE FROM location_portal_receipts').run()
  updatePortalSettings({
    location_portal_enabled: true,
    location_portal_laundry_enabled: true,
    location_portal_laundry_pin_required: false,
  })
})

const acikTalepler = () => getDB().prepare("SELECT * FROM laundry_pickup_requests WHERE status='open'").all()

describe('çamaşır alma talebi', () => {
  it('talep oluşturur ve makbuz döner', async () => {
    const res = await talep(odaToken, { note: 'İki torba var' })
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('201')
    expect(res.body.receipt).toBeTruthy()
    expect(res.body.merged).toBe(false)
    expect(acikTalepler()).toHaveLength(1)
  })

  // Sabırsız sakin beş kez basınca çamaşırhaneye beş iş düşmemeli.
  it('aynı odada ikinci talep yeni kayıt açmaz, mevcutla birleşir', async () => {
    await talep(odaToken, { note: 'Bir torba' })
    const ikinci = await talep(odaToken, { note: 'Bir torba daha' })

    expect(ikinci.body.merged).toBe(true)
    const acik = acikTalepler()
    expect(acik).toHaveLength(1)
    expect(acik[0].request_count).toBe(2)
    // İkinci notu ezmek bilgi kaybı olurdu.
    expect(acik[0].note).toContain('Bir torba')
    expect(acik[0].note).toContain('Bir torba daha')
  })

  it('farklı konum ayrı kayıt açar', async () => {
    await talep(odaToken)
    await talep(digerOdaToken)
    expect(acikTalepler()).toHaveLength(2)
  })

  // ASIL KURAL: talep teslim değildir; burada laundry_items yazılmamalı.
  it('fiziksel teslim sayılmaz — çamaşır kaydı açılmaz', async () => {
    const once = getDB().prepare('SELECT COUNT(*) c FROM laundry_items').get().c
    const res = await talep(odaToken)
    expect(getDB().prepare('SELECT COUNT(*) c FROM laundry_items').get().c).toBe(once)
    expect(JSON.stringify(res.body)).toMatch(/talep/i)
  })

  it('makbuz sakine talep-teslim farkını yazar', async () => {
    const res = await talep(odaToken)
    const makbuz = await request(app).get(`/api/room-portal/receipts/${res.body.receipt}`)
    expect(makbuz.status).toBe(200)
    expect(JSON.stringify(makbuz.body)).toMatch(/teslim kaydı ayrıca yapılır/)
  })

  // Koridorun çamaşırı olmaz.
  it('ortak alandan talep reddedilir', async () => {
    const res = await talep(ortakToken)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('laundry_room_only')
  })

  it('hizmet kapalıyken 404 döner', async () => {
    updatePortalSettings({ location_portal_laundry_enabled: false })
    const res = await talep(odaToken)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('action_disabled')
  })

  it('portal kapalıyken 503 döner', async () => {
    updatePortalSettings({ location_portal_enabled: false })
    expect((await talep(odaToken)).status).toBe(503)
  })

  // PIN zorunluyken anonim geçilememeli.
  it('PIN zorunluyken oturumsuz talep reddedilir', async () => {
    updatePortalSettings({ location_portal_laundry_pin_required: true })
    const res = await talep(odaToken)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('resident_session_required')
  })

  // Zayıf bağlantıda tekrar gönderim sık; ikinci istek yeni talep açmamalı.
  it('aynı client_request_id tekrar gönderilirse yeni talep açılmaz', async () => {
    const id = yeniId()
    const yol = `/api/room-portal/${odaToken}/laundry-requests`
    const ilk = await request(app).post(yol).send({ client_request_id: id })
    const tekrar = await request(app).post(yol).send({ client_request_id: id })
    expect(tekrar.body.replayed).toBe(true)
    expect(tekrar.body.receipt).toBe(ilk.body.receipt)
    expect(acikTalepler()).toHaveLength(1)
  })

  it('geçersiz gövde ve bozuk token reddedilir', async () => {
    expect((await request(app).post(`/api/room-portal/${odaToken}/laundry-requests`).send({})).status).toBe(400)
    expect((await talep('gecersiztoken')).status).toBe(404)
  })
})

describe('çamaşırhane tarafı', () => {
  it('açık talepleri oda bilgisiyle listeler', async () => {
    await talep(odaToken, { note: 'Acil', bag_estimate: 3 })
    const liste = listOpenPickupRequests()
    expect(liste.available).toBe(true)
    expect(liste.items).toHaveLength(1)
    expect(liste.items[0]).toMatchObject({ note: 'Acil', bag_estimate: 3, request_count: 1 })
    expect(liste.items[0].display_name).toBeTruthy()
  })

  it('talep kapatılınca listeden düşer ve torbaya bağlanır', async () => {
    await talep(odaToken)
    const db = getDB()
    // laundry_item_id gerçek bir torbaya işaret etmeli; FK uydurma id'yi
    // reddediyor — "talep vardı, torba nerede" izinin kopmaması için doğrusu bu.
    const oda = db.prepare('SELECT id FROM rooms LIMIT 1').get()
    const torbaId = db.prepare("INSERT INTO laundry_items(room_id, item_count, status) VALUES(?,1,'dirty')")
      .run(oda.id).lastInsertRowid
    const kullanici = db.prepare('SELECT id FROM users LIMIT 1').get()

    const id = acikTalepler()[0].id
    const kapali = closePickupRequest(id, { status: 'collected', laundryItemId: torbaId, userId: kullanici.id })
    expect(kapali).toMatchObject({ status: 'collected', laundry_item_id: torbaId })
    expect(kapali.collected_at).toBeTruthy()
    expect(listOpenPickupRequests().items).toHaveLength(0)
  })

  // Kapatılmış talebi tekrar kapatmak sessizce geçmemeli.
  it('açık olmayan talep kapatılamaz', async () => {
    await talep(odaToken)
    const id = acikTalepler()[0].id
    closePickupRequest(id, { status: 'collected' })
    expect(() => closePickupRequest(id, { status: 'collected' })).toThrow(/bulunamadı/)
  })

  it('geçersiz kapatma durumu reddedilir', async () => {
    await talep(odaToken)
    const id = acikTalepler()[0].id
    expect(() => closePickupRequest(id, { status: 'uydurma' })).toThrow(/Geçersiz kapatma/)
  })

  // Boş liste "talep yok" diye okunur; okunamadığını söylemek gerekir.
  it('tablo okunamazsa boş liste değil gerekçe döner', () => {
    const bos = new Database(':memory:')
    const r = listOpenPickupRequests({}, bos)
    expect(r.available).toBe(false)
    expect(r.reason).toMatch(/okunamadı/)
    bos.close()
  })
})

// Talep açmak teslim kapısını atlatmamalı: kart zorunluluğu teslim anında
// baştan uygulanır (spec: "Kart kapısının teslim anında tekrar çalışması").
describe('kart kapısı talepten etkilenmez', () => {
  it('açık talep varken bile teslim kart kapısına takılır', async () => {
    const db = getDB()
    setCardSetting(AKSIYON.INTAKE, true, db)
    await talep(odaToken)

    const oda = db.prepare(`
      SELECT r.block, r.room_no FROM location_qr_codes q
      JOIN service_locations sl ON sl.id = q.location_id
      JOIN rooms r ON r.id = sl.room_id
      WHERE q.token = ?
    `).get(odaToken)

    const res = await request(app).post('/api/self-service/laundry-kiosk/bag')
      .set({ Authorization: `Bearer ${adminToken}` })
      .field('block', oda.block).field('room_no', oda.room_no)
      .field('item_count', '2').field('intake_signature', 'imza')
      .field('card_code', '').field('card_override_reason', '')

    expect(res.status).toBe(409)
    setCardSetting(AKSIYON.INTAKE, false, db)
  })
})
