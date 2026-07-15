import { describe, expect, it } from 'vitest'
import {
  INPUT_UNITS,
  assertAvailableUnit,
  availableUnits,
  humanize,
  toBase,
  unitMultiplier,
} from './units.js'

describe('water units', () => {
  const bottles = { name: '0.33 L Su', unit_label: 'şişe', units_per_case: 12, cases_per_pallet: 70 }
  const demijohn = { name: 'Damacana', unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36 }
  const cases = { name: 'Koli Su', unit_label: 'koli', units_per_case: 1, cases_per_pallet: 180 }
  const packages = { name: 'Cam Su', unit_label: 'paket', units_per_case: 1, cases_per_pallet: 133 }

  it('publishes an immutable supported-unit contract', () => {
    expect(INPUT_UNITS).toEqual(['adet', 'koli', 'paket', 'palet'])
    expect(Object.isFrozen(INPUT_UNITS)).toBe(true)
  })

  it('calculates multipliers from the product natural tracking unit', () => {
    expect(unitMultiplier(bottles, 'adet')).toBe(1)
    expect(unitMultiplier(bottles, 'koli')).toBe(12)
    expect(unitMultiplier(bottles, 'palet')).toBe(840)
    expect(unitMultiplier(demijohn, 'palet')).toBe(36)
    expect(unitMultiplier(cases, 'koli')).toBe(1)
    expect(unitMultiplier(cases, 'palet')).toBe(180)
    expect(unitMultiplier(packages, 'paket')).toBe(1)
    expect(unitMultiplier(packages, 'palet')).toBe(133)
  })

  it('rejects units that cannot represent the product base', () => {
    expect(() => unitMultiplier(packages, 'koli')).toThrowError(expect.objectContaining({ statusCode: 400 }))
    expect(() => unitMultiplier(cases, 'paket')).toThrowError(expect.objectContaining({ statusCode: 400 }))
    expect(() => unitMultiplier(bottles, 'kasa')).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('lists only meaningful entry units and validates a selected unit', () => {
    expect(availableUnits(bottles)).toEqual(['adet', 'koli', 'palet'])
    expect(availableUnits(demijohn)).toEqual(['adet', 'palet'])
    expect(availableUnits({ ...cases, unit_label: 'KOLİ' })).toEqual(['adet', 'koli', 'palet'])
    expect(availableUnits(packages)).toEqual(['adet', 'paket', 'palet'])
    expect(availableUnits({ name: 'Tahta Palet', unit_label: 'palet' })).toEqual(['adet', 'palet'])

    expect(() => assertAvailableUnit(packages, 'paket')).not.toThrow()
    expect(() => assertAvailableUnit(packages, 'koli')).toThrowError(expect.objectContaining({
      statusCode: 400,
      message: 'Cam Su için koli birimi kullanılamaz',
    }))
  })

  it('accepts fractional input only when it becomes a whole base quantity', () => {
    expect(toBase(bottles, 0.5, 'koli')).toBe(6)
    expect(toBase(demijohn, 2.5, 'palet')).toBe(90)
    expect(toBase({ ...bottles, units_per_case: 10 }, 0.1, 'koli')).toBe(1)

    expect(() => toBase(bottles, 2.5, 'adet')).toThrowError(expect.objectContaining({
      statusCode: 400,
      message: expect.stringContaining('tam şişe karşılığına dönüşmeli'),
    }))
    expect(() => toBase(packages, 0.5, 'palet')).toThrowError(expect.objectContaining({
      statusCode: 400,
      message: expect.stringContaining('tam paket karşılığına dönüşmeli'),
    }))
  })

  it('rejects non-finite and unsafe quantities without rounding', () => {
    expect(() => toBase(bottles, Number.POSITIVE_INFINITY, 'adet')).toThrowError(expect.objectContaining({
      statusCode: 400,
      message: 'Miktar güvenli sayı aralığında olmalı',
    }))
    expect(() => toBase(bottles, Number.MAX_SAFE_INTEGER, 'palet')).toThrowError(expect.objectContaining({
      statusCode: 400,
      message: 'Miktar güvenli sayı aralığında olmalı',
    }))
  })

  it('renders pallet, case, package, piece and negative quantities consistently', () => {
    expect(humanize(bottles, 869)).toBe('1 palet 2 koli 5 şişe')
    expect(humanize(demijohn, 108)).toBe('3 palet')
    expect(humanize(cases, 1810)).toBe('10 palet 10 koli')
    expect(humanize(packages, 266)).toBe('2 palet')
    expect(humanize({ name: 'Tahta Palet', unit_label: 'palet' }, 3)).toBe('3 palet')
    expect(humanize(bottles, -24)).toBe('-2 koli')
    expect(humanize(bottles, 0)).toBe('0 şişe')
  })
})
