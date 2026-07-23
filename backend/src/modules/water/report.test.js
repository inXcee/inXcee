import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import PDFDocument from 'pdfkit'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { accountingReportService, parseSections, REPORT_SECTIONS } from './report.js'
import { writeAccountingReportPDF, attachReportPhotos } from './report-pdf.js'

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
    const secondProduct = db.prepare(`INSERT INTO water_products(name, unit_label, units_per_case, cases_per_pallet)
      VALUES('İkinci Yoğunluk Ürünü', 'koli', 1, 10)`).run().lastInsertRowid
    const insert = db.prepare(`INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit, waybill_no)
      VALUES(?,?,?,?,?,?,?,?)`)
    for (let day = 1; day <= 31; day += 1) {
      const date = `2027-03-${String(day).padStart(2, '0')}`
      insert.run('in', productId, null, date, 1234567, 1, 'koli', `IRS-2027-${day}`)
      // İki ürün → matriste yer satırının altında ürün alt satırları da çizilir
      zoneIds.forEach(zone => {
        insert.run('out', productId, zone, date, 987654, 1, 'koli', null)
        insert.run('out', secondProduct, zone, date, 54321, 1, 'koli', null)
      })
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
    expect(parseSections('ledger,photos')).toEqual(['ledger', 'photos'])
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

  it('matris satırı, o yere hangi üründen ne kadar gittiğini gün gün taşır', () => {
    const { detail } = accountingReportService({ ...range, sections: 'matrix' })
    const zoneA = detail.rows.find(row => row.zone_name === 'Rapor Bölge A')
    expect(zoneA.products).toHaveLength(1)
    const product = zoneA.products[0]
    expect(product).toMatchObject({ name: 'Rapor Suyu', total: 12, days_active: 1, human: '1 palet 2 koli' })
    expect(product.cells[2]).toBe(12)
    expect(product.cells.reduce((sum, value) => sum + value, 0)).toBe(product.total)
    // Yerin ürünleri toplamı yer toplamına eşit olmalı
    for (const row of detail.rows) {
      expect(row.products.reduce((sum, item) => sum + item.total, 0)).toBe(row.total)
      for (const item of row.products) {
        expect(item.cells.reduce((sum, value) => sum + value, 0)).toBe(item.total)
      }
    }
  })

  it('ürün × gün matrisi dönem dağıtımını tam kapsar', () => {
    const report = accountingReportService({ ...range, sections: 'matrix' })
    const { product_rows: productRows } = report.detail
    expect(productRows.reduce((sum, row) => sum + row.total, 0)).toBe(report.totals.period_out)
    const suyu = productRows.find(row => row.name === 'Rapor Suyu')
    expect(suyu.share).toBe(100)
    expect(suyu.cells.reduce((sum, value) => sum + value, 0)).toBe(report.totals.period_out)
    // Sütun toplamları yer matrisi ile ürün matrisinde aynı olmalı
    productRows.forEach(() => {})
    const productColumnTotals = report.detail.columns.map((_, index) =>
      productRows.reduce((sum, row) => sum + row.cells[index], 0))
    expect(productColumnTotals).toEqual(report.detail.column_totals)
  })

  it('özet istatistikleri: hareketli gün ortalaması ve en yoğun gün', () => {
    const { totals } = accountingReportService(range)
    expect(totals.active_days).toBe(3)
    expect(totals.avg_out_active).toBe(Math.round(totals.period_out / 3))
    expect(totals.busiest).toMatchObject({ key: '2026-06-03', out_base: 12 })
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
    expect(pages.length).toBeLessThanOrEqual(7)
    expect(links.length).toBeGreaterThan(0)
    expect(links.every(link => link.rect.every(Number.isFinite))).toBe(true)
    expect(links.map(link => link.name).filter(name => !targets.includes(name))).toEqual([])
    // Bölüm kısayolları + her gün için bir hedef
    expect(targets).toEqual(expect.arrayContaining(['sec-ledger', 'sec-matrix', 'sec-days', 'sec-zones', 'sec-intakes']))
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

  it('istenmeyen bölüm için veri üretilmez', () => {
    const onlyMatrix = accountingReportService({ ...range, sections: 'matrix' })
    expect(onlyMatrix.detail).toBeDefined()
    expect(onlyMatrix.extras).toBeUndefined()
    const onlyTrucks = accountingReportService({ ...range, sections: 'trucks' })
    expect(onlyTrucks.detail).toBeUndefined()
    expect(onlyTrucks.extras.trucks).toBeDefined()
    expect(onlyTrucks.extras.deposit).toBeUndefined()
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

describe('Su muhasebe raporu — muhasebe ekleri', () => {
  const range = { from: '2026-09-01', to: '2026-09-30' }
  let returnableId

  beforeAll(() => {
    const db = getDB()
    returnableId = db.prepare(`INSERT INTO water_products(name, unit_label, units_per_case, cases_per_pallet, is_returnable)
      VALUES('Rapor Damacana', 'damacana', 1, 1, 1)`).run().lastInsertRowid
    const zoneId = db.prepare('INSERT INTO water_zones(name) VALUES(?)').run('Ek Bölüm Testi').lastInsertRowid

    db.prepare(`INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit, waybill_no)
      VALUES('in', ?, NULL, '2026-09-02', 500, 500, 'adet', 'IRS-EK-1')`).run(returnableId)
    db.prepare(`INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit, waybill_no)
      VALUES('in', ?, NULL, '2026-09-03', 100, 100, 'adet', NULL)`).run(returnableId)
    db.prepare(`INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit)
      VALUES('out', ?, ?, '2026-09-04', 120, 120, 'adet')`).run(returnableId, zoneId)
    db.prepare(`INSERT INTO water_returns(product_id, move_date, qty_base, input_qty, input_unit)
      VALUES(?, '2026-09-10', 80, 80, 'adet')`).run(returnableId)

    db.prepare(`INSERT INTO water_adjustments(product_id, move_date, direction, qty_base, input_qty, input_unit, reason, note)
      VALUES(?, '2026-09-20', 'out', 30, 30, 'adet', 'fire_kirik', 'Kırıldı')`).run(returnableId)
    db.prepare(`INSERT INTO water_adjustments(product_id, move_date, direction, qty_base, input_qty, input_unit, reason, note)
      VALUES(?, '2026-09-05', 'in', 10, 10, 'adet', 'eksik_irsaliye', NULL)`).run(returnableId)

    db.prepare(`INSERT INTO water_truck_arrivals(arrival_date, arrival_start_time, arrival_end_time, mail_deadline_date,
      plate, supplier_name, status, mail_sent_at)
      VALUES('2026-09-12', '08:00', '17:00', '2026-09-11', '67 AAA 111', 'Test Nakliyat', 'arrived', '2026-09-11 10:00')`).run()
    db.prepare(`INSERT INTO water_truck_arrivals(arrival_date, arrival_start_time, arrival_end_time, mail_deadline_date,
      plate, supplier_name, status)
      VALUES('2026-09-06', '09:00', '12:00', '2026-09-05', '34 BBB 222', 'Diğer Nakliyat', 'cancelled')`).run()

    db.prepare(`INSERT INTO water_stock_counts(month, product_id, system_base, counted_base, diff_base, reason, note)
      VALUES('2026-09', ?, 450, 440, -10, 'sayim_farki', 'Depo')`).run(returnableId)
  })

  it('günlük defter giriş, dağıtım, boş iade ve düzeltmeleri tarih sırasıyla birleştirir', () => {
    const { ledger } = accountingReportService({ ...range, sections: 'ledger' })
    expect(ledger.total_entries).toBe(6)
    expect(ledger.days.map(day => day.key)).toEqual([
      '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-10', '2026-09-20',
    ])
    expect(ledger.days.flatMap(day => day.entries).map(entry => entry.kind)).toEqual([
      'intake', 'intake', 'distribution', 'adjustment', 'return', 'adjustment',
    ])
    expect(ledger.days.find(day => day.key === '2026-09-10')).toMatchObject({ return_base: 80 })
    expect(ledger.days.find(day => day.key === '2026-09-20')).toMatchObject({ adjustment_base: -30 })
    expect(ledger.truncated).toBe(false)
  })

  it('iade durumu: sahada kalan = verilen − iade', () => {
    const { extras } = accountingReportService({ ...range, sections: 'deposit' })
    const row = extras.deposit.find(item => item.product_id === returnableId)
    expect(row).toMatchObject({ total_in: 600, total_return: 80, period_return: 80, outstanding: 520 })
    expect(row.outstanding_human).toBe('520 damacana')
  })

  it('düzeltmeler tarih sırasında, işaretli ve sebep etiketli', () => {
    const { extras } = accountingReportService({ ...range, sections: 'adjustments' })
    expect(extras.adjustments.map(row => row.move_date)).toEqual(['2026-09-05', '2026-09-20'])
    expect(extras.adjustments[0]).toMatchObject({ signed_base: 10, reason_label: 'Eksik irsaliye' })
    expect(extras.adjustments[1]).toMatchObject({ signed_base: -30, reason_label: 'Fire / kırık', note: 'Kırıldı' })
  })

  it('tırlar tarih sırasında, durum etiketli ve mail bilgisiyle', () => {
    const { extras } = accountingReportService({ ...range, sections: 'trucks' })
    expect(extras.trucks.map(row => row.plate)).toEqual(['34 BBB 222', '67 AAA 111'])
    expect(extras.trucks[0]).toMatchObject({ status_label: 'İptal', mail_sent: false, window: '09:00-12:00' })
    expect(extras.trucks[1]).toMatchObject({ status_label: 'Geldi', mail_sent: true })
  })

  it('sayım bölümü yalnız kaydı olan ayı verir', () => {
    const { extras } = accountingReportService({ ...range, sections: 'counts' })
    expect(extras.counts).toHaveLength(1)
    expect(extras.counts[0].month).toBe('2026-09')
    const row = extras.counts[0].rows.find(item => item.product_name === 'Rapor Damacana')
    expect(row).toMatchObject({ counted_base: 440, reason_label: 'Sayım farkı' })
    expect(row.diff_base).toBe(row.counted_base - row.system_base)
  })

  it('kontrol listesi seviyeleriyle gelir', () => {
    const { extras } = accountingReportService({ ...range, sections: 'checks' })
    const byLabel = new Map(extras.checks.map(check => [check.label, check]))
    expect(byLabel.get('İrsaliyesiz giriş')).toMatchObject({ level: 'warn' })
    expect(byLabel.get('İrsaliyesiz giriş').detail).toMatch(/1 giriş/)
    expect(byLabel.get('İrsaliye evrak tamlığı')).toMatchObject({ level: 'warn' })
    expect(byLabel.get('İrsaliye evrak tamlığı').detail).toMatch(/fotoğrafsız.*numarasız/)
    expect(byLabel.get('Ay kilidi')).toMatchObject({ level: 'warn' })
    expect(extras.checks.every(check => ['ok', 'warn', 'error'].includes(check.level))).toBe(true)
  })

  it('PDF: her ek bölüm kendi hedefini koyar, mükerrer hedef yok', async () => {
    const report = accountingReportService({ ...range, sections: 'all' })
    const doc = new PDFDocument({ size: 'A4', margin: 28 })
    doc.on('data', () => {})
    const done = new Promise(resolve => doc.on('end', resolve))
    const targets = []
    const links = []
    const originalDestination = doc.addNamedDestination.bind(doc)
    doc.addNamedDestination = (name, ...args) => { targets.push(name); return originalDestination(name, ...args) }
    const originalGoTo = doc.goTo.bind(doc)
    doc.goTo = (x, y, w, h, name) => { links.push(name); return originalGoTo(x, y, w, h, name) }

    writeAccountingReportPDF(report, doc)
    await done

    for (const section of ['deposit', 'adjustments', 'trucks', 'counts', 'checks']) {
      expect(targets).toContain(`sec-${section}`)
    }
    expect(targets.filter((name, index) => targets.indexOf(name) !== index)).toEqual([])
    expect([...new Set(links)].filter(name => !targets.includes(name))).toEqual([])
  })
})

describe('Su muhasebe raporu — irsaliye fotoğrafları bölümü', () => {
  const range = { from: '2026-10-01', to: '2026-10-31' }
  let photoProductId

  beforeAll(async () => {
    const db = getDB()
    photoProductId = db.prepare(`INSERT INTO water_products(name, unit_label, units_per_case, cases_per_pallet)
      VALUES('Foto Ürünü', 'koli', 1, 140)`).run().lastInsertRowid
    const movementId = db.prepare(`INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit, waybill_no)
      VALUES('in', ?, NULL, '2026-10-05', 280, 2, 'palet', 'FOTO-1')`).run(photoProductId).lastInsertRowid
    db.prepare(`INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit, waybill_no)
      VALUES('in', ?, NULL, '2026-10-05', 140, 1, 'palet', 'FOTO-1')`).run(photoProductId)

    // Geçerli küçük bir JPEG üret (sharp ile) ve uploads klasörüne yaz
    const fs = await import('node:fs')
    const path = await import('node:path')
    const sharp = (await import('sharp')).default
    const dir = path.resolve('uploads')
    fs.mkdirSync(dir, { recursive: true })
    const jpeg = await sharp({ create: { width: 80, height: 60, channels: 3, background: { r: 180, g: 220, b: 250 } } })
      .jpeg().toBuffer()
    fs.writeFileSync(path.join(dir, 'water-waybill-test-report-photo.jpg'), jpeg)

    db.prepare(`INSERT INTO water_waybill_photos(movement_id, waybill_no, move_date, photo_url)
      VALUES(?, 'FOTO-1', '2026-10-05', '/uploads/water-waybill-test-report-photo.jpg')`).run(movementId)
    db.prepare(`INSERT INTO water_waybill_photos(movement_id, waybill_no, move_date, photo_url)
      VALUES(NULL, NULL, '2026-10-07', '/uploads/water-waybill-olmayan-dosya.jpg')`).run()
  })

  afterAll(async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    try { fs.unlinkSync(path.resolve('uploads/water-waybill-test-report-photo.jpg')) } catch {}
  })

  it('fotoğraf verisi içerik satırlarıyla (irsaliye kardeşleri dahil) gelir', () => {
    const report = accountingReportService({ ...range, sections: 'photos' })
    expect(report.photos.items).toHaveLength(2)
    const linked = report.photos.items.find(item => item.waybill_no === 'FOTO-1')
    expect(linked.content).toHaveLength(2) // aynı irsaliyenin iki ürün satırı
    expect(linked.content[0]).toMatchObject({ product_name: 'Foto Ürünü' })
    expect(report.photos.skipped).toBe(0)
  })

  it('attachReportPhotos: dosyayı küçültüp gömer, olmayan dosyayı işaretler', async () => {
    const report = accountingReportService({ ...range, sections: 'photos' })
    await attachReportPhotos(report)
    const ok = report.photos.items.find(item => item.waybill_no === 'FOTO-1')
    const missing = report.photos.items.find(item => !item.waybill_no)
    expect(Buffer.isBuffer(ok.buffer)).toBe(true)
    expect(ok.buffer.length).toBeGreaterThan(100)
    expect(missing.buffer).toBeUndefined()
    expect(missing.error).toBe('dosya yok')
  })

  it('PDF fotoğraf sayfası üretir; buffer\'sız fotoğraf uyarıyla basılır', async () => {
    const report = accountingReportService({ ...range, sections: 'photos' })
    await attachReportPhotos(report)
    const doc = new PDFDocument({ size: 'A4', margin: 28 })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    const done = new Promise(resolve => doc.on('end', resolve))
    const targets = []
    const originalDestination = doc.addNamedDestination.bind(doc)
    doc.addNamedDestination = (name, ...args) => { targets.push(name); return originalDestination(name, ...args) }
    writeAccountingReportPDF(report, doc)
    await done
    const buffer = Buffer.concat(chunks)
    expect(targets).toContain('sec-photos')
    // Gömülü JPEG → PDF içinde DCTDecode filtresi bulunur
    expect(buffer.toString('latin1')).toContain('DCTDecode')
    expect((buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length).toBe(2) // özet + foto sayfası
  })

  it('PDF endpoint sections=photos ile çalışır', async () => {
    const res = await request(app).get('/api/water/report/accounting.pdf?from=2026-10-01&to=2026-10-31&sections=photos')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.body.length).toBeGreaterThan(20000)
  })
})

describe('Su muhasebe raporu — GÜN×ÜRÜN yerleşimi', () => {
  // Çizilen metinleri sayfa numarasıyla yakalar; koordinat/font asserti YOK
  // (Windows Arial ≠ sunucu DejaVu — yerleşim testleri font-bağımsız kalmalı).
  const renderDraws = async (report) => {
    const doc = new PDFDocument({ size: 'A4', margin: 28 })
    doc.on('data', () => {})
    const done = new Promise(resolve => doc.on('end', resolve))
    const draws = []
    const links = []
    const targets = []
    let page = 1
    const originalAddPage = doc.addPage.bind(doc)
    doc.addPage = (...args) => { page += 1; return originalAddPage(...args) }
    const originalText = doc.text.bind(doc)
    doc.text = (value, x, y, options) => {
      if (typeof x === 'number' && typeof y === 'number') draws.push({ value: String(value), page })
      return originalText(value, x, y, options)
    }
    const originalGoTo = doc.goTo.bind(doc)
    doc.goTo = (x, y, w, h, name) => { links.push(name); return originalGoTo(x, y, w, h, name) }
    const originalDestination = doc.addNamedDestination.bind(doc)
    doc.addNamedDestination = (name, ...args) => { targets.push(name); return originalDestination(name, ...args) }
    writeAccountingReportPDF(report, doc)
    await done
    return { draws, links, targets }
  }

  it('matris: ürün adları üstte, günler aşağı, yer tabloları tek tek', async () => {
    const report = accountingReportService({ from: '2026-06-01', to: '2026-06-30', sections: 'matrix' })
    const { draws, links, targets } = await renderDraws(report)
    const matrixDraws = draws.filter(draw => draw.page > 1) // sayfa 1 = özet
    const count = value => matrixDraws.filter(draw => draw.value === value).length
    // Ürün adı başlıklarda: genel tablo + Bölge A tablosu + Bölge B tablosu
    expect(count('Rapor Suyu')).toBe(3)
    // Gün etiketi satır olarak: genel tabloda + yalnız o gün hareketi olan yerin tablosunda
    expect(count('03.06 Çar')).toBe(2) // genel + Rapor Bölge A
    expect(count('05.06 Cum')).toBe(2) // genel + Rapor Bölge B
    // Eski gün-numarası sütun başlıkları tamamen gitti
    expect(count('01')).toBe(0)
    expect(count('02')).toBe(0)
    // Yer bantları tek tek çizildi
    expect(count('Rapor Bölge A')).toBe(1)
    expect(count('Rapor Bölge B')).toBe(1)
    // Gün detay bölümü basılmıyor → hedefsiz gün bağlantısı da olmamalı
    expect(links.filter(name => !targets.includes(name))).toEqual([])
  })

  it('matris uzun aralıkta ay satırlarına düşer', async () => {
    const report = accountingReportService({ from: '2026-05-01', to: '2026-07-31', sections: 'matrix' })
    const { draws } = await renderDraws(report)
    const matrixDraws = draws.filter(draw => draw.page > 1)
    // 'Haziran 2026' genel tabloda satır + hareketli yer tablolarında satır
    expect(matrixDraws.filter(draw => draw.value === 'Haziran 2026').length).toBeGreaterThanOrEqual(2)
  })

  it('yer tablosunda 6 üründen fazlası Diğer sütununda toplanır', async () => {
    const db = getDB()
    const zoneId = db.prepare('INSERT INTO water_zones(name) VALUES(?)').run('Çok Ürünlü Yer').lastInsertRowid
    const insertProduct = db.prepare(`INSERT INTO water_products(name, unit_label, units_per_case, cases_per_pallet)
      VALUES(?, 'koli', 1, 10)`)
    const insertMove = db.prepare(`INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit)
      VALUES('out', ?, ?, '2027-06-10', ?, 1, 'koli')`)
    for (let index = 1; index <= 7; index += 1) {
      const id = insertProduct.run(`Kalabalık Ürün ${index}`).lastInsertRowid
      insertMove.run(id, zoneId, 100 - index) // çoktan aza: Ürün 1 en büyük, Ürün 7 en küçük
    }
    const report = accountingReportService({ from: '2027-06-01', to: '2027-06-30', sections: 'matrix' })
    const { draws } = await renderDraws(report)
    const values = draws.filter(draw => draw.page > 1).map(draw => draw.value)
    expect(values).toContain('Diğer') // yer tablosunda 7. sütun
    expect(values.some(value => value.startsWith('Diğer: Kalabalık Ürün 7'))).toBe(true) // kapsam notu
    expect(values).toContain('Kalabalık Ürün 1') // görünen 6'nın adı başlıkta
  })

  it('gün gün detay: başlıklar ürün adlı, numaralı lejant yok', async () => {
    const report = accountingReportService({ from: '2026-06-01', to: '2026-06-30', sections: 'days' })
    const { draws } = await renderDraws(report)
    const values = draws.filter(draw => draw.page > 1).map(draw => draw.value)
    // Dağıtım olan iki günün (03.06, 05.06) tablo başlığında ürün adı; giriş günü 02.06'da tablo yok
    expect(values.filter(value => value === 'Rapor Suyu').length).toBe(2)
    // Lejant satırı ve numaralı sütun başlığı kalmadı
    expect(values.some(value => value.startsWith('SÜTUNLAR'))).toBe(false)
    expect(values.filter(value => value === '1').length).toBe(0)
  })
})
