import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import PDFDocument from 'pdfkit'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { accountingReportService, writeAccountingReportPDF } from './report.js'

let managerToken, laundryToken, productId, zoneA, zoneB

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  laundryToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
  const auth = req => req.set('Authorization', `Bearer ${managerToken}`)

  productId = (await auth(request(app).post('/api/water/products'))
    .send({ name: 'Rapor Suyu', unit_label: 'koli', units_per_case: 1, cases_per_pallet: 10 })).body.id
  zoneA = (await auth(request(app).post('/api/water/zones')).send({ name: 'Rapor Bölge A' })).body.id
  zoneB = (await auth(request(app).post('/api/water/zones')).send({ name: 'Rapor Bölge B' })).body.id

  // Dönem öncesi devir: 20 koli girdi, 5 koli dağıtıldı → devir 15
  await auth(request(app).post('/api/water/intake'))
    .send({ product_id: productId, input_qty: 20, input_unit: 'koli', move_date: '2026-05-20', waybill_no: 'ESKI-1' })
  await auth(request(app).post('/api/water/distribute'))
    .send({ product_id: productId, zone_id: zoneA, input_qty: 5, input_unit: 'koli', move_date: '2026-05-21' })

  // Dönem içi: 100 koli giriş, 12 + 8 koli dağıtım
  await auth(request(app).post('/api/water/intake'))
    .send({ product_id: productId, input_qty: 10, input_unit: 'palet', move_date: '2026-06-02', waybill_no: 'IRS-100' })
  await auth(request(app).post('/api/water/distribute'))
    .send({ product_id: productId, zone_id: zoneA, input_qty: 12, input_unit: 'koli', move_date: '2026-06-03' })
  await auth(request(app).post('/api/water/distribute'))
    .send({ product_id: productId, zone_id: zoneB, input_qty: 8, input_unit: 'koli', move_date: '2026-06-05' })
})

const productRow = report => report.products.find(row => row.product_id === productId)

describe('Su muhasebe raporu — hesaplama', () => {
  it('devir dönem öncesinden gelir, kapanış = devir + gelen − dağıtılan', () => {
    const report = accountingReportService({ from: '2026-06-01', to: '2026-06-30' })
    const row = productRow(report)
    expect(row.opening_base).toBe(15)
    expect(row.period_in).toBe(100)
    expect(row.period_out).toBe(20)
    expect(row.closing_base).toBe(95)
  })

  it('gün gün seri aralığın tamamını kapsar, boş günler 0 gelir', () => {
    const report = accountingReportService({ from: '2026-06-01', to: '2026-06-06' })
    expect(report.grouped).toBe(false)
    expect(report.daily).toHaveLength(6)
    expect(report.daily[0]).toMatchObject({ key: '2026-06-01', in_base: 0, out_base: 0, empty: true })
    expect(report.daily[1]).toMatchObject({ key: '2026-06-02', in_base: 100, empty: false })
    expect(report.daily[2]).toMatchObject({ key: '2026-06-03', out_base: 12 })
    expect(report.totals.active_days).toBe(3)
  })

  it('yürüyen bakiye devirden başlar ve kapanışta biter', () => {
    const report = accountingReportService({ from: '2026-06-01', to: '2026-06-30' })
    expect(report.daily[0].balance_base).toBe(report.totals.opening)
    expect(report.daily.at(-1).balance_base).toBe(report.totals.closing)
  })

  it('uzun aralık aylık gruplanır (tek sayfa garantisi)', () => {
    const report = accountingReportService({ from: '2026-05-01', to: '2026-07-31' })
    expect(report.grouped).toBe(true)
    expect(report.daily.map(row => row.key)).toEqual(['2026-05', '2026-06', '2026-07'])
    expect(report.daily[1].out_base).toBe(20)
  })

  it('dağıtım yerleri çoktan aza sıralanır', () => {
    const report = accountingReportService({ from: '2026-06-01', to: '2026-06-30' })
    const names = report.zones.map(zone => zone.zone_name)
    expect(names.slice(0, 2)).toEqual(['Rapor Bölge A', 'Rapor Bölge B'])
    expect(report.zones[0].total_out).toBe(12)
  })

  it('irsaliyeler tarihe göre artan listelenir', () => {
    const report = accountingReportService({ from: '2026-06-01', to: '2026-06-30' })
    expect(report.intakes).toHaveLength(1)
    expect(report.intakes[0]).toMatchObject({ waybill_no: 'IRS-100', qty_base: 100 })
  })

  it('geçersiz aralık 400 verir', () => {
    expect(() => accountingReportService({ from: '2026-06-01', to: 'yarin' })).toThrow(/YYYY-AA-GG/)
    expect(() => accountingReportService({})).toThrow(/YYYY-AA-GG/)
    expect(() => accountingReportService({ from: '2026-06-10', to: '2026-06-01' })).toThrow(/sonra olamaz/)
    expect(() => accountingReportService({ from: '2020-01-01', to: '2026-06-01' })).toThrow(/en fazla/)
  })
})

describe('Su muhasebe raporu — PDF ve yetki', () => {
  it('PDF tek sayfa üretir', async () => {
    const report = accountingReportService({ from: '2026-06-01', to: '2026-06-30' })
    const doc = new PDFDocument({ size: 'A4', margin: 28 })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    const done = new Promise(resolve => doc.on('end', resolve))
    writeAccountingReportPDF(report, doc)
    await done
    const buffer = Buffer.concat(chunks)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
    expect(buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1)
  })

  it('endpoint PDF döner ve dosya adı aralığı taşır', async () => {
    const res = await request(app).get('/api/water/report/accounting.pdf?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toContain('su-muhasebe-raporu-2026-06-01_2026-06-30.pdf')
  })

  it('JSON endpoint aynı veriyi verir, hatalı aralık 400', async () => {
    const ok = await request(app).get('/api/water/report/accounting?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(ok.status).toBe(200)
    expect(ok.body.totals.period_out).toBe(20)
    const bad = await request(app).get('/api/water/report/accounting?from=2026-06-01')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(bad.status).toBe(400)
  })

  // Tek sayfa sözü ancak hiçbir hücre kırpılmazsa ve hiçbir çizim sayfa dışına
  // taşmazsa gerçek olur — çizimleri yakalayıp ölçüyoruz.
  it('yoğun veride bile hücreler kırpılmaz, sayfa dışına taşmaz', () => {
    const db = getDB()
    const zoneIds = ['Uzun İsimli Şantiye Bölgesi Arka Taraf', 'Kısa Yer', 'Orta Uzunlukta Bölge Adı']
      .map(name => db.prepare('INSERT INTO water_zones(name) VALUES(?)').run(name).lastInsertRowid)
    const insert = db.prepare(`INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit, waybill_no)
      VALUES(?,?,?,?,?,?,?,?)`)
    for (let day = 1; day <= 31; day += 1) {
      const date = `2027-03-${String(day).padStart(2, '0')}`
      insert.run('in', productId, null, date, 1234567, 1, 'koli', `IRS-2027-${day}`)
      zoneIds.forEach(zone => insert.run('out', productId, zone, date, 987654, 1, 'koli', null))
    }

    const report = accountingReportService({ from: '2027-03-01', to: '2027-03-31' })
    const doc = new PDFDocument({ size: 'A4', margin: 28 })
    doc.on('data', () => {})
    const draws = []
    const originalText = doc.text.bind(doc)
    doc.text = (value, x, y, options) => {
      if (typeof x === 'number' && typeof y === 'number') {
        draws.push({ value: String(value), x, y, size: doc._fontSize, width: options?.width ?? null, measured: doc.widthOfString(String(value)) })
      }
      return originalText(value, x, y, options)
    }
    writeAccountingReportPDF(report, doc)

    expect(report.daily).toHaveLength(31)
    const clipped = draws.filter(draw => draw.width != null && draw.measured > draw.width + 0.5)
    expect(clipped.map(draw => draw.value)).toEqual([])
    expect(draws.filter(draw => draw.y + draw.size * 1.2 > 841.89)).toEqual([])
    expect(draws.filter(draw => draw.x + (draw.width ?? draw.measured) > 595.28 - 27.5)).toEqual([])
  })

  it('yetkisiz rol erişemez', async () => {
    const res = await request(app).get('/api/water/report/accounting?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${laundryToken}`)
    expect(res.status).toBe(403)
    expect((await request(app).get('/api/water/report/accounting.pdf?from=2026-06-01&to=2026-06-30')).status).toBe(401)
  })
})
