import { describe, it, expect } from 'vitest'
import {
  brandOptions, COMMON_BRANDS, SIZE_GROUPS, SIZE_LETTERS, SIZE_NUMBERS, sizeGroupsWith,
} from './garmentOptions.js'

describe('brandOptions', () => {
  it('arşivden gelen markalar öne alınır', () => {
    const options = brandOptions(['Penti', 'Mavi Jeans'])
    expect(options.slice(0, 2)).toEqual(['Penti', 'Mavi Jeans'])
  })

  it('yaygın markalar arşivden sonra gelir', () => {
    const options = brandOptions(['Penti'])
    expect(options).toContain('LC Waikiki')
    expect(options.indexOf('Penti')).toBeLessThan(options.indexOf('LC Waikiki'))
  })

  it('aynı marka iki kez listelenmez (Türkçe büyük/küçük harf dahil)', () => {
    const options = brandOptions(['lc waıkıkı', 'NIKE'])
    const normalized = options.map(brand => brand.toLocaleLowerCase('tr').replaceAll('ı', 'i'))
    expect(new Set(normalized).size).toBe(normalized.length)
    // Arşivdeki yazım korunur, yaygın listedeki kopya elenir
    expect(options[0]).toBe('lc waıkıkı')
    expect(options).not.toContain('LC Waikiki')
  })

  it('boş ve boşluklu girdiler atlanır', () => {
    const options = brandOptions(['', '   ', 'Koton'])
    expect(options[0]).toBe('Koton')
  })

  it('limit aşılmaz', () => {
    const options = brandOptions([], { limit: 5 })
    expect(options).toHaveLength(5)
    expect(options).toEqual(COMMON_BRANDS.slice(0, 5))
  })

  it('arşiv boşsa yine de dolu palet döner', () => {
    expect(brandOptions().length).toBeGreaterThan(10)
  })
})

describe('beden grupları', () => {
  it('harf ve sayı olmak üzere iki grup', () => {
    expect(SIZE_GROUPS.map(group => group.key)).toEqual(['letter', 'number'])
    expect(SIZE_LETTERS).toContain('5XL')
    expect(SIZE_NUMBERS).toContain('56')
  })

  it('bilinen beden için ek grup açılmaz', () => {
    expect(sizeGroupsWith('XL')).toBe(SIZE_GROUPS)
    expect(sizeGroupsWith('42')).toBe(SIZE_GROUPS)
    expect(sizeGroupsWith('')).toBe(SIZE_GROUPS)
  })

  it('serbest yazılan beden "Girilen" grubunda gösterilir', () => {
    const groups = sizeGroupsWith('104 cm')
    expect(groups).toHaveLength(3)
    expect(groups.at(-1)).toMatchObject({ key: 'custom', options: ['104 cm'] })
  })
})
