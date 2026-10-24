import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateMissingQrCodes } from '../location-portal/service.js'

// Saha ekranı kiosk oda panosu uçları (spec: docs/superpowers/specs/2026-10-23-saha-ekrani-design.md §6).
// FB: deneme bloğu — 101 ve 102 açık, 103 kapalı.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')
const UPLOAD_DIR = process.env.UPLOADS_DIR || 'uploads'
const BOARD = '/api/avs-self-service/board'
let db, cleaner, second, technician, assigned
const created = []
const auth = token => ({ Authorization: `Bearer ${token}` })
const roomId = no => db.prepare("SELECT id FROM rooms WHERE block='FB' AND room_no=?").get(no).id
const housekeepingFiles = () => readdirSync(UPLOAD_DIR).filter(f => f.startsWith('housekeeping-')).length

async function kioskLogin(adminToken, fullName, departmentId, pin, assignedBlock = null) {
  const worker = (await request(app).post('/api/avs-workers').set(auth(adminToken)).send({ full_name: fullName })).body
  await request(app).put(`/api/avs-workers/${worker.id}/pin`).set(auth(adminToken)).send({ new_pin: pin })
  db.prepare('UPDATE staff SET department_id=?, assigned_block=? WHERE id=?').run(departmentId, assignedBlock, worker.id)
  const token = (await request(app).post('/api/auth/avs-login').send({ worker_id: worker.id, pin })).body.token
  return { id: worker.id, token }
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds, use_state) VALUES('FB', 1, ?, 6, 6, ?)`)
  room.run('101', 'open')
  room.run('102', 'open')
  room.run('103', 'closed')
  const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const dept = name => db.prepare('SELECT id FROM departments WHERE name=?').get(name).id
  cleaner = await kioskLogin(adminToken, 'Pano Temizlik', dept('Temizlik'), '2580')
  second = await kioskLogin(adminToken, 'Pano İkinci', dept('Temizlik'), '4826')
  technician = await kioskLogin(adminToken, 'Pano Teknik', dept('Teknik'), '1470')
  assigned = await kioskLogin(adminToken, 'Pano M2 Görevlisi', dept('Temizlik'), '3690', 'M2')
})

afterAll(() => {
  for (const name of created) {
    const path = join(UPLOAD_DIR, name)
    if (existsSync(path)) unlinkSync(path)
  }
})

describe('saha oda panosu uçları', () => {
  it('oturumsuz 401; teknik personel 403; temizlik personeli blok listesini sayaçlarla alır', async () => {
    expect((await request(app).get(`${BOARD}/blocks`)).status).toBe(401)
    const denied = await request(app).get(`${BOARD}/blocks`).set(auth(technician.token))
    expect(denied.status).toBe(403)
    expect(denied.body.error).toBe('Bu ekran kat hizmetleri ve çamaşırhane içindir')
    const res = await request(app).get(`${BOARD}/blocks`).set(auth(cleaner.token))
    expect(res.status).toBe(200)
    expect(res.body.assigned_block).toBeNull()
    expect(res.body.blocks.find(b => b.block === 'FB')).toMatchObject({ rooms: 3, open: 2, closed: 1, cleaned: 0 })
  })

  it('temizlendi işareti panoda kutucuğu kendi işareti olarak gösterir; geri al işaretsiz yapar', async () => {
    const mark = await request(app).post(`${BOARD}/mark`).set(auth(cleaner.token)).send({ location: 'FB-101', action: 'clean' })
    expect(mark.status).toBe(200)
    expect(mark.body).toMatchObject({ status: 'cleaned', already: false })
    const board = await request(app).get(`${BOARD}/rooms?block=FB`).set(auth(cleaner.token))
    expect(board.status).toBe(200)
    expect(board.body.floors[0].rooms.find(r => r.room_no === '101')).toMatchObject({ status: 'cleaned', by: 'Pano Temizlik', mine: true })
    const undo = await request(app).post(`${BOARD}/undo`).set(auth(cleaner.token)).send({ location: 'FB-101' })
    expect(undo.body).toEqual({ ok: true, removed: true })
    const after = await request(app).get(`${BOARD}/rooms?block=FB`).set(auth(cleaner.token))
    expect(after.body.floors[0].rooms.find(r => r.room_no === '101').status).toBeNull()
  })

  it('fotoğraflı işaret dosyayı göreve bağlar; zaten temizlenmiş odaya gelen yeni dosya diskte bırakılmaz', async () => {
    const res = await request(app).post(`${BOARD}/mark`).set(auth(cleaner.token))
      .field('location', 'FB-102').field('action', 'clean')
      .attach('photos', JPEG, { filename: 'oda.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(200)
    const photo = db.prepare('SELECT photo_url, category FROM cleaning_task_photos WHERE task_id=?').get(res.body.task_id)
    expect(photo.category).toBe('sonrasi')
    expect(photo.photo_url).toMatch(/^\/uploads\/housekeeping-.+\.jpg$/)
    const name = photo.photo_url.replace('/uploads/', '')
    created.push(name)
    expect(existsSync(join(UPLOAD_DIR, name))).toBe(true)

    const before = housekeepingFiles()
    const again = await request(app).post(`${BOARD}/mark`).set(auth(second.token))
      .field('location', 'FB-102').field('action', 'clean')
      .attach('photos', JPEG, { filename: 'tekrar.jpg', contentType: 'image/jpeg' })
    expect(again.body).toMatchObject({ already: true, task_id: res.body.task_id })
    expect(housekeepingFiles()).toBe(before)
  })

  it('doluluk: dolu 200; kapalı odada 409 "Oda kapalı"', async () => {
    const ok = await request(app).patch(`${BOARD}/rooms/${roomId('101')}/occupancy`).set(auth(cleaner.token)).send({ occupancy: 'occupied' })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ id: roomId('101'), occupancy: 'occupied' })
    const closed = await request(app).patch(`${BOARD}/rooms/${roomId('103')}/occupancy`).set(auth(cleaner.token)).send({ occupancy: 'empty' })
    expect(closed.status).toBe(409)
    expect(closed.body.error).toBe('Oda kapalı')
  })

  it('kat toplusu: kuru deneme yazmaz ve sayar; onaydan sonra yazar, dönen listeyle geri alınır; dry_run zorunlu', async () => {
    const count = () => db.prepare("SELECT COUNT(*) n FROM cleaning_tasks WHERE block='FB'").get().n
    const before = count()
    const dry = await request(app).post(`${BOARD}/floor`).set(auth(cleaner.token)).send({ block: 'FB', floor: 1, dry_run: true })
    expect(dry.status).toBe(200)
    expect(dry.body).toEqual({
      locations: ['FB-101'], excluded: { closed: 1, locked: 0, night: 0, empty: 0, no_clean: 0, qr_required: 0, marked: 1 },
    })
    expect(count()).toBe(before)
    expect((await request(app).post(`${BOARD}/floor`).set(auth(cleaner.token)).send({ block: 'FB', floor: 1 })).status).toBe(400)

    const real = await request(app).post(`${BOARD}/floor`).set(auth(cleaner.token)).send({ block: 'FB', floor: 1, dry_run: false })
    expect(real.body.locations).toEqual(['FB-101'])
    const undo = await request(app).post(`${BOARD}/floor-undo`).set(auth(cleaner.token)).send({ locations: real.body.locations })
    expect(undo.body).toEqual({ undone: 1, skipped: 0 })
  })

  it('servis hataları durum koduyla döner: biçim 400, olmayan oda/blok 404, kapalı oda 409, başkasının işareti 403', async () => {
    const mark = body => request(app).post(`${BOARD}/mark`).set(auth(cleaner.token)).send(body)
    expect((await mark({ location: 'saçma yer', action: 'clean' })).status).toBe(400)
    expect((await mark({ location: 'FB-101', action: 'sil' })).status).toBe(400)
    expect((await mark({ location: 'FB-999', action: 'clean' })).status).toBe(404)
    const closed = await mark({ location: 'FB-103', action: 'clean' })
    expect(closed.status).toBe(409)
    expect(closed.body.error).toBe('Oda kapalı')
    expect((await request(app).get(`${BOARD}/rooms?block=YOK`).set(auth(cleaner.token))).status).toBe(404)
    const theirs = await request(app).post(`${BOARD}/undo`).set(auth(second.token)).send({ location: 'FB-102' })
    expect(theirs.status).toBe(403)
  })

  it('bloğa atanmış personel yalnız kendi bloğunu görür ve işaretler', async () => {
    const blocks = await request(app).get(`${BOARD}/blocks`).set(auth(assigned.token))
    expect(blocks.body.assigned_block).toBe('M2')
    expect(blocks.body.blocks.map(b => b.block)).toEqual(['M2'])
    expect((await request(app).get(`${BOARD}/rooms?block=FB`).set(auth(assigned.token))).status).toBe(403)
    expect((await request(app).post(`${BOARD}/mark`).set(auth(assigned.token)).send({ location: 'FB-101', action: 'skip', reason: 'dnd' })).status).toBe(403)
    expect((await request(app).post(`${BOARD}/floor`).set(auth(assigned.token)).send({ block: 'FB', floor: 1, dry_run: true })).status).toBe(403)
    expect((await request(app).get(`${BOARD}/rooms?block=M2`).set(auth(assigned.token))).status).toBe(200)
  })

  it('beklenmeyen hata 500 "Sunucu hatası" döner, iç hata metni sızmaz', async () => {
    db.exec('ALTER TABLE cleaning_tasks RENAME TO cleaning_tasks_gecici')
    try {
      const res = await request(app).get(`${BOARD}/rooms?block=FB`).set(auth(cleaner.token))
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Sunucu hatası' })
    } finally {
      db.exec('ALTER TABLE cleaning_tasks_gecici RENAME TO cleaning_tasks')
    }
  })
})

// Etiket kurulumu sahadan (spec 2026-10-24-oda-qr-saha §Hedefler 4): beklenen yer = görevlinin panoda açtığı yer
describe('sahadan etiket doğrulama', () => {
  const token = key => db.prepare(`
    SELECT q.token FROM location_qr_codes q JOIN service_locations sl ON sl.id=q.location_id
    WHERE sl.qr_location=? AND q.status='active'
  `).get(key).token
  const locationId = key => db.prepare('SELECT id FROM service_locations WHERE qr_location=?').get(key).id

  it('doğru kapı doğrulanır; başka odanın etiketi yanlış kapı kaydı açar; teknik giremez', async () => {
    generateMissingQrCodes({}, null)
    const verify = (who, body) => request(app).post(`${BOARD}/label-verify`).set(auth(who.token)).send(body)
    const ok = await verify(cleaner, { location: 'FB-101', qr: `https://avskamp.com/r/${token('FB-101')}` })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ ok: true, code: 'verified' })
    expect(db.prepare('SELECT verified_by_staff_id FROM location_qr_deployments WHERE location_id=?').get(locationId('FB-101')))
      .toEqual({ verified_by_staff_id: cleaner.id })

    const wrong = await verify(cleaner, { location: 'FB-101', qr: token('FB-102') })
    expect(wrong.status).toBe(200)
    expect(wrong.body).toMatchObject({ ok: false, code: 'location_mismatch' })
    expect(db.prepare(`
      SELECT reported_by_staff_id FROM location_qr_verify_mismatches WHERE expected_location_id=? ORDER BY id DESC
    `).get(locationId('FB-101'))).toEqual({ reported_by_staff_id: cleaner.id })

    expect((await verify(technician, { location: 'FB-101', qr: token('FB-101') })).status).toBe(403)
  })

  it('pano yanıtı zorunluluk ayarını ve yer başına etiket, okutma, talep, şikayet alanlarını taşır', async () => {
    const res = await request(app).get(`${BOARD}/rooms?block=FB`).set(auth(cleaner.token))
    expect(res.status).toBe(200)
    expect(res.body.enforcement).toBe('off')
    const room = res.body.floors[0].rooms.find(r => r.location === 'FB-101')
    expect(room).toMatchObject({ qr_label: 'verified', qr_required: false, pickup_request: null, complaint: null })
    expect(room).toHaveProperty('verified_by_qr')
  })
})
