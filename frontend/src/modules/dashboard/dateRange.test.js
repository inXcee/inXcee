import { describe, it, expect } from 'vitest'
import { parseRange, computeRange, PRESET_LABELS, MAX_DAYS } from './dateRange.js'

describe('parseRange', () => {
  it('parametre yoksa default 30', () => {
    expect(parseRange(null, null, null)).toEqual({ range: '30', from: null, to: null, isCustom: false })
  })

  it('geçersiz range default 30 fallback', () => {
    expect(parseRange('foo', null, null)).toEqual({ range: '30', from: null, to: null, isCustom: false })
  })

  it('preset 7/30/90 olduğu gibi', () => {
    expect(parseRange('7', null, null).range).toBe('7')
    expect(parseRange('90', null, null).range).toBe('90')
  })

  it('custom + from + to → isCustom true', () => {
    const r = parseRange('custom', '2026-04-01', '2026-04-30')
    expect(r).toEqual({ range: 'custom', from: '2026-04-01', to: '2026-04-30', isCustom: true })
  })

  it('custom ama from eksik → default 30', () => {
    expect(parseRange('custom', null, '2026-04-30').isCustom).toBe(false)
    expect(parseRange('custom', null, '2026-04-30').range).toBe('30')
  })

  it('custom ama to<from → default 30', () => {
    expect(parseRange('custom', '2026-05-01', '2026-04-30').isCustom).toBe(false)
  })
})

describe('computeRange', () => {
  const fixedNow = new Date('2026-05-19T12:00:00Z').getTime()

  it('preset 7 → days=7, to=today, from=today-6', () => {
    const r = computeRange({ range: '7', from: null, to: null, isCustom: false }, fixedNow)
    expect(r.days).toBe(7)
    expect(r.to).toBe('2026-05-19')
    expect(r.from).toBe('2026-05-13')
    expect(r.label).toBe('SON 7 GÜN')
  })

  it('preset 30 → days=30', () => {
    const r = computeRange({ range: '30', from: null, to: null, isCustom: false }, fixedNow)
    expect(r.days).toBe(30)
    expect(r.label).toBe('SON 30 GÜN')
  })

  it('custom 1-30 Nisan → days=30, from/to korunur, label tarih aralığı', () => {
    const r = computeRange({ range: 'custom', from: '2026-04-01', to: '2026-04-30', isCustom: true }, fixedNow)
    expect(r.days).toBe(30)
    expect(r.from).toBe('2026-04-01')
    expect(r.to).toBe('2026-04-30')
    expect(r.label).toBe('2026-04-01 → 2026-04-30')
  })

  it('custom aynı gün → days=1', () => {
    const r = computeRange({ range: 'custom', from: '2026-05-10', to: '2026-05-10', isCustom: true }, fixedNow)
    expect(r.days).toBe(1)
  })

  it('custom >90 gün → days=90 clamp', () => {
    const r = computeRange({ range: 'custom', from: '2026-01-01', to: '2026-05-01', isCustom: true }, fixedNow)
    expect(r.days).toBe(MAX_DAYS)
  })
})

describe('PRESET_LABELS', () => {
  it('7/30/90 anahtarları var', () => {
    expect(PRESET_LABELS['7']).toBe('SON 7 GÜN')
    expect(PRESET_LABELS['30']).toBe('SON 30 GÜN')
    expect(PRESET_LABELS['90']).toBe('SON 90 GÜN')
  })
})
