import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { toBase, humanize, availableUnits } from './service.js'

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

  it('ürüne göre geçerli birimler hesaplanır', () => {
    expect(availableUnits({ units_per_case: 1, cases_per_pallet: 1 })).toEqual(['adet'])
    expect(availableUnits({ units_per_case: 24, cases_per_pallet: 1 })).toEqual(['adet', 'koli'])
    expect(availableUnits({ units_per_case: 12, cases_per_pallet: 70 })).toEqual(['adet', 'koli', 'palet'])
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
    const alloc = getDB().prepare('SELECT * FROM water_movement_allocations WHERE out_movement_id=?').get(r.body.id)
    expect(alloc.qty_base).toBe(60)
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
    expect(r.body[0].source_waybills).toContain('IRS-001')
  })

  it('giriş hareketinde irsaliye kalan stok döner', async () => {
    const r = await request(app).get('/api/water/movements?type=in').set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    const intake = r.body.find(m => m.waybill_no === 'IRS-001')
    expect(intake.remaining_base).toBe(1620)
    expect(intake.remaining_human).toBe('1 palet 65 koli')
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

  it('stoktan fazla dağıtım irsaliye eşleşmesi olmadığı için reddedilir', async () => {
    const r = await request(app).post('/api/water/distribute').set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: pDam, zone_id: zoneA, input_qty: 999, input_unit: 'adet', move_date: '2026-08-03' })
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/stok yetersiz/)
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
