import { describe, it, expect } from 'vitest'
import {
  normText, buildPhotoIndex, intakeHasPhoto, intakeQualityCounts, filterIntakes,
  buildIntakeIndex, photoIntakes, filterPhotos,
} from './intakeFilter.js'
import { baseEquivalent } from './waterUnits.js'

const rows = [
  { id: 1, move_date: '2026-07-01', product_name: '0.5 L Şişe Su', brand_name: 'Mila', waybill_no: 'IRS-100', lot_no: 'L1', expiry_tracking: 1, expiry_date: '2027-01-01', qty_base: 280, remaining_base: 0 },
  { id: 2, move_date: '2026-07-05', product_name: '19 L Damacana', brand_name: 'Çoban', waybill_no: null, lot_no: null, expiry_tracking: 0, expiry_date: null, qty_base: 60, remaining_base: 40 },
  { id: 3, move_date: '2026-07-05', product_name: 'Bardak Su', brand_name: 'Mila', waybill_no: 'IRS-102', lot_no: null, expiry_tracking: 1, expiry_date: null, qty_base: 500, remaining_base: 120 },
  { id: 4, move_date: '2026-07-03', product_name: '0.33 L Şişe Su', brand_name: 'Assu', waybill_no: 'IRS-101', lot_no: null, expiry_tracking: 0, expiry_date: null, qty_base: 900, remaining_base: 10 },
]
const photos = [{ movement_id: 1, waybill_no: 'IRS-100' }, { movement_id: null, waybill_no: 'IRS-101' }]

describe('normText', () => {
  it('Türkçe İ/ı ve aksanları normalize eder', () => {
    expect(normText('İRSALİYE')).toBe('irsaliye')
    expect(normText('Işık')).toBe('isik')
    expect(normText('  Şişe Su  ')).toBe('sise su')
  })
})

describe('buildPhotoIndex / intakeHasPhoto', () => {
  it('hareket id veya irsaliye no ile fotoğraf eşler', () => {
    const idx = buildPhotoIndex(photos)
    expect(intakeHasPhoto(rows[0], idx)).toBe(true)  // movement_id 1
    expect(intakeHasPhoto(rows[3], idx)).toBe(true)  // waybill IRS-101
    expect(intakeHasPhoto(rows[1], idx)).toBe(false) // irsaliyesiz, foto yok
    expect(intakeHasPhoto(rows[2], idx)).toBe(false)
  })
})

describe('intakeQualityCounts', () => {
  it('ay genelinde bayrak sayılarını verir', () => {
    const counts = intakeQualityCounts(rows, buildPhotoIndex(photos))
    expect(counts.no_waybill).toBe(1)     // id 2
    expect(counts.no_expiry).toBe(1)      // id 3 (takip açık, SKT yok)
    expect(counts.no_photo).toBe(2)       // id 2, id 3
    expect(counts.has_remaining).toBe(3)  // id 2,3,4
  })
})

describe('filterIntakes', () => {
  const photo = buildPhotoIndex(photos)

  it('varsayılan sıralama tarih azalan, eş tarihte id azalan', () => {
    const out = filterIntakes(rows, { photo })
    expect(out.map(r => r.id)).toEqual([3, 2, 4, 1])
  })

  it('arama ürün/marka/irsaliye üzerinde çalışır ve Türkçe duyarsız', () => {
    expect(filterIntakes(rows, { search: 'mila', photo }).map(r => r.id)).toEqual([3, 1])
    expect(filterIntakes(rows, { search: 'ŞİŞE', photo }).map(r => r.id).sort()).toEqual([1, 4])
    expect(filterIntakes(rows, { search: 'irs-101', photo }).map(r => r.id)).toEqual([4])
  })

  it('hızlı filtreler AND mantığıyla uygulanır', () => {
    expect(filterIntakes(rows, { quick: ['no_waybill'], photo }).map(r => r.id)).toEqual([2])
    expect(filterIntakes(rows, { quick: ['no_photo', 'has_remaining'], photo }).map(r => r.id)).toEqual([3, 2])
    expect(filterIntakes(rows, { quick: ['no_expiry'], photo }).map(r => r.id)).toEqual([3])
  })

  it('miktar ve kalan sıralaması', () => {
    expect(filterIntakes(rows, { sort: 'qty_desc', photo }).map(r => r.id)).toEqual([4, 3, 1, 2])
    expect(filterIntakes(rows, { sort: 'remaining_desc', photo }).map(r => r.id)).toEqual([3, 2, 4, 1])
  })

  it('arama + hızlı filtre birlikte', () => {
    expect(filterIntakes(rows, { search: 'mila', quick: ['no_photo'], photo }).map(r => r.id)).toEqual([3])
  })

  it('girdi listesini mutasyona uğratmaz', () => {
    const snapshot = rows.map(r => r.id)
    filterIntakes(rows, { sort: 'qty_desc', photo })
    expect(rows.map(r => r.id)).toEqual(snapshot)
  })
})

describe('baseEquivalent', () => {
  const sise = { unit_label: 'koli', units_per_case: 1, cases_per_pallet: 140 }
  it('palete toplanan miktarın baz karşılığını verir', () => {
    expect(baseEquivalent(sise, 280)).toBe('280 koli')
    expect(baseEquivalent(sise, 2940)).toBe('2.940 koli') // 21 palet
  })
  it('okunur metin baz ile aynıysa null (tekrar yazmaz)', () => {
    expect(baseEquivalent(sise, 3)).toBeNull()            // "3 koli" === baz
    expect(baseEquivalent({ unit_label: 'palet', units_per_case: 1, cases_per_pallet: 1 }, 20)).toBeNull()
  })
  it('karışık kırılımda da baz toplamı verir', () => {
    expect(baseEquivalent(sise, 143)).toBe('143 koli')    // "1 palet 3 koli"
  })
})

describe('buildIntakeIndex / photoIntakes', () => {
  const intakes = [
    { id: 10, waybill_no: 'IRS-A', product_name: 'Şişe', qty_base: 280 },
    { id: 11, waybill_no: 'IRS-A', product_name: 'Damacana', qty_base: 40 },
    { id: 12, waybill_no: null, product_name: 'Bardak', qty_base: 66 },
  ]
  const index = buildIntakeIndex(intakes)

  it('hareket id eşleşmesi irsaliye kardeşlerini de getirir', () => {
    expect(photoIntakes({ movement_id: 10 }, index).map(r => r.id)).toEqual([10, 11])
  })
  it('irsaliyesiz hareket yalnız kendini getirir', () => {
    expect(photoIntakes({ movement_id: 12 }, index).map(r => r.id)).toEqual([12])
  })
  it('yalnız irsaliye no ile eşleşir', () => {
    expect(photoIntakes({ waybill_no: 'IRS-A' }, index).map(r => r.id)).toEqual([10, 11])
    expect(photoIntakes({ waybill_no: 'YOK' }, index)).toEqual([])
    expect(photoIntakes({}, index)).toEqual([])
  })
})

describe('filterPhotos', () => {
  const intakes = [
    { id: 10, waybill_no: '14869', product_name: '0.5 L Şişe Su', brand_name: 'Mila', qty_base: 280 },
  ]
  const index = buildIntakeIndex(intakes)
  const photos = [
    { id: 1, waybill_no: '14869', move_date: '2026-07-13', plate: null },
    { id: 2, waybill_no: null, move_date: '2026-07-10', plate: '67 ABC 123', note: 'kapı önü' },
  ]

  it('irsaliye no, plaka ve bağlı ürün adına göre arar', () => {
    expect(filterPhotos(photos, { search: '14869', index }).map(p => p.id)).toEqual([1])
    expect(filterPhotos(photos, { search: 'abc', index }).map(p => p.id)).toEqual([2])
    expect(filterPhotos(photos, { search: 'şişe', index }).map(p => p.id)).toEqual([1])
    expect(filterPhotos(photos, { search: 'mila', index }).map(p => p.id)).toEqual([1])
    expect(filterPhotos(photos, { search: '', index })).toHaveLength(2)
  })
})
