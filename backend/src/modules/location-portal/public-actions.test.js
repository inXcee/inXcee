import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateMissingQrCodes, updatePortalSettings } from './service.js'

let room
let roomToken
let residentId

function setPortalSettings(patch = {}) {
  updatePortalSettings({
    location_portal_enabled: true,
    location_portal_fault_enabled: true,
    location_portal_survey_enabled: true,
    location_portal_fault_pin_required: false,
    ...patch,
  })
}

function faultRequest(clientRequestId = 'fault-request-001', category = 'tesisat') {
  return request(app).post(`/api/room-portal/${roomToken}/faults`)
    .field('client_request_id', clientRequestId)
    .field('category', category)
    .field('description', 'Lavabo musluğu su kaçırıyor')
}

async function residentSession() {
  const response = await request(app).post(`/api/room-portal/${roomToken}/auth`)
    .send({ identifier: '99887766550', pin: '2468' })
  expect(response.status).toBe(200)
  return response.body.session_token
}

function removeCreatedImages() {
  const db = getDB()
  let rows = []
  try { rows = db.prepare("SELECT file_url FROM maintenance_request_media WHERE source='room_qr'").all() } catch { return }
  for (const row of rows) {
    const target = path.join(process.cwd(), row.file_url.replace(/^\//, ''))
    try { fs.unlinkSync(target) } catch { /* already removed */ }
  }
}

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  room = db.prepare("SELECT id,block,floor,room_no FROM rooms WHERE block='M1' ORDER BY id LIMIT 1").get()
  residentId = db.prepare(`
    INSERT INTO personnel(tc_no,full_name,company,kiosk_pin)
    VALUES('99887766550','Portal İşlem Sakini','Test',?)
  `).run(bcrypt.hashSync('2468', 10)).lastInsertRowid
  db.prepare('INSERT INTO room_assignments(personnel_id,room_id,bed_no) VALUES(?,?,2)').run(residentId, room.id)
  generateMissingQrCodes({ block: room.block }, 1)
  roomToken = db.prepare(`
    SELECT q.token FROM location_qr_codes q
    JOIN service_locations sl ON sl.id=q.location_id
    WHERE sl.room_id=? AND q.status='active'
  `).get(room.id).token
})

beforeEach(() => {
  const db = getDB()
  removeCreatedImages()
  db.exec(`
    DELETE FROM location_portal_receipts;
    DELETE FROM location_portal_events;
    DELETE FROM location_portal_sessions;
    DELETE FROM maintenance_request_media;
    DELETE FROM maintenance_comments;
    DELETE FROM maintenance_requests;
    DELETE FROM satisfaction_surveys;
  `)
  setPortalSettings()
})

afterAll(removeCreatedImages)

describe('room portal arıza bildirimi', () => {
  it('portal veya arıza hizmeti kapalıyken kayıt açmaz', async () => {
    setPortalSettings({ location_portal_fault_enabled: false })
    const response = await faultRequest()
    expect(response.status).toBe(404)
    expect(response.body.code).toBe('action_disabled')
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM maintenance_requests').get().count).toBe(0)
  })

  it('anonim bildirimi mevcut teknik bakım akışına, audit ve makbuza bağlar', async () => {
    const response = await faultRequest()
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ merged: false, replayed: false, status: 'accepted' })
    expect(response.body.receipt).toHaveLength(24)

    const db = getDB()
    const fault = db.prepare('SELECT * FROM maintenance_requests').get()
    const location = db.prepare('SELECT id FROM service_locations WHERE room_id=?').get(room.id)
    expect(fault).toMatchObject({
      room_id: room.id,
      block: room.block,
      service_location_id: location.id,
      request_source: 'room_qr',
      identity_mode: 'anonymous',
      category: 'tesisat',
      status: 'open',
    })
    expect(db.prepare("SELECT result,actor_mode,linked_entity_id FROM location_portal_events WHERE event_type='fault'").get())
      .toMatchObject({ result: 'accepted', actor_mode: 'anonymous', linked_entity_id: fault.id })
    expect(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE target_role='technical'").get().count).toBe(1)

    const receipt = await request(app).get(`/api/room-portal/receipts/${response.body.receipt}`)
    expect(receipt.body).toMatchObject({ action: 'fault', status: 'accepted' })
    expect(JSON.stringify(receipt.body)).not.toContain('personnel_id')
  })

  it('PIN zorunluyken oturumsuz isteği reddeder, doğru oda oturumunu kaydeder', async () => {
    setPortalSettings({ location_portal_fault_pin_required: true })
    expect((await faultRequest()).status).toBe(401)
    const token = await residentSession()
    const response = await faultRequest('fault-request-pin').set('X-Room-Portal-Session', token)
    expect(response.status).toBe(201)
    const fault = getDB().prepare('SELECT reporter_personnel_id,identity_mode FROM maintenance_requests').get()
    expect(fault).toEqual({ reporter_personnel_id: residentId, identity_mode: 'resident_pin' })
  })

  it('aynı konum ve kategorideki açık kaydı birleştirir, farklı kategoriyi ayırır', async () => {
    expect((await faultRequest('fault-merge-001')).status).toBe(201)
    const merged = await faultRequest('fault-merge-002')
      .field('unused', '')
    expect(merged.status).toBe(200)
    expect(merged.body.merged).toBe(true)
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM maintenance_requests').get().count).toBe(1)
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM maintenance_comments').get().count).toBe(1)
    expect((await faultRequest('fault-separate-001', 'elektrik')).status).toBe(201)
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM maintenance_requests').get().count).toBe(2)
  })

  it('aynı client_request_id tekrarında yeni kayıt veya olay üretmez', async () => {
    const first = await faultRequest('fault-idempotent-001')
    const replay = await faultRequest('fault-idempotent-001')
    expect(replay.status).toBe(200)
    expect(replay.body).toMatchObject({ receipt: first.body.receipt, replayed: true })
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM maintenance_requests').get().count).toBe(1)
    expect(getDB().prepare("SELECT COUNT(*) AS count FROM location_portal_events WHERE event_type='fault'").get().count).toBe(1)
  })

  it('sahte MIME içeriğini reddeder; gerçek fotoğrafları EXIFsiz JPEG ve en fazla 1600 px saklar', async () => {
    const fake = await faultRequest('fault-photo-fake')
      .attach('photos', Buffer.from('not-a-real-image'), { filename: 'fake.jpg', contentType: 'image/jpeg' })
    expect(fake.status).toBe(400)
    expect(fake.body.code).toBe('invalid_photo_content')

    const original = await sharp({
      create: { width: 2200, height: 1100, channels: 3, background: { r: 24, g: 120, b: 180 } },
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const accepted = await faultRequest('fault-photo-real')
      .attach('photos', original, { filename: 'room.jpg', contentType: 'image/jpeg' })
    expect(accepted.status).toBe(201)
    const url = getDB().prepare('SELECT file_url FROM maintenance_request_media').get().file_url
    const metadata = await sharp(path.join(process.cwd(), url.replace(/^\//, ''))).metadata()
    expect(metadata.format).toBe('jpeg')
    expect(Math.max(metadata.width, metadata.height)).toBeLessThanOrEqual(1600)
    expect(metadata.exif).toBeUndefined()
    expect(getDB().prepare('SELECT photo_before FROM maintenance_requests').get().photo_before).toBe(url)
  })
})

describe('room portal konuma bağlı anket', () => {
  it('anonim anketi konumla kaydeder ve idempotent makbuz döndürür', async () => {
    const payload = {
      client_request_id: 'survey-request-001',
      room_score: 4,
      cleaning_score: 5,
      overall_score: 4,
      comment: 'Oda genel olarak iyi durumda',
    }
    const first = await request(app).post(`/api/room-portal/${roomToken}/surveys`).send(payload)
    const replay = await request(app).post(`/api/room-portal/${roomToken}/surveys`).send(payload)
    expect(first.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(replay.body).toMatchObject({ receipt: first.body.receipt, replayed: true })
    const survey = getDB().prepare('SELECT * FROM satisfaction_surveys').get()
    expect(survey).toMatchObject({ survey_source: 'room_qr', identity_mode: 'anonymous', room_score: 4, overall_score: 4 })
    expect(survey.service_location_id).toBeTruthy()
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM satisfaction_surveys').get().count).toBe(1)
  })

  it('isteğe bağlı PIN kullanıldığında yalnız doğrulanmış sakini bağlar', async () => {
    const token = await residentSession()
    const response = await request(app).post(`/api/room-portal/${roomToken}/surveys`)
      .set('X-Room-Portal-Session', token)
      .send({ client_request_id: 'survey-request-pin', overall_score: 5 })
    expect(response.status).toBe(201)
    expect(getDB().prepare('SELECT personnel_id,identity_mode FROM satisfaction_surveys').get())
      .toEqual({ personnel_id: residentId, identity_mode: 'resident_pin' })
  })
})
