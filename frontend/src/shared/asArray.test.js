import { describe, it, expect } from 'vitest'
import { asArray } from './asArray.js'

describe('asArray', () => {
  it('diziyi olduğu gibi verir', () => {
    const dizi = [1, 2]
    expect(asArray(dizi)).toBe(dizi)
  })

  it('undefined/null için boş dizi verir', () => {
    expect(asArray(undefined)).toEqual([])
    expect(asArray(null)).toEqual([])
  })

  // Canlıdaki çökmelerin sebebi tam olarak buydu: truthy ama dizi değil.
  it('nesne gelirse çökmek yerine boş dizi verir', () => {
    expect(asArray({ error: 'Sunucu hatası' })).toEqual([])
    expect(asArray('metin')).toEqual([])
    expect(asArray(42)).toEqual([])
  })

  it('sayfalı yanıtın içindeki diziyi çıkarır', () => {
    expect(asArray({ items: [1, 2], total: 2 })).toEqual([1, 2])
    expect(asArray({ rows: ['a'], total: 1 })).toEqual(['a'])
  })

  it('items dizi değilse yine boş dizi', () => {
    expect(asArray({ items: 'dizi degil' })).toEqual([])
  })
})
