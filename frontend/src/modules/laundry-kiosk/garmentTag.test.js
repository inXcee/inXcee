import { describe, it, expect } from 'vitest'
import {
  colorLabels, garmentColors, garmentTagSummary, patternLabel, tagCompleteness, tagPatch,
} from './garmentTag.js'

const PATTERNS = [
  { key: 'solid', label: 'Düz' },
  { key: 'striped-h', label: 'Çizgili' },
]

describe('garmentColors', () => {
  it('colors_json okur', () => {
    expect(garmentColors({ colors_json: '[{"key":"blue","label":"Mavi"}]' }))
      .toEqual([{ key: 'blue', label: 'Mavi' }])
  })

  it('bozuk json çökmez', () => {
    expect(garmentColors({ colors_json: 'bozuk{' })).toEqual([])
  })

  it('hazır colors dizisi varsa onu kullanır', () => {
    expect(garmentColors({ colors: [{ key: 'red', label: 'Kırmızı' }] }))
      .toEqual([{ key: 'red', label: 'Kırmızı' }])
  })
})

describe('colorLabels', () => {
  it('colors_json boşsa tekil color alanına düşer', () => {
    expect(colorLabels({ colors_json: '[]', color: 'Beyaz' })).toEqual(['Beyaz'])
  })

  it('hiç renk yoksa boş döner', () => {
    expect(colorLabels({})).toEqual([])
  })
})

describe('patternLabel', () => {
  it('"düz" deseni gizler', () => {
    expect(patternLabel({ pattern: 'solid' }, PATTERNS)).toBe(null)
  })

  it('bilinen deseni etiketler, bilinmeyeni anahtarıyla gösterir', () => {
    expect(patternLabel({ pattern: 'striped-h' }, PATTERNS)).toBe('Çizgili')
    expect(patternLabel({ pattern: 'ekose' }, PATTERNS)).toBe('ekose')
  })
})

describe('garmentTagSummary', () => {
  it('dolu künyeyi tek satırda birleştirir', () => {
    const summary = garmentTagSummary({
      brand: 'Lacoste', model: 'Slim', size: 'XL',
      colors_json: '[{"key":"blue","label":"Mavi"}]', pattern: 'striped-h',
    }, PATTERNS)
    expect(summary).toBe('Lacoste · Slim · Beden XL · Mavi · Çizgili')
  })

  it('künye tamamen boşsa null döner', () => {
    expect(garmentTagSummary({ pattern: 'solid' }, PATTERNS)).toBe(null)
  })

  it('yalnız beden varsa da özet üretir', () => {
    expect(garmentTagSummary({ size: 'M' }, PATTERNS)).toBe('Beden M')
  })
})

describe('tagCompleteness', () => {
  it('dolu alan sayısını verir', () => {
    expect(tagCompleteness({ brand: 'Nike', size: 'L' })).toMatchObject({ filled: 2, total: 4, complete: false })
  })

  it('hepsi doluysa complete olur', () => {
    expect(tagCompleteness({
      brand: 'Nike', size: 'L', colors_json: '[{"label":"Mavi"}]', pattern: 'striped-h',
    })).toMatchObject({ filled: 4, complete: true })
  })

  it('"düz" desen dolu sayılmaz', () => {
    expect(tagCompleteness({ brand: 'N', size: 'L', color: 'Mavi', pattern: 'solid' }).filled).toBe(3)
  })
})

describe('tagPatch', () => {
  const garment = {
    brand: 'Nike', model: null, size: 'L', pattern: 'solid',
    condition_notes: null, colors_json: '[{"key":"blue","label":"Mavi"}]',
  }

  it('yalnızca değişen alanları gönderir', () => {
    const patch = tagPatch(
      { brand: 'Nike', model: '', size: 'XL', pattern: 'solid', condition_notes: '', colors: [{ key: 'blue', label: 'Mavi' }] },
      garment,
    )
    expect(patch).toEqual({ size: 'XL' })
  })

  it('renk değişimini yakalar', () => {
    const patch = tagPatch(
      { brand: 'Nike', model: '', size: 'L', pattern: 'solid', condition_notes: '', colors: [{ key: 'red', label: 'Kırmızı' }] },
      garment,
    )
    expect(patch).toEqual({ colors: [{ key: 'red', label: 'Kırmızı' }] })
  })

  it('alan temizlemeyi boş string olarak gönderir', () => {
    const patch = tagPatch(
      { brand: '', model: '', size: 'L', pattern: 'solid', condition_notes: '', colors: [{ key: 'blue', label: 'Mavi' }] },
      garment,
    )
    expect(patch).toEqual({ brand: '' })
  })

  it('hiçbir şey değişmediyse boş patch üretir', () => {
    const patch = tagPatch(
      { brand: 'Nike', model: '', size: 'L', pattern: 'solid', condition_notes: '', colors: [{ key: 'blue', label: 'Mavi' }] },
      garment,
    )
    expect(patch).toEqual({})
  })
})
