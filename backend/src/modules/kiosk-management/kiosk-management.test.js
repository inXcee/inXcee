import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

const auth = token => ({ Authorization: `Bearer ${token}` })

let managerToken
let supervisorToken
let technicalToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  technicalToken = (await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })).body.token
})

describe('kiosk management — yetki ve genel bakış', () => {
  it('yönetici ve vardiya amiri genel bakışı görebilir, diğer roller göremez', async () => {
    const manager = await request(app).get('/api/kiosk-management/overview').set(auth(managerToken))
    const supervisor = await request(app).get('/api/kiosk-management/overview').set(auth(supervisorToken))
    const technical = await request(app).get('/api/kiosk-management/overview').set(auth(technicalToken))

    expect(manager.status).toBe(200)
    expect(supervisor.status).toBe(200)
    expect(technical.status).toBe(403)
    expect(manager.body).toMatchObject({
      devices: expect.any(Object),
      pin_coverage: expect.any(Object),
      queues: expect.any(Object),
    })
  })

  it('vardiya amiri kayıt kodu üretemez', async () => {
    const response = await request(app)
      .post('/api/kiosk-management/enrollment-codes')
      .set(auth(supervisorToken))
      .send({ name: 'AVS Ortak', device_type: 'avs_shared', mode: 'shared' })
    expect(response.status).toBe(403)
  })

  it('cihaz türü ile uyumsuz kullanım modunu reddeder', async () => {
    const response = await request(app)
      .post('/api/kiosk-management/enrollment-codes')
      .set(auth(managerToken))
      .send({ name: 'Hatalı ekran', device_type: 'display_general', mode: 'shared' })
    expect(response.status).toBe(400)
  })
})

describe('kiosk device — kayıt, heartbeat ve komutlar', () => {
  let deviceId
  let deviceKey

  it('tek kullanımlık kod üretir ve cihaz anahtarını yalnız kayıt anında döndürür', async () => {
    const issued = await request(app)
      .post('/api/kiosk-management/enrollment-codes')
      .set(auth(managerToken))
      .send({
        name: 'Çamaşır Pilot 1',
        device_type: 'laundry_terminal',
        mode: 'shared',
        location: 'Çamaşırhane',
        expires_minutes: 30,
      })

    expect(issued.status).toBe(201)
    expect(issued.body.code).toMatch(/^KE-/)

    const enrolled = await request(app).post('/api/kiosk-device/enroll').send({
      code: issued.body.code,
      app_version: 'web-test',
      capabilities: { camera: true, indexed_db: true },
    })

    expect(enrolled.status).toBe(201)
    expect(enrolled.body.device_key).toMatch(/^KD-/)
    expect(enrolled.body.device).not.toHaveProperty('token_hash')
    deviceId = enrolled.body.device.id
    deviceKey = enrolled.body.device_key

    const reused = await request(app).post('/api/kiosk-device/enroll').send({ code: issued.body.code })
    expect(reused.status).toBe(409)

    const listed = await request(app).get('/api/kiosk-management/devices').set(auth(managerToken))
    expect(listed.status).toBe(200)
    expect(listed.body.find(device => device.id === deviceId)).not.toHaveProperty('token_hash')

    const updated = await request(app)
      .patch(`/api/kiosk-management/devices/${deviceId}`)
      .set(auth(managerToken))
      .send({ location: 'Yeni Konum' })
    expect(updated.status).toBe(200)
    expect(updated.body).not.toHaveProperty('token_hash')
  })

  it('heartbeat sağlık, kuyruk ve kullanıcı durumunu günceller', async () => {
    const response = await request(app)
      .post('/api/kiosk-device/heartbeat')
      .set('X-Kiosk-Device-Key', deviceKey)
      .send({
        app_version: 'web-test-2',
        queue_count: 4,
        error_count: 1,
        health: { online: true, storage_percent: 32 },
        current_principal: { kind: 'staff', id: 7, name: 'Pilot Operatör' },
      })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: 'active', queue_count: 4, error_count: 1 })
    const row = getDB().prepare('SELECT * FROM kiosk_devices WHERE id=?').get(deviceId)
    expect(row.last_principal_name).toBe('Pilot Operatör')
    expect(row.token_hash).not.toContain(deviceKey)
  })

  it('yönetici kilit komutu yollar, cihaz görür ve tamamlandı olarak işaretler', async () => {
    const created = await request(app)
      .post(`/api/kiosk-management/devices/${deviceId}/commands`)
      .set(auth(managerToken))
      .send({ command_type: 'lock', payload: { reason: 'Vardiya sonu' } })

    expect(created.status).toBe(201)
    const pending = await request(app)
      .get('/api/kiosk-device/commands')
      .set('X-Kiosk-Device-Key', deviceKey)
    expect(pending.status).toBe(200)
    expect(pending.body.some(command => command.id === created.body.id)).toBe(true)

    const ack = await request(app)
      .post(`/api/kiosk-device/commands/${created.body.id}/ack`)
      .set('X-Kiosk-Device-Key', deviceKey)
      .send({ status: 'completed' })
    expect(ack.status).toBe(200)

    const config = await request(app)
      .get('/api/kiosk-device/config')
      .set('X-Kiosk-Device-Key', deviceKey)
    expect(config.status).toBe(200)
    expect(config.body.device.status).toBe('locked')
  })

  it('anahtar döndürme eski anahtarı iptal eder', async () => {
    const rotated = await request(app)
      .post('/api/kiosk-device/rotate-key')
      .set('X-Kiosk-Device-Key', deviceKey)
    expect(rotated.status).toBe(200)
    expect(rotated.body.device_key).toMatch(/^KD-/)

    const oldKey = await request(app).get('/api/kiosk-device/config').set('X-Kiosk-Device-Key', deviceKey)
    expect(oldKey.status).toBe(401)
    deviceKey = rotated.body.device_key
  })

  it('iptal edilen cihaz artık doğrulanamaz', async () => {
    const revoked = await request(app)
      .post(`/api/kiosk-management/devices/${deviceId}/revoke`)
      .set(auth(managerToken))
    expect(revoked.status).toBe(200)

    const config = await request(app).get('/api/kiosk-device/config').set('X-Kiosk-Device-Key', deviceKey)
    expect(config.status).toBe(401)
  })
})

describe('kiosk migration', () => {
  it('cihaz bağlantı kolonlarını ve temel indeksleri oluşturur', () => {
    const db = getDB()
    const authColumns = db.pragma('table_info(auth_sessions)').map(column => column.name)
    const stationColumns = db.pragma('table_info(scan_stations)').map(column => column.name)
    expect(authColumns).toContain('device_id')
    expect(stationColumns).toContain('device_id')
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_kiosk_devices_last_seen'").get()).toBeTruthy()
  })
})
