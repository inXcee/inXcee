import { describe, expect, it } from 'vitest'
import { istanbulDate } from './time.js'

describe('istanbulDate', () => {
  it('UTC gece sinirini Europe/Istanbul gunune cevirir', () => {
    expect(istanbulDate(new Date('2026-07-25T22:30:00.000Z'))).toBe('2026-07-26')
  })

  it('gecersiz tarihi reddeder', () => {
    expect(() => istanbulDate('gecersiz')).toThrow('Gecersiz tarih')
  })
})
