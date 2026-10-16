import { describe, it, expect } from 'vitest'
import { markerIdsFor, decodeMarkerIds, drawArucoMarker, MAX_PRINT_ID, MAX_PAGE, MARKER_CELLS } from './signatureMarkers.js'
import { ARUCO_5X5_1000 } from './aruco5x5.js'

describe('İmza föyü köşe işaretleri — kimlik', () => {
  it('baskı no ve sayfa işaretlerden geri okunur; her köşe kendi aralığında', () => {
    for (const [printId, page] of [[1, 0], [249, 3], [250, 0], [12345, 17], [MAX_PRINT_ID, MAX_PAGE]]) {
      const ids = markerIdsFor(printId, page)
      expect(ids.tl).toBeGreaterThanOrEqual(0); expect(ids.tl).toBeLessThan(250)
      expect(ids.tr).toBeGreaterThanOrEqual(250); expect(ids.tr).toBeLessThan(500)
      expect(ids.br).toBeGreaterThanOrEqual(500); expect(ids.br).toBeLessThan(750)
      expect(ids.bl).toBeGreaterThanOrEqual(750); expect(ids.bl).toBeLessThan(1000)
      expect(decodeMarkerIds(ids)).toEqual({ printId, pageIndex: page })
    }
  })

  it('sağlama tutmayan, eksik ya da aralık dışı kimlik reddedilir', () => {
    const ids = markerIdsFor(12345, 2)
    expect(decodeMarkerIds({ ...ids, bl: ids.bl === 999 ? 750 : ids.bl + 1 })).toBeNull()   // sağlama
    expect(decodeMarkerIds({ ...ids, br: ids.br + 1 })).toBeNull()                          // başka sayfa
    expect(decodeMarkerIds({ ...ids, tl: undefined })).toBeNull()                           // görünmeyen köşe
    expect(decodeMarkerIds({ ...ids, tl: ids.tr })).toBeNull()                              // yanlış köşe rolü
    expect(decodeMarkerIds({ tl: 0, tr: 250, br: 500, bl: 750 + 17 })).toBeNull()           // baskı no 0 yok
  })

  it('aralık dışı baskı no / sayfa hata verir', () => {
    expect(() => markerIdsFor(0, 0)).toThrow(RangeError)
    expect(() => markerIdsFor(MAX_PRINT_ID + 1, 0)).toThrow(RangeError)
    expect(() => markerIdsFor(5, MAX_PAGE + 1)).toThrow(RangeError)
  })
})

describe('İmza föyü köşe işaretleri — çizim', () => {
  function kayitci() {
    const cizimler = []
    let renk = null
    const doc = {
      save() { return doc }, restore() { return doc },
      fillColor(c) { renk = c; return doc },
      rect(x, y, w, h) { cizimler.push({ renk, x, y, w, h }); return doc },
      fill() { return doc },
    }
    return { doc, cizimler }
  }

  it('OpenCV deseniyle birebir: siyah zemin + beyaz hücreler, kenarlık siyah kalır', () => {
    const { doc, cizimler } = kayitci()
    drawArucoMarker(doc, 0, 100, 200, 28)
    const [zemin, ...beyaz] = cizimler
    expect(zemin).toEqual({ renk: '#000000', x: 100, y: 200, w: 28, h: 28 })
    // OpenCV generateImageMarker(DICT_5X5_1000, 0) iç deseni (1 = beyaz), satır satır
    const beklenen = '1010001011011001010111100'
    const hucre = 28 / MARKER_CELLS
    const bulunan = beyaz.map(r => [Math.round((r.y - 200) / hucre) - 1, Math.round((r.x - 100) / hucre) - 1])
    const beyazlar = [...beklenen].flatMap((b, i) => (b === '1' ? [[Math.floor(i / 5), i % 5]] : []))
    expect(bulunan).toEqual(beyazlar)
    expect(beyaz.every(r => r.renk === '#ffffff')).toBe(true)
    expect(ARUCO_5X5_1000).toHaveLength(1000)
  })

  it('bilinmeyen kimlik hata verir', () => {
    expect(() => drawArucoMarker(kayitci().doc, 1000, 0, 0, 20)).toThrow(RangeError)
  })
})
