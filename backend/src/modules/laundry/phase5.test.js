import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { getCostReport, recordLoadCost } from './phase5.js'

let adminToken
let workerToken

function createReadyTrackedBag(count = 2) {
  const db = getDB()
  const room = db.prepare("SELECT id FROM rooms WHERE block='M1' AND room_no='101'").get()
  const item = db.prepare(`
    INSERT INTO laundry_items(room_id,status,item_count,tracking_mode,intake_name,created_at,updated_at)
    VALUES(?,'ready',?,'individual','Faz 5 Sakin',datetime('now'),datetime('now'))
  `).run(room.id, count)
  const itemId = Number(item.lastInsertRowid)
  db.prepare('UPDATE laundry_items SET bag_no=? WHERE id=?').run(`F5-${itemId}`, itemId)
  const garmentIds = []
  for (let index = 0; index < count; index += 1) {
    const garment = db.prepare(`
      INSERT INTO premium_garments(item_id,garment_code,garment_type,sequence_no,status)
      VALUES(?,?,?,?, 'ready')
    `).run(itemId, `F5-G-${itemId}-${index + 1}`, index ? 'Pantolon' : 'Gömlek', index + 1)
    garmentIds.push(Number(garment.lastInsertRowid))
  }
  return { itemId, garmentIds }
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const worker = (await request(app).post('/api/avs-workers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ full_name: 'Faz 5 Çamaşır Personeli', role_label: 'Çamaşırhane Personeli' })).body
  await request(app).put(`/api/avs-workers/${worker.id}/pin`)
    .set('Authorization', `Bearer ${adminToken}`).send({ new_pin: '8642' })
  workerToken = (await request(app).post('/api/auth/avs-login').send({ worker_id: worker.id, pin: '8642' })).body.token
})

describe('Laundry Kiosk Faz 5', () => {
  it('seçilen parçaları kısmi teslim eder ve kalan parçayı açık tutar', async () => {
    const { itemId, garmentIds } = createReadyTrackedBag(2)
    const first = await request(app).post('/api/self-service/laundry-kiosk/deliver-partial')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({
        item_id: itemId,
        garment_ids: [garmentIds[0]],
        delivered_name: 'Faz 5 Sakin',
        signature: 'data:image/png;base64,dGVzdA==',
      })
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ delivered_count: 1, remaining_count: 1, item_status: 'ready' })
    expect(getDB().prepare('SELECT status FROM premium_garments WHERE id=?').get(garmentIds[0]).status).toBe('delivered')
    expect(getDB().prepare('SELECT status FROM laundry_items WHERE id=?').get(itemId).status).toBe('ready')

    const second = await request(app).post('/api/self-service/laundry-kiosk/deliver-partial')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({
        item_id: itemId,
        garment_ids: [garmentIds[1]],
        delivered_name: 'Faz 5 Sakin',
        signature: 'data:image/png;base64,dGVzdA==',
      })
    expect(second.status).toBe(200)
    expect(second.body).toMatchObject({ remaining_count: 0, item_status: 'delivered' })
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM laundry_deliveries WHERE item_id=?').get(itemId).count).toBe(1)
  })

  it('üçüncü kişiye teslimi yönetici onayına kadar bekletir', async () => {
    const { itemId, garmentIds } = createReadyTrackedBag(1)
    const pending = await request(app).post('/api/self-service/laundry-kiosk/deliver-partial')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({
        item_id: itemId,
        garment_ids: garmentIds,
        delivered_name: 'Teslim Alan Üçüncü Kişi',
        recipient_type: 'third_party',
        third_party_reason: 'Sakin yazılı olarak oda arkadaşını yetkilendirdi',
        signature: 'data:image/png;base64,dGVzdA==',
      })
    expect(pending.status).toBe(202)
    expect(pending.body).toMatchObject({ status: 'pending_approval', approval_required: true })
    expect(getDB().prepare('SELECT status FROM premium_garments WHERE id=?').get(garmentIds[0]).status).toBe('ready')

    const approved = await request(app).post(`/api/laundry/deliveries/${pending.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(approved.status).toBe(200)
    expect(approved.body).toMatchObject({ status: 'completed', delivered_count: 1, remaining_count: 0 })
  })

  it('kayıp torba için vaka, SLA ve kontrol listesi açar; bulunduğunda kapatır', async () => {
    const { itemId } = createReadyTrackedBag(1)
    const lost = await request(app).post(`/api/self-service/laundry-kiosk/bags/${itemId}/lost`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ notes: 'Teslim rafında bulunamadı' })
    expect(lost.status).toBe(200)
    const listed = await request(app).get('/api/self-service/laundry-kiosk/incidents?scope=open')
      .set('Authorization', `Bearer ${workerToken}`)
    const incident = listed.body.incidents.find(row => row.item_id === itemId)
    expect(incident.case_no).toMatch(/^CAM-/)
    expect(incident.checklist).toHaveLength(4)
    expect(incident.sla_due_at).toBeTruthy()

    const found = await request(app).post(`/api/self-service/laundry-kiosk/bags/${itemId}/found`)
      .set('Authorization', `Bearer ${workerToken}`)
    expect(found.status).toBe(200)
    expect(getDB().prepare('SELECT status,resolution FROM laundry_incidents WHERE id=?').get(incident.id))
      .toMatchObject({ status: 'resolved', resolution: 'found' })
  })

  it('tazminat sonucunu kiosk personeline kapatır', async () => {
    const created = await request(app).post('/api/self-service/laundry-kiosk/incidents')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ kind: 'other', severity: 'normal', description: 'Test tazminat vakası' })
    const response = await request(app).patch(`/api/self-service/laundry-kiosk/incidents/${created.body.id}`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ resolution: 'compensated', compensation_amount: 100 })
    expect(response.status).toBe(403)
  })

  it('tamamlanan makine yükünün su, enerji, sarf ve kg maliyetini kaydeder', () => {
    const db = getDB()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE type='washer' LIMIT 1").get()
    const supply = db.prepare(`
      INSERT INTO laundry_supplies(name,unit,current_stock,unit_cost) VALUES('Faz 5 Deterjan','kg',10,80)
    `).run()
    db.prepare('INSERT INTO laundry_machine_supplies(machine_id,supply_id,per_wash_amount) VALUES(?,?,?)')
      .run(machine.id, supply.lastInsertRowid, 0.2)
    const load = db.prepare(`
      INSERT INTO laundry_machine_loads(machine_id,program,estimated_weight_kg,actual_weight_kg,capacity_kg,status,completed_at)
      VALUES(?,'standard',5,5.2,10,'completed',CURRENT_TIMESTAMP)
    `).run(machine.id)
    const item = createReadyTrackedBag(1)
    db.prepare('INSERT INTO laundry_machine_load_items(load_id,item_id,estimated_weight_kg) VALUES(?,?,?)')
      .run(load.lastInsertRowid, item.itemId, 5.2)
    const cost = recordLoadCost(Number(load.lastInsertRowid))
    expect(cost.total_cost).toBeGreaterThan(0)
    expect(cost.water_liters).toBeGreaterThan(0)
    const report = getCostReport({})
    expect(report.summary.loads).toBeGreaterThanOrEqual(1)
    expect(report.summary.cost_per_kg).toBeGreaterThan(0)
  })
})
