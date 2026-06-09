import { describe, it, expect } from 'vitest'
import { parsePersonnelGrid } from './excelImport.js'

const HEADER = ['SIRA', 'ADI SOYADI', 'TC KİMLİK NO', 'FİRMA', 'TELEFON', 'MEMLEKET', 'GÖREVİ', 'CİNSİYET', 'BLOK', 'ODA', 'GİRİŞ TARİHİ']

describe('parsePersonnelGrid', () => {
  it('başlık satırını anahtar kelimeyle bulur, alanları eşler', () => {
    const grid = [
      ['AVS KAMP SAKİN LİSTESİ'], // gürültü satırı
      HEADER,
      [1, 'AHMET YILMAZ', '12345678901', 'Yapı AŞ', '05551112233', 'Konya', 'Kaynakçı', 'E', 'M1', '101', '2026-06-01'],
    ]
    const out = parsePersonnelGrid(grid)
    expect(out.error).toBeUndefined()
    expect(out.rows.length).toBe(1)
    const r = out.rows[0]
    expect(r.fullName).toBe('AHMET YILMAZ')
    expect(r.tcNo).toBe('12345678901')
    expect(r.company).toBe('Yapı AŞ')
    expect(r.phone).toBe('05551112233')
    expect(r.hometown).toBe('Konya')
    expect(r.jobTitle).toBe('Kaynakçı')
    expect(r.gender).toBe('E')
    expect(r.block).toBe('M1')
    expect(r.roomNo).toBe('101')
    expect(r.checkInDate).toBe('2026-06-01')
  })

  it('sayı hücreleri (TC, oda) string olur', () => {
    const grid = [HEADER, [1, 'VELİ KAYA', 12345678901, '', '', '', '', '', 'A', 101, '']]
    const out = parsePersonnelGrid(grid)
    expect(out.rows[0].tcNo).toBe('12345678901')
    expect(out.rows[0].roomNo).toBe('101')
  })

  it('ayrı blok sütunu yoksa "A-101" biçimli odayı böler', () => {
    const grid = [
      ['ADI SOYADI', 'ODA'],
      ['HASAN DEMİR', 'A-101'],
    ]
    const out = parsePersonnelGrid(grid)
    expect(out.rows[0].block).toBe('A')
    expect(out.rows[0].roomNo).toBe('101')
  })

  it('boş satırları ve isimsiz satırları atlar', () => {
    const grid = [
      HEADER,
      [],
      [null, '', '', '', '', '', '', '', '', '', ''],
      [2, 'GERÇEK KİŞİ', '', '', '', '', '', '', '', '', ''],
    ]
    const out = parsePersonnelGrid(grid)
    expect(out.rows.length).toBe(1)
    expect(out.rows[0].fullName).toBe('GERÇEK KİŞİ')
  })

  it('Date hücresini ISO tarihe çevirir', () => {
    const grid = [
      ['AD SOYAD', 'GİRİŞ'],
      ['CAN ÖZTÜRK', new Date(2026, 5, 9)], // 9 Haziran 2026
    ]
    const out = parsePersonnelGrid(grid)
    expect(out.rows[0].checkInDate).toBe('2026-06-09')
  })

  it('başlık bulunamazsa hata döndürür', () => {
    const grid = [['foo', 'bar'], [1, 2]]
    const out = parsePersonnelGrid(grid)
    expect(out.error).toBeTruthy()
  })
})
