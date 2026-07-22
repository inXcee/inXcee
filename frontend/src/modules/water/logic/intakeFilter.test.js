import { describe, it, expect } from 'vitest'
import {
  normText, buildPhotoIndex, intakeHasPhoto, intakeQualityCounts, filterIntakes,
} from './intakeFilter.js'

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
