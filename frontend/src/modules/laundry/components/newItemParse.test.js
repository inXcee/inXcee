import { describe, it, expect } from 'vitest'
import { normTR, fuzzyFind, parseQuickPremium, parseClothingText, parseClothingLine, parsePremiumLine, findRoom } from './newItem/parse.js'
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

describe('parseClothingLine (çok-segment)', () => {
  it('"3 gömlek mavi, 2 pantolon siyah, çorap" → 3 satır', () => {
    const list = parseClothingLine('3 gömlek mavi, 2 pantolon siyah, çorap', DEFAULT_CLOTHING_TYPES)
    expect(list).toEqual([
      { type: 'Gömlek', color: 'Mavi', qty: 3 },
      { type: 'Pantolon', color: 'Siyah', qty: 2 },
      { type: 'Çorap', color: '', qty: 1 },
    ])
  })
  it('tip eşleşmeyen segment custom isimle girer', () => {
    const list = parseClothingLine('2 yelek yeşil', DEFAULT_CLOTHING_TYPES)
    expect(list).toEqual([{ type: 'yelek', color: 'Yeşil', qty: 2 }])
  })
  it('boş segmentler atlanır', () => {
    expect(parseClothingLine(' , ,, ', DEFAULT_CLOTHING_TYPES)).toEqual([])
  })
  it('tek segment eski davranışla aynı', () => {
    expect(parseClothingLine('gömlek', DEFAULT_CLOTHING_TYPES)).toEqual([{ type: 'Gömlek', color: '', qty: 1 }])
  })
})

describe('parsePremiumLine (çok-segment)', () => {
  it('"3 gömlek mavi çizgili L Lacoste, 2 pantolon" → 2 satır', () => {
    const list = parsePremiumLine('3 gömlek mavi çizgili L Lacoste, 2 pantolon', DEFAULT_CLOTHING_TYPES)
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ type: 'Gömlek', color: 'Mavi', pattern: 'Çizgili', size: 'L', brand: 'Lacoste', qty: 3 })
    expect(list[1]).toMatchObject({ type: 'Pantolon', qty: 2 })
  })
  it('tip eşleşmeyen segment atlanır (premium tipte zorunlu)', () => {
    expect(parsePremiumLine('falanca şey, 2 gömlek', DEFAULT_CLOTHING_TYPES)).toHaveLength(1)
  })
})

describe('findRoom', () => {
  const ROOMS = [
    { id: 1, block: 'M1', room_no: '205' },
    { id: 2, block: 'M2', room_no: '205' },
    { id: 3, block: 'A', room_no: '105' },
  ]
  it('"m1 205" → M1 odası', () => {
    expect(findRoom('m1 205', ROOMS)?.id).toBe(1)
  })
  it('"205 m2" ters sıra', () => {
    expect(findRoom('205 m2', ROOMS)?.id).toBe(2)
  })
  it('"M1205" bitişik yazım', () => {
    expect(findRoom('M1205', ROOMS)?.id).toBe(1)
  })
  it('sadece oda no → null (blok belirsiz)', () => {
    expect(findRoom('205', ROOMS)).toBe(null)
  })
  it('listede olmayan oda → null', () => {
    expect(findRoom('M1 999', ROOMS)).toBe(null)
  })
})
