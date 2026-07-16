import { describe, expect, it } from 'vitest'
import { isIsoDate, isIsoMonth, isTime } from './date.js'

describe('date validation', () => {
  it('accepts only real ISO calendar dates', () => {
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2027-02-29')).toBe(false)
    expect(isIsoDate('2027-02-30')).toBe(false)
    expect(isIsoDate('2027-13-01')).toBe(false)
    expect(isIsoDate('27-01-01')).toBe(false)
  })

  it('accepts only real ISO months', () => {
    expect(isIsoMonth('2027-01')).toBe(true)
    expect(isIsoMonth('2027-12')).toBe(true)
    expect(isIsoMonth('2027-00')).toBe(false)
    expect(isIsoMonth('2027-13')).toBe(false)
  })

  it('accepts only valid 24-hour clock values', () => {
    expect(isTime('00:00')).toBe(true)
    expect(isTime('23:59')).toBe(true)
    expect(isTime('24:00')).toBe(false)
    expect(isTime('12:60')).toBe(false)
    expect(isTime('9:30')).toBe(false)
  })
})
