import { describe, expect, it } from 'vitest'
import {
  availableUnitsForProduct,
  exactBaseQuantity,
  humanQty,
  smartQty,
} from './waterUnits.js'

describe('water product unit rules', () => {
  it('offers only units meaningful for the product tracking base', () => {
    expect(availableUnitsForProduct({ unit_label: 'adet', units_per_case: 12, cases_per_pallet: 70 })).toEqual(['adet', 'koli', 'palet'])
    expect(availableUnitsForProduct({ unit_label: 'koli', units_per_case: 1, cases_per_pallet: 180 })).toEqual(['koli', 'palet'])
    expect(availableUnitsForProduct({ unit_label: 'paket', units_per_case: 1, cases_per_pallet: 80 })).toEqual(['paket', 'palet'])
  })

  it('accepts fractional packages or pallets only when the base result is whole', () => {
    const bottles = { unit_label: 'şişe', units_per_case: 12, cases_per_pallet: 70 }
    const demijohn = { unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36 }
    const glass = { unit_label: 'paket', units_per_case: 1, cases_per_pallet: 133 }

    expect(exactBaseQuantity(bottles, 0.5, 'koli')).toEqual({ rawBase: 6, base: 6, exact: true })
    expect(exactBaseQuantity(demijohn, 2.5, 'palet')).toEqual({ rawBase: 90, base: 90, exact: true })
    expect(exactBaseQuantity(glass, 0.5, 'palet')).toEqual({ rawBase: 66.5, base: 0, exact: false })
  })

  it('parses short unit codes and plain values using the selected product unit', () => {
    const demijohn = { name: 'Damacana', unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36 }
    const cases = { name: '0.33 L', unit_label: 'koli', units_per_case: 1, cases_per_pallet: 180 }

    expect(smartQty('3p', demijohn, 'adet')).toMatchObject({ input_qty: 3, input_unit: 'palet', base: 108, valid: true })
    expect(smartQty('10', cases, 'koli')).toMatchObject({ input_qty: 10, input_unit: 'koli', base: 10, valid: true })
    expect(smartQty('2,5 palet', demijohn, 'adet')).toMatchObject({ input_qty: 2.5, input_unit: 'palet', base: 90, valid: true })
  })

  it('does not silently round fractional base quantities', () => {
    const bottles = { name: 'Şişe Su', unit_label: 'şişe', units_per_case: 12, cases_per_pallet: 70 }
    const glass = { name: 'Cam Su', unit_label: 'paket', units_per_case: 1, cases_per_pallet: 133 }

    expect(smartQty('2,5', bottles, 'adet')).toMatchObject({ valid: false, base: 0, rawBase: 2.5, reason: 'fractional_base' })
    expect(smartQty('0,5p', glass, 'paket')).toMatchObject({ valid: false, base: 0, rawBase: 66.5, reason: 'fractional_base' })
    expect(smartQty('3 kasa', bottles, 'adet')).toMatchObject({ valid: false, reason: 'invalid_unit' })
  })

  it('renders whole base amounts without changing their meaning', () => {
    const product = { unit_label: 'şişe', units_per_case: 12, cases_per_pallet: 70 }
    expect(humanQty(product, 869)).toBe('1 palet 2 koli 5 şişe')
    expect(humanQty(product, -24)).toBe('-2 koli')
  })
})
