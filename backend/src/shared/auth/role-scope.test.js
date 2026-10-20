// Rol/kapsam yetkisi: auth-coverage.test.js token'sız erişimi denetler; bu dosya
// GEÇERLİ ama yetkisiz token'larla yönetim verisine erişilemediğini doğrular.
// Kiosk (sakin, role='kiosk') ve AVS kiosk (çalışan, role='avs_kiosk') token'ları
// requireAuth'tan geçtiği için yalnız requireAuth ile korunan uçlar bunlara açıktı.
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../app.js'
import { initDB, getDB } from '../db/index.js'
import { seedDev } from '../db/seed.js'

const auth = t => ({ Authorization: `Bearer ${t}` })
const login = async username =>
  (await request(app).post('/api/auth/login').send({ username, password: 'admin123' })).body.token

let kiosk, avsKiosk, manager, supervisor, housekeeper, laundry, technical
let personnelId, staffId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  personnelId = db.prepare('SELECT id FROM personnel WHERE check_out_date IS NULL LIMIT 1').get().id
  staffId = db.prepare('SELECT id FROM staff WHERE is_active=1 LIMIT 1').get().id
  kiosk = jwt.sign({ personnelId, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
  avsKiosk = jwt.sign({ workerId: staffId, role: 'avs_kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
  manager = await login('mudur')
  supervisor = await login('vardiya')
  housekeeper = await login('meydanci')
  laundry = await login('camasir')
  technical = await login('teknik')
})

// Panel/mobil uçları: kiosk token'ları 403, personel rolleri geçer.
const STAFF_ENDPOINTS = [
  ['get', '/api/companies'],
  ['get', '/api/companies/stats'],
  ['get', '/api/projects'],
  ['get', '/api/visitors/stats'],
  ['get', '/api/drills'],
  ['get', '/api/drills/roster'],
  ['get', '/api/automation'],
  ['get', '/api/inventory/requests'],
  ['get', '/api/campus-map/summary'],
  ['get', '/api/campus-map/operations'],
  ['get', '/api/notifications'],
  ['post', '/api/notifications/mark-all-read'],
  ['post', '/api/notifications/clear-read'],
  ['get', '/api/notification-prefs'],
  ['post', '/api/push/subscribe'],
]

// Yönetim verisi (belge, gider, ziyaretçi TC'si, anket cevapları, grup üyelerinin
// e-posta/telefonu): yalnız müdür + amir.
const MGMT_ENDPOINTS = [
  ['get', '/api/documents'],
  ['get', '/api/documents/1/download'],
  ['get', '/api/expenses'],
  ['get', '/api/expenses/summary'],
  ['get', '/api/visitors'],
  ['get', '/api/surveys'],
  ['get', '/api/notification-groups'],
  ['get', '/api/notification-groups/1'],
]

// Kart/QR kimlik bilgisi (kart kodu, NFC UID, qr_token, TC): yalnız müdür + amir.
const CREDENTIAL_ENDPOINTS = () => [
  ['get', `/api/qr/staff/${staffId}`],
  ['get', `/api/qr/staff/${staffId}/card/pdf`],
  ['get', '/api/cards/roster'],
  ['get', `/api/cards/staff/${staffId}`],
  ['get', '/api/cards/1/pdf'],
]

const call = (method, url, token) => request(app)[method](url).set(auth(token)).send({})

describe('kiosk token\'ları panel uçlarına giremez', () => {
  it.each([...STAFF_ENDPOINTS, ...MGMT_ENDPOINTS])('%s %s → kiosk/avs_kiosk 403', async (method, url) => {
    expect((await call(method, url, kiosk)).status).toBe(403)
    expect((await call(method, url, avsKiosk)).status).toBe(403)
  })

  it('personel rolleri panel uçlarına girmeye devam eder', async () => {
    for (const [method, url] of STAFF_ENDPOINTS) {
      const res = await call(method, url, housekeeper)
      expect([401, 403], `${method} ${url}`).not.toContain(res.status)
    }
  })

  it('bildirim akışı (SSE) kiosk token\'ına kapalı', async () => {
    const res = await request(app).get(`/api/notifications/stream?token=${kiosk}`)
    expect(res.status).toBe(403)
  })
})

describe('yönetim verisi yalnız müdür + amir', () => {
  it.each(MGMT_ENDPOINTS)('%s %s → saha rolleri 403', async (method, url) => {
    for (const token of [housekeeper, laundry, technical]) {
      expect((await call(method, url, token)).status).toBe(403)
    }
  })

  it.each(MGMT_ENDPOINTS)('%s %s → müdür ve amir girer', async (method, url) => {
    for (const token of [manager, supervisor]) {
      expect([401, 403]).not.toContain((await call(method, url, token)).status)
    }
  })

  it('kart/QR kimlik bilgisi saha rollerine kapalı, yönetime açık', async () => {
    getDB().prepare("UPDATE staff SET qr_token='QR-TEST-TOKEN' WHERE id=?").run(staffId)
    for (const [method, url] of CREDENTIAL_ENDPOINTS()) {
      for (const token of [housekeeper, laundry, technical]) {
        expect((await call(method, url, token)).status, `${url}`).toBe(403)
      }
      expect([401, 403], `${url}`).not.toContain((await call(method, url, manager)).status)
    }
  })
})

describe('POST /api/surveys/submit', () => {
  const body = { overall_score: 5, comment: 'iyi' }

  it('oturumsuz gönderim reddedilir', async () => {
    const res = await request(app).post('/api/surveys/submit').send({ ...body, personnel_id: personnelId })
    expect(res.status).toBe(401)
  })

  it('kiosk başkası adına gönderemez, kendi adına ve anonim gönderebilir', async () => {
    const other = getDB().prepare("INSERT INTO personnel(full_name) VALUES('Anket Başkası')").run().lastInsertRowid
    const res = await request(app).post('/api/surveys/submit').set(auth(kiosk)).send({ ...body, personnel_id: other })
    expect(res.status).toBe(403)
    const own = await request(app).post('/api/surveys/submit').set(auth(kiosk)).send({ ...body, personnel_id: personnelId })
    expect(own.status).toBe(201)
    const anon = await request(app).post('/api/surveys/submit').set(auth(kiosk)).send(body)
    expect(anon.status).toBe(201)
  })
})

describe('PATCH /api/notifications/:id/read', () => {
  it('başka role giden bildirim okundu yapılamaz', async () => {
    const db = getDB()
    const id = db.prepare(`
      INSERT INTO notifications(type, message, target_role, is_read) VALUES('info', 'müdüre özel', 'campus_manager', 0)
    `).run().lastInsertRowid
    const res = await request(app).patch(`/api/notifications/${id}/read`).set(auth(housekeeper))
    expect(res.status).toBe(403)
    expect(db.prepare('SELECT is_read FROM notifications WHERE id=?').get(id).is_read).toBe(0)

    const ok = await request(app).patch(`/api/notifications/${id}/read`).set(auth(manager))
    expect(ok.status).toBe(200)
    expect(db.prepare('SELECT is_read FROM notifications WHERE id=?').get(id).is_read).toBe(1)
  })
})
