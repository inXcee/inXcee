import { describe, it, expect } from 'vitest'
import { alertBucket } from './cadence.js'

// Referans an: bucket'lar buna göre üretilir.
const AN = new Date('2026-08-02T14:00:00Z')

describe('alertBucket — uyarı sıklığı yaşla birlikte seyrelir', () => {
  it('taze bir sorun günlük kova alır', () => {
    expect(alertBucket(2, AN)).toBe('d2026-08-02')
    expect(alertBucket(47, AN)).toBe('d2026-08-02')
  })

  it('aynı gün içinde aynı kova döner (gün içi tekrar yok)', () => {
    const sabah = alertBucket(5, new Date('2026-08-02T06:00:00Z'))
    const aksam = alertBucket(5, new Date('2026-08-02T21:00:00Z'))
    expect(sabah).toBe(aksam)
  })

  it('ertesi gün kova değişir (günde bir hatırlatma)', () => {
    expect(alertBucket(5, new Date('2026-08-03T06:00:00Z'))).not.toBe(alertBucket(5, AN))
  })

  // 72 saati aşan sorun kronikleşmiştir: her gün ping atmak yerine haftada bir.
  it('kronikleşen sorun haftalık kovaya geçer', () => {
    expect(alertBucket(80, AN)).toMatch(/^w/)
  })

  it('kronik kova hafta boyunca sabit kalır', () => {
    const pazar = alertBucket(200, new Date('2026-08-02T10:00:00Z'))
    const carsamba = alertBucket(200, new Date('2026-08-05T10:00:00Z'))
    expect(pazar).toBe(carsamba)
  })

  it('sonraki haftada kova değişir', () => {
    const buHafta = alertBucket(200, new Date('2026-08-02T10:00:00Z'))
    const gelecekHafta = alertBucket(200, new Date('2026-08-12T10:00:00Z'))
    expect(buHafta).not.toBe(gelecekHafta)
  })

  it('yaş bilinmiyorsa günlük davranır', () => {
    expect(alertBucket(null, AN)).toBe('d2026-08-02')
    expect(alertBucket(undefined, AN)).toBe('d2026-08-02')
  })
})
