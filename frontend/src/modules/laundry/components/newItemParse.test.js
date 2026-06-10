import { describe, it, expect } from 'vitest'
import { normTR, fuzzyFind, parseQuickPremium, parseClothingText } from './newItem/parse.js'
import { DEFAULT_CLOTHING_TYPES } from './newItem/constants.js'

describe('normTR', () => {
  it('Türkçe karakterleri sadeleştirir', () => {
    expect(normTR('Gömlek')).toBe('gomlek')
    expect(normTR('İş Pantalonu')).toBe('ispantalonu')
    expect(normTR('ÇORAP')).toBe('corap')
  })
})

describe('fuzzyFind', () => {
  it('tam ve prefix eşleşme bulur', () => {
    expect(fuzzyFind('gomlek', DEFAULT_CLOTHING_TYPES)).toBe('Gömlek')
    expect(fuzzyFind('pant', DEFAULT_CLOTHING_TYPES)).toBe('Pantolon')
  })
  it('2 karakterden kısa kelimeye null döner', () => {
    expect(fuzzyFind('g', DEFAULT_CLOTHING_TYPES)).toBe(null)
  })
})

describe('parseQuickPremium', () => {
  it('"3 gömlek mavi çizgili L Lacoste" tam ayrıştırır', () => {
    const p = parseQuickPremium('3 gömlek mavi çizgili L Lacoste', DEFAULT_CLOTHING_TYPES)
    expect(p.qty).toBe(3)
    expect(p.type).toBe('Gömlek')
    expect(p.color).toBe('Mavi')
    expect(p.pattern).toBe('Çizgili')
    expect(p.size).toBe('L')
    expect(p.brand).toBe('Lacoste')
  })
  it('boş metin varsayılan döner', () => {
    expect(parseQuickPremium('', DEFAULT_CLOTHING_TYPES)).toEqual({ type:'', color:'', pattern:'', brand:'', size:'', qty:1 })
  })
})

describe('parseClothingText', () => {
  it('"2 pantolon siyah" ayrıştırır', () => {
    const p = parseClothingText('2 pantolon siyah', DEFAULT_CLOTHING_TYPES)
    expect(p).toEqual({ type: 'Pantolon', color: 'Siyah', qty: 2 })
  })
  it('"açık mavi" uzun renk adını "Mavi"den önce eşler', () => {
    const p = parseClothingText('gömlek açık mavi', DEFAULT_CLOTHING_TYPES)
    expect(p.color).toBe('Açık Mavi')
  })
  it('adet sınırı 99', () => {
    expect(parseClothingText('150 çorap', DEFAULT_CLOTHING_TYPES).qty).toBe(99)
  })
})
