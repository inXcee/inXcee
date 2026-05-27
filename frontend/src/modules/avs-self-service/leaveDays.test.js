import { describe, it, expect } from 'vitest'
import { leaveDays } from './leaveDays.js'

describe('leaveDays', () => {
  it('aynı gün → 1', () => {
    expect(leaveDays('2026-05-27', '2026-05-27')).toBe(1)
  })
  it('dahil aralık → +1 (backend ile aynı)', () => {
    expect(leaveDays('2026-05-27', '2026-05-29')).toBe(3)
  })
  it('bir hafta → 7', () => {
    expect(leaveDays('2026-06-01', '2026-06-07')).toBe(7)
  })
  it('eksik tarih → 0', () => {
    expect(leaveDays('', '2026-05-29')).toBe(0)
    expect(leaveDays('2026-05-27', '')).toBe(0)
  })
  it('ters tarih → 0', () => {
    expect(leaveDays('2026-05-29', '2026-05-27')).toBe(0)
  })
  it('geçersiz tarih → 0', () => {
    expect(leaveDays('abc', '2026-05-29')).toBe(0)
  })
})
