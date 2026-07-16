// Product-aware conversion rules. qty_base always stores the product's natural
// tracking unit: pieces for bottles/demijohns, cases, packages or pallets.

export const INPUT_UNITS = Object.freeze(['adet', 'koli', 'paket', 'palet'])

const BASE_UNITS = new Set(INPUT_UNITS)
const WHOLE_BASE_TOLERANCE = 1e-9

const badRequest = message => Object.assign(new Error(message), { statusCode: 400 })

function normalizedUnit(unit) {
  return String(unit || 'adet').toLocaleLowerCase('tr').trim()
}

function baseInputUnit(product) {
  const unit = normalizedUnit(product?.base_unit || product?.unit_label)
  return BASE_UNITS.has(unit) ? unit : 'adet'
}

function positiveWholeSetting(value) {
  return Math.max(1, parseInt(value, 10) || 1)
}

export function unitMultiplier(product, unit) {
  const input = normalizedUnit(unit)
  const baseUnit = baseInputUnit(product)
  const unitsPerCase = positiveWholeSetting(product?.units_per_case)
  const casesPerPallet = positiveWholeSetting(product?.cases_per_pallet)

  if (input === 'adet') return 1
  if (input === 'koli') {
    if (baseUnit === 'koli') return 1
    if (baseUnit === 'paket' || baseUnit === 'palet') throw badRequest('Geçersiz birim')
    return unitsPerCase
  }
  if (input === 'paket') {
    if (baseUnit === 'paket') return 1
    throw badRequest('Geçersiz birim')
  }
  if (input === 'palet') {
    if (baseUnit === 'palet') return 1
    if (baseUnit === 'koli' || baseUnit === 'paket') return casesPerPallet
    return unitsPerCase * casesPerPallet
  }
  throw badRequest('Geçersiz birim')
}

export function availableUnits(product) {
  const units = ['adet']
  const baseUnit = baseInputUnit(product)
  const unitsPerCase = positiveWholeSetting(product?.units_per_case)
  const casesPerPallet = positiveWholeSetting(product?.cases_per_pallet)

  if (baseUnit === 'koli' || (baseUnit === 'adet' && unitsPerCase > 1)) units.push('koli')
  if (baseUnit === 'paket') units.push('paket')
  if (baseUnit === 'palet') units.push('palet')
  if (baseUnit !== 'palet' && casesPerPallet > 1) units.push('palet')
  return [...new Set(units)]
}

export function assertAvailableUnit(product, unit) {
  if (!availableUnits(product).includes(unit)) {
    throw badRequest(`${product?.name || 'Ürün'} için ${unit} birimi kullanılamaz`)
  }
}

export function toBase(product, quantity, unit) {
  const numericQuantity = Number(quantity)
  const rawBase = numericQuantity * unitMultiplier(product, unit)
  const roundedBase = Math.round(rawBase)
  const tolerance = WHOLE_BASE_TOLERANCE * Math.max(1, Math.abs(rawBase))

  if (!Number.isFinite(rawBase) || !Number.isSafeInteger(roundedBase)) {
    throw badRequest('Miktar güvenli sayı aralığında olmalı')
  }
  if (Math.abs(rawBase - roundedBase) > tolerance) {
    const baseLabel = product?.unit_label || baseInputUnit(product)
    throw badRequest(
      `${product?.name || 'Ürün'} miktarı tam ${baseLabel} karşılığına dönüşmeli; kesirli baz miktar kaydedilemez`,
    )
  }
  return roundedBase
}

export function humanize(product, baseQuantity) {
  const unitsPerCase = positiveWholeSetting(product?.units_per_case)
  const casesPerPallet = positiveWholeSetting(product?.cases_per_pallet)
  const baseUnit = baseInputUnit(product)
  const perPallet = baseUnit === 'palet'
    ? 1
    : (baseUnit === 'koli' || baseUnit === 'paket')
      ? casesPerPallet
      : unitsPerCase * casesPerPallet
  const unit = product?.unit_label || 'adet'
  const sign = Number(baseQuantity) < 0 ? '-' : ''
  let remainder = Math.abs(Math.round(baseQuantity || 0))
  const parts = []

  if (perPallet > 1) {
    const pallets = Math.floor(remainder / perPallet)
    remainder %= perPallet
    if (pallets) parts.push(`${pallets} palet`)
  }
  if (baseUnit === 'adet' && unitsPerCase > 1) {
    const cases = Math.floor(remainder / unitsPerCase)
    remainder %= unitsPerCase
    if (cases) parts.push(`${cases} koli`)
  }
  if (remainder || parts.length === 0) parts.push(`${remainder} ${unit}`)
  return sign ? `-${parts.join(' ')}` : parts.join(' ')
}
