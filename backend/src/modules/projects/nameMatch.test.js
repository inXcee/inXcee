import { describe, it, expect } from 'vitest'
import { normalizeName, similarity, matchRoster } from './nameMatch.js'

describe('normalizeName', () => {
  it('Türkçe harfleri ASCII karşılığına indirir', () => {
    expect(normalizeName('Ali Rıza Çolban')).toBe('ALI RIZA COLBAN')
    expect(normalizeName('BİRGÜL KINICI')).toBe('BIRGUL KINICI')
    expect(normalizeName('Şişli Öğüt Çağrı')).toBe('SISLI OGUT CAGRI')
  })

  it('fazla boşlukları toplar', () => {
    expect(normalizeName('  AYŞE   YAĞLI ')).toBe('AYSE YAGLI')
  })

  it('boş girdi boş döner', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName('   ')).toBe('')
  })
})

describe('similarity', () => {
  it('aynı isim 1 verir', () => {
    expect(similarity('ALI COLBAN', 'ALI COLBAN')).toBe(1)
  })

  it('tek harf farkı yüksek benzerlik verir', () => {
    expect(similarity('ALI RIZA COLBAN', 'ALI RIZA CORBAN')).toBeGreaterThan(0.9)
  })

  // Bu iki isim canlı veride difflib ile yanlışlıkla eşleşiyordu — farklı kişiler.
  it('farklı kişileri yüksek benzer saymaz', () => {
    expect(similarity('SINEM KACAR', 'EMINE ACAR')).toBeLessThan(0.85)
  })
})

describe('matchRoster', () => {
  const staff = [
    { id: 1, full_name: 'ALİ RIZA ÇORBAN' },
    { id: 2, full_name: 'BİRGÜL KINACI' },
    { id: 3, full_name: 'AYŞE YAĞLI' },
    { id: 4, full_name: 'EMİNE ACAR' },
  ]

  it('birebir eşleşmeyi bulur', () => {
    const sonuc = matchRoster(['AYŞE YAĞLI'], staff)
    expect(sonuc.exact).toEqual([{ name: 'AYŞE YAĞLI', staff_id: 3, staff_name: 'AYŞE YAĞLI' }])
    expect(sonuc.near).toHaveLength(0)
    expect(sonuc.unknown).toHaveLength(0)
  })

  it('yazım farkını öneri olarak sunar, otomatik bağlamaz', () => {
    const sonuc = matchRoster(['ALİ RIZA ÇOLBAN'], staff)
    expect(sonuc.exact).toHaveLength(0)
    expect(sonuc.near[0]).toMatchObject({ name: 'ALİ RIZA ÇOLBAN', staff_id: 1, staff_name: 'ALİ RIZA ÇORBAN' })
    expect(sonuc.near[0].score).toBeGreaterThan(0.9)
  })

  it('benzemeyen ismi yeni kişi sayar', () => {
    const sonuc = matchRoster(['SİNEM KAÇAR'], staff)
    expect(sonuc.unknown).toEqual(['SİNEM KAÇAR'])
    expect(sonuc.near).toHaveLength(0)
  })

  it('aynı isim listede iki kez varsa bir kez işlenir', () => {
    const sonuc = matchRoster(['AYŞE YAĞLI', 'ayşe   yağlı'], staff)
    expect(sonuc.exact).toHaveLength(1)
  })

  it('bir DB kaydı iki farklı isme birden önerilmez', () => {
    // İkisi de ÇORBAN'a benziyor; yalnız en yakın olan öneri alır.
    const sonuc = matchRoster(['ALİ RIZA ÇOLBAN', 'ALİ RIZA ÇORBAM'], staff)
    const oneriler = sonuc.near.filter(item => item.staff_id === 1)
    expect(oneriler).toHaveLength(1)
  })

  it('boş satırları yok sayar', () => {
    expect(matchRoster(['', '   ', null], staff).unknown).toHaveLength(0)
  })
})
