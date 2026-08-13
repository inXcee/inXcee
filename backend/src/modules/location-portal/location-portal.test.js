import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { resolveLocationToken } from './service.js'

let managerToken
let supervisorToken
let laundryToken

const auth = token => ({ Authorization: `Bearer ${token}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  laundryToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
})

describe('location portal — ayarlar ve yetki', () => {
  it('sekiz ayarı da kapalı başlatır', async () => {
    const response = await request(app).get('/api/location-portal/settings').set(auth(managerToken))
    expect(response.status).toBe(200)
    expect(Object.keys(response.body)).toHaveLength(8)
    expect(Object.values(response.body).every(value => value === false)).toBe(true)
  })

  it('yönetici bağımsız ayarı açar, amir salt okunur görür', async () => {
    const updated = await request(app).put('/api/location-portal/settings')
      .set(auth(managerToken))
      .send({ location_portal_fault_enabled: true })
    expect(updated.status).toBe(200)
    expect(updated.body.location_portal_fault_enabled).toBe(true)
    expect(updated.body.location_portal_laundry_enabled).toBe(false)

    const visible = await request(app).get('/api/location-portal/settings').set(auth(supervisorToken))
    expect(visible.status).toBe(200)
    expect(visible.body.location_portal_fault_enabled).toBe(true)
    expect((await request(app).put('/api/location-portal/settings')
      .set(auth(supervisorToken)).send({ location_portal_enabled: true })).status).toBe(403)
  })

  it('bilinmeyen ve boolean olmayan ayarı reddeder', async () => {
    expect((await request(app).put('/api/location-portal/settings')
      .set(auth(managerToken)).send({ location_portal_enabled: 'evet' })).status).toBe(400)
    expect((await request(app).put('/api/location-portal/settings')
      .set(auth(managerToken)).send({ baska_ayar: true })).status).toBe(400)
  })
})

describe('location portal — konum ve token yaşam döngüsü', () => {
  it('konumları sayfalı listeler ve alakasız rolü engeller', async () => {
    const response = await request(app).get('/api/location-portal/locations?limit=5&location_type=room')
      .set(auth(supervisorToken))
    expect(response.status).toBe(200)
    expect(response.body.items.length).toBeLessThanOrEqual(5)
    expect(response.body.items.every(item => item.location_type === 'room')).toBe(true)
    expect((await request(app).get('/api/location-portal/locations').set(auth(laundryToken))).status).toBe(403)
  })

  it('eksik aktif konumlara 256-bit token üretir ve tekrarında çoğaltmaz', async () => {
    const first = await request(app).post('/api/location-portal/locations/generate-missing')
      .set(auth(managerToken)).send({ block: 'M1' })
    expect(first.status).toBe(201)
    expect(first.body.created).toBeGreaterThan(0)

    const second = await request(app).post('/api/location-portal/locations/generate-missing')
      .set(auth(managerToken)).send({ block: 'M1' })
    expect(second.body.created).toBe(0)
    const tokens = getDB().prepare(`
      SELECT q.token,q.token_hash
      FROM location_qr_codes q JOIN service_locations sl ON sl.id=q.location_id
      WHERE sl.block='M1' AND q.status='active'
    `).all()
    expect(tokens.every(row => Buffer.from(row.token, 'base64url').length === 32)).toBe(true)
    expect(new Set(tokens.map(row => row.token)).size).toBe(tokens.length)
    expect(tokens.every(row => row.token_hash.length === 64)).toBe(true)
  })

  it('QR döndürür, eskisini iptal eder ve çözümleme durumunu korur', async () => {
    const db = getDB()
    const location = db.prepare(`
      SELECT sl.id,q.token,q.id AS qr_id
      FROM service_locations sl JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
      WHERE sl.block='M1' LIMIT 1
    `).get()
    const rotated = await request(app).post(`/api/location-portal/locations/${location.id}/rotate`)
      .set(auth(managerToken)).send({ reason: 'kopya şüphesi' })
    expect(rotated.status).toBe(201)
    expect(rotated.body.token).not.toBe(location.token)
    expect(rotated.body.rotated_from_id).toBe(location.qr_id)
    expect(resolveLocationToken(location.token).qr_status).toBe('revoked')
    expect(resolveLocationToken(rotated.body.token).qr_status).toBe('active')
    expect(db.prepare("SELECT COUNT(*) c FROM location_qr_codes WHERE location_id=? AND status='active'").get(location.id).c).toBe(1)
  })

  it('aktif QRı iptal eder; ikinci iptal 404 döner', async () => {
    const db = getDB()
    const location = db.prepare(`
      SELECT sl.id FROM service_locations sl
      JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
      LIMIT 1
    `).get()
    const first = await request(app).post(`/api/location-portal/locations/${location.id}/revoke`)
      .set(auth(managerToken)).send({ reason: 'etiket kaldırıldı' })
    expect(first.status).toBe(200)
    expect((await request(app).post(`/api/location-portal/locations/${location.id}/revoke`)
      .set(auth(managerToken)).send({ reason: 'tekrar' })).status).toBe(404)
  })
})
