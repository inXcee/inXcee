import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import PDFDocument from 'pdfkit'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { accountingReportService, parseSections, REPORT_SECTIONS } from './report.js'
import { writeAccountingReportPDF } from './report-pdf.js'

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

    const summaryReport = accountingReportService({ from: '2027-03-01', to: '2027-03-31' })
    const fullReport = accountingReportService({ from: '2027-03-01', to: '2027-03-31', sections: 'all' })
    expect(summaryReport.daily).toHaveLength(31)

    // widthFactor: platformun gerçek fontu (Windows Arial / sunucu DejaVu) üstüne
    // %15 pay — yerleşim tek bir fontun ölçülerine bağlı kalmasın. Sayfa ölçüleri
    // çizim anında okunur; matris sayfaları yatay olduğundan sabit A4 kullanmayız.
    const isNumeric = value => /^[-+]?[\d.,·]+$/.test(value)
    const audit = (report, widthFactor) => {
      const doc = new PDFDocument({ size: 'A4', margin: 28 })
      doc.on('data', () => {})
      const originalWidth = doc.widthOfString.bind(doc)
      doc.widthOfString = (value, options) => originalWidth(value, options) * widthFactor
      const draws = []
      const originalText = doc.text.bind(doc)
      doc.text = (value, x, y, options) => {
        if (typeof x === 'number' && typeof y === 'number') {
          draws.push({
            value: String(value), x, y, size: doc._fontSize,
            width: options?.width ?? null,
            wraps: options?.lineBreak !== false,
            measured: doc.widthOfString(String(value)),
            pageWidth: doc.page.width, pageHeight: doc.page.height,
          })
        }
        return originalText(value, x, y, options)
      }
      writeAccountingReportPDF(report, doc)
      // Sarma izni olan paragraflar (dipnot) taşma sayılmaz; tek satırlık hücreler sayılır.
      const lineCount = draw => (draw.wraps && draw.width ? Math.max(1, Math.ceil(draw.measured / draw.width)) : 1)
      const bottomOf = draw => draw.y + lineCount(draw) * draw.size * 1.25
      const note = draws.find(draw => draw.value.startsWith('Miktarlar her ürünün'))
      const signature = draws.find(draw => draw.value === 'HAZIRLAYAN')
      return {
        // Sayılar asla kırpılmaz; uzun yer adları ellipsis alabilir (bilinçli).
        clippedNumbers: draws.filter(draw => !draw.wraps && draw.width != null
          && draw.measured > draw.width + 0.5 && isNumeric(draw.value)).map(draw => draw.value),
        belowPage: draws.filter(draw => bottomOf(draw) > draw.pageHeight + 0.5).map(draw => draw.value),
        offRight: draws.filter(draw => draw.x + (draw.width ?? draw.measured) > draw.pageWidth - 23.5).map(draw => draw.value),
        noteOverlapsSignature: bottomOf(note) > signature.y - 6,
      }
    }

    for (const factor of [1, 1.15]) {
      expect(audit(summaryReport, factor)).toEqual({ clippedNumbers: [], belowPage: [], offRight: [], noteOverlapsSignature: false })
      expect(audit(fullReport, factor)).toEqual({ clippedNumbers: [], belowPage: [], offRight: [], noteOverlapsSignature: false })
    }
  })

  it('yetkisiz rol erişemez', async () => {
    const res = await request(app).get('/api/water/report/accounting?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${laundryToken}`)
    expect(res.status).toBe(403)
    expect((await request(app).get('/api/water/report/accounting.pdf?from=2026-06-01&to=2026-06-30')).status).toBe(401)
  })
})

describe('Su muhasebe raporu — kapsamlı bölümler', () => {
  const range = { from: '2026-06-01', to: '2026-06-30' }

  it('bölüm listesi ayrıştırılır, bilinmeyen ad yok sayılır', () => {
    expect(parseSections('matrix,days')).toEqual(['matrix', 'days'])
    expect(parseSections('all')).toEqual([...REPORT_SECTIONS])
    expect(parseSections(['DAYS', ' zones '])).toEqual(['days', 'zones'])
    expect(parseSections('bilinmeyen')).toEqual([])
    expect(parseSections(undefined)).toEqual([])
  })

  it('bölüm istenmezse detay üretilmez (özet raporu değişmez)', () => {
    const report = accountingReportService(range)
    expect(report.sections).toEqual([])
    expect(report.detail).toBeUndefined()
  })

  it('matris satır/sütun toplamları dönem dağıtımına eşit', () => {
    const report = accountingReportService({ ...range, sections: 'all' })
    const { detail } = report
    expect(detail.columns).toHaveLength(30)
    expect(detail.grand_total).toBe(report.totals.period_out)
    expect(detail.column_totals.reduce((sum, value) => sum + value, 0)).toBe(report.totals.period_out)
    expect(detail.rows.reduce((sum, row) => sum + row.total, 0)).toBe(report.totals.period_out)
    const zoneA = detail.rows.find(row => row.zone_name === 'Rapor Bölge A')
    expect(zoneA.total).toBe(12)
    expect(zoneA.cells[2]).toBe(12) // 03.06 → 3. sütun
  })

  it('gün detayı yalnız hareketli günleri, yer ve ürün kırılımıyla verir', () => {
    const { detail } = accountingReportService({ ...range, sections: 'days' })
    expect(detail.days.map(day => day.key)).toEqual(['2026-06-02', '2026-06-03', '2026-06-05'])
    const intakeDay = detail.days[0]
    expect(intakeDay.intakes).toHaveLength(1)
    expect(intakeDay.intakes[0]).toMatchObject({ waybill_no: 'IRS-100', qty_base: 100 })
    expect(intakeDay.zones).toEqual([])
    const outDay = detail.days[1]
    expect(outDay.weekday).toBe('Çarşamba')
    expect(outDay.zones[0]).toMatchObject({ zone_name: 'Rapor Bölge A', total: 12 })
    expect(outDay.zones[0].lines[0]).toMatchObject({ product_name: 'Rapor Suyu', qty_base: 12 })
    expect(outDay.balance_base).toBe(103) // 15 devir + 100 giriş − 12
  })

  it('yer × ürün kırılımı okunur birim de taşır', () => {
    const { detail } = accountingReportService({ ...range, sections: 'zones' })
    const zoneA = detail.zone_products.find(zone => zone.zone_name === 'Rapor Bölge A')
    expect(zoneA.total).toBe(12)
    expect(zoneA.products).toEqual([expect.objectContaining({ name: 'Rapor Suyu', total: 12, human: '1 palet 2 koli' })])
  })

  it('PDF ek bölümlerle çok sayfa üretir, iç bağlantılar kırık değil', async () => {
    const report = accountingReportService({ ...range, sections: 'all' })
    const doc = new PDFDocument({ size: 'A4', margin: 28 })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    const done = new Promise(resolve => doc.on('end', resolve))

    const links = []
    const targets = []
    const originalGoTo = doc.goTo.bind(doc)
    doc.goTo = (x, y, width, height, name) => { links.push({ name, rect: [x, y, width, height] }); return originalGoTo(x, y, width, height, name) }
    const originalDestination = doc.addNamedDestination.bind(doc)
    doc.addNamedDestination = (name, ...args) => { targets.push(name); return originalDestination(name, ...args) }

    writeAccountingReportPDF(report, doc)
    await done
    const buffer = Buffer.concat(chunks)
    const pages = buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []

    expect(pages.length).toBeGreaterThan(1)
    expect(pages.length).toBeLessThanOrEqual(6)
    expect(links.length).toBeGreaterThan(0)
    expect(links.every(link => link.rect.every(Number.isFinite))).toBe(true)
    expect(links.map(link => link.name).filter(name => !targets.includes(name))).toEqual([])
    // Bölüm kısayolları + her gün için bir hedef
    expect(targets).toEqual(expect.arrayContaining(['sec-matrix', 'sec-days', 'sec-zones', 'sec-intakes']))
    for (const day of report.detail.days) expect(targets).toContain(`day-${day.key}`)
  })

  it('endpoint sections parametresini uygular', async () => {
    const res = await request(app).get('/api/water/report/accounting?from=2026-06-01&to=2026-06-30&sections=matrix,days')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.sections).toEqual(['matrix', 'days'])
    expect(res.body.detail.rows.length).toBeGreaterThan(0)
    const pdf = await request(app).get('/api/water/report/accounting.pdf?from=2026-06-01&to=2026-06-30&sections=all')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(pdf.status).toBe(200)
    expect(pdf.headers['content-type']).toContain('application/pdf')
  })

  it('uzun aralıkta matris aya düşer; az hareketli günde detay yine üretilir', () => {
    const { detail } = accountingReportService({ from: '2026-01-01', to: '2026-12-31', sections: 'all' })
    expect(detail.grouped).toBe(true)
    expect(detail.columns).toHaveLength(12)
    // Hareketli gün sayısı 62 sınırının altında → gün detayı korunur (yürüyen bakiye ay bazında olmadığından null)
    expect(detail.days.length).toBeGreaterThan(0)
    expect(detail.days_skipped).toBe(0)
    expect(detail.days.every(day => day.balance_base === null)).toBe(true)
  })

  it('62+ hareketli günde gün detayı atlanır, sayısı raporlanır', () => {
    const db = getDB()
    const insert = db.prepare(`INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit)
      VALUES('out', ?, ?, ?, 1, 1, 'koli')`)
    const zoneId = db.prepare('INSERT INTO water_zones(name) VALUES(?)').run('Detay Sınır Testi').lastInsertRowid
    for (let day = 0; day < 70; day += 1) {
      const date = new Date(Date.UTC(2028, 0, 1 + day)).toISOString().slice(0, 10)
      insert.run(productId, zoneId, date)
    }
    const { detail } = accountingReportService({ from: '2028-01-01', to: '2028-03-31', sections: 'days' })
    expect(detail.days).toEqual([])
    expect(detail.days_skipped).toBe(70)
  })
})
