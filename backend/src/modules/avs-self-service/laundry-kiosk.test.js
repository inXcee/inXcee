import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Saha ekranı çamaşır defteri kiosk uçları (spec §6): /api/avs-self-service/laundry
const LAUNDRY = '/api/avs-self-service/laundry'
let db, roomId, laundry, housekeeper, technician
const auth = token => ({ Authorization: `Bearer ${token}` })

async function kioskLogin(adminToken, fullName, department, pin) {
  const worker = (await request(app).post('/api/avs-workers').set(auth(adminToken)).send({ full_name: fullName })).body
  await request(app).put(`/api/avs-workers/${worker.id}/pin`).set(auth(adminToken)).send({ new_pin: pin })
  const departmentId = db.prepare('SELECT id FROM departments WHERE name=?').get(department).id
  db.prepare('UPDATE staff SET department_id=? WHERE id=?').run(departmentId, worker.id)
  const token = (await request(app).post('/api/auth/avs-login').send({ worker_id: worker.id, pin })).body.token
  return { id: worker.id, token }
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  roomId = Number(db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds) VALUES('FC', 1, '101', 6, 6)`).run().lastInsertRowid)
  const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  laundry = await kioskLogin(adminToken, 'Defter Çamaşır', 'Çamaşırhane', '2580')
  housekeeper = await kioskLogin(adminToken, 'Defter Temizlik', 'Temizlik', '4826')
  technician = await kioskLogin(adminToken, 'Defter Teknik', 'Teknik', '1470')
})

describe('saha çamaşır defteri uçları', () => {
  it('teknik personel 403; çamaşırhane ve kat hizmetleri defteri görür', async () => {
    expect((await request(app).get(LAUNDRY).set(auth(technician.token))).status).toBe(403)
    expect((await request(app).get(LAUNDRY).set(auth(housekeeper.token))).status).toBe(200)
    const res = await request(app).get(LAUNDRY).set(auth(laundry.token))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ open: [], ready: [], delivered_today: [] })
  })

  it('al → hazır → teslim → geri al tam akışı oda bazında yürür', async () => {
    const intake = await request(app).post(LAUNDRY).set(auth(laundry.token))
      .send({ room_id: roomId, bags: 2, ironing: true, urgent: false, client_request_id: 'saha-kiosk-0001' })
    expect(intake.status).toBe(200)
    expect(intake.body.already).toBe(false)
    expect(intake.body.ids).toHaveLength(2)
    const retry = await request(app).post(LAUNDRY).set(auth(laundry.token))
      .send({ room_id: roomId, bags: 2, ironing: true, urgent: false, client_request_id: 'saha-kiosk-0001' })
    expect(retry.body).toEqual({ ids: intake.body.ids, already: true })

    const open = (await request(app).get(LAUNDRY).set(auth(laundry.token))).body.open
    expect(open).toEqual([expect.objectContaining({ room_id: roomId, block: 'FC', room_no: '101', bags: 2, ironing: 2, ids: intake.body.ids })])

    const ready = await request(app).post(`${LAUNDRY}/rooms/${roomId}/ready`).set(auth(laundry.token))
    expect(ready.body).toEqual({ ids: intake.body.ids })
    const deliver = await request(app).post(`${LAUNDRY}/rooms/${roomId}/deliver`).set(auth(laundry.token)).send({ name: 'Ahmet' })
    expect(deliver.body).toEqual({ ids: intake.body.ids })
    expect((await request(app).get(LAUNDRY).set(auth(laundry.token))).body.delivered_today)
      .toEqual([expect.objectContaining({ room_id: roomId, bags: 2 })])

    const someoneElse = await request(app).post(`${LAUNDRY}/undo`).set(auth(housekeeper.token)).send({ action: 'deliver', ids: intake.body.ids })
    expect(someoneElse.status).toBe(403)
    const undo = await request(app).post(`${LAUNDRY}/undo`).set(auth(laundry.token)).send({ action: 'deliver', ids: intake.body.ids })
    expect(undo.body).toEqual({ undone: 2 })
    expect((await request(app).get(LAUNDRY).set(auth(laundry.token))).body.ready)
      .toEqual([expect.objectContaining({ room_id: roomId, bags: 2 })])
  })

  it('geçersiz istekler 400, torbası olmayan oda 404', async () => {
    const post = body => request(app).post(LAUNDRY).set(auth(laundry.token)).send(body)
    expect((await post({ room_id: roomId, bags: 0, client_request_id: 'saha-kiosk-0002' })).status).toBe(400)
    expect((await post({ room_id: roomId, bags: 21, client_request_id: 'saha-kiosk-0003' })).status).toBe(400)
    expect((await post({ room_id: roomId, bags: 1 })).status).toBe(400)
    expect((await post({ room_id: roomId, bags: 1, client_request_id: 'kısa' })).status).toBe(400)
    expect((await request(app).post(`${LAUNDRY}/undo`).set(auth(laundry.token)).send({ action: 'sil', ids: [1] })).status).toBe(400)
    const empty = Number(db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds) VALUES('FC', 1, '102', 6, 6)`).run().lastInsertRowid)
    expect((await request(app).post(`${LAUNDRY}/rooms/${empty}/ready`).set(auth(laundry.token))).status).toBe(404)
  })
})
