import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { toBase, humanize } from './service.js'

let managerToken, laundryToken
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  laundryToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
})

describe('Su takip — çevrim mantığı', () => {
  const product = { units_per_case: 12, cases_per_pallet: 70, unit_label: 'şişe' }

  it('toBase palet/koli/adet → adet', () => {
    expect(toBase(product, 5, 'adet')).toBe(5)
    expect(toBase(product, 3, 'koli')).toBe(36)
    expect(toBase(product, 2, 'palet')).toBe(1680) // 2 × 70 × 12
  })

  it('humanize adet → palet/koli/şişe kırılımı', () => {
    // 1 palet (840) + 2 koli (24) + 5 şişe = 869
    expect(humanize(product, 869)).toBe('1 palet 2 koli 5 şişe')
    expect(humanize(product, 24)).toBe('2 koli')
    expect(humanize(product, 0)).toBe('0 şişe')
  })

  it('damacana (çevrimsiz) sade sayı verir', () => {
    const dam = { units_per_case: 1, cases_per_pallet: 1, unit_label: 'damacana' }
    expect(humanize(dam, 7)).toBe('7 damacana')
    expect(toBase(dam, 7, 'adet')).toBe(7)
  })
})

describe('Su takip — API', () => {
  let zoneId, productId

  it('varsayılan ürünler seed edildi', async () => {
    const r = await request(app).get('/api/water/products').set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThanOrEqual(4)
    productId = r.body.find(p => p.name.includes('0.5')).id
  })

  it('bölge oluşturulur ve listelenir', async () => {
    const r = await request(app).post('/api/water/zones').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'A Blok Yemekhane', code: 'A-YEM' })
    expect(r.status).toBe(201)
    zoneId = r.body.id
    const list = await request(app).get('/api/water/zones').set('Authorization', `Bearer ${managerToken}`)
    expect(list.body.some(z => z.id === zoneId)).toBe(true)
  })

  it('giriş (irsaliye) — 2 palet 0.5L = 1680 şişe base', async () => {
    const r = await request(app).post('/api/water/intake').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: productId, input_qty: 2, input_unit: 'palet', move_date: '2026-07-01', waybill_no: 'IRS-001' })
    expect(r.status).toBe(201)
    const row = getDB().prepare('SELECT * FROM water_movements WHERE id=?').get(r.body.id)
    expect(row.type).toBe('in')
    expect(row.qty_base).toBe(1680)
    expect(row.waybill_no).toBe('IRS-001')
  })

  it('dağıtım — bölgeye 5 koli bırak = 60 şişe base', async () => {
    const r = await request(app).post('/api/water/distribute').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: productId, zone_id: zoneId, input_qty: 5, input_unit: 'koli', move_date: '2026-07-02' })
    expect(r.status).toBe(201)
    const row = getDB().prepare('SELECT * FROM water_movements WHERE id=?').get(r.body.id)
    expect(row.type).toBe('out')
    expect(row.qty_base).toBe(60)
    expect(row.zone_id).toBe(zoneId)
  })

  it('dağıtımda bölge zorunlu (400)', async () => {
    const r = await request(app).post('/api/water/distribute').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: productId, input_qty: 1, input_unit: 'koli', move_date: '2026-07-02' })
    expect(r.status).toBe(400)
  })

  it('geçersiz miktar/birim 400', async () => {
    const bad1 = await request(app).post('/api/water/intake').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: productId, input_qty: 0, input_unit: 'koli', move_date: '2026-07-01' })
    expect(bad1.status).toBe(400)
    const bad2 = await request(app).post('/api/water/intake').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: productId, input_qty: 3, input_unit: 'kasa', move_date: '2026-07-01' })
    expect(bad2.status).toBe(400)
  })

  it('özet — stok bakiyesi, bölge toplamı ve günlük seri döner', async () => {
    const r = await request(app).get('/api/water/summary?from=2026-07-01&to=2026-07-31').set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    const p = r.body.stock.find(s => s.product_id === productId)
    expect(p.total_in).toBe(1680)
    expect(p.total_out).toBe(60)
    expect(p.balance).toBe(1620)
    expect(p.balance_human).toBe('1 palet 65 koli') // 1620 = 1×840 + 65×12 + 0
    expect(r.body.zones.some(z => z.zone_id === zoneId && z.total_out === 60)).toBe(true)
    expect(r.body.daily.length).toBeGreaterThanOrEqual(2)
    expect(r.body.totals.balance).toBe(1620)
  })

  it('movements listesi qty_human içerir', async () => {
    const r = await request(app).get('/api/water/movements?type=out').set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.body[0].qty_human).toBe('5 koli')
    expect(r.body[0].zone_name).toBe('A Blok Yemekhane')
  })

  it('hareketi olan bölge silinemez (409)', async () => {
    const r = await request(app).delete(`/api/water/zones/${zoneId}`).set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(409)
  })

  it('yetkisiz rol erişemez (403)', async () => {
    const r = await request(app).get('/api/water/summary').set('Authorization', `Bearer ${laundryToken}`)
    expect(r.status).toBe(403)
  })

  it('token olmadan 401', async () => {
    const r = await request(app).get('/api/water/products')
    expect(r.status).toBe(401)
  })
})

describe('Su takip — toplu giriş + metinden dağıtım + düşük stok + ay serisi', () => {
  let zoneA, zoneB, p05, p033, pDam

  beforeAll(async () => {
    const prods = (await request(app).get('/api/water/products').set('Authorization', `Bearer ${managerToken}`)).body
    p05 = prods.find(p => p.name.includes('0.5')).id
    p033 = prods.find(p => p.name.includes('0.33')).id
    pDam = prods.find(p => p.name.includes('Damacana')).id
    zoneA = (await request(app).post('/api/water/zones').set('Authorization', `Bearer ${managerToken}`).send({ name: 'B Blok Yemekhane' })).body.id
    zoneB = (await request(app).post('/api/water/zones').set('Authorization', `Bearer ${managerToken}`).send({ name: 'C Blok Şantiye' })).body.id
  })

  it('toplu irsaliye — 3 ürün tek çağrı', async () => {
    const r = await request(app).post('/api/water/intake/batch').set('Authorization', `Bearer ${managerToken}`)
      .send({ move_date: '2026-08-01', waybill_no: 'IRS-BATCH', lines: [
        { product_id: p05, input_qty: 3, input_unit: 'palet' },
        { product_id: p033, input_qty: 2, input_unit: 'palet' },
        { product_id: pDam, input_qty: 40, input_unit: 'adet' },
      ] })
    expect(r.status).toBe(201)
    expect(r.body.count).toBe(3)
    const rows = getDB().prepare("SELECT COUNT(*) c FROM water_movements WHERE waybill_no='IRS-BATCH'").get()
    expect(rows.c).toBe(3)
  })

  it('metinden dağıtım — çözümle bölge+ürün+miktar eşler', async () => {
    const text = 'B Blok Yemekhane 5 koli 0.5, 10 damacana\nC Blok Şantiye 2 palet 0.33'
    const r = await request(app).post('/api/water/distribute/parse').set('Authorization', `Bearer ${managerToken}`).send({ text })
    expect(r.status).toBe(200)
    const items = r.body.items
    expect(items.length).toBe(3)
    const yem05 = items.find(i => i.zone_id === zoneA && i.product_id === p05)
    expect(yem05).toBeTruthy()
    expect(yem05.input_qty).toBe(5); expect(yem05.input_unit).toBe('koli'); expect(yem05.ok).toBe(true)
    const yemDam = items.find(i => i.zone_id === zoneA && i.product_id === pDam)
    expect(yemDam.input_qty).toBe(10)
    const sant = items.find(i => i.zone_id === zoneB && i.product_id === p033)
    expect(sant.input_qty).toBe(2); expect(sant.input_unit).toBe('palet')
  })

  it('metinden dağıtım — eşleşmeyen bölge issue döner', async () => {
    const r = await request(app).post('/api/water/distribute/parse').set('Authorization', `Bearer ${managerToken}`)
      .send({ text: 'Bilinmeyen Yer 3 koli 0.5' })
    expect(r.body.items[0].ok).toBe(false)
    expect(r.body.items[0].issues).toContain('bölge')
  })

  it('toplu dağıtım kaydı — bölgeye yazılır', async () => {
    const r = await request(app).post('/api/water/distribute/batch').set('Authorization', `Bearer ${managerToken}`)
      .send({ move_date: '2026-08-02', lines: [
        { zone_id: zoneA, product_id: p05, input_qty: 5, input_unit: 'koli' },
        { zone_id: zoneB, product_id: p033, input_qty: 2, input_unit: 'palet' },
      ] })
    expect(r.status).toBe(201)
    expect(r.body.count).toBe(2)
  })

  it('düşük stok — min eşik altına düşünce summary low=true', async () => {
    // pDam stok: giriş 40 adet. min_level 100 yap → low
    await request(app).put(`/api/water/products/${pDam}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ name: '19 L Damacana', unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 1, min_level: 100 })
    const r = await request(app).get('/api/water/summary').set('Authorization', `Bearer ${managerToken}`)
    const dam = r.body.stock.find(s => s.product_id === pDam)
    expect(dam.min_level).toBe(100)
    expect(dam.low).toBe(true)
    expect(r.body.totals.low_count).toBeGreaterThanOrEqual(1)
  })

  it('ay bazlı seri döner (group=month)', async () => {
    const r = await request(app).get('/api/water/summary?group=month&from=2026-07-01&to=2026-08-31')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.body.group).toBe('month')
    expect(r.body.daily.every(d => /^\d{4}-\d{2}$/.test(d.move_date))).toBe(true)
  })

  it('dönem KPI — period_in/period_out aralığa göre', async () => {
    const r = await request(app).get('/api/water/summary?from=2026-08-01&to=2026-08-31')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.body.totals.period_in).toBeGreaterThan(0)
    expect(r.body.totals.period_out).toBeGreaterThan(0)
  })
})
