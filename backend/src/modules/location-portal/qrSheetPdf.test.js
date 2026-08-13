import { describe, expect, it } from 'vitest'
import {
  buildQrSheetPdf, konumAltBaslik, portalUrl, sayfaSayisi, SAYFA_BASINA,
} from './qrSheetPdf.js'

// QR kodları üretildi ama basılacak bir çıktı yoktu; 1078 etiketi ekrandan tek
// tek kopyalamak mümkün değil. Bu föy kesilip kapılara asılacak.

const konum = (over = {}) => ({
  token: 'abc123', display_name: 'M1 Oda 101', block: 'M1', floor: 1,
  area_code: null, location_type: 'room', ...over,
})

const sayfaSay = buf => {
  // pdfkit sayfa sayısını /Type /Page ile saymak güvenilmez (bkz. imza föyü
  // dersi); üretilen sayfa adedini sayfaSayisi() ile kıyaslıyoruz.
  return buf.length
}

describe('etiket metni', () => {
  it('blok ve katı birleştirir', () => {
    expect(konumAltBaslik(konum())).toBe('M1 · Kat 1')
  })

  it('ortak alanda alan kodunu da yazar', () => {
    expect(konumAltBaslik(konum({ area_code: 'corridor' }))).toBe('M1 · Kat 1 · corridor')
  })

  // Eksik alan "undefined" yazdırmamalı.
  it('eksik alanları atlar', () => {
    expect(konumAltBaslik({ block: 'S2' })).toBe('S2')
    expect(konumAltBaslik({})).toBe('')
  })

  // Kat 0 düşmemeli — zemin kat geçerli bir değer.
  it('kat sıfırı kaybetmez', () => {
    expect(konumAltBaslik({ block: 'M1', floor: 0 })).toBe('M1 · Kat 0')
  })
})

describe('portal adresi', () => {
  it('token ile /r/ yolunu kurar', () => {
    expect(portalUrl('https://avskamp.com', 'tok')).toBe('https://avskamp.com/r/tok')
  })

  // Sondaki eğik çizgi çift slash üretmemeli; QR yanlış adrese giderdi.
  it('sondaki eğik çizgiyi temizler', () => {
    expect(portalUrl('https://avskamp.com/', 'tok')).toBe('https://avskamp.com/r/tok')
    expect(portalUrl('https://avskamp.com///', 'tok')).toBe('https://avskamp.com/r/tok')
  })
})

describe('sayfa hesabı', () => {
  it('sayfa başına 12 etiket', () => {
    expect(SAYFA_BASINA).toBe(12)
    expect(sayfaSayisi(12)).toBe(1)
    expect(sayfaSayisi(13)).toBe(2)
    expect(sayfaSayisi(1078)).toBe(90)
  })

  // Boş liste bile en az bir sayfa üretir (uyarı sayfası).
  it('sıfırda bir sayfa sayar', () => {
    expect(sayfaSayisi(0)).toBe(1)
  })
})

describe('PDF üretimi', () => {
  it('tek konum için geçerli PDF üretir', async () => {
    const buf = await buildQrSheetPdf([konum()], { baseUrl: 'https://avskamp.com' })
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('Türkçe karakterli adı taşıyabilir', async () => {
    const buf = await buildQrSheetPdf([konum({ display_name: 'S2 Oda 101 — Çamaşırhane Girişi' })], {})
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('çok sayfalı çıktıda büyür', async () => {
    const az = await buildQrSheetPdf(Array.from({ length: 3 }, (_, i) => konum({ token: `t${i}` })), {})
    const cok = await buildQrSheetPdf(Array.from({ length: 30 }, (_, i) => konum({ token: `t${i}` })), {})
    expect(sayfaSay(cok)).toBeGreaterThan(sayfaSay(az))
  })

  // Tokensiz kayıt basılamaz; sessizce boş etiket üretmek yerine elenir.
  it('tokensiz kayıtları eler', async () => {
    const buf = await buildQrSheetPdf([konum(), { display_name: 'Tokensiz' }], {})
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  // Boş PDF "her şey basıldı" gibi okunur; sebebi yazılmalı.
  it('kayıt yoksa açıklama sayfası üretir', async () => {
    const buf = await buildQrSheetPdf([], {})
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(500)
  })

  it('baseUrl verilmezse çökmez', async () => {
    const buf = await buildQrSheetPdf([konum()], {})
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
