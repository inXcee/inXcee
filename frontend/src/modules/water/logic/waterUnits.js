const UNITS = [['adet', 'Adet'], ['koli', 'Koli'], ['paket', 'Paket'], ['palet', 'Palet']]
const BASE_UNITS = new Set(UNITS.map(([unit]) => unit))
const WHOLE_TOLERANCE = 1e-9

const normUnit = (unit) => String(unit || 'adet').toLocaleLowerCase('tr').trim()

export const baseUnitForProduct = (product) => {
  const unit = normUnit(product?.base_unit || product?.unit_label)
  return BASE_UNITS.has(unit) ? unit : 'adet'
}

export const multiplier = (product, unit) => {
  const baseUnit = baseUnitForProduct(product)
  const perCase = Math.max(1, Number(product?.units_per_case || 1))
  const perPallet = Math.max(1, Number(product?.cases_per_pallet || 1))
  if (unit === 'adet') return 1
  if (unit === 'koli') return baseUnit === 'koli' ? 1 : perCase
  if (unit === 'paket') return baseUnit === 'paket' ? 1 : 1
  if (unit === 'palet') {
    if (baseUnit === 'palet') return 1
    if (baseUnit === 'koli' || baseUnit === 'paket') return perPallet
    return perCase * perPallet
  }
  return 1
}

export const exactBaseQuantity = (product, qty, unit) => {
  const numericQty = Number(qty)
  const rawBase = numericQty * multiplier(product, unit)
  const roundedBase = Math.round(rawBase)
  const tolerance = WHOLE_TOLERANCE * Math.max(1, Math.abs(rawBase))
  const exact = Number.isFinite(rawBase)
    && Number.isSafeInteger(roundedBase)
    && Math.abs(rawBase - roundedBase) <= tolerance
  return { rawBase, base: exact ? roundedBase : 0, exact }
}

export const humanQty = (product, base) => {
  const label = product?.unit_label || 'adet'
  const sign = Number(base) < 0 ? '-' : ''
  let rest = Math.abs(Math.round(base || 0))
  if (rest === 0) return `0 ${label}`
  const parts = []
  const perCase = Math.max(1, Number(product?.units_per_case || 1))
  const casesPerPallet = Math.max(1, Number(product?.cases_per_pallet || 1))
  const baseUnit = baseUnitForProduct(product)
  const perPallet = baseUnit === 'palet' ? 1 : (baseUnit === 'koli' || baseUnit === 'paket') ? casesPerPallet : perCase * casesPerPallet
  if (perPallet > 1 && rest >= perPallet) {
    const pallets = Math.floor(rest / perPallet)
    parts.push(`${pallets} palet`)
    rest -= pallets * perPallet
  }
  if (baseUnit === 'adet' && perCase > 1 && rest >= perCase) {
    const cases = Math.floor(rest / perCase)
    parts.push(`${cases} koli`)
    rest -= cases * perCase
  }
  if (rest > 0) parts.push(`${rest} ${label}`)
  return sign ? `-${parts.join(' ')}` : parts.join(' ')
}

export const defaultUnitForProduct = (product) => {
  const baseUnit = baseUnitForProduct(product)
  if (baseUnit === 'koli' || baseUnit === 'paket') return baseUnit
  if ((product?.units_per_case || 1) > 1) return 'koli'
  return 'adet'
}

export const availableUnitsForProduct = (product) => {
  const baseUnit = baseUnitForProduct(product)
  const unitsPerCase = Math.max(1, Number(product?.units_per_case || 1))
  const casesPerPallet = Math.max(1, Number(product?.cases_per_pallet || 1))
  const units = []
  if (baseUnit === 'koli') units.push('koli')
  else if (baseUnit === 'paket') units.push('paket')
  else if (baseUnit === 'palet') units.push('palet')
  else units.push('adet')
  if (baseUnit === 'koli' || (baseUnit === 'adet' && unitsPerCase > 1)) units.push('koli')
  if (baseUnit === 'paket') units.push('paket')
  if (baseUnit !== 'palet' && casesPerPallet > 1) units.push('palet')
  return [...new Set(units)]
}

export const unitOptionsForProduct = (product) => UNITS.filter(([unit]) => availableUnitsForProduct(product).includes(unit))

export const coerceUnitForProduct = (unit, product) => {
  const units = availableUnitsForProduct(product)
  return units.includes(unit) ? unit : units[units.length - 1] || 'adet'
}

const parseQty = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(String(value ?? '').replace(',', '.').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

export const unitLabel = (unit) => UNITS.find(([value]) => value === unit)?.[1] || unit || 'Adet'

export const productInputUnit = (product, unitMap = {}) => {
  const productId = product?.product_id || product?.id
  return coerceUnitForProduct(unitMap[productId] || defaultUnitForProduct(product), product)
}

const unitFromToken = (token) => {
  if (token == null || String(token).trim() === '') return null
  const normalized = normUnit(token).replace(/\./g, '')
  if (['p', 'pl', 'plt', 'pal', 'palet', 'pallet'].includes(normalized)) return 'palet'
  if (['pk', 'pkt', 'pak', 'paket'].includes(normalized)) return 'paket'
  if (['k', 'kl', 'kol', 'koli'].includes(normalized)) return 'koli'
  if (['a', 'ad', 'adet', 'tane'].includes(normalized)) return 'adet'
  return null
}

export const smartQty = (raw, product, fallbackUnit) => {
  const text = String(raw ?? '').trim()
  const fallback = coerceUnitForProduct(fallbackUnit, product)
  if (!text) return { input_qty: 0, input_unit: fallback, base: 0, valid: false, reason: 'empty' }

  const normalized = text.replace(',', '.').toLocaleLowerCase('tr')
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zçğıöşü.]+)?$/i)
  const qty = match ? Number(match[1]) : parseQty(text)
  const rawToken = match?.[2] || null
  const tokenUnit = unitFromToken(rawToken)
  if (rawToken && !tokenUnit) {
    return { input_qty: qty || 0, input_unit: fallback, base: 0, valid: false, reason: 'invalid_unit' }
  }

  const wantedUnit = tokenUnit || fallback
  const available = availableUnitsForProduct(product)
  if (tokenUnit && !available.includes(tokenUnit)) {
    return { input_qty: qty || 0, input_unit: tokenUnit, base: 0, valid: false, tokenUnit, reason: 'invalid_unit' }
  }
  const unit = available.includes(wantedUnit) ? wantedUnit : fallback
  if (!Number.isFinite(qty) || qty <= 0) {
    return { input_qty: qty || 0, input_unit: unit, base: 0, valid: false, tokenUnit, reason: 'invalid_qty' }
  }

  const conversion = exactBaseQuantity(product, qty, unit)
  if (!conversion.exact || conversion.base <= 0) {
    return {
      input_qty: qty,
      input_unit: unit,
      base: 0,
      rawBase: conversion.rawBase,
      valid: false,
      tokenUnit,
      reason: 'fractional_base',
      error: `Tam ${product?.unit_label || baseUnitForProduct(product)} gerekli`,
    }
  }
  return { input_qty: qty, input_unit: unit, base: conversion.base, rawBase: conversion.rawBase, valid: true, tokenUnit }
}
