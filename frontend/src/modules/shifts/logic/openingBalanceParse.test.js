import { describe, it, expect } from 'vitest'
import { parseOpeningLines } from './openingBalanceParse.js'

describe('parseOpeningLines', () => {
  it('Excel sekmeli yapıştırma + başlık satırı', () => {
    expect(parseOpeningLines('Ad Soyad\tKalan\nAYŞE KAYA\t12\nALİ VELİ\t3,5\n')).toEqual({
      rows: [{ name: 'AYŞE KAYA', days: 12 }, { name: 'ALİ VELİ', days: 3.5 }], errors: [],
    })
  })
  it('noktalı virgül ve boşluk ayracı, negatif devir', () => {
    expect(parseOpeningLines('Mehmet Öz ; 7\nFatma Dindar -2').rows)
      .toEqual([{ name: 'Mehmet Öz', days: 7 }, { name: 'Fatma Dindar', days: -2 }])
  })
  it('sayısız satır hata olarak döner', () => {
    expect(parseOpeningLines('AYŞE KAYA 5\nBOZUK SATIR').errors).toEqual([{ line: 2, text: 'BOZUK SATIR' }])
  })
})
