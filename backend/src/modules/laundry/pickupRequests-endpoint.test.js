import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateMissingQrCodes, updatePortalSettings } from '../location-portal/service.js'

// Oda QR'ından gelen çamaşır taleplerinin ÇAMAŞIRHANE TARAFI.
//
// Bu dosya somut bir boşluktan doğdu: Faz 5 talebi oluşturuyor ve bildirim
// atıyordu ama talebi görecek/kapatacak hiçbir uç yoktu. Hizmet canlıda
// açıldığında sakin "talebiniz iletildi" makbuzu alıyor, çamaşırhanede zil
// çalıyor, sonrası boşluktu.
//
// Kapatmanın ikinci işlevi: oda başına tek açık talep kısıtı var. Talep hiç
// kapatılmazsa o oda bir daha "yeni" talep açamaz — hepsi eski kayda birleşir.

let camasirToken, adminToken, amirToken, odaToken, odaId

const talepAc = (token, govde = {}) => request(app)
  .post(`/api/room-portal/${token}/laundry-requests`)
  .send({ client_request_id: `pickup-${Math.random().toString(36).slice(2, 10)}`, ...govde })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = (u) => request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })
  camasirToken = (await giris('camasir')).body.token
  adminToken = (await giris('mudur')).body.token
  amirToken = (await giris('vardiya')).body.token
  generateMissingQrCodes({}, null)

  const oda = getDB().prepare(`
    SELECT sl.id, q.token FROM service_locations sl
    JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
    WHERE sl.location_type='room' ORDER BY sl.id LIMIT 1
  `).get()
  odaToken = oda.token
  odaId = oda.id
})

beforeEach(() => {
  getDB().prepare('DELETE FROM laundry_pickup_requests').run()
  getDB().prepare('DELETE FROM location_portal_receipts').run()
  updatePortalSettings({
    location_portal_enabled: true,
    location_portal_laundry_enabled: true,
    location_portal_laundry_pin_required: false,
  })
})

const yetkili = (m, yol, token) => request(app)[m](yol).set({ Authorization: `Bearer ${token}` })

describe('çamaşır alma talepleri — çamaşırhane tarafı', () => {
  it('sakinin açtığı talep çamaşırhane listesinde görünür', async () => {
    await talepAc(odaToken, { note: 'İki torba var', bag_estimate: 2 })

    const res = await yetkili('get', '/api/laundry/pickup-requests', camasirToken)
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(res.body.available).toBe(true)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({ note: 'İki torba var', bag_estimate: 2, request_count: 1 })
    expect(res.body.items[0].display_name).toBeTruthy()
  })

  it('talep yokken boş liste ama available=true döner', async () => {
    const res = await yetkili('get', '/api/laundry/pickup-requests', camasirToken)
    expect(res.body).toMatchObject({ available: true, items: [] })
  })

  it('talep kapatılınca listeden düşer', async () => {
    await talepAc(odaToken)
    const id = getDB().prepare("SELECT id FROM laundry_pickup_requests WHERE status='open'").get().id

    const kapat = await yetkili('post', `/api/laundry/pickup-requests/${id}/close`, camasirToken)
      .send({ status: 'collected' })
    expect(kapat.status).toBe(200)
    expect(kapat.body.status).toBe('collected')
    expect(kapat.body.collected_at).toBeTruthy()

    expect((await yetkili('get', '/api/laundry/pickup-requests', camasirToken)).body.items).toHaveLength(0)
  })

  // ASIL SEBEP: oda başına tek açık talep kısıtı var. Kapatılmazsa sakinin
  // ikinci isteği yeni kayıt açamaz, eskisine birleşir.
  it('kapatıldıktan sonra sakin YENİ talep açabilir', async () => {
    await talepAc(odaToken, { note: 'ilk' })
    const id = getDB().prepare("SELECT id FROM laundry_pickup_requests WHERE status='open'").get().id
    await yetkili('post', `/api/laundry/pickup-requests/${id}/close`, camasirToken).send({ status: 'collected' })

    const ikinci = await talepAc(odaToken, { note: 'ikinci' })
    expect(ikinci.body.merged).toBe(false)
    const acik = getDB().prepare("SELECT * FROM laundry_pickup_requests WHERE status='open'").all()
    expect(acik).toHaveLength(1)
    expect(acik[0].note).toBe('ikinci')
  })

  it('kapatılmamışken ikinci istek birleşir (kuyruk şişmez)', async () => {
    await talepAc(odaToken, { note: 'ilk' })
    const ikinci = await talepAc(odaToken, { note: 'ikinci' })
    expect(ikinci.body.merged).toBe(true)
    const liste = (await yetkili('get', '/api/laundry/pickup-requests', camasirToken)).body.items
    expect(liste).toHaveLength(1)
    expect(liste[0].request_count).toBe(2)
  })

  it('zaten kapalı talep ikinci kez kapatılamaz', async () => {
    await talepAc(odaToken)
    const id = getDB().prepare("SELECT id FROM laundry_pickup_requests WHERE status='open'").get().id
    await yetkili('post', `/api/laundry/pickup-requests/${id}/close`, camasirToken).send({ status: 'collected' })

    const tekrar = await yetkili('post', `/api/laundry/pickup-requests/${id}/close`, camasirToken).send({ status: 'collected' })
    expect(tekrar.status).toBe(404)
    expect(tekrar.body.code).toBe('request_not_found')
  })

  it('geçersiz kapatma durumu 400 döner', async () => {
    await talepAc(odaToken)
    const id = getDB().prepare("SELECT id FROM laundry_pickup_requests WHERE status='open'").get().id
    const res = await yetkili('post', `/api/laundry/pickup-requests/${id}/close`, camasirToken).send({ status: 'uydurma' })
    expect(res.status).toBe(400)
  })

  it('iptal gerekçesiyle kapatılabilir', async () => {
    await talepAc(odaToken)
    const id = getDB().prepare("SELECT id FROM laundry_pickup_requests WHERE status='open'").get().id
    const res = await yetkili('post', `/api/laundry/pickup-requests/${id}/close`, camasirToken)
      .send({ status: 'cancelled', reason: 'Sakin vazgeçti' })
    expect(res.body).toMatchObject({ status: 'cancelled', cancelled_reason: 'Sakin vazgeçti' })
    expect(res.body.collected_at).toBeNull()
  })

  describe('yetki', () => {
    it('amir listeyi görebilir ama kapatamaz', async () => {
      await talepAc(odaToken)
      expect((await yetkili('get', '/api/laundry/pickup-requests', amirToken)).status).toBe(200)
      const id = getDB().prepare("SELECT id FROM laundry_pickup_requests WHERE status='open'").get().id
      expect((await yetkili('post', `/api/laundry/pickup-requests/${id}/close`, amirToken).send({})).status).toBe(403)
    })

    it('yönetici hem görür hem kapatır', async () => {
      await talepAc(odaToken)
      const id = getDB().prepare("SELECT id FROM laundry_pickup_requests WHERE status='open'").get().id
      expect((await yetkili('get', '/api/laundry/pickup-requests', adminToken)).status).toBe(200)
      expect((await yetkili('post', `/api/laundry/pickup-requests/${id}/close`, adminToken).send({})).status).toBe(200)
    })

    it('yetkisiz erişim reddedilir', async () => {
      expect((await request(app).get('/api/laundry/pickup-requests')).status).toBe(401)
      expect((await request(app).post('/api/laundry/pickup-requests/1/close').send({})).status).toBe(401)
    })
  })
})
