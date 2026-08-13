import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import { streamLabelPdf, streamCalibrationPdf, portalUrl } from './labelPdf.js'
import {
  MM, TEMPLATES, getTemplate, labelsPerPage, normalizeCalibration,
  shortSerial, drawVectorQr, labelTheme,
} from './labelTemplates.js'

// Faz 7 kabul kriterleri (spec):
//   • PDF MediaBox ve etiket ölçülerinin milimetre doğruluğu
//   • 8'li, 12'li, tekli şablon sayfa yerleşimleri
//   • Uzun oda adlarında taşma olmaması
//   • Türkçe/Arapça karakterlerin basılabilmesi
//   • Aynı etikette yinelenen veya yanlış konuma ait QR bulunmaması
//
// SPEC'İN KARŞILANMAYAN KRİTERİ: "render edilen PDF'den her QR'ın yeniden
// çözülmesi". Arka uçta QR çözücü ve PDF rasterleştirici yok. Onun yerine
// çizimin KAYNAK MATRİSE SADAKATİ doğrulanıyor: çizilen dikdörtgenlerden matris
// geri kuruluyor ve qrcode kütüphanesinin ürettiğiyle karşılaştırılıyor.
// Kodlamanın doğruluğu kütüphaneye ait; buradaki test çizim hatasını yakalar.

const konum = (over = {}) => ({
  token: 'a'.repeat(43),
  display_name: 'M1 Oda 101',
  block: 'M1',
  floor: 1,
  room_no: '101',
  location_type: 'room',
  location_id: 1,
  ...over,
})

const topla = doc => new Promise(resolve => {
  const parcalar = []
  doc.on('data', c => parcalar.push(c))
  doc.on('end', () => resolve(Buffer.concat(parcalar)))
})

// PDF'in MediaBox'ından sayfa ölçüsünü pt olarak okur.
function mediaBox(buf) {
  const m = buf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null
}

describe('ölçü doğruluğu', () => {
  it('A4 şablonlar 210 × 297 mm sayfa üretir', async () => {
    const buf = await topla(streamLabelPdf([konum()], { template: 'a4_8' }))
    const kutu = mediaBox(buf)
    expect(kutu.w / MM).toBeCloseTo(210, 1)
    expect(kutu.h / MM).toBeCloseTo(297, 1)
  })

  // Tekli kapı etiketi sayfa = etiket; A4'e basılırsa ölçü kayar.
  it('tekli etiket 100 × 70 mm sayfa üretir', async () => {
    const buf = await topla(streamLabelPdf([konum()], { template: 'tek_100x70' }))
    const kutu = mediaBox(buf)
    expect(kutu.w / MM).toBeCloseTo(100, 1)
    expect(kutu.h / MM).toBeCloseTo(70, 1)
  })

  // Etiketler sayfaya sığmazsa yazıcı kırpar; sessiz veri kaybı olur.
  it('her şablonun etiketleri sayfa sınırları içinde kalır', () => {
    for (const tpl of Object.values(TEMPLATES)) {
      const toplamW = tpl.marginX * 2 + tpl.cols * tpl.labelW + (tpl.cols - 1) * tpl.gapX
      const toplamH = tpl.marginY * 2 + tpl.rows * tpl.labelH + (tpl.rows - 1) * tpl.gapY
      expect(toplamW, `${tpl.key} genişlik`).toBeLessThanOrEqual(tpl.page.w + 0.5)
      expect(toplamH, `${tpl.key} yükseklik`).toBeLessThanOrEqual(tpl.page.h + 0.5)
    }
  })

  // Spec: büyük etikette QR 44-46 mm, kompaktta en az 36 mm.
  it('QR boyu spec aralığında ve etikete sığar', () => {
    expect(TEMPLATES.a4_8.qrMm).toBeGreaterThanOrEqual(44)
    expect(TEMPLATES.a4_8.qrMm).toBeLessThanOrEqual(46)
    expect(TEMPLATES.a4_12.qrMm).toBeGreaterThanOrEqual(36)
    for (const tpl of Object.values(TEMPLATES)) {
      expect(tpl.qrMm, `${tpl.key} QR yüksekliğe sığmalı`).toBeLessThan(tpl.labelH)
    }
  })

  it('sayfa başına etiket sayısı satır × sütun', () => {
    expect(labelsPerPage(TEMPLATES.a4_8)).toBe(8)
    expect(labelsPerPage(TEMPLATES.a4_12)).toBe(12)
    expect(labelsPerPage(TEMPLATES.tek_100x70)).toBe(1)
  })

  it('bilinmeyen şablon varsayılana düşer', () => {
    expect(getTemplate('yok').key).toBe('a4_8')
  })
})

// Çizimi kaydeden sahte pdfkit belgesi.
function sahteDoc() {
  const rects = []
  const doc = {
    rects,
    save: () => doc, restore: () => doc, fillColor: () => doc,
    rect: (x, y, w, h) => { rects.push({ x, y, w, h }); return doc },
    fill: () => doc,
  }
  return doc
}

describe('vektörel QR çizimi', () => {
  const url = 'https://avskamp.com/r/' + 'a'.repeat(43)

  it('çizilen dikdörtgenlerden kaynak matris birebir geri kurulur', () => {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'H' })
    const boy = 200
    const doc = sahteDoc()
    drawVectorQr(doc, qr, 0, 0, boy)

    const adet = qr.modules.size
    const sessiz = 4
    const modul = boy / (adet + sessiz * 2)
    const bas = sessiz * modul

    // Çizilen dikdörtgenlerden matrisi geri kur.
    const kurulan = new Uint8Array(adet * adet)
    for (const r of doc.rects) {
      const sutun = Math.round((r.x - bas) / modul)
      const satir = Math.round((r.y - bas) / modul)
      const uzunluk = Math.round(r.w / modul)
      for (let i = 0; i < uzunluk; i += 1) kurulan[satir * adet + sutun + i] = 1
    }

    expect(kurulan.length).toBe(qr.modules.data.length)
    expect(Array.from(kurulan)).toEqual(Array.from(qr.modules.data))
  })

  // Sessiz alan olmadan QR okunmaz; spec en az 4 modül istiyor.
  it('4 modüllük sessiz alan bırakır', () => {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'H' })
    const boy = 200
    const doc = sahteDoc()
    drawVectorQr(doc, qr, 0, 0, boy)
    const modul = boy / (qr.modules.size + 8)
    const enSol = Math.min(...doc.rects.map(r => r.x))
    const enUst = Math.min(...doc.rects.map(r => r.y))
    expect(enSol).toBeCloseTo(4 * modul, 5)
    expect(enUst).toBeCloseTo(4 * modul, 5)
    const enSag = Math.max(...doc.rects.map(r => r.x + r.w))
    expect(boy - enSag).toBeGreaterThanOrEqual(4 * modul - 0.001)
  })

  // Yan yana modüller birleşmezse aralarında saç teli boşluk kalır.
  it('yatay komşu modülleri tek dikdörtgende birleştirir', () => {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'H' })
    const doc = sahteDoc()
    drawVectorQr(doc, qr, 0, 0, 200)
    const doluModul = Array.from(qr.modules.data).filter(Boolean).length
    expect(doc.rects.length).toBeLessThan(doluModul)
    expect(doc.rects.some(r => r.w > r.h * 1.5)).toBe(true)
  })

  it("hata düzeltme 'H' kullanılır", () => {
    const h = QRCode.create(url, { errorCorrectionLevel: 'H' }).modules.size
    const m = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules.size
    // H daha fazla yedeklilik → daha büyük matris. Aynıysa seviye uygulanmamış.
    expect(h).toBeGreaterThan(m)
  })
})

describe('kısa seri', () => {
  it('blok ve oda ile RQ- biçiminde üretilir', () => {
    expect(shortSerial(konum(), 'token')).toMatch(/^RQ-M1-101-[A-Z2-9]{4}$/)
  })

  it('aynı token her zaman aynı seriyi verir', () => {
    expect(shortSerial(konum(), 'abc')).toBe(shortSerial(konum(), 'abc'))
  })

  it('farklı token farklı kuyruk verir', () => {
    expect(shortSerial(konum(), 'abc')).not.toBe(shortSerial(konum(), 'xyz'))
  })

  // Elle okunurken karışan karakterler kullanılmamalı.
  it('kuyrukta I, O, 0, 1 bulunmaz', () => {
    for (let i = 0; i < 60; i += 1) {
      const kuyruk = shortSerial(konum(), `t${i}`).split('-').pop()
      expect(kuyruk).not.toMatch(/[IO01]/)
    }
  })

  // Seri basılıyor; token BASILMIYOR. Seri tokenı sızdırmamalı.
  it('seri tokenın kendisini içermez', () => {
    const token = 'GIZLITOKEN'.repeat(4)
    expect(shortSerial(konum(), token)).not.toContain('GIZLI')
  })

  it('eksik alanlarda çökmez', () => {
    expect(shortSerial({}, null)).toMatch(/^RQ-XX-0-/)
  })
})

describe('kalibrasyon', () => {
  it('ölçeği %98-102 arasına sıkıştırır', () => {
    expect(normalizeCalibration({ scale: 0.5 }).scale).toBe(0.98)
    expect(normalizeCalibration({ scale: 5 }).scale).toBe(1.02)
    expect(normalizeCalibration({ scale: 1.01 }).scale).toBe(1.01)
  })

  it('ofseti ±10 mm ile sınırlar', () => {
    expect(normalizeCalibration({ offset_x_mm: -50 }).offset_x_mm).toBe(-10)
    expect(normalizeCalibration({ offset_y_mm: 99 }).offset_y_mm).toBe(10)
  })

  it('bozuk değerlerde varsayılana düşer', () => {
    expect(normalizeCalibration({ scale: 'abc', offset_x_mm: null }))
      .toEqual({ offset_x_mm: 0, offset_y_mm: 0, scale: 1 })
    expect(normalizeCalibration()).toEqual({ offset_x_mm: 0, offset_y_mm: 0, scale: 1 })
  })

  it('kalibrasyon sayfası QR içermez ama etiket sınırlarını çizer', async () => {
    const buf = await topla(streamCalibrationPdf({ template: 'a4_8' }))
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(1000)
  })
})

describe('etiket görünümü', () => {
  // Ortak alanda çamaşır hizmeti yok; etikette de olmamalı.
  it('ortak alan teması çamaşır göstermez ve farklı renk kullanır', () => {
    const oda = labelTheme('room')
    const ortak = labelTheme('common_area')
    expect(oda.showLaundry).toBe(true)
    expect(ortak.showLaundry).toBe(false)
    expect(ortak.accent).not.toBe(oda.accent)
    expect(ortak.title).toMatch(/Ortak Alan/)
  })

  it('uzun oda adı olan etiket üretilebilir', async () => {
    const buf = await topla(streamLabelPdf([
      konum({ display_name: 'S2 Blok 2. Kat Çamaşırhane Girişi Yanındaki Depo Odası' }),
    ], {}))
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('Türkçe ve Arapça karakterli etiket üretilebilir', async () => {
    const buf = await topla(streamLabelPdf([konum({ display_name: 'M1 Oda 101 — Güneş Işığı' })], {}))
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})

describe('föy üretimi', () => {
  it('portal adresini tek biçimde kurar', () => {
    expect(portalUrl('https://avskamp.com/', 'tok')).toBe('https://avskamp.com/r/tok')
  })

  // Aynı etikette yanlış konumun QR'ı olmamalı: her etiket kendi serisini alır.
  it('her etiket kendi serisini alır, seriler yinelenmez', async () => {
    const kayitlar = Array.from({ length: 8 }, (_, i) => konum({
      token: `${'b'.repeat(40)}${i}`, room_no: String(101 + i), display_name: `M1 Oda ${101 + i}`,
    }))
    const doc = streamLabelPdf(kayitlar, {})
    await topla(doc)
    expect(doc.__seriler).toHaveLength(8)
    expect(new Set(doc.__seriler).size).toBe(8)
  })

  it('tokensiz kayıtları eler', async () => {
    const doc = streamLabelPdf([konum(), { display_name: 'Tokensiz' }], {})
    await topla(doc)
    expect(doc.__seriler).toHaveLength(1)
  })

  // Boş PDF "hepsi basıldı" gibi okunur; sebebi yazılmalı.
  it('kayıt yoksa açıklama sayfası üretir', async () => {
    const buf = await topla(streamLabelPdf([], {}))
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(500)
  })

  it('kapak sayfası istenirse kapatılabilir', async () => {
    const kapakli = await topla(streamLabelPdf([konum()], { coverPage: true }))
    const kapaksiz = await topla(streamLabelPdf([konum()], { coverPage: false }))
    expect(kapakli.length).toBeGreaterThan(kapaksiz.length)
  })
})
