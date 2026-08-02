import { describe, it, expect } from 'vitest'
import { parseRoomShortcut, parseGarmentLine } from './quickParse.js'

const TYPES = [
  { id: 1, name: 'Gömlek', emoji: '👔' },
  { id: 2, name: 'Pantolon', emoji: '👖' },
  { id: 3, name: 'Çorap', emoji: '🧦' },
  { id: 4, name: 'T-Shirt', emoji: '👕' },
]

describe('parseRoomShortcut', () => {
  it('"m1 205" → M1-205', () => {
    expect(parseRoomShortcut('m1 205')).toEqual({ block: 'M1', room_no: '205' })
  })
  it('"205 m1" ters sırada da çalışır', () => {
    expect(parseRoomShortcut('205 m1')).toEqual({ block: 'M1', room_no: '205' })
  })
  it('"M1205" bitişik yazım — blok sözlüğü belirsizliği çözer', () => {
    expect(parseRoomShortcut('M1205')).toEqual({ block: 'M1', room_no: '205' })
  })
  it('"a 105" tek harfli Y blok', () => {
    expect(parseRoomShortcut('a 105')).toEqual({ block: 'A', room_no: '105' })
  })
  it('Faz 2 bloklarında 1-80 oda numarasını kabul eder', () => {
    expect(parseRoomShortcut('F2A 80')).toEqual({ block: 'F2A', room_no: '80' })
    expect(parseRoomShortcut('f2b 1')).toEqual({ block: 'F2B', room_no: '1' })
    expect(parseRoomShortcut('F2C 81')).toBe(null)
  })
  it('blokta olmayan oda null döner', () => {
    expect(parseRoomShortcut('M1 999')).toBe(null)
  })
  it('bilinmeyen blok null döner', () => {
    expect(parseRoomShortcut('Z9 101')).toBe(null)
  })
  it('boş/eksik girdi null döner', () => {
    expect(parseRoomShortcut('')).toBe(null)
    expect(parseRoomShortcut('M1')).toBe(null)
    expect(parseRoomShortcut('205')).toBe(null)
  })
})

describe('parseGarmentLine', () => {
  it('"3 gömlek mavi" → tek entry, adet 3, renk Mavi', () => {
    const [g] = parseGarmentLine('3 gömlek mavi', TYPES)
    expect(g.type_id).toBe(1)
    expect(g.type_name).toBe('Gömlek')
    expect(g.count).toBe(3)
    expect(g.colors).toEqual([{ key: 'blue', label: 'Mavi' }])
    expect(g.pattern).toBe('solid')
  })
  it('virgülle çoklu segment: "3 gömlek mavi, 2 pantolon siyah, çorap"', () => {
    const list = parseGarmentLine('3 gömlek mavi, 2 pantolon siyah, çorap', TYPES)
    expect(list).toHaveLength(3)
    expect(list[0].type_name).toBe('Gömlek')
    expect(list[1].type_name).toBe('Pantolon')
    expect(list[1].colors[0].key).toBe('black')
    expect(list[2].type_name).toBe('Çorap')
    expect(list[2].count).toBe(1)
  })
  it('desen eşleşir: "gömlek çizgili" → striped-h', () => {
    const [g] = parseGarmentLine('gömlek çizgili', TYPES)
    expect(g.pattern).toBe('striped-h')
    expect(g.pattern_label).toBe('Çizgili')
  })
  it('çoklu renk: "gömlek mavi beyaz"', () => {
    const [g] = parseGarmentLine('gömlek mavi beyaz', TYPES)
    expect(g.colors.map(c => c.key)).toEqual(['blue', 'white'])
  })
  it('tip eşleşmezse custom isimle eklenir (ölü uç yok)', () => {
    const [g] = parseGarmentLine('2 yelek yeşil', TYPES)
    expect(g.type_id).toBe(null)
    expect(g.type_name).toBe('yelek')
    expect(g.count).toBe(2)
    expect(g.colors[0].key).toBe('green')
  })
  it('Türkçe normalize: "gomlek" de Gömlek bulur', () => {
    const [g] = parseGarmentLine('gomlek', TYPES)
    expect(g.type_name).toBe('Gömlek')
  })
  it('boş metin boş liste', () => {
    expect(parseGarmentLine('', TYPES)).toEqual([])
  })
  it('adet sınırı 99', () => {
    expect(parseGarmentLine('150 çorap', TYPES)[0].count).toBe(99)
  })
})

describe('parseGarmentLine — marka ve beden', () => {
  it('harf bedeni tek başına yakalar', () => {
    const [g] = parseGarmentLine('gömlek L', TYPES)
    expect(g.size).toBe('L')
    expect(g.brand).toBe(null)
  })

  it('"42 beden" sayısal bedeni adetten ayırır', () => {
    const [g] = parseGarmentLine('2 pantolon 42 beden', TYPES)
    expect(g.count).toBe(2)
    expect(g.size).toBe('42')
  })

  it('"beden 42" ters sıralamayı da anlar', () => {
    expect(parseGarmentLine('pantolon beden 42', TYPES)[0].size).toBe('42')
  })

  it('çıplak sayı beden değil ADETtir', () => {
    const [g] = parseGarmentLine('42 çorap', TYPES)
    expect(g.count).toBe(42)
    expect(g.size).toBe(null)
  })

  it('tip eşleştikten sonra artan kelime marka olur', () => {
    const [g] = parseGarmentLine('3 nike gömlek mavi', TYPES)
    expect(g).toMatchObject({ type_name: 'Gömlek', count: 3, brand: 'nike' })
    expect(g.colors[0].key).toBe('blue')
  })

  it('tip eşleşmezse artan kelime marka değil kıyafet adı kalır', () => {
    const [g] = parseGarmentLine('2 yelek yeşil', TYPES)
    expect(g.type_name).toBe('yelek')
    expect(g.brand).toBe(null)
  })

  it('marka + beden + renk + desen aynı segmentte', () => {
    const [g] = parseGarmentLine('2 lacoste gömlek mavi çizgili XL', TYPES)
    expect(g).toMatchObject({
      type_name: 'Gömlek', count: 2, brand: 'lacoste', size: 'XL', pattern: 'striped-h',
    })
    expect(g.colors[0].key).toBe('blue')
  })
})
