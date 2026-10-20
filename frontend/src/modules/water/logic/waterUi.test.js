import { describe, expect, it } from 'vitest'
import {
  buildCsvText,
  calcText,
  dateRange,
  movementTime,
  parseServerTimestamp,
  serverDateTime,
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
    const hhmm = date => date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    // SQLite CURRENT_TIMESTAMP UTC yazar: ekli/eksiz biçimler aynı ana karşılık gelir (İstanbul'da 12:05)
    expect(movementTime('2026-07-15 09:05:00')).toBe(hhmm(new Date(Date.UTC(2026, 6, 15, 9, 5))))
    expect(movementTime('2026-07-15T09:05:00Z')).toBe(hhmm(new Date(Date.UTC(2026, 6, 15, 9, 5))))
    expect(movementTime('2026-07-15T12:05:00+03:00')).toBe(hhmm(new Date(Date.UTC(2026, 6, 15, 9, 5))))
    expect(movementTime('not-a-date')).toBe('')
  })

  it('sunucu zaman damgasını İstanbul saatine doğru çevirir (UTC sanılmaz → 3 saat kayma yok)', () => {
    const ts = parseServerTimestamp('2026-10-20 06:05:00')
    expect(ts.toISOString()).toBe('2026-10-20T06:05:00.000Z')
    expect(ts.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })).toBe('09:05')
  })

  it('sunucu gün+saatini yerel biçimde verir, boş/bozuk değeri yutmaz', () => {
    const expected = new Date(Date.UTC(2026, 9, 20, 6, 5)).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    expect(serverDateTime('2026-10-20 06:05:00')).toBe(expected)
    expect(serverDateTime(null)).toBe('')
    expect(serverDateTime('bozuk')).toBe('bozuk')
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
