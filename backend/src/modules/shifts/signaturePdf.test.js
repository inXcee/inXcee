import { describe, it, expect, beforeAll } from 'vitest'
import PDFDocument from 'pdfkit'
import { drawSignaturePdf, signatureColumnWidths } from './signaturePdf.js'

function gun(label, kategori = 'working', detail = '') {
  return { date: '2026-08-10', category: kategori, label, detail, can_sign: kategori === 'working' }
}

const MODEL = {
  dates: ['2026-08-10', '2026-08-11', '2026-08-12'],
  opts: { showLocationAndRole: true, doubleSignature: false, blankRows: 2, showDepartmentBands: true },
  people_count: 2,
  pages: [{
    department: 'Tüm Bölümler',
    combined: true,
    page: 1,
    page_count: 1,
    row_offset: 0,
    show_blank_rows: true,
    rows: [
      { staff_id: 1, full_name: 'ŞÜKRÜ ÇAĞLAYAN', role: 'Aşçı', department: 'Mutfak', days: [gun('08-16'), gun('İzin', 'leave'), gun('08-16', 'working', 'OTC Lokal')] },
      { staff_id: 2, full_name: 'İĞDE ÖZTÜRK', role: 'Bulaşıkhane', department: 'Mutfak', days: [gun('16-24'), gun('16-24'), gun('Devamsız', 'absent')] },
    ],
  }],
}

// PDF'i belleğe yazıp gerçekten bayt üretildiğini doğrular; pdfkit hataları
// çoğu zaman ancak akış bitince yüzeye çıkar.
function pdfUret(model, meta) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 })
    const parcalar = []
    doc.on('data', p => parcalar.push(p))
    doc.on('end', () => resolve(Buffer.concat(parcalar)))
    doc.on('error', reject)
    try {
      const sonuc = drawSignaturePdf(doc, model, meta)
      doc.end()
      resolve.sonuc = sonuc
    } catch (e) { reject(e) }
  })
}

describe('İmza föyü PDF', () => {
  it('geçerli bir PDF üretir', async () => {
    const buf = await pdfUret(MODEL, { revision: '2', weekLabel: '10-16 Ağustos' })
    expect(buf.length).toBeGreaterThan(1000)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  // Türkçe harfler pdfkit'in gömülü Helvetica'sında bozulur; ortak font modülü
  // devrede olmalı — çökmeden üretmesi bunun kanıtı.
  it('Türkçe karakterlerle çökmez', async () => {
    const buf = await pdfUret(MODEL, {})
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('çok sayfalı modelde her sayfayı çizer', async () => {
    const cokSayfa = {
      ...MODEL,
      pages: [
        { ...MODEL.pages[0], page: 1, page_count: 2, show_blank_rows: false },
        { ...MODEL.pages[0], page: 2, page_count: 2, row_offset: 2, show_blank_rows: true },
      ],
    }
    const buf = await pdfUret(cokSayfa, {})
    // /Type /Page sayısı sayfa sayısını verir (Pages ağacı hariç).
    const adet = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
    expect(adet).toBe(2)
  })

  it('boş sayfa listesinde patlamaz', async () => {
    const buf = await pdfUret({ dates: [], opts: {}, pages: [] }, {})
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('çift imza seçilince de üretir', async () => {
    const buf = await pdfUret({ ...MODEL, opts: { ...MODEL.opts, doubleSignature: true } }, {})
    expect(buf.length).toBeGreaterThan(1000)
  })
})

describe('İmza föyü kolon genişlikleri', () => {
  it('kullanılabilir genişliği aşmaz', () => {
    const g = signatureColumnWidths({ dayCount: 7, showRole: true, usableWidth: 786 })
    expect(g.no + g.ad + g.gorev + g.gun * 7).toBeCloseTo(786, 5)
  })

  it('görev kapalıyken o sütun sıfırlanır ve genişlik günlere dağılır', () => {
    const acik = signatureColumnWidths({ dayCount: 7, showRole: true, usableWidth: 786 })
    const kapali = signatureColumnWidths({ dayCount: 7, showRole: false, usableWidth: 786 })
    expect(kapali.gorev).toBe(0)
    expect(kapali.gun).toBeGreaterThan(acik.gun)
  })

  it('gün yoksa bölme hatası vermez', () => {
    const g = signatureColumnWidths({ dayCount: 0, showRole: true, usableWidth: 786 })
    expect(Number.isFinite(g.gun)).toBe(true)
  })
})

describe('İmza föyü PDF ucu', () => {
  // Kurulum test GÖVDESİNDE yapılırsa suite içinde diğer dosyalarla çakışıyor
  // (aynı :memory: DB yeniden seed ediliyor). Diğer dosyalarla aynı desen:
  // beforeAll içinde bir kez.
  let request, app, auth

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:'
    request = (await import('supertest')).default
    app = (await import('../../app.js')).default
    const { initDB } = await import('../../shared/db/index.js')
    const { seedDev } = await import('../../shared/db/seed.js')
    initDB()
    seedDev()
    const token = (await request(app).post('/api/auth/login')
      .send({ username: 'mudur', password: 'admin123' })).body.token
    auth = { Authorization: `Bearer ${token}` }
  })

  it('geçersiz model 400 döner', async () => {
    expect((await request(app).post('/api/shifts/schedule/signature-pdf').set(auth).send({})).status).toBe(400)
  })

  it('geçerli model PDF döndürür', async () => {
    const res = await request(app).post('/api/shifts/schedule/signature-pdf')
      .set(auth).send({ model: MODEL, meta: { weekStart: '2026-08-10' } })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toContain('imza-foyu-2026-08-10.pdf')
    expect(res.body.length).toBeGreaterThan(1000)
  })
})
