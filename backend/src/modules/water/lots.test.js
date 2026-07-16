import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let supervisorToken
let zoneId

const auth = req => req.set('Authorization', `Bearer ${managerToken}`)

async function createTrackedProduct(name) {
  const response = await auth(request(app).post('/api/water/products')).send({
    name,
    unit_label: 'adet',
    units_per_case: 1,
    cases_per_pallet: 1,
    expiry_tracking: true,
    expiry_warning_days: 20,
  })
  expect(response.status).toBe(201)
  return response.body.id
}

async function intake(productId, { lotNo, moveDate, expiryDate, qty = 10 }) {
  return auth(request(app).post('/api/water/intake')).send({
    product_id: productId,
    input_qty: qty,
    input_unit: 'adet',
    move_date: moveDate,
    waybill_no: `IRS-${lotNo}`,
    lot_no: lotNo,
    production_date: moveDate,
    expiry_date: expiryDate,
  })
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  zoneId = getDB().prepare('SELECT id FROM water_zones ORDER BY id LIMIT 1').get().id
})

beforeEach(() => {
  const db = getDB()
  db.exec(`
    DELETE FROM water_movement_allocations;
    DELETE FROM water_movements;
    DELETE FROM water_products WHERE name LIKE 'SKT TEST %';
  `)
})

describe('Su lot ve SKT takibi', () => {
  it('takibi açık üründe lot/SKT zorunluluğunu uygular ve kritik özete yansıtır', async () => {
    const productId = await createTrackedProduct('SKT TEST ZORUNLU')

    const missing = await auth(request(app).post('/api/water/intake')).send({
      product_id: productId,
      input_qty: 10,
      input_unit: 'adet',
      move_date: '2027-06-01',
    })
    expect(missing.status).toBe(400)
    expect(missing.body.error).toMatch(/lot numarası zorunlu/i)

    const created = await intake(productId, {
      lotNo: 'LOT-001',
      moveDate: '2027-06-01',
      expiryDate: '2027-06-25',
    })
    expect(created.status).toBe(201)

    const lots = await request(app).get('/api/water/lots?today=2027-06-10')
      .set('Authorization', `Bearer ${supervisorToken}`)
    expect(lots.status).toBe(200)
    expect(lots.body.summary.expiring).toBe(1)
    expect(lots.body.rows[0]).toMatchObject({ lot_no: 'LOT-001', health: 'expiring', days_to_expiry: 15 })

    const alerts = await auth(request(app).get('/api/water/alerts?today=2027-06-10'))
    expect(alerts.body.summary.lot_critical).toBe(1)
    expect(alerts.body.lot_alerts[0].lot_no).toBe('LOT-001')
  })

  it('FIFO yerine FEFO ile SKT si daha yakın sağlam lotu önce tahsis eder', async () => {
    const productId = await createTrackedProduct('SKT TEST FEFO')
    const oldIntake = await intake(productId, {
      lotNo: 'UZUN-SKT', moveDate: '2027-05-01', expiryDate: '2027-12-31', qty: 20,
    })
    const nearExpiry = await intake(productId, {
      lotNo: 'YAKIN-SKT', moveDate: '2027-05-10', expiryDate: '2027-08-01', qty: 20,
    })

    const distribution = await auth(request(app).post('/api/water/distribute')).send({
      product_id: productId,
      zone_id: zoneId,
      input_qty: 6,
      input_unit: 'adet',
      move_date: '2027-06-01',
    })
    expect(distribution.status).toBe(201)

    const allocation = getDB().prepare('SELECT * FROM water_movement_allocations WHERE out_movement_id=?').get(distribution.body.id)
    expect(allocation.in_movement_id).toBe(nearExpiry.body.id)
    expect(allocation.in_movement_id).not.toBe(oldIntake.body.id)
  })

  it('dağıtım tarihinde SKT si geçmiş lotu kullanmaz', async () => {
    const productId = await createTrackedProduct('SKT TEST GECMIS')
    const expired = await intake(productId, {
      lotNo: 'GECMIS', moveDate: '2027-01-01', expiryDate: '2027-02-01', qty: 10,
    })
    const valid = await intake(productId, {
      lotNo: 'GECERLI', moveDate: '2027-05-01', expiryDate: '2027-12-01', qty: 10,
    })

    const distribution = await auth(request(app).post('/api/water/distribute')).send({
      product_id: productId,
      zone_id: zoneId,
      input_qty: 8,
      input_unit: 'adet',
      move_date: '2027-06-01',
    })
    const allocation = getDB().prepare('SELECT * FROM water_movement_allocations WHERE out_movement_id=?').get(distribution.body.id)
    expect(allocation.in_movement_id).toBe(valid.body.id)
    expect(allocation.in_movement_id).not.toBe(expired.body.id)
  })

  it('karantinadaki lotu bloke eder ve kullanıma açılınca bekleyen dağıtımı eşleştirir', async () => {
    const productId = await createTrackedProduct('SKT TEST KARANTINA')
    const created = await intake(productId, {
      lotNo: 'KAR-01', moveDate: '2027-06-01', expiryDate: '2027-12-01', qty: 10,
    })

    const missingReason = await request(app).put(`/api/water/lots/${created.body.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ lot_status: 'quarantined' })
    expect(missingReason.status).toBe(400)
    expect(missingReason.body.error).toMatch(/gerekçesi zorunlu/i)

    const quarantine = await request(app).put(`/api/water/lots/${created.body.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ lot_status: 'quarantined', lot_status_note: 'Kapak hasarı kontrolü' })
    expect(quarantine.status).toBe(200)

    const distribution = await auth(request(app).post('/api/water/distribute')).send({
      product_id: productId,
      zone_id: zoneId,
      input_qty: 5,
      input_unit: 'adet',
      move_date: '2027-06-10',
    })
    expect(getDB().prepare('SELECT needs_review FROM water_movements WHERE id=?').get(distribution.body.id).needs_review).toBe(1)

    const release = await request(app).put(`/api/water/lots/${created.body.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ lot_status: 'active', lot_status_note: 'Kontrol tamamlandı' })
    expect(release.status).toBe(200)
    expect(release.body.matched).toBe(1)
    expect(getDB().prepare('SELECT needs_review FROM water_movements WHERE id=?').get(distribution.body.id).needs_review).toBe(0)
  })

  it('dağıtımdan sonra karantinaya alınan lotun tahsislerini sağlıklı lota taşır', async () => {
    const productId = await createTrackedProduct('SKT TEST SONRADAN KARANTINA')
    const quarantinedLot = await intake(productId, {
      lotNo: 'KAR-SONRA', moveDate: '2027-06-01', expiryDate: '2027-08-01', qty: 10,
    })
    const backupLot = await intake(productId, {
      lotNo: 'YEDEK', moveDate: '2027-06-02', expiryDate: '2027-12-01', qty: 10,
    })
    const distribution = await auth(request(app).post('/api/water/distribute')).send({
      product_id: productId,
      zone_id: zoneId,
      input_qty: 6,
      input_unit: 'adet',
      move_date: '2027-06-10',
    })
    expect(getDB().prepare(
      'SELECT in_movement_id FROM water_movement_allocations WHERE out_movement_id=?',
    ).get(distribution.body.id).in_movement_id).toBe(quarantinedLot.body.id)

    const quarantine = await request(app).put(`/api/water/lots/${quarantinedLot.body.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ lot_status: 'quarantined', lot_status_note: 'Geri çağırma kararı' })

    expect(quarantine.status).toBe(200)
    expect(quarantine.body.matched).toBe(1)
    expect(getDB().prepare(
      'SELECT in_movement_id FROM water_movement_allocations WHERE out_movement_id=?',
    ).get(distribution.body.id).in_movement_id).toBe(backupLot.body.id)
    expect(getDB().prepare(
      'SELECT COUNT(*) AS count FROM water_movement_allocations WHERE in_movement_id=?',
    ).get(quarantinedLot.body.id).count).toBe(0)
    expect(getDB().prepare(
      'SELECT needs_review FROM water_movements WHERE id=?',
    ).get(distribution.body.id).needs_review).toBe(0)
  })

  it('tamamı dağıtılmış lot karantinaya alınırsa karşılanamayan dağıtımı incelemeye taşır', async () => {
    const productId = await createTrackedProduct('SKT TEST TAM KARANTINA')
    const created = await intake(productId, {
      lotNo: 'TAM-KAR', moveDate: '2027-06-01', expiryDate: '2027-12-01', qty: 5,
    })
    const distribution = await auth(request(app).post('/api/water/distribute')).send({
      product_id: productId,
      zone_id: zoneId,
      input_qty: 5,
      input_unit: 'adet',
      move_date: '2027-06-10',
    })

    const quarantine = await request(app).put(`/api/water/lots/${created.body.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ lot_status: 'quarantined', lot_status_note: 'Tam geri çağırma' })

    expect(quarantine.status).toBe(200)
    expect(quarantine.body.matched).toBe(0)
    expect(getDB().prepare(
      'SELECT COUNT(*) AS count FROM water_movement_allocations WHERE out_movement_id=?',
    ).get(distribution.body.id).count).toBe(0)
    expect(getDB().prepare(
      'SELECT needs_review FROM water_movements WHERE id=?',
    ).get(distribution.body.id).needs_review).toBe(1)
  })
})
