import { describe, expect, it } from 'vitest'
import {
  buildCsvText,
  calcText,
  dateRange,
  movementTime,
  shiftIsoDay,
  todayStr,
} from './waterUi.js'

describe('water UI helpers', () => {
  it('yerel tarihi ISO gününe dönüştürür ve gün kaydırır', () => {
    expect(todayStr(new Date(2026, 6, 15, 12, 0, 0))).toBe('2026-07-15')
    expect(shiftIsoDay('2026-07-01', -1)).toBe('2026-06-30')
  })

  it('iki tarih arasındaki bütün günleri ay geçişiyle üretir', () => {
    expect(dateRange('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ])
  })

  it('hareket saatini okunabilir biçimde gösterir ve bozuk zamanı yutmaz', () => {
    expect(movementTime('2026-07-15 09:05:00')).toBe('09:05')
    expect(movementTime('not-a-date')).toBe('')
  })

  it('miktar dönüşüm açıklamasını ortak biçimde üretir', () => {
    expect(calcText(
      { unit_label: 'adet' },
      { valid: true, input_qty: 3, input_unit: 'palet', base: 108 },
    )).toBe('3 Palet = 108 adet')
    expect(calcText({}, { valid: false })).toBe('')
  })

  it('CSV hücrelerini noktalı virgül ve çift tırnağa karşı güvenli yazar', () => {
    expect(buildCsvText(['Bölge', 'Not'], [['OTC; Kamp', '3 "palet"']]))
      .toBe('"Bölge";"Not"\n"OTC; Kamp";"3 ""palet"""')
  })
})
