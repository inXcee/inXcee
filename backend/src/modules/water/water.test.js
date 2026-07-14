import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import PDFDocument from 'pdfkit'
import { toBase, humanize, availableUnits, checkTruckArrivalAlerts, waterDailyDigest, buildReconciliationPDF, waterEscalations } from './service.js'
import { reconciliationRow, reconciliationRows } from './queries.js'
import { uploadFilePathFromUrl } from './file-lifecycle.js'

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
    expect(humanize(product, -24)).toBe('-2 koli')
  })

  it('damacana (çevrimsiz) sade sayı verir', () => {
    const dam = { units_per_case: 1, cases_per_pallet: 1, unit_label: 'damacana' }
    expect(humanize(dam, 7)).toBe('7 damacana')
    expect(toBase(dam, 7, 'adet')).toBe(7)
  })

  it('ürüne göre geçerli birimler hesaplanır', () => {
    expect(availableUnits({ units_per_case: 1, cases_per_pallet: 1 })).toEqual(['adet'])
    expect(availableUnits({ units_per_case: 24, cases_per_pallet: 1 })).toEqual(['adet', 'koli'])
    expect(availableUnits({ units_per_case: 12, cases_per_pallet: 70 })).toEqual(['adet', 'koli', 'palet'])
    expect(availableUnits({ unit_label: 'koli', units_per_case: 1, cases_per_pallet: 180 })).toEqual(['adet', 'koli', 'palet'])
    expect(availableUnits({ unit_label: 'paket', units_per_case: 1, cases_per_pallet: 80 })).toEqual(['adet', 'paket', 'palet'])
  })

  it('fotoğraftaki palet kurallarını doğal takip birimine çevirir', () => {
    expect(toBase({ unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36 }, 3, 'palet')).toBe(108)
    expect(toBase({ unit_label: 'koli', units_per_case: 1, cases_per_pallet: 180 }, 10, 'palet')).toBe(1800)
    expect(toBase({ unit_label: 'paket', units_per_case: 1, cases_per_pallet: 80 }, 2, 'palet')).toBe(160)
    expect(humanize({ unit_label: 'koli', units_per_case: 1, cases_per_pallet: 180 }, 1810)).toBe('10 palet 10 koli')
  })
})

describe('Su takip — API', () => {
  let zoneId, productId

  it('varsayılan ürünler seed edildi', async () => {
    const r = await request(app).get('/api/water/products').set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThanOrEqual(4)
    productId = r.body.find(p => p.name.includes('0.5')).id
    const p05 = r.body.find(p => p.name.includes('0.5'))
    const dam = r.body.find(p => p.name === '19 L Damacana')
    const p5l = r.body.find(p => p.name === '5 L Su')
    expect(p05.unit_label).toBe('koli')
    expect(p05.cases_per_pallet).toBe(140)
    expect(dam.cases_per_pallet).toBe(36)
    expect(p5l.unit_label).toBe('paket')
    expect(p5l.cases_per_pallet).toBe(80)
  })

  it('bölge oluşturulur ve listelenir', async () => {
    const r = await request(app).post('/api/water/zones').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'A Blok Yemekhane', code: 'A-YEM' })
    expect(r.status).toBe(201)
    zoneId = r.body.id
    const list = await request(app).get('/api/water/zones').set('Authorization', `Bearer ${managerToken}`)
    expect(list.body.some(z => z.id === zoneId)).toBe(true)
  })

  it('giriş (irsaliye) — 2 palet 0.5L = 280 koli base', async () => {
    const r = await request(app).post('/api/water/intake').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: productId, input_qty: 2, input_unit: 'palet', move_date: '2026-07-01', waybill_no: 'IRS-001' })
    expect(r.status).toBe(201)
    const row = getDB().prepare('SELECT * FROM water_movements WHERE id=?').get(r.body.id)
    expect(row.type).toBe('in')
    expect(row.qty_base).toBe(280)
    expect(row.waybill_no).toBe('IRS-001')
  })

  it('dağıtım — bölgeye 5 koli bırak = 5 koli base', async () => {
    const r = await request(app).post('/api/water/distribute').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: productId, zone_id: zoneId, input_qty: 5, input_unit: 'koli', move_date: '2026-07-02' })
    expect(r.status).toBe(201)
    const row = getDB().prepare('SELECT * FROM water_movements WHERE id=?').get(r.body.id)
    expect(row.type).toBe('out')
    expect(row.qty_base).toBe(5)
    expect(row.zone_id).toBe(zoneId)
    const alloc = getDB().prepare('SELECT * FROM water_movement_allocations WHERE out_movement_id=?').get(r.body.id)
    expect(alloc.qty_base).toBe(5)
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
    expect(p.total_in).toBe(280)
    expect(p.total_out).toBe(5)
    expect(p.balance).toBe(275)
    expect(p.balance_human).toBe('1 palet 135 koli')
    expect(p.brand_name).toBeTruthy()
    expect(r.body.zones.some(z => z.zone_id === zoneId && z.total_out === 5)).toBe(true)
    expect(r.body.daily.length).toBeGreaterThanOrEqual(2)
    expect(r.body.totals.balance).toBe(275)
  })

  it('movements listesi qty_human içerir', async () => {
    const r = await request(app).get('/api/water/movements?type=out').set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.body[0].qty_human).toBe('5 koli')
    expect(r.body[0].zone_name).toBe('A Blok Yemekhane')
    expect(r.body[0].source_waybills).toContain('IRS-001')
    expect(r.body[0].created_by_username).toBe('mudur')
    const limited = await request(app).get('/api/water/movements?type=out&limit=1').set('Authorization', `Bearer ${managerToken}`)
    expect(limited.body).toHaveLength(1)
  })

  it('giriş hareketinde irsaliye kalan stok döner', async () => {
    const r = await request(app).get('/api/water/movements?type=in').set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    const intake = r.body.find(m => m.waybill_no === 'IRS-001')
    expect(intake.remaining_base).toBe(275)
    expect(intake.remaining_human).toBe('1 palet 135 koli')
  })

  it('damacana paleti — 3 palet = 108 adet olarak kaydedilir', async () => {
    const prods = (await request(app).get('/api/water/products').set('Authorization', `Bearer ${managerToken}`)).body
    const dam = prods.find(p => p.name === '19 L Damacana')
    const r = await request(app).post('/api/water/intake').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: dam.id, input_qty: 3, input_unit: 'palet', move_date: '2026-07-04', waybill_no: 'IRS-DAM' })
    expect(r.status).toBe(201)
    const row = getDB().prepare('SELECT * FROM water_movements WHERE id=?').get(r.body.id)
    expect(row.qty_base).toBe(108)
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

  it('çevrimsiz üründe koli/palet birimi reddedilir', async () => {
    const r = await request(app).post('/api/water/intake').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: pDam, input_qty: 1, input_unit: 'koli', move_date: '2026-08-01' })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/koli/)
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
    const allocs = getDB().prepare(`SELECT COUNT(*) c FROM water_movement_allocations WHERE out_movement_id IN (${r.body.ids.map(() => '?').join(',')})`).get(...r.body.ids)
    expect(allocs.c).toBeGreaterThanOrEqual(2)
  })

  it('toplu dağıtım satır bazlı tarih kabul eder', async () => {
    const r = await request(app).post('/api/water/distribute/batch').set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'günlük çizelge', lines: [
        { move_date: '2026-08-04', zone_id: zoneA, product_id: pDam, input_qty: 1, input_unit: 'adet' },
        { move_date: '2026-08-05', zone_id: zoneA, product_id: pDam, input_qty: 2, input_unit: 'adet' },
      ] })
    expect(r.status).toBe(201)
    expect(r.body.count).toBe(2)
    const dates = getDB().prepare(`SELECT move_date FROM water_movements WHERE id IN (${r.body.ids.map(() => '?').join(',')}) ORDER BY move_date`).all(...r.body.ids).map(x => x.move_date)
    expect(dates).toEqual(['2026-08-04', '2026-08-05'])
  })

  it('dağıtım kaydı düzenlenir ve irsaliye eşleşmesi yenilenir', async () => {
    const created = await request(app).post('/api/water/distribute').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: pDam, zone_id: zoneA, input_qty: 3, input_unit: 'adet', move_date: '2026-08-06', note: 'ilk kayıt' })
    expect(created.status).toBe(201)
    const updated = await request(app).put(`/api/water/movements/${created.body.id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: pDam, zone_id: zoneB, input_qty: 4, input_unit: 'adet', move_date: '2026-08-07', note: 'düzeltildi' })
    expect(updated.status).toBe(200)
    const row = getDB().prepare('SELECT * FROM water_movements WHERE id=?').get(created.body.id)
    expect(row.zone_id).toBe(zoneB)
    expect(row.move_date).toBe('2026-08-07')
    expect(row.qty_base).toBe(4)
    expect(row.note).toBe('düzeltildi')
    const alloc = getDB().prepare('SELECT COALESCE(SUM(qty_base),0) total FROM water_movement_allocations WHERE out_movement_id=?').get(created.body.id)
    expect(alloc.total).toBe(4)
  })

  it('stoktan fazla dağıtım reddedilmez, eksi/bekleyen olarak kaydedilir ve sonra irsaliye ile kapanır', async () => {
    const r = await request(app).post('/api/water/distribute').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: pDam, zone_id: zoneA, input_qty: 999, input_unit: 'adet', move_date: '2026-08-03' })
    expect(r.status).toBe(201)
    const before = await request(app).get(`/api/water/movements?type=out&product_id=${pDam}&limit=1000`).set('Authorization', `Bearer ${managerToken}`)
    const pending = before.body.find(x => x.id === r.body.id)
    expect(pending.unallocated_base).toBeGreaterThan(0)
    expect(pending.allocation_status).toBe('pending')

    const inr = await request(app).post('/api/water/intake').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: pDam, input_qty: pending.unallocated_base, input_unit: 'adet', move_date: '2026-08-08', waybill_no: 'IRS-EKSI-KAPAT' })
    expect(inr.status).toBe(201)
    const after = await request(app).get(`/api/water/movements?type=out&product_id=${pDam}&limit=1000`).set('Authorization', `Bearer ${managerToken}`)
    const matched = after.body.find(x => x.id === r.body.id)
    expect(matched.unallocated_base).toBe(0)
    expect(matched.allocation_status).toBe('matched')
    expect(matched.source_waybills).toMatch(/IRS-EKSI-KAPAT/)
  })

  it('düşük stok — min eşik altına düşünce summary low=true', async () => {
    // pDam stokunda daha once paletli giris de var; eşiği yukarı çekince low olur.
    await request(app).put(`/api/water/products/${pDam}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ name: '19 L Damacana', unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36, min_level: 200 })
    const r = await request(app).get('/api/water/summary').set('Authorization', `Bearer ${managerToken}`)
    const dam = r.body.stock.find(s => s.product_id === pDam)
    expect(dam.min_level).toBe(200)
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
    expect(r.body.totals).toHaveProperty('period_net')
    expect(r.body.totals).toHaveProperty('deficit_total')
    const dam = r.body.stock.find(s => s.product_id === pDam)
    expect(dam).toHaveProperty('period_in')
    expect(dam).toHaveProperty('period_out')
    expect(dam).toHaveProperty('period_net_human')
  })
})

describe('Su takip — marka + boş kap iadesi + INDEX pivot', () => {
  let returnableId, nonReturnableId, tempBrandId

  it('markalar seed edildi ve listelenir', async () => {
    const r = await request(app).get('/api/water/brands').set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThanOrEqual(3)
    expect(r.body.some(b => b.name === 'MİLA SU')).toBe(true)
    expect(r.body.some(b => b.name === 'AVRİL')).toBe(true)
  })

  it('firmalar (bölgeler) seed edildi', async () => {
    const r = await request(app).get('/api/water/zones').set('Authorization', `Bearer ${managerToken}`)
    expect(r.body.some(z => z.name === 'OTC KAMP ALANI')).toBe(true)
    expect(r.body.some(z => z.name === 'FPU KAMP ALANI')).toBe(true)
  })

  it('ürünler marka bilgisi ve iade edilebilirlik içerir', async () => {
    const r = await request(app).get('/api/water/products').set('Authorization', `Bearer ${managerToken}`)
    const dam = r.body.find(p => p.name === '19 L Damacana')
    expect(dam).toBeTruthy()
    expect(dam.brand_name).toBe('MİLA SU')
    expect(dam.is_returnable).toBe(1)
    returnableId = dam.id
    const p05 = r.body.find(p => p.name.includes('0.5'))
    nonReturnableId = p05.id
    expect(p05.is_returnable).toBe(0)
  })

  it('marka oluşturma + aynı isim 409', async () => {
    const r = await request(app).post('/api/water/brands').set('Authorization', `Bearer ${managerToken}`).send({ name: 'TEST MARKA' })
    expect(r.status).toBe(201)
    tempBrandId = r.body.id
    const dup = await request(app).post('/api/water/brands').set('Authorization', `Bearer ${managerToken}`).send({ name: 'TEST MARKA' })
    expect(dup.status).toBe(409)
  })

  it('boş marka silinir, ürünlü marka silinemez (409)', async () => {
    const del = await request(app).delete(`/api/water/brands/${tempBrandId}`).set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
    const brands = (await request(app).get('/api/water/brands').set('Authorization', `Bearer ${managerToken}`)).body
    const mila = brands.find(b => b.name === 'MİLA SU')
    const del2 = await request(app).delete(`/api/water/brands/${mila.id}`).set('Authorization', `Bearer ${managerToken}`)
    expect(del2.status).toBe(409)
  })

  it('boş kap iadesi — iade edilebilir üründe kaydedilir', async () => {
    const r = await request(app).post('/api/water/returns').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: returnableId, input_qty: 10, input_unit: 'adet', move_date: '2026-09-01', note: 'boş damacana' })
    expect(r.status).toBe(201)
    const row = getDB().prepare('SELECT * FROM water_returns WHERE id=?').get(r.body.id)
    expect(row.qty_base).toBe(10)
  })

  it('iade edilemez üründe iade reddedilir (400)', async () => {
    const r = await request(app).post('/api/water/returns').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: nonReturnableId, input_qty: 5, input_unit: 'adet', move_date: '2026-09-01' })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/iade edilebilir/)
  })

  it('toplu iade — çok satır tek çağrı', async () => {
    const r = await request(app).post('/api/water/returns/batch').set('Authorization', `Bearer ${managerToken}`)
      .send({ move_date: '2026-09-02', lines: [
        { product_id: returnableId, input_qty: 4, input_unit: 'adet' },
        { product_id: returnableId, input_qty: 6, input_unit: 'adet' },
      ] })
    expect(r.status).toBe(201)
    expect(r.body.count).toBe(2)
  })

  it('depozito bakiyesi — dolaşımdaki = giriş − iade', async () => {
    const r = await request(app).get('/api/water/deposit').set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    const dam = r.body.find(d => d.product_id === returnableId)
    expect(dam).toBeTruthy()
    expect(dam.total_return).toBe(20) // 10 + 4 + 6
    expect(dam.outstanding).toBe(dam.total_in - dam.total_return)
  })

  it('iade listesi qty_human ve marka içerir', async () => {
    const r = await request(app).get('/api/water/returns').set('Authorization', `Bearer ${managerToken}`)
    expect(r.body.length).toBeGreaterThanOrEqual(3)
    expect(r.body[0].qty_human).toBeTruthy()
    expect(r.body[0]).toHaveProperty('brand_name')
  })

  it('INDEX pivot — matris yapısı ve tutarlı toplamlar döner', async () => {
    const r = await request(app).get('/api/water/pivot?from=2026-07-01&to=2026-08-31').set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.columns)).toBe(true)
    expect(Array.isArray(r.body.rows)).toBe(true)
    expect(r.body.brands.some(b => b.brand_name === 'MİLA SU')).toBe(true)
    const colSum = Object.values(r.body.colTotals).reduce((s, c) => s + c.base, 0)
    expect(r.body.grandTotal).toBe(colSum)
    const anyRow = r.body.rows.find(row => row.total_base > 0)
    expect(anyRow).toBeTruthy()
    const cellSum = Object.values(anyRow.cells).reduce((s, c) => s + c.base, 0)
    expect(anyRow.total_base).toBe(cellSum)
  })

  it('summary depozito bölümü döner', async () => {
    const r = await request(app).get('/api/water/summary?from=2026-09-01&to=2026-09-30').set('Authorization', `Bearer ${managerToken}`)
    expect(Array.isArray(r.body.deposit)).toBe(true)
    expect(r.body.totals).toHaveProperty('outstanding')
    expect(r.body.totals.period_return).toBe(20) // eylül iadeleri
  })

  it('iade kaydı silinir', async () => {
    const list = (await request(app).get('/api/water/returns').set('Authorization', `Bearer ${managerToken}`)).body
    const del = await request(app).delete(`/api/water/returns/${list[0].id}`).set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
  })
})

describe('Su takip — Operasyon Uyarı Merkezi (W1)', () => {
  const DAY = '2026-07-09'
  let pNeg, pLow, zActive, zIdle

  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

  beforeAll(async () => {
    // Eksi/bekleyen ürün: hiç giriş yok, sadece dağıtım → negatif + irsaliye bekleyen + ay dağıtım>gelen
    pNeg = (await auth(request(app).post('/api/water/products'))
      .send({ name: 'UYARI Eksi 0.6', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    // Düşük stok ürün: küçük giriş + yüksek eşik (balance >= 0 ama eşiğin altında)
    pLow = (await auth(request(app).post('/api/water/products'))
      .send({ name: 'UYARI Düşük 0.7', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1, min_level: 100 })).body.id
    zActive = (await auth(request(app).post('/api/water/zones')).send({ name: 'UYARI Aktif Bölge' })).body.id
    zIdle = (await auth(request(app).post('/api/water/zones')).send({ name: 'UYARI Boş Bölge' })).body.id

    // pNeg: bugün 7 adet dağıt (girişsiz → eksi + bekleyen)
    await auth(request(app).post('/api/water/distribute'))
      .send({ product_id: pNeg, zone_id: zActive, input_qty: 7, input_unit: 'adet', move_date: DAY })
    // pLow: bugün 5 adet giriş (balance 5 < 100 eşik → düşük)
    await auth(request(app).post('/api/water/intake'))
      .send({ product_id: pLow, input_qty: 5, input_unit: 'adet', move_date: DAY, waybill_no: 'UYARI-IN' })
  })

  it('irsaliye bekleyen dağıtım kartı — girişsiz ürünü bekleyen listesine koyar', async () => {
    const r = await auth(request(app).get(`/api/water/alerts?today=${DAY}`))
    expect(r.status).toBe(200)
    const item = r.body.pending_waybill.find(p => p.product_id === pNeg)
    expect(item).toBeTruthy()
    expect(item.unallocated_base).toBe(7)
    expect(item.waiting_days).toBe(0)
    expect(item.unallocated_human).toBe('7 adet')
    expect(r.body.summary.pending).toBeGreaterThanOrEqual(1)
  })

  it('eksi stok kartı — negatif bakiyeli ürünü listeler', async () => {
    const r = await auth(request(app).get(`/api/water/alerts?today=${DAY}`))
    const neg = r.body.negative_stock.find(p => p.product_id === pNeg)
    expect(neg).toBeTruthy()
    expect(neg.balance).toBe(-7)
    expect(neg.deficit_human).toBe('7 adet')
  })

  it('ay dağıtım>gelen kartı — bu ay fazla dağıtılan ürünü yakalar', async () => {
    const r = await auth(request(app).get(`/api/water/alerts?today=${DAY}`))
    const over = r.body.over_distributed.find(p => p.product_id === pNeg)
    expect(over).toBeTruthy()
    expect(over.period_out).toBe(7)
    expect(over.period_in).toBe(0)
    expect(over.diff).toBe(7)
  })

  it('düşük stok kartı — eşik altındaki (ama pozitif) ürünü listeler', async () => {
    const r = await auth(request(app).get(`/api/water/alerts?today=${DAY}`))
    const low = r.body.low_stock.find(p => p.product_id === pLow)
    expect(low).toBeTruthy()
    expect(low.balance).toBe(5)
    expect(low.min_level).toBe(100)
    // pozitif bakiye eksi listesinde OLMAMALI
    expect(r.body.negative_stock.some(p => p.product_id === pLow)).toBe(false)
  })

  it('bugün kayıtsız bölgeler kartı — boş bölge var, bugün dağıtım yapılan bölge yok', async () => {
    const r = await auth(request(app).get(`/api/water/alerts?today=${DAY}`))
    expect(r.body.idle_zones.some(z => z.zone_id === zIdle)).toBe(true)
    expect(r.body.idle_zones.some(z => z.zone_id === zActive)).toBe(false)
  })

  it('bekleme günü — geçmiş tarihli bekleyen dağıtım için doğru gün sayısı', async () => {
    const r = await auth(request(app).get('/api/water/alerts?today=2026-07-12'))
    const item = r.body.pending_waybill.find(p => p.product_id === pNeg)
    expect(item.waiting_days).toBe(3) // 07-09 → 07-12
  })

  it('yetkisiz rol erişemez (403)', async () => {
    const r = await request(app).get(`/api/water/alerts?today=${DAY}`).set('Authorization', `Bearer ${laundryToken}`)
    expect(r.status).toBe(403)
  })
})

describe('Su takip — Ay Sonu Kapanış / Uyuşturma (W2)', () => {
  const MONTH = '2026-06'
  let pRec, zone, supervisorToken
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

  beforeAll(async () => {
    supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
    pRec = (await auth(request(app).post('/api/water/products'))
      .send({ name: 'KAPANIS Test 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    zone = (await auth(request(app).post('/api/water/zones')).send({ name: 'KAPANIS Bölge' })).body.id
    // Ay öncesi devreden: 100 (Mayıs)
    await auth(request(app).post('/api/water/intake')).send({ product_id: pRec, input_qty: 100, input_unit: 'adet', move_date: '2026-05-15', waybill_no: 'KAP-OPEN' })
    // Ay içi gelen: 50 (Haziran)
    await auth(request(app).post('/api/water/intake')).send({ product_id: pRec, input_qty: 50, input_unit: 'adet', move_date: '2026-06-10', waybill_no: 'KAP-IN' })
    // Ay içi dağıtılan: 30 (Haziran)
    await auth(request(app).post('/api/water/distribute')).send({ product_id: pRec, zone_id: zone, input_qty: 30, input_unit: 'adet', move_date: '2026-06-20' })
  })

  it('uyuşturma — devreden/gelen/dağıtılan/sistem kalan doğru hesaplanır', async () => {
    const r = await auth(request(app).get(`/api/water/reconciliation?month=${MONTH}`))
    expect(r.status).toBe(200)
    expect(r.body.locked).toBe(false)
    const row = r.body.rows.find(x => x.product_id === pRec)
    expect(row.opening_base).toBe(100)
    expect(row.month_in).toBe(50)
    expect(row.month_out).toBe(30)
    expect(row.system_base).toBe(120) // 100 + 50 - 30
    expect(row.status).toBe('pending') // henüz sayım yok
    expect(Array.isArray(r.body.reasons)).toBe(true)
  })

  it('tek ürün uzlaştırması ay sınırlarını korur ve toplu sonuçla aynıdır', async () => {
    await auth(request(app).post('/api/water/intake'))
      .send({ product_id: pRec, input_qty: 9, input_unit: 'adet', move_date: '2026-07-01', waybill_no: 'KAP-NEXT' })
    await auth(request(app).post('/api/water/intake'))
      .send({ product_id: pRec, input_qty: 4, input_unit: 'adet', move_date: '2026-12-31', waybill_no: 'KAP-YEAR-END' })
    await auth(request(app).post('/api/water/intake'))
      .send({ product_id: pRec, input_qty: 7, input_unit: 'adet', move_date: '2027-01-01', waybill_no: 'KAP-NEXT-YEAR' })

    const single = reconciliationRow(MONTH, pRec)
    const fromAll = reconciliationRows(MONTH).find(row => row.product_id === pRec)
    expect(single).toEqual(fromAll)
    expect(single.month_in).toBe(50)
    expect(reconciliationRow('2026-12', pRec).month_in).toBe(4)
    expect(reconciliationRow(MONTH, -999999)).toBeUndefined()
  })

  it('uzlaştırma tarih aralıkları bileşik indeksleri kullanır', () => {
    const db = getDB()
    const movementPlan = db.prepare(`
      EXPLAIN QUERY PLAN SELECT qty_base FROM water_movements
      WHERE product_id=? AND move_date>=? AND move_date<?
    `).all(pRec, '2026-06-01', '2026-07-01')
    const adjustmentPlan = db.prepare(`
      EXPLAIN QUERY PLAN SELECT qty_base FROM water_adjustments
      WHERE product_id=? AND move_date>=? AND move_date<?
    `).all(pRec, '2026-06-01', '2026-07-01')
    const returnPlan = db.prepare(`
      EXPLAIN QUERY PLAN SELECT qty_base FROM water_returns
      WHERE product_id=? AND move_date>=? AND move_date<?
    `).all(pRec, '2026-06-01', '2026-07-01')

    expect(movementPlan.map(row => row.detail).join(' ')).toContain('idx_water_mov_product_date')
    expect(adjustmentPlan.map(row => row.detail).join(' ')).toContain('idx_water_adj_product_date')
    expect(returnPlan.map(row => row.detail).join(' ')).toContain('idx_water_ret_product_date')
  })

  it('geçersiz ay formatı 400', async () => {
    const r = await auth(request(app).get('/api/water/reconciliation?month=2026'))
    expect(r.status).toBe(400)
  })

  it('sayım = sistem → fark 0, sebep gerekmez', async () => {
    const r = await auth(request(app).post('/api/water/stock-count'))
      .send({ month: MONTH, product_id: pRec, counted_qty: 120, counted_unit: 'adet' })
    expect(r.status).toBe(200)
    expect(r.body.diff_base).toBe(0)
    expect(r.body.status).toBe('even')
  })

  it('fark varsa sebep zorunlu (400), sebeple kaydedilir', async () => {
    const bad = await auth(request(app).post('/api/water/stock-count'))
      .send({ month: MONTH, product_id: pRec, counted_qty: 115, counted_unit: 'adet' })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toMatch(/sebep|açıklama/i)

    const ok = await auth(request(app).post('/api/water/stock-count'))
      .send({ month: MONTH, product_id: pRec, counted_qty: 115, counted_unit: 'adet', reason: 'fire_kirik', note: '5 kırık' })
    expect(ok.status).toBe(200)
    expect(ok.body.diff_base).toBe(-5)
    expect(ok.body.status).toBe('short')

    // uyuşturmada sayım + fark + durum yansır
    const rec = await auth(request(app).get(`/api/water/reconciliation?month=${MONTH}`))
    const row = rec.body.rows.find(x => x.product_id === pRec)
    expect(row.counted_base).toBe(115)
    expect(row.diff_base).toBe(-5)
    expect(row.reason).toBe('fire_kirik')
    expect(row.status).toBe('short')
    expect(row.diff_human).toBe('-5 adet')
  })

  it('ay kapanışı kilitler; kilitli aya kayıt uyarı döndürür (engellemez)', async () => {
    const close = await auth(request(app).post('/api/water/monthly-close')).send({ month: MONTH, note: 'Haziran kapandı' })
    expect(close.status).toBe(201)
    expect(close.body.is_locked).toBe(1)

    const rec = await auth(request(app).get(`/api/water/reconciliation?month=${MONTH}`))
    expect(rec.body.locked).toBe(true)

    // kilitli aya yeni giriş — kaydedilir ama uyarı gelir
    const intake = await auth(request(app).post('/api/water/intake'))
      .send({ product_id: pRec, input_qty: 5, input_unit: 'adet', move_date: '2026-06-25', waybill_no: 'KAP-LATE' })
    expect(intake.status).toBe(201)
    expect(intake.body.warning).toMatch(/Kapanmış aya kayıt/)
  })

  it('kapanış/kilit sadece kampüs müdürüne açık (403 vardiya)', async () => {
    const r = await request(app).post('/api/water/monthly-close').set('Authorization', `Bearer ${supervisorToken}`).send({ month: '2026-05' })
    expect(r.status).toBe(403)
  })

  it('kilidi açma — kayıt sonrası uyarı kalkar', async () => {
    const unlock = await auth(request(app).post(`/api/water/monthly-close/${MONTH}/unlock`))
    expect(unlock.status).toBe(200)
    const intake = await auth(request(app).post('/api/water/intake'))
      .send({ product_id: pRec, input_qty: 1, input_unit: 'adet', move_date: '2026-06-26' })
    expect(intake.body.warning).toBeNull()
  })

  it('olmayan ay kilidi açılamaz (404)', async () => {
    const r = await auth(request(app).post('/api/water/monthly-close/2099-01/unlock'))
    expect(r.status).toBe(404)
  })
})

describe('Su takip — İrsaliye Bekleyenler (W3)', () => {
  const TODAY = '2026-10-10'
  let pPend, zone
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

  beforeAll(async () => {
    pPend = (await auth(request(app).post('/api/water/products'))
      .send({ name: 'BEKLEYEN Test 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    zone = (await auth(request(app).post('/api/water/zones')).send({ name: 'BEKLEYEN Bölge' })).body.id
    // 5 gün önce girişsiz dağıtım (20) → bekleyen + gecikmiş
    await auth(request(app).post('/api/water/distribute')).send({ product_id: pPend, zone_id: zone, input_qty: 20, input_unit: 'adet', move_date: '2026-10-05' })
  })

  it('bekleyen dağıtımı listeler — bekleyen miktar + gün + severity', async () => {
    const r = await auth(request(app).get(`/api/water/pending?today=${TODAY}`))
    expect(r.status).toBe(200)
    const row = r.body.rows.find(x => x.product_name === 'BEKLEYEN Test 1L')
    expect(row).toBeTruthy()
    expect(row.unallocated_base).toBe(20)
    expect(row.allocated_base).toBe(0)
    expect(row.waiting_days).toBe(5) // 10-05 → 10-10
    expect(row.severity).toBe('overdue') // 3+ gün
    expect(row.zone_name).toBe('BEKLEYEN Bölge')
    expect(r.body.totals.count).toBeGreaterThanOrEqual(1)
  })

  it('yeni irsaliye girilince bekleyen otomatik kapanır (kısmi eşleşme → bekleyen azalır)', async () => {
    // 15 adet giriş → 20'nin 15'i eşleşir, 5 bekler
    await auth(request(app).post('/api/water/intake')).send({ product_id: pPend, input_qty: 15, input_unit: 'adet', move_date: '2026-10-08', waybill_no: 'BEK-IRS-1' })
    const r = await auth(request(app).get(`/api/water/pending?today=${TODAY}`))
    const row = r.body.rows.find(x => x.product_name === 'BEKLEYEN Test 1L')
    expect(row.unallocated_base).toBe(5)
    expect(row.allocated_base).toBe(15)
    expect(row.source_waybills).toMatch(/BEK-IRS-1/)

    // kalan 5'i de kapat → listeden çıkar
    await auth(request(app).post('/api/water/intake')).send({ product_id: pPend, input_qty: 5, input_unit: 'adet', move_date: '2026-10-09', waybill_no: 'BEK-IRS-2' })
    const r2 = await auth(request(app).get(`/api/water/pending?today=${TODAY}`))
    expect(r2.body.rows.some(x => x.product_name === 'BEKLEYEN Test 1L')).toBe(false)
  })

  it('yetkisiz rol erişemez (403)', async () => {
    const r = await request(app).get('/api/water/pending').set('Authorization', `Bearer ${laundryToken}`)
    expect(r.status).toBe(403)
  })
})

describe('Su takip — Dağıtım yeri beklenen tüketim (W4)', () => {
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

  it('bölge beklenen aylık tüketim ile oluşturulur, güncellenir ve pivotta döner', async () => {
    const z = await auth(request(app).post('/api/water/zones')).send({ name: 'BEKLENEN Bölge', expected_monthly: 500 })
    expect(z.status).toBe(201)
    const zone = (await auth(request(app).get('/api/water/zones'))).body.find(x => x.id === z.body.id)
    expect(zone.expected_monthly).toBe(500)

    await auth(request(app).put(`/api/water/zones/${z.body.id}`)).send({ name: 'BEKLENEN Bölge', expected_monthly: 800 })
    const zone2 = (await auth(request(app).get('/api/water/zones'))).body.find(x => x.id === z.body.id)
    expect(zone2.expected_monthly).toBe(800)

    const piv = await auth(request(app).get('/api/water/pivot?from=2026-07-01&to=2026-07-31'))
    expect(piv.body.rows.find(r => r.zone_id === z.body.id).expected_monthly).toBe(800)
  })

  it('expected_monthly gönderilmezse 0 varsayılır', async () => {
    const z = await auth(request(app).post('/api/water/zones')).send({ name: 'BEKLENENSIZ Bölge' })
    const zone = (await auth(request(app).get('/api/water/zones'))).body.find(x => x.id === z.body.id)
    expect(zone.expected_monthly).toBe(0)
  })
})

describe('Su takip — Hızlı Giriş Şablonları (W5)', () => {
  let pId, zId
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

  beforeAll(async () => {
    pId = (await auth(request(app).post('/api/water/products')).send({ name: 'SABLON Su 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    zId = (await auth(request(app).post('/api/water/zones')).send({ name: 'SABLON Bölge' })).body.id
  })

  it('şablon oluşturulur ve satırlarıyla listelenir', async () => {
    const r = await auth(request(app).post('/api/water/templates')).send({
      name: 'FPU Yemekhane Rutin',
      lines: [{ zone_id: zId, product_id: pId, default_qty: 5, default_unit: 'adet' }],
    })
    expect(r.status).toBe(201)
    const list = (await auth(request(app).get('/api/water/templates'))).body
    const tpl = list.find(t => t.name === 'FPU Yemekhane Rutin')
    expect(tpl).toBeTruthy()
    expect(tpl.lines).toHaveLength(1)
    expect(tpl.lines[0].zone_name).toBe('SABLON Bölge')
    expect(tpl.lines[0].product_name).toBe('SABLON Su 1L')
    expect(tpl.lines[0].default_qty).toBe(5)
  })

  it('aynı isim 409, satırsız 400, geçersiz ürün 400', async () => {
    const dup = await auth(request(app).post('/api/water/templates')).send({ name: 'FPU Yemekhane Rutin', lines: [{ zone_id: zId, product_id: pId }] })
    expect(dup.status).toBe(409)
    const empty = await auth(request(app).post('/api/water/templates')).send({ name: 'Boş Şablon', lines: [] })
    expect(empty.status).toBe(400)
    const badP = await auth(request(app).post('/api/water/templates')).send({ name: 'Kötü Şablon', lines: [{ zone_id: zId, product_id: 999999 }] })
    expect(badP.status).toBe(400)
  })

  it('şablon silinir (satırları da gider)', async () => {
    const created = await auth(request(app).post('/api/water/templates')).send({ name: 'Silinecek Şablon', lines: [{ zone_id: zId, product_id: pId, default_qty: 2, default_unit: 'adet' }] })
    const del = await auth(request(app).delete(`/api/water/templates/${created.body.id}`))
    expect(del.status).toBe(200)
    const list = (await auth(request(app).get('/api/water/templates'))).body
    expect(list.some(t => t.id === created.body.id)).toBe(false)
    const lines = getDB().prepare('SELECT COUNT(*) c FROM water_template_lines WHERE template_id=?').get(created.body.id)
    expect(lines.c).toBe(0)
  })

  it('yetkisiz rol erişemez (403)', async () => {
    const r = await request(app).get('/api/water/templates').set('Authorization', `Bearer ${laundryToken}`)
    expect(r.status).toBe(403)
  })
})

describe('Su takip — Çok-satırlı irsaliye + bekleyen kapanışı (W6)', () => {
  let pA, pB, zone
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

  beforeAll(async () => {
    pA = (await auth(request(app).post('/api/water/products')).send({ name: 'W6 Ürün A', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    pB = (await auth(request(app).post('/api/water/products')).send({ name: 'W6 Ürün B', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    zone = (await auth(request(app).post('/api/water/zones')).send({ name: 'W6 Bölge' })).body.id
    // pA için bekleyen dağıtım (girişsiz)
    await auth(request(app).post('/api/water/distribute')).send({ product_id: pA, zone_id: zone, input_qty: 10, input_unit: 'adet', move_date: '2026-11-01' })
  })

  it('toplu irsaliye 2 ürün kaydeder ve bekleyeni eşleştirir (matched döner)', async () => {
    const r = await auth(request(app).post('/api/water/intake/batch')).send({
      move_date: '2026-11-03', waybill_no: 'W6-IRS',
      lines: [
        { product_id: pA, input_qty: 10, input_unit: 'adet' },
        { product_id: pB, input_qty: 5, input_unit: 'adet' },
      ],
    })
    expect(r.status).toBe(201)
    expect(r.body.count).toBe(2)
    expect(r.body.matched).toBeGreaterThanOrEqual(1) // pA bekleyeni eşleşti

    // pA artık bekleyenler listesinde değil
    const pending = await auth(request(app).get('/api/water/pending?today=2026-11-05'))
    expect(pending.body.rows.some(x => x.product_name === 'W6 Ürün A')).toBe(false)
  })
})

describe('Su takip — Stok Düzeltme / Sayım Fişi (W7)', () => {
  const MONTH = '2026-12'
  let pAdj, supervisorToken
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)
  const balanceOf = async (id) => (await auth(request(app).get('/api/water/summary'))).body.stock.find(s => s.product_id === id)?.balance

  beforeAll(async () => {
    supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
    pAdj = (await auth(request(app).post('/api/water/products')).send({ name: 'DUZELTME 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
  })

  it('düzeltme (artı) stok bakiyesini artırır, sebep zorunlu', async () => {
    expect(await balanceOf(pAdj)).toBe(0)
    const noReason = await auth(request(app).post('/api/water/adjustments')).send({ product_id: pAdj, direction: 'in', input_qty: 10, input_unit: 'adet', move_date: '2026-12-05' })
    expect(noReason.status).toBe(400)
    const add = await auth(request(app).post('/api/water/adjustments')).send({ product_id: pAdj, direction: 'in', input_qty: 10, input_unit: 'adet', move_date: '2026-12-05', reason: 'devir_duzeltme', note: 'açılış sayımı' })
    expect(add.status).toBe(201)
    expect(await balanceOf(pAdj)).toBe(10)
  })

  it('düzeltme (eksi) stok bakiyesini azaltır', async () => {
    await auth(request(app).post('/api/water/adjustments')).send({ product_id: pAdj, direction: 'out', input_qty: 3, input_unit: 'adet', move_date: '2026-12-06', reason: 'fire_kirik' })
    expect(await balanceOf(pAdj)).toBe(7) // 10 − 3
  })

  it('liste sebep + işaretli miktar döner; uyuşturmada month_adjust yansır', async () => {
    const list = await auth(request(app).get(`/api/water/adjustments?product_id=${pAdj}`))
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body.reasons)).toBe(true)
    expect(list.body.rows).toHaveLength(2)
    expect(list.body.rows.some(a => a.signed_base === 10)).toBe(true)
    expect(list.body.rows.some(a => a.signed_base === -3)).toBe(true)

    const rec = await auth(request(app).get(`/api/water/reconciliation?month=${MONTH}`))
    const row = rec.body.rows.find(x => x.product_id === pAdj)
    expect(row.month_adjust).toBe(7) // +10 −3
    expect(row.system_base).toBe(7) // devreden 0 + gelen 0 − dağıtılan 0 + düzeltme 7
  })

  it('düzeltme silinince bakiye geri döner', async () => {
    const list = (await auth(request(app).get(`/api/water/adjustments?product_id=${pAdj}`))).body.rows
    const plus = list.find(a => a.direction === 'in')
    const del = await auth(request(app).delete(`/api/water/adjustments/${plus.id}`))
    expect(del.status).toBe(200)
    expect(await balanceOf(pAdj)).toBe(-3) // +10 kalktı → 0 − 3
  })

  it('düzeltme yazımı sadece kampüs müdürüne açık (403 vardiya)', async () => {
    const r = await request(app).post('/api/water/adjustments').set('Authorization', `Bearer ${supervisorToken}`)
      .send({ product_id: pAdj, direction: 'in', input_qty: 1, input_unit: 'adet', move_date: '2026-12-07', reason: 'sayim_farki' })
    expect(r.status).toBe(403)
  })
})

describe('Su takip — Ürün/Marka güçlendirme (W8)', () => {
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

  it('ürün kritik stok eşiği ile oluşur; eşik altında summary critical=true', async () => {
    const pid = (await auth(request(app).post('/api/water/products')).send({ name: 'W8 Kritik 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1, min_level: 50, critical_level: 10 })).body.id
    const zid = (await auth(request(app).post('/api/water/zones')).send({ name: 'W8 Bölge' })).body.id
    await auth(request(app).post('/api/water/distribute')).send({ product_id: pid, zone_id: zid, input_qty: 5, input_unit: 'adet', move_date: '2027-01-05' })
    const s = await auth(request(app).get('/api/water/summary'))
    const row = s.body.stock.find(x => x.product_id === pid)
    expect(row.critical_level).toBe(10)
    expect(row.critical).toBe(true) // balance -5 < 0
    expect(s.body.totals).toHaveProperty('critical_count')
  })

  it('marka rengi kaydedilir; geçersiz renk null olur', async () => {
    const bid = (await auth(request(app).post('/api/water/brands')).send({ name: 'W8 Renkli Marka', color: '#ff8800' })).body.id
    expect((await auth(request(app).get('/api/water/brands'))).body.find(x => x.id === bid).color).toBe('#ff8800')
    await auth(request(app).put(`/api/water/brands/${bid}`)).send({ name: 'W8 Renkli Marka', color: 'notacolor' })
    expect((await auth(request(app).get('/api/water/brands'))).body.find(x => x.id === bid).color).toBeNull()
  })

  it('ürün pasife alınır — aktif listede gizli, all listede görünür', async () => {
    const pid = (await auth(request(app).post('/api/water/products')).send({ name: 'W8 Pasif Ürün', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    await auth(request(app).put(`/api/water/products/${pid}`)).send({ name: 'W8 Pasif Ürün', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1, is_active: false })
    expect((await auth(request(app).get('/api/water/products'))).body.some(x => x.id === pid)).toBe(false)
    expect((await auth(request(app).get('/api/water/products?all=1'))).body.some(x => x.id === pid)).toBe(true)
  })
})

describe('Su takip — Ay kapanışı PDF özeti (W9)', () => {
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)
  it('PDF döner (application/pdf); geçersiz ay 400', async () => {
    const bad = await auth(request(app).get('/api/water/reconciliation/2026/pdf'))
    expect(bad.status).toBe(400)
    const r = await auth(request(app).get('/api/water/reconciliation/2026-06/pdf').buffer())
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/pdf/)
    expect(r.body.length || r.text?.length || 0).toBeGreaterThan(100) // PDF gövdesi
  })
  it('yetkisiz rol PDF alamaz (403)', async () => {
    const r = await request(app).get('/api/water/reconciliation/2026-06/pdf').set('Authorization', `Bearer ${laundryToken}`)
    expect(r.status).toBe(403)
  })
})

describe('Su takip — Onay akışı (W10)', () => {
  let pRev, zRev, supervisorToken
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

  beforeAll(async () => {
    supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
    pRev = (await auth(request(app).post('/api/water/products')).send({ name: 'ONAY 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    zRev = (await auth(request(app).post('/api/water/zones')).send({ name: 'ONAY Bölge' })).body.id
  })

  it('stok karşılığı olmayan dağıtım "kontrol bekliyor" listesine düşer', async () => {
    await auth(request(app).post('/api/water/distribute')).send({ product_id: pRev, zone_id: zRev, input_qty: 8, input_unit: 'adet', move_date: '2027-02-01' })
    const r = await auth(request(app).get('/api/water/review'))
    expect(r.status).toBe(200)
    const item = r.body.rows.find(x => x.product_name === 'ONAY 1L')
    expect(item).toBeTruthy()
    expect(item.unallocated_base).toBe(8)
  })

  it('stok karşılığı olan dağıtım kontrol beklemez', async () => {
    const p2 = (await auth(request(app).post('/api/water/products')).send({ name: 'ONAY Stoklu 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    await auth(request(app).post('/api/water/intake')).send({ product_id: p2, input_qty: 50, input_unit: 'adet', move_date: '2027-02-02', waybill_no: 'ONAY-IN2' })
    await auth(request(app).post('/api/water/distribute')).send({ product_id: p2, zone_id: zRev, input_qty: 10, input_unit: 'adet', move_date: '2027-02-03' })
    const r = await auth(request(app).get('/api/water/review'))
    expect(r.body.rows.some(x => x.product_name === 'ONAY Stoklu 1L')).toBe(false)
  })

  it('vardiya onaylayamaz (403); müdür toplu onaylar → kuyruk temizlenir', async () => {
    const forbidden = await request(app).post('/api/water/review/approve').set('Authorization', `Bearer ${supervisorToken}`).send({})
    expect(forbidden.status).toBe(403)
    // vardiya kuyruğu görebilir (mgr)
    expect((await request(app).get('/api/water/review').set('Authorization', `Bearer ${supervisorToken}`)).status).toBe(200)

    expect((await auth(request(app).get('/api/water/review'))).body.count).toBeGreaterThanOrEqual(1)
    const ok = await auth(request(app).post('/api/water/review/approve')).send({}) // ids yok → hepsini onayla
    expect(ok.status).toBe(200)
    expect(ok.body.approved).toBeGreaterThanOrEqual(1)
    expect((await auth(request(app).get('/api/water/review'))).body.count).toBe(0)
  })
})

describe('Su takip — Tüketim öngörüsü & sipariş önerisi (V1)', () => {
  const TODAY = '2027-03-31'
  let pOrder, pStock, zone
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

  beforeAll(async () => {
    pOrder = (await auth(request(app).post('/api/water/products')).send({ name: 'FC Order 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    pStock = (await auth(request(app).post('/api/water/products')).send({ name: 'FC Stock 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    zone = (await auth(request(app).post('/api/water/zones')).send({ name: 'FC Bölge' })).body.id
    // pOrder: 100 giriş + 90 dağıtım (9 gün × 10) → balance 10, avg 3/gün (90/30), gün-yeter 3
    await auth(request(app).post('/api/water/intake')).send({ product_id: pOrder, input_qty: 100, input_unit: 'adet', move_date: '2027-03-20', waybill_no: 'FC-1' })
    const lines = []
    for (let d = 22; d <= 30; d++) lines.push({ move_date: `2027-03-${d}`, zone_id: zone, product_id: pOrder, input_qty: 10, input_unit: 'adet' })
    await auth(request(app).post('/api/water/distribute/batch')).send({ lines })
    // pStock: 1000 giriş + 30 dağıtım → bol stok (~970 gün yeter)
    await auth(request(app).post('/api/water/intake')).send({ product_id: pStock, input_qty: 1000, input_unit: 'adet', move_date: '2027-03-01', waybill_no: 'FC-2' })
    await auth(request(app).post('/api/water/distribute')).send({ product_id: pStock, zone_id: zone, input_qty: 30, input_unit: 'adet', move_date: '2027-03-15' })
  })

  it('düşük stoklu ürün için gün-yeter + sipariş önerisi hesaplar', async () => {
    const r = await auth(request(app).get(`/api/water/forecast?today=${TODAY}`))
    expect(r.status).toBe(200)
    const row = r.body.rows.find(x => x.product_id === pOrder)
    expect(row.balance).toBe(10)
    expect(row.avg_daily).toBe(3) // 90/30
    expect(row.days_of_cover).toBe(3) // floor(10/3)
    expect(row.needs_order).toBe(true)
    expect(row.suggested_base).toBe(80) // ceil(3×30) − 10
    expect(row.confidence).toBe('ok')
    expect(r.body.order_suggestions.some(x => x.product_id === pOrder)).toBe(true)
    expect(r.body.totals.order_count).toBeGreaterThanOrEqual(1)
  })

  it('bol stoklu ürün sipariş önermez', async () => {
    const r = await auth(request(app).get(`/api/water/forecast?today=${TODAY}`))
    const row = r.body.rows.find(x => x.product_id === pStock)
    expect(row.days_of_cover).toBeGreaterThan(100)
    expect(row.needs_order).toBe(false)
  })

  it('yetersiz veri (yeni ürün) düşük güven + null gün-yeter döner', async () => {
    const pNew = (await auth(request(app).post('/api/water/products')).send({ name: 'FC New 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    const r = await auth(request(app).get(`/api/water/forecast?today=${TODAY}`))
    const row = r.body.rows.find(x => x.product_id === pNew)
    expect(row.confidence).toBe('low')
    expect(row.days_of_cover).toBeNull()
    expect(row.needs_order).toBe(false)
  })

  it('yetkisiz rol erişemez (403)', async () => {
    const r = await request(app).get('/api/water/forecast').set('Authorization', `Bearer ${laundryToken}`)
    expect(r.status).toBe(403)
  })
})

describe('Su takip — Trend & analiz (V2)', () => {
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)
  let pTr, zTr

  beforeAll(async () => {
    pTr = (await auth(request(app).post('/api/water/products')).send({ name: 'TREND 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1 })).body.id
    zTr = (await auth(request(app).post('/api/water/zones')).send({ name: 'TREND Bölge' })).body.id
    await auth(request(app).post('/api/water/intake')).send({ product_id: pTr, input_qty: 500, input_unit: 'adet', move_date: '2027-05-01', waybill_no: 'TR-1' })
    await auth(request(app).post('/api/water/distribute/batch')).send({ lines: [
      { move_date: '2027-05-10', zone_id: zTr, product_id: pTr, input_qty: 100, input_unit: 'adet' },
      { move_date: '2027-06-10', zone_id: zTr, product_id: pTr, input_qty: 150, input_unit: 'adet' },
    ] })
  })

  it('son N ay aylık akış + bölge/ürün sıralaması döner', async () => {
    const r = await auth(request(app).get('/api/water/trends?today=2027-06-30&months=3'))
    expect(r.status).toBe(200)
    expect(r.body.months).toBe(3)
    expect(r.body.monthly.some(x => x.month === '2027-05')).toBe(true)
    expect(r.body.monthly.some(x => x.month === '2027-06')).toBe(true)
    expect(r.body.zones.find(z => z.zone_id === zTr)?.total).toBe(250) // 100 + 150
    expect(r.body.products.find(p => p.product_id === pTr)?.out).toBe(250)
  })

  it('yetkisiz rol erişemez (403)', async () => {
    const r = await request(app).get('/api/water/trends').set('Authorization', `Bearer ${laundryToken}`)
    expect(r.status).toBe(403)
  })
})

describe('Su takip — Eskalasyon (V5)', () => {
  const NOW = new Date('2027-04-10T11:00:00+03:00')
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

  beforeAll(async () => {
    const pEsc = (await auth(request(app).post('/api/water/products')).send({ name: 'ESC 1L', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1, critical_level: 50 })).body.id
    const zEsc = (await auth(request(app).post('/api/water/zones')).send({ name: 'ESC Bölge' })).body.id
    // 9 gün önce girişsiz dağıtım → overdue bekleyen + eksi (kritik stok)
    await auth(request(app).post('/api/water/distribute')).send({ product_id: pEsc, zone_id: zEsc, input_qty: 20, input_unit: 'adet', move_date: '2027-04-01' })
  })

  it('overdue bekleyen + kritik stok için critical bildirim üretir; günlük dedup', () => {
    const r = waterEscalations({ now: NOW })
    expect(r.created).toBeGreaterThanOrEqual(1)
    const esc = getDB().prepare("SELECT COUNT(*) c FROM notifications WHERE dedup_key LIKE 'water_esc_%'").get()
    expect(esc.c).toBeGreaterThanOrEqual(1)
    // aynı gün ikinci çağrı → hepsi dedup, yeni bildirim yok
    const r2 = waterEscalations({ now: NOW })
    expect(r2.created).toBe(0)
  })
})

describe('Su takip — Ay kapanışı PDF servisi (V4)', () => {
  it('buildReconciliationPDF pdfkit doc\'una geçerli PDF yazar (cron yolu)', async () => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    const done = new Promise(res => doc.on('end', res))
    buildReconciliationPDF('2026-06', doc) // doc.end() içeride
    await done
    const buf = Buffer.concat(chunks)
    expect(buf.length).toBeGreaterThan(100)
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })
  it('geçersiz ay 400 fırlatır', () => {
    expect(() => buildReconciliationPDF('2026', {})).toThrow(/YYYY-MM/)
  })
})

describe('Su takip — Günlük operasyon özeti (V3)', () => {
  it('digest actionable öğeleri toplar, müdüre bildirim üretir ve günlük dedup uygular', () => {
    const r = waterDailyDigest()
    expect(r.actionable).toBe(true) // önceki testlerden eksi/bekleyen kayıtlar mevcut
    expect(r.notified).toBe(true)
    expect(Array.isArray(r.parts) && r.parts.length).toBeTruthy()

    const notif = getDB().prepare('SELECT * FROM notifications WHERE dedup_key=?').get(`water_digest_${r.date}`)
    expect(notif).toBeTruthy()
    expect(notif.message).toMatch(/günlük özet/)
    expect(notif.target_role).toBe('campus_manager')

    // aynı gün ikinci çağrı → dedup, yeni bildirim yok
    const r2 = waterDailyDigest()
    expect(r2.notified).toBe(false)
  })
})

describe('Su takip - Tir on bildirimleri ve irsaliye foto arsivi (W11)', () => {
  const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')

  it('tir on bildirimi olusturulur, listede mail hazir durumu ve saat araligi doner', async () => {
    const brandId = (await auth(request(app).post('/api/water/brands')).send({ name: 'W11 Mila' })).body.id
    const created = await auth(request(app).post('/api/water/truck-arrivals')).send({
      arrival_date: '2027-03-10',
      arrival_start_time: '09:00',
      arrival_end_time: '11:00',
      mail_deadline_date: '2027-03-10',
      mail_deadline_time: '17:00',
      reminder_start_time: '08:00',
      reminder_end_time: '17:00',
      reminder_interval_minutes: 60,
      supplier_name: 'Mila Su',
      brand_id: brandId,
      driver_name: 'Ahmet Yilmaz',
      driver_tc: '12345678901',
      driver_phone: '05551112233',
      plate: '34 abc 123',
      trailer_plate: '34 drs 456',
      identity_type: 'tc',
      visit_company: 'AVS Küresel Gıda Tedarik ve Yönetim A.Ş.',
      host_person_name: 'Sercan Sucu',
      host_person_phone: '0539111344',
      entry_reason: 'SU AMAÇLI NAKLİYE',
      work_area: 'FPU KAMP ALANI',
      center_email: 'merkez@example.com',
      note: 'Ana kapidan giris',
    })
    expect(created.status).toBe(201)

    const list = await auth(request(app).get('/api/water/truck-arrivals?from=2027-03-10&to=2027-03-10'))
    expect(list.status).toBe(200)
    const row = list.body.find(x => x.id === created.body.id)
    expect(row).toBeTruthy()
    expect(row.plate).toBe('34 ABC 123')
    expect(row.arrival_window).toBe('09:00-11:00')
    expect(row.mail_deadline_label).toBe('2027-03-10 17:00')
    expect(row.mail_ready).toBe(true)
    expect(row.missing_mail_fields).toEqual([])
    expect(row.mail_phase).toBe('scheduled')
    expect(row.arrival_phase).toBe('scheduled')
    expect(row.check_plan_label).toBe('08:00-17:00 / 60 dk')
    expect(row.mail_subject).toBe('Su amaçlı nakliye personel giriş talebi - 2027-03-10 - 34 ABC 123')
    expect(row.mail_preview.to).toBe('merkez@example.com')
    expect(row.mail_preview.body).toMatch(/10\.03\.2027 tarihinde 09:00-11:00 saatleri arasında Ahmet Yilmaz/)
    expect(row.mail_preview.body).toMatch(/Personel ve araç girişinin sağlanması hususunda yardımlarınızı rica ederiz/)
    expect(row.mail_preview.body).toMatch(/T\.C\. Kimlik \/ Sicil-Arşiv No: 12345678901/)
    expect(row.mail_preview.body).toMatch(/Ziyaret edilecek kişi: Sercan Sucu/)
    expect(row.mail_preview.body).toMatch(/Çalışma yapacağı bölge: FPU KAMP ALANI/)
    expect(row.gate_entry).toMatchObject({
      full_name: 'Ahmet Yilmaz', identity_type: 'tc', identity_no: '12345678901',
      visit_company: 'AVS Küresel Gıda Tedarik ve Yönetim A.Ş.', host_person_name: 'Sercan Sucu',
      entry_reason: 'SU AMAÇLI NAKLİYE', work_area: 'FPU KAMP ALANI', ready: true,
    })
    expect(row.action_items).toContain('İrsaliye fotoğrafı henüz yok')

    const pdf = await auth(request(app).get(`/api/water/truck-arrivals/${row.id}/gate-entry.pdf`)).buffer()
    expect(pdf.status).toBe(200)
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/)
    expect(pdf.headers['content-disposition']).toMatch(/su-nakliye-personel-giris-2027-03-10-34-ABC-123\.pdf/)
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF')
    expect(pdf.body.length).toBeGreaterThan(2000)
    expect(pdf.body.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2)
  })

  it('personel girişinde kimlik türü doğrulanır', async () => {
    const invalid = await auth(request(app).post('/api/water/truck-arrivals')).send({
      arrival_date: '2027-03-10', plate: '34 TEST 049', identity_type: 'ehliyet',
    })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error).toMatch(/Kimlik türü/)
  })

  it('olmayan tırın personel giriş PDF isteği 404 döner', async () => {
    const missing = await auth(request(app).get('/api/water/truck-arrivals/999999/gate-entry.pdf'))
    expect(missing.status).toBe(404)
    expect(missing.body.error).toMatch(/Tır kaydı bulunamadı/)
  })

  it('mail bilgisi eksik tirda otomatik mail reddedilir; manuel isaretleme durumu mail_sent yapar', async () => {
    const created = await auth(request(app).post('/api/water/truck-arrivals')).send({
      arrival_date: '2027-03-11',
      plate: '35 test 111',
    })
    expect(created.status).toBe(201)

    const blocked = await auth(request(app).post(`/api/water/truck-arrivals/${created.body.id}/send-mail`))
    expect(blocked.status).toBe(400)
    expect(blocked.body.error).toMatch(/Mail/)

    const marked = await auth(request(app).post(`/api/water/truck-arrivals/${created.body.id}/mark-mail-sent`))
    expect(marked.status).toBe(200)
    expect(marked.body.status).toBe('mail_sent')
    expect(marked.body.mail_sent_at).toBeTruthy()
  })

  it('hazır tır mailini kalıcı kuyruğa atomik ekler ve çift istekte aynı işi döndürür', async () => {
    const created = await auth(request(app).post('/api/water/truck-arrivals')).send({
      arrival_date: '2027-03-11',
      arrival_start_time: '09:00',
      arrival_end_time: '11:00',
      plate: '35 queue 050',
      driver_name: 'Kuyruk Test',
      driver_tc: '12345678901',
      driver_phone: '05550000050',
      trailer_plate: '35 DOR 050',
      visit_company: 'AVS Tedarik',
      host_person_name: 'Sercan Sucu',
      host_person_phone: '0539111344',
      work_area: 'FPU KAMP ALANI',
      center_email: 'merkez@example.com',
    })
    expect(created.status).toBe(201)

    const queued = await auth(request(app).post(`/api/water/truck-arrivals/${created.body.id}/send-mail`))
    expect(queued.status).toBe(202)
    expect(queued.body).toMatchObject({ queued: true, alreadyQueued: false })
    expect(queued.body.truck.mail_phase).toBe('queued')
    expect(queued.body.truck.mail_queue).toMatchObject({ status: 'pending', active: true, attempts: 0, max_attempts: 5 })

    const job = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(queued.body.job_id)
    expect(job.type).toBe('water.truck-mail')
    expect(JSON.parse(job.payload)).toMatchObject({
      truckArrivalId: created.body.id,
      to: 'merkez@example.com',
    })

    const duplicate = await auth(request(app).post(`/api/water/truck-arrivals/${created.body.id}/send-mail`))
    expect(duplicate.status).toBe(200)
    expect(duplicate.body).toMatchObject({ queued: true, alreadyQueued: true, job_id: queued.body.job_id })
    expect(getDB().prepare("SELECT COUNT(*) AS count FROM job_queue WHERE type='water.truck-mail'").get().count).toBe(1)
  })

  it('irsaliye fotografi tir kaydina baglanir, arsivde listelenir ve silinir', async () => {
    const truck = await auth(request(app).post('/api/water/truck-arrivals')).send({
      arrival_date: '2027-03-12',
      arrival_start_time: '08:00',
      arrival_end_time: '12:00',
      plate: '06 irs 012',
      driver_name: 'Mehmet Kaya',
      driver_tc: '10987654321',
      driver_phone: '05554443322',
      trailer_plate: '06 dor 012',
      center_email: 'merkez@example.com',
    })
    expect(truck.status).toBe(201)

    const uploaded = await auth(request(app).post('/api/water/waybill-photos'))
      .field('truck_arrival_id', String(truck.body.id))
      .field('waybill_no', 'W11-IRS-001')
      .field('move_date', '2027-03-12')
      .field('note', 'Teslim irsaliyesi')
      .attach('photo', jpeg, 'irsaliye.jpg')
    expect(uploaded.status).toBe(201)

    const photos = await auth(request(app).get(`/api/water/waybill-photos?truck_arrival_id=${truck.body.id}`))
    expect(photos.status).toBe(200)
    const photo = photos.body.find(x => x.id === uploaded.body.id)
    expect(photo).toBeTruthy()
    expect(photo.photo_url).toMatch(/^\/uploads\/water-waybill-/)
    expect(photo.plate).toBe('06 IRS 012')
    expect(photo.waybill_no).toBe('W11-IRS-001')
    const filePath = uploadFilePathFromUrl(photo.photo_url)
    expect(fs.existsSync(filePath)).toBe(true)

    const del = await auth(request(app).delete(`/api/water/waybill-photos/${uploaded.body.id}`))
    expect(del.status).toBe(200)
    expect(del.body.file_status).toBe('deleted')
    expect(fs.existsSync(filePath)).toBe(false)
    const after = await auth(request(app).get(`/api/water/waybill-photos?truck_arrival_id=${truck.body.id}`))
    expect(after.body.some(x => x.id === uploaded.body.id)).toBe(false)
  })

  it('tır silinince yalnız tıra bağlı fotoğrafı siler, stok girişine bağlı irsaliyeyi korur', async () => {
    const product = await auth(request(app).post('/api/water/products')).send({
      name: 'W11 Dosya Yasam Dongusu', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1,
    })
    const intake = await auth(request(app).post('/api/water/intake')).send({
      product_id: product.body.id, input_qty: 5, input_unit: 'adet', move_date: '2027-03-13', waybill_no: 'W11-LIFE-IN',
    })
    const truck = await auth(request(app).post('/api/water/truck-arrivals')).send({
      arrival_date: '2027-03-13', plate: '06 life 013',
    })

    const truckOnly = await auth(request(app).post('/api/water/waybill-photos'))
      .field('truck_arrival_id', String(truck.body.id))
      .field('move_date', '2027-03-13')
      .attach('photo', jpeg, 'yalniz-tir.jpg')
    const linked = await auth(request(app).post('/api/water/waybill-photos'))
      .field('truck_arrival_id', String(truck.body.id))
      .field('movement_id', String(intake.body.id))
      .field('move_date', '2027-03-13')
      .attach('photo', jpeg, 'stok-girisi.jpg')

    const truckOnlyRow = getDB().prepare('SELECT * FROM water_waybill_photos WHERE id=?').get(truckOnly.body.id)
    const linkedRow = getDB().prepare('SELECT * FROM water_waybill_photos WHERE id=?').get(linked.body.id)
    const truckOnlyPath = uploadFilePathFromUrl(truckOnlyRow.photo_url)
    const linkedPath = uploadFilePathFromUrl(linkedRow.photo_url)
    expect(fs.existsSync(truckOnlyPath)).toBe(true)
    expect(fs.existsSync(linkedPath)).toBe(true)

    const deleted = await auth(request(app).delete(`/api/water/truck-arrivals/${truck.body.id}`))
    expect(deleted.status).toBe(200)
    expect(deleted.body).toMatchObject({
      deleted_photo_count: 1, preserved_photo_count: 1, file_cleanup_pending: 0,
    })
    expect(getDB().prepare('SELECT * FROM water_waybill_photos WHERE id=?').get(truckOnly.body.id)).toBeUndefined()
    expect(fs.existsSync(truckOnlyPath)).toBe(false)

    const preserved = getDB().prepare('SELECT * FROM water_waybill_photos WHERE id=?').get(linked.body.id)
    expect(preserved).toMatchObject({ truck_arrival_id: null, movement_id: intake.body.id })
    expect(fs.existsSync(linkedPath)).toBe(true)

    const removePreserved = await auth(request(app).delete(`/api/water/waybill-photos/${linked.body.id}`))
    expect(removePreserved.status).toBe(200)
    expect(fs.existsSync(linkedPath)).toBe(false)
  })

  it('dakikalik kontrol mail deadline ve gelis araligi icin bildirim uretir', async () => {
    const truck = await auth(request(app).post('/api/water/truck-arrivals')).send({
      arrival_date: '2027-03-15',
      arrival_start_time: '10:00',
      arrival_end_time: '12:00',
      mail_deadline_date: '2027-03-15',
      mail_deadline_time: '17:00',
      reminder_start_time: '08:00',
      reminder_end_time: '17:00',
      plate: '16 uyari 001',
      driver_name: 'Ali Saat',
      driver_tc: '11122233344',
      driver_phone: '05550000000',
      trailer_plate: '16 dor 001',
      center_email: 'merkez@example.com',
    })
    expect(truck.status).toBe(201)

    const result = checkTruckArrivalAlerts({ now: new Date('2027-03-15T11:00:00+03:00') })
    expect(result.checked).toBeGreaterThanOrEqual(1)
    expect(result.created).toBeGreaterThanOrEqual(2)

    expect(result.alerts.some(a => a.type === 'mail_due')).toBe(true)
    expect(result.alerts.some(a => a.type === 'arrival_due')).toBe(true)
    const mailNotif = getDB().prepare('SELECT * FROM notifications WHERE dedup_key=?').get(`water_truck_mail_${truck.body.id}_2027-03-15_1100`)
    const arrivalNotif = getDB().prepare('SELECT * FROM notifications WHERE dedup_key=?').get(`water_truck_arrival_${truck.body.id}_2027-03-15_1100`)
    expect(mailNotif?.module).toBe('water')
    expect(arrivalNotif?.module).toBe('water')
  })

  it('15 dakikalik tir kontrol araligi ayni saat icinde ayri bildirim anahtari uretir', async () => {
    const truck = await auth(request(app).post('/api/water/truck-arrivals')).send({
      arrival_date: '2027-03-16',
      arrival_start_time: '09:00',
      arrival_end_time: '12:00',
      mail_deadline_date: '2027-03-16',
      mail_deadline_time: '17:00',
      reminder_start_time: '08:00',
      reminder_end_time: '17:00',
      reminder_interval_minutes: 15,
      plate: '16 onbes 001',
      driver_name: 'Veli Ceyrek',
      driver_tc: '22233344455',
      driver_phone: '05551110000',
      trailer_plate: '16 drs 001',
      center_email: 'merkez@example.com',
    })
    expect(truck.status).toBe(201)

    const first = checkTruckArrivalAlerts({ now: new Date('2027-03-16T11:00:00+03:00') })
    const second = checkTruckArrivalAlerts({ now: new Date('2027-03-16T11:15:00+03:00') })
    expect(first.created).toBeGreaterThanOrEqual(2)
    expect(second.created).toBeGreaterThanOrEqual(2)
    expect(getDB().prepare('SELECT * FROM notifications WHERE dedup_key=?').get(`water_truck_mail_${truck.body.id}_2027-03-16_1100`)).toBeTruthy()
    expect(getDB().prepare('SELECT * FROM notifications WHERE dedup_key=?').get(`water_truck_mail_${truck.body.id}_2027-03-16_1115`)).toBeTruthy()
  })

  it('cron slot baslangicini kacirsa 30 dakikalik araligi yakalar ve ayni slotu tekillestirir', async () => {
    const truck = await auth(request(app).post('/api/water/truck-arrivals')).send({
      arrival_date: '2027-03-17',
      arrival_start_time: '09:00',
      arrival_end_time: '12:00',
      mail_deadline_date: '2027-03-17',
      mail_deadline_time: '17:00',
      reminder_start_time: '08:00',
      reminder_end_time: '17:00',
      reminder_interval_minutes: 30,
      plate: '16 otuz 001',
      driver_name: 'Dakika Test',
      driver_tc: '33344455566',
      driver_phone: '05552220000',
      trailer_plate: '16 drs 030',
      center_email: 'merkez@example.com',
    })
    expect(truck.status).toBe(201)

    const recovered = checkTruckArrivalAlerts({ now: new Date('2027-03-17T11:07:00+03:00') })
    const duplicate = checkTruckArrivalAlerts({ now: new Date('2027-03-17T11:29:00+03:00') })
    const nextSlot = checkTruckArrivalAlerts({ now: new Date('2027-03-17T11:30:00+03:00') })

    expect(recovered.created).toBeGreaterThanOrEqual(2)
    expect(duplicate.created).toBe(0)
    expect(nextSlot.created).toBeGreaterThanOrEqual(2)
    expect(getDB().prepare('SELECT * FROM notifications WHERE dedup_key=?').get(`water_truck_mail_${truck.body.id}_2027-03-17_1100`)).toBeTruthy()
    expect(getDB().prepare('SELECT * FROM notifications WHERE dedup_key=?').get(`water_truck_mail_${truck.body.id}_2027-03-17_1130`)).toBeTruthy()
  })

  it('mail deadline asimini ilk dakikada yakalar ve her dakika bildirim yagdirmaz', async () => {
    const truck = await auth(request(app).post('/api/water/truck-arrivals')).send({
      arrival_date: '2027-03-19',
      arrival_start_time: '09:00',
      arrival_end_time: '12:00',
      mail_deadline_date: '2027-03-18',
      mail_deadline_time: '17:00',
      reminder_start_time: '08:00',
      reminder_end_time: '17:00',
      reminder_interval_minutes: 15,
      plate: '16 deadline 001',
      driver_name: 'Deadline Test',
      driver_tc: '44455566677',
      driver_phone: '05553330000',
      trailer_plate: '16 drs 015',
      center_email: 'merkez@example.com',
    })
    expect(truck.status).toBe(201)

    const firstMinute = checkTruckArrivalAlerts({ now: new Date('2027-03-18T17:01:00+03:00') })
    const sameSlot = checkTruckArrivalAlerts({ now: new Date('2027-03-18T17:05:00+03:00') })
    const nextSlot = checkTruckArrivalAlerts({ now: new Date('2027-03-18T17:16:00+03:00') })

    expect(firstMinute.created).toBe(1)
    expect(firstMinute.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'mail_overdue', created: true })]))
    expect(sameSlot.created).toBe(0)
    expect(nextSlot.created).toBe(1)
    expect(getDB().prepare('SELECT * FROM notifications WHERE dedup_key=?').get(`water_truck_deadline_${truck.body.id}_2027-03-18_1701`)).toBeTruthy()
    expect(getDB().prepare('SELECT * FROM notifications WHERE dedup_key=?').get(`water_truck_deadline_${truck.body.id}_2027-03-18_1716`)).toBeTruthy()
  })
})

describe('Su takip - merkezi endpoint hata hatti', () => {
  it('4xx yanitlari normal dondurur, 5xx hatalarini error_log kaydina aktarir', async () => {
    const db = getDB()
    const previousNodeEnv = process.env.NODE_ENV
    db.exec('BEGIN')
    try {
      process.env.NODE_ENV = 'development'
      const initialErrorCount = db.prepare('SELECT COUNT(*) AS count FROM error_log').get().count

      const validation = await request(app)
        .post('/api/water/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: '' })
      expect(validation.status).toBe(400)
      expect(db.prepare('SELECT COUNT(*) AS count FROM error_log').get().count).toBe(initialErrorCount)

      db.exec(`
        CREATE TEMP TRIGGER force_water_product_failure
        BEFORE INSERT ON water_products
        BEGIN
          SELECT RAISE(ABORT, 'forced water route failure');
        END
      `)
      const failure = await request(app)
        .post('/api/water/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Hata Hatti Test Urunu' })

      expect(failure.status).toBe(500)
      expect(failure.body).toEqual({ error: 'Sunucu hatası' })
      const logged = db.prepare(`
        SELECT source, severity, message, url, user_id
        FROM error_log
        ORDER BY id DESC
        LIMIT 1
      `).get()
      expect(logged).toMatchObject({
        source: 'backend',
        severity: 'error',
        message: 'forced water route failure',
        url: 'POST /api/water/products',
      })
      expect(logged.user_id).toBeTruthy()
    } finally {
      process.env.NODE_ENV = previousNodeEnv
      if (db.inTransaction) db.exec('ROLLBACK')
    }
  })
})

describe('Su takip - intake ve FIFO atomikligi', () => {
  const auth = (builder) => builder.set('Authorization', `Bearer ${managerToken}`)

  async function createAtomicFixture(suffix, qty = 7) {
    const product = await auth(request(app).post('/api/water/products')).send({
      name: `Atomic FIFO ${suffix}`,
      unit_label: 'adet',
      units_per_case: 1,
      cases_per_pallet: 1,
    })
    const zone = await auth(request(app).post('/api/water/zones')).send({
      name: `Atomic Zone ${suffix}`,
      code: `AT-${suffix}`,
    })
    expect(product.status).toBe(201)
    expect(zone.status).toBe(201)

    const distribution = await auth(request(app).post('/api/water/distribute')).send({
      product_id: product.body.id,
      zone_id: zone.body.id,
      input_qty: qty,
      input_unit: 'adet',
      move_date: '2028-01-05',
    })
    expect(distribution.status).toBe(201)
    return { productId: product.body.id, distributionId: distribution.body.id }
  }

  function forceAllocationFailure(triggerName, distributionId) {
    getDB().exec(`
      CREATE TEMP TRIGGER ${triggerName}
      BEFORE INSERT ON water_movement_allocations
      WHEN NEW.out_movement_id = ${Number(distributionId)}
      BEGIN
        SELECT RAISE(ABORT, 'forced FIFO reconcile failure');
      END
    `)
  }

  it('tekli intake tahsisi basarisizsa hareket kaydini geri alir', async () => {
    const db = getDB()
    const { productId, distributionId } = await createAtomicFixture('SINGLE')
    const triggerName = 'force_single_fifo_failure'
    forceAllocationFailure(triggerName, distributionId)
    try {
      const response = await auth(request(app).post('/api/water/intake')).send({
        product_id: productId,
        input_qty: 7,
        input_unit: 'adet',
        move_date: '2028-01-06',
        waybill_no: 'ATOMIC-SINGLE-FAIL',
      })

      expect(response.status).toBe(500)
      expect(db.prepare('SELECT COUNT(*) AS count FROM water_movements WHERE waybill_no=?').get('ATOMIC-SINGLE-FAIL').count).toBe(0)
      expect(db.prepare('SELECT COUNT(*) AS count FROM water_movement_allocations WHERE out_movement_id=?').get(distributionId).count).toBe(0)
      expect(db.prepare('SELECT needs_review FROM water_movements WHERE id=?').get(distributionId).needs_review).toBe(1)
    } finally {
      db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`)
    }
  })

  it('toplu intake reconcile hatasinda butun irsaliye satirlarini geri alir', async () => {
    const db = getDB()
    const { productId, distributionId } = await createAtomicFixture('BATCH')
    const secondProduct = await auth(request(app).post('/api/water/products')).send({
      name: 'Atomic FIFO BATCH SECOND',
      unit_label: 'adet',
      units_per_case: 1,
      cases_per_pallet: 1,
    })
    expect(secondProduct.status).toBe(201)

    const triggerName = 'force_batch_fifo_failure'
    forceAllocationFailure(triggerName, distributionId)
    try {
      const response = await auth(request(app).post('/api/water/intake/batch')).send({
        move_date: '2028-01-06',
        waybill_no: 'ATOMIC-BATCH-FAIL',
        lines: [
          { product_id: productId, input_qty: 7, input_unit: 'adet' },
          { product_id: secondProduct.body.id, input_qty: 3, input_unit: 'adet' },
        ],
      })

      expect(response.status).toBe(500)
      expect(db.prepare('SELECT COUNT(*) AS count FROM water_movements WHERE waybill_no=?').get('ATOMIC-BATCH-FAIL').count).toBe(0)
      expect(db.prepare('SELECT COUNT(*) AS count FROM water_movement_allocations WHERE out_movement_id=?').get(distributionId).count).toBe(0)
      expect(db.prepare('SELECT needs_review FROM water_movements WHERE id=?').get(distributionId).needs_review).toBe(1)
    } finally {
      db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`)
    }
  })
})

describe('Su takip - hareket degisikliginde FIFO butunlugu', () => {
  const auth = (builder) => builder.set('Authorization', `Bearer ${managerToken}`)

  async function createProduct(name) {
    const response = await auth(request(app).post('/api/water/products')).send({
      name,
      unit_label: 'adet',
      units_per_case: 1,
      cases_per_pallet: 1,
    })
    expect(response.status).toBe(201)
    return response.body.id
  }

  async function createZone(name, code) {
    const response = await auth(request(app).post('/api/water/zones')).send({ name, code })
    expect(response.status).toBe(201)
    return response.body.id
  }

  async function intake(productId, qty, waybillNo) {
    const response = await auth(request(app).post('/api/water/intake')).send({
      product_id: productId,
      input_qty: qty,
      input_unit: 'adet',
      move_date: '2028-02-01',
      waybill_no: waybillNo,
    })
    expect(response.status).toBe(201)
    return response.body.id
  }

  async function distribute(productId, zoneId, qty, moveDate) {
    const response = await auth(request(app).post('/api/water/distribute')).send({
      product_id: productId,
      zone_id: zoneId,
      input_qty: qty,
      input_unit: 'adet',
      move_date: moveDate,
    })
    expect(response.status).toBe(201)
    return response.body.id
  }

  it('OUT silinince serbest kalan lotu siradaki bekleyen dagitima aktarir', async () => {
    const db = getDB()
    const productId = await createProduct('FIFO DELETE OUT')
    const zoneId = await createZone('FIFO Delete Zone', 'FIFO-DEL')
    const intakeId = await intake(productId, 10, 'FIFO-DELETE-IN')
    const allocatedOutId = await distribute(productId, zoneId, 10, '2028-02-02')
    const pendingOutId = await distribute(productId, zoneId, 6, '2028-02-03')

    expect(db.prepare('SELECT needs_review FROM water_movements WHERE id=?').get(pendingOutId).needs_review).toBe(1)
    const deleted = await auth(request(app).delete(`/api/water/movements/${allocatedOutId}`))

    expect(deleted.status).toBe(200)
    expect(db.prepare('SELECT COUNT(*) AS count FROM water_movements WHERE id=?').get(allocatedOutId).count).toBe(0)
    expect(db.prepare('SELECT COALESCE(SUM(qty_base),0) AS total FROM water_movement_allocations WHERE out_movement_id=?').get(pendingOutId).total).toBe(6)
    expect(db.prepare('SELECT needs_review FROM water_movements WHERE id=?').get(pendingOutId).needs_review).toBe(0)
    expect(db.prepare('SELECT COALESCE(SUM(qty_base),0) AS total FROM water_movement_allocations WHERE in_movement_id=?').get(intakeId).total).toBe(6)
  })

  it('tahsisli IN silmeyi aciklamali 409 ile engeller', async () => {
    const db = getDB()
    const productId = await createProduct('FIFO DELETE IN')
    const zoneId = await createZone('FIFO Intake Zone', 'FIFO-IN')
    const intakeId = await intake(productId, 5, 'FIFO-RESTRICT-IN')
    const outId = await distribute(productId, zoneId, 3, '2028-02-02')
    const auditCountBefore = db.prepare(`
      SELECT COUNT(*) AS count FROM audit_log
      WHERE action='water_movement_delete' AND target_id=?
    `).get(intakeId).count

    const response = await auth(request(app).delete(`/api/water/movements/${intakeId}`))

    expect(response.status).toBe(409)
    expect(response.body.error).toMatch(/1 dağıtıma toplam 3 birim tahsis edilmiş/)
    expect(db.prepare('SELECT COUNT(*) AS count FROM water_movements WHERE id=?').get(intakeId).count).toBe(1)
    expect(db.prepare('SELECT COALESCE(SUM(qty_base),0) AS total FROM water_movement_allocations WHERE out_movement_id=?').get(outId).total).toBe(3)
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM audit_log
      WHERE action='water_movement_delete' AND target_id=?
    `).get(intakeId).count).toBe(auditCountBefore)
  })

  it('dagitim urunu A dan B ye degisince iki urunun tahsislerini yeniden dengeler', async () => {
    const db = getDB()
    const productA = await createProduct('FIFO UPDATE PRODUCT A')
    const productB = await createProduct('FIFO UPDATE PRODUCT B')
    const zoneId = await createZone('FIFO Update Zone', 'FIFO-UPD')
    const intakeA = await intake(productA, 10, 'FIFO-UPDATE-A')
    const movingOutId = await distribute(productA, zoneId, 10, '2028-02-02')
    const pendingAId = await distribute(productA, zoneId, 6, '2028-02-03')
    const intakeB = await intake(productB, 8, 'FIFO-UPDATE-B')

    const updated = await auth(request(app).put(`/api/water/movements/${movingOutId}`)).send({
      product_id: productB,
      zone_id: zoneId,
      input_qty: 8,
      input_unit: 'adet',
      move_date: '2028-02-04',
      note: 'A dan B ye aktarildi',
    })

    expect(updated.status).toBe(200)
    expect(db.prepare('SELECT product_id FROM water_movements WHERE id=?').get(movingOutId).product_id).toBe(productB)
    expect(db.prepare('SELECT COALESCE(SUM(qty_base),0) AS total FROM water_movement_allocations WHERE out_movement_id=?').get(pendingAId).total).toBe(6)
    expect(db.prepare('SELECT needs_review FROM water_movements WHERE id=?').get(pendingAId).needs_review).toBe(0)
    expect(db.prepare('SELECT COALESCE(SUM(qty_base),0) AS total FROM water_movement_allocations WHERE in_movement_id=?').get(intakeA).total).toBe(6)

    const updatedSources = db.prepare(`
      SELECT src.product_id, SUM(wa.qty_base) AS total
      FROM water_movement_allocations wa
      JOIN water_movements src ON src.id=wa.in_movement_id
      WHERE wa.out_movement_id=?
      GROUP BY src.product_id
    `).all(movingOutId)
    expect(updatedSources).toEqual([{ product_id: productB, total: 8 }])
    expect(db.prepare('SELECT COALESCE(SUM(qty_base),0) AS total FROM water_movement_allocations WHERE in_movement_id=?').get(intakeB).total).toBe(8)
  })
})

describe('Su takip - denetim izi', () => {
  const auth = builder => builder.set('Authorization', `Bearer ${managerToken}`)
  const auditRow = (action, targetId) => getDB().prepare(`
    SELECT * FROM audit_log WHERE action=? AND target_id=? ORDER BY id DESC LIMIT 1
  `).get(action, targetId)

  it('ürün güncelleme ve silmede önce/sonra değerlerini kaydeder', async () => {
    const created = await auth(request(app).post('/api/water/products')).send({
      name: 'AUDIT ÜRÜN', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 24,
      min_level: 3, critical_level: 1,
    })
    expect(created.status).toBe(201)
    const productId = created.body.id

    const updated = await auth(request(app).put(`/api/water/products/${productId}`)).send({
      name: 'AUDIT ÜRÜN YENİ', unit_label: 'adet', units_per_case: 2, cases_per_pallet: 30,
      min_level: 5, critical_level: 2, is_returnable: true, is_active: true,
    })
    expect(updated.status).toBe(200)
    const updateAudit = auditRow('water_product_update', productId)
    expect(updateAudit).toBeTruthy()
    expect(JSON.parse(updateAudit.detail)).toMatchObject({
      before: { name: 'AUDIT ÜRÜN', cases_per_pallet: 24, min_level: 3 },
      after: { name: 'AUDIT ÜRÜN YENİ', cases_per_pallet: 30, min_level: 5, is_returnable: 1 },
    })

    const deleted = await auth(request(app).delete(`/api/water/products/${productId}`))
    expect(deleted.status).toBe(200)
    expect(JSON.parse(auditRow('water_product_delete', productId).detail)).toMatchObject({
      before: { name: 'AUDIT ÜRÜN YENİ' }, after: null,
    })
  })

  it('marka güncelleme ve silmeyi renk dahil kaydeder', async () => {
    const created = await auth(request(app).post('/api/water/brands')).send({ name: 'AUDIT MARKA', color: '#112233' })
    expect(created.status).toBe(201)
    const brandId = created.body.id

    const updated = await auth(request(app).put(`/api/water/brands/${brandId}`)).send({
      name: 'AUDIT MARKA YENİ', color: '#445566', sort_order: 8, is_active: true,
    })
    expect(updated.status).toBe(200)
    expect(JSON.parse(auditRow('water_brand_update', brandId).detail)).toMatchObject({
      before: { name: 'AUDIT MARKA', color: '#112233' },
      after: { name: 'AUDIT MARKA YENİ', color: '#445566', sort_order: 8 },
    })

    const deleted = await auth(request(app).delete(`/api/water/brands/${brandId}`))
    expect(deleted.status).toBe(200)
    expect(JSON.parse(auditRow('water_brand_delete', brandId).detail)).toMatchObject({
      before: { name: 'AUDIT MARKA YENİ' }, after: null,
    })
  })

  it('dağıtım yeri güncelleme ve silmeyi hedef kimliğiyle kaydeder', async () => {
    const created = await auth(request(app).post('/api/water/zones')).send({
      name: 'AUDIT BÖLGE', code: 'AUD-1', note: 'ilk', expected_monthly: 100,
    })
    expect(created.status).toBe(201)
    const zoneId = created.body.id

    const updated = await auth(request(app).put(`/api/water/zones/${zoneId}`)).send({
      name: 'AUDIT BÖLGE YENİ', code: 'AUD-2', note: 'güncel', expected_monthly: 180, is_active: true,
    })
    expect(updated.status).toBe(200)
    expect(JSON.parse(auditRow('water_zone_update', zoneId).detail)).toEqual({
      before: { name: 'AUDIT BÖLGE', code: 'AUD-1', note: 'ilk', is_active: 1, expected_monthly: 100 },
      after: { name: 'AUDIT BÖLGE YENİ', code: 'AUD-2', note: 'güncel', is_active: 1, expected_monthly: 180 },
    })

    const deleted = await auth(request(app).delete(`/api/water/zones/${zoneId}`))
    expect(deleted.status).toBe(200)
    expect(JSON.parse(auditRow('water_zone_delete', zoneId).detail)).toMatchObject({
      before: { name: 'AUDIT BÖLGE YENİ', code: 'AUD-2' }, after: null,
    })
  })

  it('stok hareketi silmeyi miktar ve bağlantılarıyla kaydeder; başarısız silmeyi kaydetmez', async () => {
    const product = await auth(request(app).post('/api/water/products')).send({
      name: 'AUDIT HAREKET ÜRÜNÜ', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1,
    })
    const zone = await auth(request(app).post('/api/water/zones')).send({ name: 'AUDIT HAREKET BÖLGESİ' })
    const movement = await auth(request(app).post('/api/water/distribute')).send({
      product_id: product.body.id, zone_id: zone.body.id,
      input_qty: 3, input_unit: 'adet', move_date: '2028-03-01', note: 'audit silme',
    })
    expect(movement.status).toBe(201)

    const countBefore = getDB().prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action='water_movement_delete'").get().count
    const missing = await auth(request(app).delete('/api/water/movements/999999999'))
    expect(missing.status).toBe(404)
    expect(getDB().prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action='water_movement_delete'").get().count).toBe(countBefore)

    const deleted = await auth(request(app).delete(`/api/water/movements/${movement.body.id}`))
    expect(deleted.status).toBe(200)
    const audit = auditRow('water_movement_delete', movement.body.id)
    expect(audit).toMatchObject({ module: 'water', target_id: movement.body.id })
    expect(JSON.parse(audit.detail)).toEqual({
      before: {
        type: 'out', product_id: product.body.id, zone_id: zone.body.id,
        move_date: '2028-03-01', qty_base: 3, input_qty: 3, input_unit: 'adet',
        waybill_no: null, note: 'audit silme',
      },
      after: null,
    })
  })
})
