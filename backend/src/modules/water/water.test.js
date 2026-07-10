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
