import { describe, it, expect, beforeAll } from 'vitest'
import PDFDocument from 'pdfkit'
import { drawSignaturePdf, signatureColumnWidths, signatureRowHeight } from './signaturePdf.js'

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

// Sayfa sayısı pdfkit'in kendi sayacından okunur. PDF gövdesinde "/Type /Page"
// aramak yanıltıcı: font gömülünce ikili font verisi de kalıba takılabiliyor.
// Ayrıca uç, sayfa sayısını çağırana bildiriyor — gerçekle karşılaştırılmazsa
// yanlış sayı bildirdiği fark edilmez.
function sayfaSay(model, meta = {}) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true })
  doc.on('data', () => {})
  const sonuc = drawSignaturePdf(doc, model, meta)
  const gercek = doc.bufferedPageRange().count
  doc.end()
  expect(sonuc.pageCount).toBe(gercek)
  return gercek
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
    // 2 kadro sayfası + 1 değişiklik kaydı sayfası.
    expect(sayfaSay(cokSayfa)).toBe(3)
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

// 30 kişi tek sayfaya sığmalı: satır yüksekliği sabit 26pt iken A4 yatayda
// ancak ~17 satır giriyordu, gerisi sayfadan taşıyordu.
describe('İmza föyü satır yüksekliği', () => {
  const KULLANILABILIR = 449 // A4 yatay, başlık ve alt bilgi düşülmüş

  it('30 satır sayfaya sığar', () => {
    const h = signatureRowHeight({ rowsPerPage: 30, usableHeight: KULLANILABILIR, doubleSignature: false })
    expect(h * 30).toBeLessThanOrEqual(KULLANILABILIR)
  })

  it('az satırda ferah kalır, gereksiz sıkışmaz', () => {
    const az = signatureRowHeight({ rowsPerPage: 12, usableHeight: KULLANILABILIR, doubleSignature: false })
    const cok = signatureRowHeight({ rowsPerPage: 30, usableHeight: KULLANILABILIR, doubleSignature: false })
    expect(az).toBeGreaterThan(cok)
    expect(az).toBeLessThanOrEqual(26)
  })

  // Okunabilirlik tabanı: altına inince imza atacak yer kalmıyor.
  it('okunabilir alt sınırın altına inmez', () => {
    const h = signatureRowHeight({ rowsPerPage: 40, usableHeight: 200, doubleSignature: false })
    expect(h).toBeGreaterThanOrEqual(13)
  })

  it('çift imzada daha yüksek satır ister', () => {
    const tek = signatureRowHeight({ rowsPerPage: 20, usableHeight: KULLANILABILIR, doubleSignature: false })
    const cift = signatureRowHeight({ rowsPerPage: 20, usableHeight: KULLANILABILIR, doubleSignature: true })
    expect(cift).toBeGreaterThanOrEqual(tek)
  })
})

// Föy pazartesi basılıyor ama hafta boyunca imzalanıyor: arada izin değişiyor,
// kişi hastalanıp raporlu oluyor, OFF günü kayıyor. Kâğıt bunu kaydedecek yer
// vermezse değişiklik ya çizelgeye hiç yansımıyor ya da föyün üstüne
// karalanıyor ve imza ile ilişkisi kayboluyor.
describe('İmza föyü — hafta içi değişiklikler', () => {
  // Blok kadro sayfasının altına sıkıştırılmaz: "tek sayfaya 30 kişi" isteğini
  // bozuyor ve elle yazacak yer kalmıyordu. Kendi sayfasına alındı.
  it('değişiklik kaydı kendi sayfasında çıkar', async () => {
    const buf = await pdfUret(MODEL, { weekLabel: '10-16 Ağustos' })
    expect(buf.length).toBeGreaterThan(1000)
    expect(sayfaSay(MODEL, { weekLabel: '10-16 Ağustos' })).toBe(2) // 1 kadro + 1 değişiklik
  })

  it('değişiklik satır sayısı ayarlanabilir', async () => {
    const az = await pdfUret({ ...MODEL, opts: { ...MODEL.opts, changeRows: 2 } }, {})
    const cok = await pdfUret({ ...MODEL, opts: { ...MODEL.opts, changeRows: 8 } }, {})
    expect(cok.length).toBeGreaterThan(az.length)
  })

  it('kapatılabilir', async () => {
    const buf = await pdfUret({ ...MODEL, opts: { ...MODEL.opts, changeRows: 0 } }, {})
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})

// Sayfalama PDF'in kendi işi olmalı: taşan çizimde pdfkit sessizce sayfa
// ekliyor ve o sayfada başlık da tablo başlığı da olmuyordu — 35 kişilik föy
// 21 bozuk sayfa üretiyordu.
describe('İmza föyü sayfalama', () => {
  function foy(kisiSayisi, opts = {}) {
    const gun = () => ({ date: '2026-08-10', category: 'working', label: '08-16', detail: '', can_sign: true })
    const rows = Array.from({ length: kisiSayisi }, (_, i) => ({
      full_name: `PERSONEL ${i + 1}`, role: 'Aşçı', department: 'Mutfak',
      days: Array.from({ length: 7 }, gun),
    }))
    return {
      dates: Array.from({ length: 7 }, (_, i) => `2026-08-1${i}`),
      opts: { showLocationAndRole: true, blankRows: 3, ...opts },
      pages: [{ department: 'Tüm', combined: true, page: 1, page_count: 1, row_offset: 0, show_blank_rows: true, rows }],
    }
  }
  it('30 kişi tek kadro sayfasına sığar', () => {
    expect(sayfaSay(foy(30))).toBe(2) // 1 kadro + 1 değişiklik
  })

  // Sığmayınca düzgün ikinci sayfa açılmalı, onlarca bozuk sayfa değil.
  it('taşan kadro makul sayıda sayfaya bölünür', () => {
    expect(sayfaSay(foy(60))).toBeLessThanOrEqual(4)
    expect(sayfaSay(foy(120))).toBeLessThanOrEqual(6)
  })

  it('değişiklik sayfası kapatılınca üretilmez', () => {
    expect(sayfaSay(foy(30, { changeRows: 0 }))).toBe(1)
  })
})
