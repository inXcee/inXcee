import bcrypt from 'bcryptjs'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateMissingQrCodes, updatePortalSettings } from './service.js'
import {
  createOrGetPortalReceipt,
  portalIpHash,
  verifyPortalSession,
} from './public-service.js'

let room
let roomToken
let otherRoom
let residentId

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  room = db.prepare("SELECT id,block,floor,room_no FROM rooms WHERE block='M1' ORDER BY id LIMIT 1").get()
  otherRoom = db.prepare('SELECT id FROM rooms WHERE id<>? ORDER BY id LIMIT 1').get(room.id)
  residentId = db.prepare(`
    INSERT INTO personnel(tc_no,full_name,company,kiosk_pin)
    VALUES('12345678901','Ali Portal Test','Test',?)
  `).run(bcrypt.hashSync('2468', 10)).lastInsertRowid
  db.prepare('INSERT INTO room_assignments(personnel_id,room_id,bed_no) VALUES(?,?,1)').run(residentId, room.id)
  generateMissingQrCodes({ block: room.block }, 1)
  roomToken = db.prepare(`
    SELECT q.token FROM location_qr_codes q
    JOIN service_locations sl ON sl.id=q.location_id
    WHERE sl.room_id=? AND q.status='active'
  `).get(room.id).token
})

beforeEach(() => {
  updatePortalSettings(Object.fromEntries([
    'location_portal_enabled',
    'location_portal_fault_enabled',
    'location_portal_laundry_enabled',
    'location_portal_cleaning_enabled',
    'location_portal_survey_enabled',
    'location_portal_fault_pin_required',
    'location_portal_laundry_pin_required',
    'location_portal_cleaning_review_pin_required',
  ].map(key => [key, false])))
})

describe('public room portal — konum çözümleme', () => {
  it('bilinmeyen QRı 404, iptal edilmiş QRı 410 döndürür', async () => {
    expect((await request(app).get(`/api/room-portal/${'x'.repeat(43)}`)).status).toBe(404)
    const db = getDB()
    db.prepare("UPDATE location_qr_codes SET status='revoked' WHERE token=?").run(roomToken)
    const revoked = await request(app).get(`/api/room-portal/${roomToken}`)
    expect(revoked.status).toBe(410)
    expect(revoked.body.code).toBe('revoked_qr')
    db.prepare("UPDATE location_qr_codes SET status='active' WHERE token=?").run(roomToken)
  })

  it('portal kapalıyken konumu gösterir fakat bütün işlemleri kapatır', async () => {
    const response = await request(app).get(`/api/room-portal/${roomToken}`)
    expect(response.status).toBe(200)
    expect(response.body.portal_status).toBe('disabled')
    expect(response.body.location).toMatchObject({ type: 'room', block: room.block })
    expect(Object.values(response.body.actions).every(action => action.enabled === false)).toBe(true)
    expect(JSON.stringify(response.body)).not.toContain('Ali Portal Test')
  })

  it('yalnız açılmış işlemleri ve bağımsız PIN kurallarını döndürür', async () => {
    updatePortalSettings({
      location_portal_enabled: true,
      location_portal_fault_enabled: true,
      location_portal_fault_pin_required: true,
      location_portal_cleaning_enabled: true,
      location_portal_cleaning_review_pin_required: true,
      location_portal_survey_enabled: true,
    })
    const response = await request(app).get(`/api/room-portal/${roomToken}`)
    expect(response.body.actions.fault).toEqual({ enabled: true, pin_required: true })
    expect(response.body.actions.survey).toEqual({ enabled: true, pin_required: false })
    expect(response.body.actions.cleaning).toEqual({ enabled: true, pin_required: false, review_pin_required: true })
    expect(response.body.actions.laundry.enabled).toBe(false)
    const event = getDB().prepare("SELECT * FROM location_portal_events WHERE event_type='scan' ORDER BY id DESC LIMIT 1").get()
    expect(event.ip_hash).toHaveLength(64)
    expect(event.ip_hash).not.toContain('127.0.0.1')
  })

  it('ortak alan QRında çamaşır ayarı açık olsa bile çamaşır işlemini gizler', async () => {
    updatePortalSettings({ location_portal_enabled: true, location_portal_laundry_enabled: true })
    const db = getDB()
    const commonToken = db.prepare(`
      SELECT q.token FROM location_qr_codes q
      JOIN service_locations sl ON sl.id=q.location_id
      WHERE sl.location_type='common_area' AND sl.block=? AND q.status='active'
      LIMIT 1
    `).get(room.block).token
    const response = await request(app).get(`/api/room-portal/${commonToken}`)
    expect(response.status).toBe(200)
    expect(response.body.location.type).toBe('common_area')
    expect(response.body.actions.laundry.enabled).toBe(false)
  })
})

describe('public room portal — konuma bağlı sakin PINi', () => {
  beforeEach(() => updatePortalSettings({ location_portal_enabled: true }))

  it('doğru oda sakinine yalnız hashlenen 15 dakikalık oturum verir', async () => {
    const response = await request(app).post(`/api/room-portal/${roomToken}/auth`)
      .send({ identifier: '12345678901', pin: '2468' })
    expect(response.status).toBe(200)
    expect(Buffer.from(response.body.session_token, 'base64url')).toHaveLength(32)
    expect(response.body.resident.display_name).toBe('Ali P. T.')
    const locationId = getDB().prepare('SELECT id FROM service_locations WHERE room_id=?').get(room.id).id
    expect(verifyPortalSession(response.body.session_token, locationId)?.personnel_id).toBe(residentId)
    const stored = getDB().prepare('SELECT token_hash,created_ip_hash FROM location_portal_sessions ORDER BY id DESC LIMIT 1').get()
    expect(stored.token_hash).not.toBe(response.body.session_token)
    expect(stored.token_hash).toHaveLength(64)
    expect(stored.created_ip_hash).toBe(portalIpHash('::ffff:127.0.0.1'))
    getDB().prepare("UPDATE location_portal_sessions SET created_at=datetime('now','-2 minutes'), expires_at=datetime('now','-1 minute') WHERE token_hash=?")
      .run(stored.token_hash)
    expect(verifyPortalSession(response.body.session_token, locationId)).toBeNull()
  })

  it('yanlış PINi ve başka odanın sakinini reddeder', async () => {
    expect((await request(app).post(`/api/room-portal/${roomToken}/auth`)
      .send({ identifier: '12345678901', pin: '0000' })).status).toBe(401)
    getDB().prepare('UPDATE room_assignments SET room_id=? WHERE personnel_id=? AND check_out_at IS NULL')
      .run(otherRoom.id, residentId)
    const mismatch = await request(app).post(`/api/room-portal/${roomToken}/auth`)
      .send({ identifier: '12345678901', pin: '2468' })
    expect(mismatch.status).toBe(403)
    expect(mismatch.body.code).toBe('room_mismatch')
    getDB().prepare('UPDATE room_assignments SET room_id=? WHERE personnel_id=? AND check_out_at IS NULL')
      .run(room.id, residentId)
  })

  it('geçici PINi tüketmeden kalıcı PIN ekranına yönlendirir', async () => {
    const db = getDB()
    const issuance = db.prepare(`
      INSERT INTO kiosk_pin_issuances(principal_kind,principal_id,issued_by,expires_at)
      VALUES('personnel',?,?,datetime('now','+1 hour'))
    `).run(residentId, 1).lastInsertRowid
    const response = await request(app).post(`/api/room-portal/${roomToken}/auth`)
      .send({ identifier: '12345678901', pin: '2468' })
    expect(response.status).toBe(423)
    expect(response.body.code).toBe('permanent_pin_required')
    expect(db.prepare('SELECT first_used_at FROM kiosk_pin_issuances WHERE id=?').get(issuance).first_used_at).toBeNull()
    db.prepare('DELETE FROM kiosk_pin_issuances WHERE id=?').run(issuance)
  })
})

describe('public room portal — idempotency ve takip makbuzu', () => {
  it('aynı istemci işleminde aynı yüksek entropili makbuzu döndürür', async () => {
    const locationId = getDB().prepare('SELECT id FROM service_locations WHERE room_id=?').get(room.id).id
    const first = createOrGetPortalReceipt({
      locationId,
      actionType: 'fault',
      clientRequestId: 'client-request-001',
      publicPayload: { message: 'Talebiniz alındı' },
    })
    const replay = createOrGetPortalReceipt({
      locationId,
      actionType: 'fault',
      clientRequestId: 'client-request-001',
      publicPayload: { message: 'Farklı olmamalı' },
    })
    expect(first.replayed).toBe(false)
    expect(replay.replayed).toBe(true)
    expect(replay.receipt.receipt).toBe(first.receipt.receipt)
    expect(Buffer.from(first.receipt.receipt, 'base64url')).toHaveLength(18)

    const publicResult = await request(app).get(`/api/room-portal/receipts/${first.receipt.receipt}`)
    expect(publicResult.status).toBe(200)
    expect(publicResult.body).toMatchObject({ action: 'fault', status: 'accepted' })
    expect(JSON.stringify(publicResult.body)).not.toContain('personnel_id')
  })
})
