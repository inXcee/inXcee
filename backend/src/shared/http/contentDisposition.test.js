import { describe, expect, it } from 'vitest'
import { asciiFilename, attachmentDisposition, setAttachment } from './contentDisposition.js'

// Bu dosya somut bir canlı hatadan doğdu: `/api/reports/housekeeping` her
// çağrıda 500 dönüyordu, çünkü dosya adında uzun tire (—) vardı ve HTTP
// başlıkları Latin-1 dışına çıkamaz. Uç taraması yakaladı.

describe('ascii dosya adı', () => {
  // ASIL HATA: uzun tire başlığı bozuyordu.
  it('uzun tireyi ve ASCII dışını temizler', () => {
    expect(asciiFilename('Gunluk Temizlik Raporu — 2026-08-17.pdf'))
      .toBe('Gunluk Temizlik Raporu - 2026-08-17.pdf')
  })

  // Türkçe harf atılmaz, okunabilir karşılığına çevrilir — "Çamaşırhane"nin
  // "-ama-rhane" olması kullanıcı için bilgi kaybıdır.
  it('Türkçe harfleri okunabilir karşılığına çevirir', () => {
    expect(asciiFilename('Çamaşırhane Şubat Öğün.pdf')).toBe('Camasirhane Subat Ogun.pdf')
    expect(asciiFilename('İĞÜŞÖÇ ığüşöç')).toBe('IGUSOC igusoc')
  })

  it('başlığı bozacak karakterleri eler', () => {
    expect(asciiFilename('rapor"kaçak\\.pdf')).not.toMatch(/["\\]/)
    expect(asciiFilename('satir\nkirik.pdf')).not.toMatch(/[\r\n]/)
  })

  it('tamamen elenen adda yedeğe düşer', () => {
    expect(asciiFilename('日本語', 'rapor.pdf')).toBe('rapor.pdf')
    expect(asciiFilename('', 'rapor.pdf')).toBe('rapor.pdf')
    expect(asciiFilename(null, 'rapor.pdf')).toBe('rapor.pdf')
  })

  it('art arda tireleri sadeleştirir ve uçlardan kırpar', () => {
    expect(asciiFilename('— — rapor — —')).toBe('rapor')
  })
})

describe('attachment başlığı', () => {
  it('hem ASCII yedek hem UTF-8 adı verir', () => {
    const h = attachmentDisposition('Çamaşır Raporu.pdf')
    expect(h).toContain('filename="Camasir Raporu.pdf"')
    expect(h).toContain("filename*=UTF-8''")
    expect(h).toContain(encodeURIComponent('Çamaşır Raporu.pdf'))
  })

  // Üretilen başlık gerçekten setHeader'dan geçmeli — testin bütün amacı bu.
  it('Node başlık doğrulamasından geçer', () => {
    const zorlu = ['Gunluk Temizlik Raporu — 2026-08-17.pdf', 'Çamaşırhane.pdf', 'M1 Oda 101 — etiket.pdf']
    for (const ad of zorlu) {
      const deger = attachmentDisposition(ad)
      // Latin-1 dışı hiçbir karakter kalmamalı; Node'un attığı hata tam da budur.
      expect(/^[\x20-\x7E]*$/.test(deger)).toBe(true)
    }
  })

  it('setAttachment yanıta yazar', () => {
    const yazilan = {}
    setAttachment({ setHeader: (k, v) => { yazilan[k] = v } }, 'Şubat Raporu.pdf')
    expect(yazilan['Content-Disposition']).toContain('filename="Subat Raporu.pdf"')
  })
})
