import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateMissingQrCodes } from '../location-portal/service.js'

// Kapıdaki QR'ı okutma ucu (spec: docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md): bütün kiosk personeli
// okutabilir; yanıt konumu ve kişinin grubunu döner (temizlik → Odalar, teknik → arıza formu), token dönmez.
const SCAN = '/api/avs-self-service/qr-scan'
let db, cleaner, technician, assigned
const auth = token => ({ Authorization: `Bearer ${token}` })
const token = key => db.prepare(`
  SELECT q.token FROM location_qr_codes q JOIN service_locations sl ON sl.id=q.location_id
  WHERE sl.qr_location=? AND q.status='active'
`).get(key).token
const scanCount = staffId => db.prepare(
  "SELECT COUNT(*) AS c FROM location_portal_events WHERE event_type='field_scan' AND actor_staff_id=?",
).get(staffId).c

async function kioskLogin(adminToken, fullName, departmentId, pin, assignedBlock = null) {
  const worker = (await request(app).post('/api/avs-workers').set(auth(adminToken)).send({ full_name: fullName })).body
  await request(app).put(`/api/avs-workers/${worker.id}/pin`).set(auth(adminToken)).send({ new_pin: pin })
  db.prepare('UPDATE staff SET department_id=?, assigned_block=? WHERE id=?').run(departmentId, assignedBlock, worker.id)
  const login = (await request(app).post('/api/auth/avs-login').send({ worker_id: worker.id, pin })).body
  return { id: worker.id, token: login.token }
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds, use_state) VALUES('FB', 1, ?, 6, 6, 'open')`)
  room.run('101')
  room.run('102')
  generateMissingQrCodes({}, null)
  const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const dept = name => db.prepare('SELECT id FROM departments WHERE name=?').get(name).id
  cleaner = await kioskLogin(adminToken, 'Okutan Temizlik', dept('Temizlik'), '2580')
  technician = await kioskLogin(adminToken, 'Okutan Teknik', dept('Teknik'), '1470')
  assigned = await kioskLogin(adminToken, 'Okutan M2', dept('Temizlik'), '3690', 'M2')
})

describe('QR okutma ucu', () => {
  it('oturumsuz 401; bozuk girdi 400', async () => {
    expect((await request(app).post(SCAN).send({ qr: token('FB-101'), via: 'camera' })).status).toBe(401)
    expect((await request(app).post(SCAN).set(auth(cleaner.token)).send({ qr: 'abcde', via: 'camera' })).status).toBe(400)
  })

  it('temizlikçi okutunca konum ve grup döner; yanıtta token yok', async () => {
    const t = token('FB-101')
    const res = await request(app).post(SCAN).set(auth(cleaner.token)).send({ qr: `https://avskamp.com/r/${t}`, via: 'camera' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ location: 'FB-101', kind: 'room', block: 'FB', group: 'housekeeping', label: 'none' })
    expect(res.body.scan_id).toBeGreaterThan(0)
    expect(JSON.stringify(res.body)).not.toContain(t)
  })

  it('teknik personel de okutabilir (arıza formu için)', async () => {
    const res = await request(app).post(SCAN).set(auth(technician.token)).send({ qr: token('FB-102'), via: 'in_app' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ location: 'FB-102', group: 'technical' })
  })

  it('başka bloğa atanmış personel 403 alır ve okutma yazılmaz', async () => {
    const res = await request(app).post(SCAN).set(auth(assigned.token)).send({ qr: token('FB-101'), via: 'camera' })
    expect(res.status).toBe(403)
    expect(scanCount(assigned.id)).toBe(0)
  })

  it('bilinmeyen QR 404 ve kodla döner', async () => {
    const res = await request(app).post(SCAN).set(auth(cleaner.token)).send({ qr: 'x'.repeat(43), via: 'camera' })
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ error: 'Bu QR sistemde tanımlı değil', code: 'qr_unknown' })
  })
})
