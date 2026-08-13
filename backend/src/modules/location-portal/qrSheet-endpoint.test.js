import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateMissingQrCodes } from './service.js'

// Gercek semada: QR uretimi + foy uretimi + yetki.

let adminToken, supervisorToken
const auth = t => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login')
    .send({ username: 'vardiya', password: 'admin123' })).body.token
  generateMissingQrCodes({}, null)
})

describe('GET /api/location-portal/qr-sheet.pdf', () => {
  it('gercek PDF doner ve indirilebilir isimlendirilir', async () => {
    const res = await request(app).get('/api/location-portal/qr-sheet.pdf?block=M1&floor=1').set(auth(adminToken))
    expect(`${res.status}`).toBe('200')
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')
  })

  // Filtre calismazsa 1078 etiket tek dosyada gelir; is gormez.
  it('filtre ciktiyi kucultur ve dosya adina yansir', async () => {
    const blok = await request(app).get('/api/location-portal/qr-sheet.pdf?block=M1').set(auth(adminToken))
    const kat = await request(app).get('/api/location-portal/qr-sheet.pdf?block=M1&floor=1').set(auth(adminToken))
    expect(kat.status).toBe(200)
    expect(kat.body.length).toBeLessThan(blok.body.length)
    expect(kat.headers['content-disposition']).toContain('M1')
  }, 30000)

  // Tumunu basmak gercek bir senaryo (1000+ etiket) ve ~11 sn suruyor; bu
  // testin varlik sebebi o surenin sessizce buyumedigini yakalamak.
  it('filtresiz tam foy da uretilebilir', async () => {
    const res = await request(app).get('/api/location-portal/qr-sheet.pdf').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')
  }, 60000)

  // Bos sonucta bos PDF "hepsi basildi" gibi okunur; aciklama sayfasi gelmeli.
  it('eslesme yoksa yine gecerli PDF doner', async () => {
    const res = await request(app).get('/api/location-portal/qr-sheet.pdf?block=YOKBLOK').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('yalniz yonetici basabilir', async () => {
    expect((await request(app).get('/api/location-portal/qr-sheet.pdf').set(auth(supervisorToken))).status).toBe(403)
    expect((await request(app).get('/api/location-portal/qr-sheet.pdf')).status).toBe(401)
  })
})
