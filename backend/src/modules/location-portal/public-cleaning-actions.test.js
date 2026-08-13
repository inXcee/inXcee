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
let location
let residentId
let workerId
let workerToken
let wrongWorkerToken
let proofPhoto

const roomChecklist = {
  floor_cleaned: true,
  surfaces_wiped: true,
  waste_removed: true,
  bed_area_checked: true,
}

function settings(patch = {}) {
  updatePortalSettings({
    location_portal_enabled: true,
    location_portal_cleaning_enabled: true,
    location_portal_cleaning_review_pin_required: false,
    ...patch,
  })
}

function insertTask({ completed = false } = {}) {
  return getDB().prepare(`
    INSERT INTO cleaning_tasks(
      area,block,floor,task_type,scheduled_at,qr_location,completed_at,verified_by_qr
    ) VALUES(?,?,?,?,datetime('now','+3 hours'),?,${completed ? "datetime('now')" : 'NULL'},?)
  `).run(
    `Oda ${room.room_no}`,
    room.block,
    room.floor,
    'room',
    location.qr_location,
    completed ? 1 : 0,
  ).lastInsertRowid
}

function completionRequest(requestId = 'cleaning-complete-001', checklist = roomChecklist) {
  return request(app)
    .post(`/api/room-portal/${roomToken}/cleaning/complete`)
    .set('Authorization', `Bearer ${workerToken}`)
    .field('client_request_id', requestId)
    .field('checklist', JSON.stringify(checklist))
}

function removeCreatedImages() {
  let rows = []
  try {
    rows = getDB().prepare("SELECT photo_url FROM cleaning_task_photos WHERE photo_url LIKE '/uploads/room-portal-cleaning-%'").all()
  } catch { return }
  for (const row of rows) {
    try { fs.unlinkSync(path.join(process.cwd(), row.photo_url.replace(/^\//, ''))) } catch { /* already removed */ }
  }
}

async function residentSession() {
  const response = await request(app).post(`/api/room-portal/${roomToken}/auth`)
    .send({ identifier: '88776655440', pin: '2468' })
  expect(response.status).toBe(200)
  return response.body.session_token
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  room = db.prepare("SELECT id,block,floor,room_no FROM rooms WHERE block='M1' ORDER BY id LIMIT 1").get()
  residentId = db.prepare(`
    INSERT INTO personnel(tc_no,full_name,company,kiosk_pin)
    VALUES('88776655440','QR Temizlik Sakini','Test',?)
  `).run(bcrypt.hashSync('2468', 10)).lastInsertRowid
  db.prepare('INSERT INTO room_assignments(personnel_id,room_id,bed_no) VALUES(?,?,3)').run(residentId, room.id)
  generateMissingQrCodes({ block: room.block }, 1)
  location = db.prepare(`
    SELECT sl.id,sl.qr_location,q.token FROM service_locations sl
    JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
    WHERE sl.room_id=?
  `).get(room.id)
  roomToken = location.token

  const adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  const worker = (await request(app).post('/api/avs-workers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ full_name: 'QR Temizlik Çalışanı', role_label: 'Temizlik Görevlisi' })).body
  workerId = worker.id
  await request(app).put(`/api/avs-workers/${workerId}/pin`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ new_pin: '8642' })
  const cleaningDepartment = db.prepare("SELECT id FROM departments WHERE lower(name) LIKE '%temizlik%' LIMIT 1").get()
  db.prepare('UPDATE staff SET department_id=?,assigned_block=? WHERE id=?')
    .run(cleaningDepartment.id, room.block, workerId)
  workerToken = (await request(app).post('/api/auth/avs-login')
    .send({ worker_id: workerId, pin: '8642' })).body.token

  const wrongWorker = (await request(app).post('/api/avs-workers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ full_name: 'QR Teknik Çalışanı', role_label: 'Teknik Personel' })).body
  await request(app).put(`/api/avs-workers/${wrongWorker.id}/pin`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ new_pin: '9753' })
  wrongWorkerToken = (await request(app).post('/api/auth/avs-login')
    .send({ worker_id: wrongWorker.id, pin: '9753' })).body.token

  proofPhoto = await sharp({
    create: { width: 2200, height: 1200, channels: 3, background: { r: 45, g: 145, b: 105 } },
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
})

beforeEach(() => {
  const db = getDB()
  removeCreatedImages()
  db.exec(`
    DELETE FROM location_portal_receipts;
    DELETE FROM location_portal_events;
    DELETE FROM location_portal_sessions;
    DELETE FROM cleaning_task_reviews;
    DELETE FROM cleaning_task_photos;
    DELETE FROM cleaning_tasks;
  `)
  settings()
  db.prepare('UPDATE staff SET assigned_block=? WHERE id=?').run(room.block, workerId)
})

afterAll(removeCreatedImages)

describe('oda QR temizlik durumu ve tamamlama', () => {
  it('hizmet kapalıyken güvenli biçimde gizler, açıkken yalnız güvenli görev durumunu döndürür', async () => {
    insertTask()
    settings({ location_portal_cleaning_enabled: false })
    expect((await request(app).get(`/api/room-portal/${roomToken}/cleaning`)).status).toBe(404)
    settings()
    const response = await request(app).get(`/api/room-portal/${roomToken}/cleaning`)
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ state: 'pending', checklist: Object.keys(roomChecklist) })
    expect(JSON.stringify(response.body)).not.toMatch(/staff|worker|photo_url|full_name/)
  })

  it('AVS oturumu, temizlik departmanı ve atanmış blok zorunludur', async () => {
    insertTask()
    const noToken = await request(app).post(`/api/room-portal/${roomToken}/cleaning/complete`)
    expect(noToken.status).toBe(401)
    const wrongRole = await request(app).post(`/api/room-portal/${roomToken}/cleaning/complete`)
      .set('Authorization', `Bearer ${wrongWorkerToken}`)
      .field('client_request_id', 'cleaning-wrong-role')
      .field('checklist', JSON.stringify(roomChecklist))
      .attach('photos', proofPhoto, { filename: 'proof.jpg', contentType: 'image/jpeg' })
    expect(wrongRole.status).toBe(403)
    expect(wrongRole.body.code).toBe('cleaning_worker_required')

    getDB().prepare("UPDATE staff SET assigned_block='S2' WHERE id=?").run(workerId)
    const wrongBlock = await completionRequest('cleaning-wrong-block')
      .attach('photos', proofPhoto, { filename: 'proof.jpg', contentType: 'image/jpeg' })
    expect(wrongBlock.status).toBe(403)
    expect(wrongBlock.body.code).toBe('worker_block_mismatch')
  })

  it('tam kontrol listesi ve 1–3 gerçek kanıt fotoğrafı ister', async () => {
    insertTask()
    expect((await completionRequest('cleaning-no-photo')).status).toBe(400)
    const incomplete = await completionRequest('cleaning-incomplete', { floor_cleaned: true })
      .attach('photos', proofPhoto, { filename: 'proof.jpg', contentType: 'image/jpeg' })
    expect(incomplete.status).toBe(400)
    expect(incomplete.body.code).toBe('checklist_incomplete')
    const fake = await completionRequest('cleaning-fake-photo')
      .attach('photos', Buffer.from('not-image'), { filename: 'fake.jpg', contentType: 'image/jpeg' })
    expect(fake.status).toBe(400)
    expect(fake.body.code).toBe('invalid_photo_content')
  })

  it('görevi, kontrol listesini, çalışanı, EXIFsiz fotoğrafları, audit ve makbuzu birlikte yazar', async () => {
    const taskId = insertTask()
    const response = await completionRequest()
      .field('note', 'Kapı önü ayrıca silindi')
      .attach('photos', proofPhoto, { filename: 'proof-1.jpg', contentType: 'image/jpeg' })
      .attach('photos', proofPhoto, { filename: 'proof-2.jpg', contentType: 'image/jpeg' })
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ replayed: false, status: 'completed' })

    const db = getDB()
    const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id=?').get(taskId)
    expect(task.completed_by_worker_id).toBe(workerId)
    expect(task.verified_by_qr).toBe(1)
    expect(JSON.parse(task.checklist)).toMatchObject({ ...roomChecklist, note: 'Kapı önü ayrıca silindi' })
    const photos = db.prepare('SELECT * FROM cleaning_task_photos WHERE task_id=? ORDER BY sort_order').all(taskId)
    expect(photos).toHaveLength(2)
    expect(photos.every(photo => photo.uploaded_by_staff_id === workerId)).toBe(true)
    const metadata = await sharp(path.join(process.cwd(), photos[0].photo_url.replace(/^\//, ''))).metadata()
    expect(Math.max(metadata.width, metadata.height)).toBeLessThanOrEqual(1600)
    expect(metadata.exif).toBeUndefined()
    expect(db.prepare("SELECT COUNT(*) AS count FROM location_portal_events WHERE event_type='cleaning_complete'").get().count).toBe(1)
  })

  it('aynı istek kimliğini tekrar oynatır; farklı istekle ikinci tamamlamayı reddeder', async () => {
    insertTask()
    const first = await completionRequest('cleaning-idempotent')
      .attach('photos', proofPhoto, { filename: 'proof.jpg', contentType: 'image/jpeg' })
    const replay = await completionRequest('cleaning-idempotent')
      .attach('photos', proofPhoto, { filename: 'proof.jpg', contentType: 'image/jpeg' })
    expect(replay.status).toBe(200)
    expect(replay.body).toMatchObject({ replayed: true, receipt: first.body.receipt })
    const second = await completionRequest('cleaning-second-request')
      .attach('photos', proofPhoto, { filename: 'proof.jpg', contentType: 'image/jpeg' })
    expect(second.status).toBe(409)
    expect(second.body.code).toBe('cleaning_already_completed')
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM cleaning_task_photos').get().count).toBe(1)
  })
})

describe('oda QR temizlik sakin değerlendirmesi', () => {
  it('PIN politikası bağımsızdır ve doğru oda sakininin değerlendirmesini bağlar', async () => {
    insertTask({ completed: true })
    settings({ location_portal_cleaning_review_pin_required: true })
    const payload = { client_request_id: 'cleaning-review-pin', outcome: 'approved', rating: 5 }
    const missing = await request(app).post(`/api/room-portal/${roomToken}/cleaning/review`).send(payload)
    expect(missing.status).toBe(401)
    const session = await residentSession()
    const accepted = await request(app).post(`/api/room-portal/${roomToken}/cleaning/review`)
      .set('X-Room-Portal-Session', session)
      .send(payload)
    expect(accepted.status).toBe(201)
    expect(getDB().prepare('SELECT reviewer_personnel_id,identity_mode,rating FROM cleaning_task_reviews').get())
      .toEqual({ reviewer_personnel_id: residentId, identity_mode: 'resident_pin', rating: 5 })
  })

  it('eksik bildirimi tamamlanmayı silmeden tek takip işi açar ve idempotent kalır', async () => {
    const taskId = insertTask({ completed: true })
    const payload = {
      client_request_id: 'cleaning-review-issue',
      outcome: 'issue',
      rating: 2,
      comment: 'Lavabo ve zemin tekrar temizlenmeli',
    }
    const first = await request(app).post(`/api/room-portal/${roomToken}/cleaning/review`).send(payload)
    const replay = await request(app).post(`/api/room-portal/${roomToken}/cleaning/review`).send(payload)
    expect(first.status).toBe(201)
    expect(first.body.follow_up_created).toBe(true)
    expect(replay.status).toBe(200)
    expect(replay.body.receipt).toBe(first.body.receipt)

    const db = getDB()
    expect(db.prepare('SELECT completed_at FROM cleaning_tasks WHERE id=?').get(taskId).completed_at).toBeTruthy()
    const review = db.prepare('SELECT * FROM cleaning_task_reviews WHERE task_id=?').get(taskId)
    expect(review.outcome).toBe('issue')
    expect(review.followup_task_id).toBeTruthy()
    expect(db.prepare('SELECT COUNT(*) AS count FROM cleaning_tasks WHERE qr_location=? AND completed_at IS NULL').get(location.qr_location).count).toBe(1)
    expect((await request(app).get(`/api/room-portal/${roomToken}/cleaning`)).body.state).toBe('pending')
  })

  it('eksik açıklamasını zorunlu tutar ve aynı tamamlanmış görevin ikinci değerlendirmesini reddeder', async () => {
    insertTask({ completed: true })
    const invalid = await request(app).post(`/api/room-portal/${roomToken}/cleaning/review`).send({
      client_request_id: 'cleaning-review-invalid', outcome: 'issue', comment: 'x',
    })
    expect(invalid.status).toBe(400)
    const first = await request(app).post(`/api/room-portal/${roomToken}/cleaning/review`).send({
      client_request_id: 'cleaning-review-first', outcome: 'approved', rating: 4,
    })
    expect(first.status).toBe(201)
    const second = await request(app).post(`/api/room-portal/${roomToken}/cleaning/review`).send({
      client_request_id: 'cleaning-review-second', outcome: 'approved', rating: 3,
    })
    expect(second.status).toBe(409)
    expect(second.body.code).toBe('cleaning_already_reviewed')
  })
})
