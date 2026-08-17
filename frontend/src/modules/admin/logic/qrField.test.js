import { describe, expect, it } from 'vitest'
import {
  elleIsaretUyarisi,
  sahaIlerleme,
  sahaKuyrugu,
  taramaSonucu,
  tokenAyikla,
} from './qrField.js'

const k = (over) => ({ location_id: 1, display_name: 'M1 Oda 101', block: 'M1', floor: 1, state: 'unknown', ...over })

describe('saha kuyruğu', () => {
  it('doğrulanmışları kuyruğa almaz', () => {
    const q = sahaKuyrugu([k({ location_id: 1, state: 'verified' }), k({ location_id: 2, state: 'unknown' })])
    expect(q.map(i => i.location_id)).toEqual([2])
  })

  // Bayat etiket sökülüp yenisi asılmalı; bilinmeyen yalnız doğrulanmalı.
  // İkisi aynı aciliyette değil.
  it('en çok iş gerektireni öne alır', () => {
    const q = sahaKuyrugu([
      k({ location_id: 1, state: 'unknown' }),
      k({ location_id: 2, state: 'stale' }),
      k({ location_id: 3, state: 'installed' }),
      k({ location_id: 4, state: 'printed' }),
    ])
    expect(q.map(i => i.state)).toEqual(['stale', 'printed', 'unknown', 'installed'])
  })

  // Görevli koridoru bir kez yürüyor; uygulama onu kat kat gezdirmemeli.
  it('aynı öncelikte kat ve ada göre fiziksel sıra tutar', () => {
    const q = sahaKuyrugu([
      k({ location_id: 1, state: 'unknown', floor: 2, display_name: 'M1 Oda 201' }),
      k({ location_id: 2, state: 'unknown', floor: 1, display_name: 'M1 Oda 102' }),
      k({ location_id: 3, state: 'unknown', floor: 1, display_name: 'M1 Oda 101' }),
    ])
    expect(q.map(i => i.display_name)).toEqual(['M1 Oda 101', 'M1 Oda 102', 'M1 Oda 201'])
  })

  it('blok ve kata göre süzer', () => {
    const veri = [
      k({ location_id: 1, block: 'M1', floor: 1 }),
      k({ location_id: 2, block: 'M2', floor: 1 }),
      k({ location_id: 3, block: 'M1', floor: 2 }),
    ]
    expect(sahaKuyrugu(veri, { block: 'M1' }).map(i => i.location_id)).toEqual([1, 3])
    expect(sahaKuyrugu(veri, { block: 'M1', floor: 2 }).map(i => i.location_id)).toEqual([3])
  })

  it('boş girdide patlamaz', () => {
    expect(sahaKuyrugu()).toEqual([])
  })
})

describe('saha ilerlemesi', () => {
  it('doğrulananı paya, kapsamı paydaya alır ve bilinmeyeni ayrıca yazar', () => {
    const p = sahaIlerleme([
      k({ location_id: 1, state: 'verified' }),
      k({ location_id: 2, state: 'unknown' }),
      k({ location_id: 3, state: 'printed' }),
      k({ location_id: 4, state: 'verified' }),
    ])
    expect(p).toMatchObject({ measurable: true, done: 2, total: 4, unknown: 1, percent: 50 })
    expect(p.label).toBe('2/4 doğrulandı')
  })

  // Boş kapsamda yüzde üretmek uydurmadır.
  it('kapsamda konum yoksa oran vermez', () => {
    expect(sahaIlerleme([], {})).toMatchObject({ measurable: false })
    expect(sahaIlerleme([k({ block: 'M1' })], { block: 'M9' }).measurable).toBe(false)
  })
})

describe('tarama sonucu', () => {
  it('başarıda ilerlemeye izin verir', () => {
    const s = taramaSonucu({ ok: true, scanned: { display_name: 'M1 Oda 101' } })
    expect(s).toMatchObject({ tur: 'basari', ilerle: true })
    expect(s.baslik).toMatch(/M1 Oda 101 doğrulandı/)
  })

  // Yanlış kapı görevlinin hatası değil; mesaj onu suçlamamalı, ne yapacağını
  // söylemeli. Ve kesinlikle ilerlememeli.
  it('yanlış kapıda ne yapılacağını söyler ve ilerlemez', () => {
    const s = taramaSonucu(
      { ok: false, code: 'location_mismatch', scanned: { display_name: 'M1 Oda 102' } },
      { display_name: 'M1 Oda 101' },
    )
    expect(s.tur).toBe('uyusmazlik')
    expect(s.ilerle).toBe(false)
    expect(s.detay).toMatch(/M1 Oda 101 olmalıydı/)
    expect(s.detay).toMatch(/M1 Oda 102/)
    expect(s.detay).toMatch(/yer değiştirin/)
  })

  it('iptal edilmiş etikette sökme talimatı verir', () => {
    const s = taramaSonucu({ ok: false, code: 'qr_revoked', scanned: { display_name: 'S1 Oda 105' } })
    expect(s.tur).toBe('bayat')
    expect(s.detay).toMatch(/Sökün/)
    expect(s.ilerle).toBe(false)
  })

  it('tanınmayan QR’da yöneticiye bildirmeyi söyler', () => {
    expect(taramaSonucu({ ok: false, code: 'qr_unknown' })).toMatchObject({ tur: 'taninmiyor', ilerle: false })
  })

  // Yanıt gelmediyse başarı sayılmamalı — çevrimdışı sahada en olası durum.
  it('yanıt yoksa başarı saymaz', () => {
    const s = taramaSonucu(null)
    expect(s.tur).toBe('hata')
    expect(s.ilerle).toBe(false)
  })
})

describe('token ayıklama', () => {
  it('tam URL’den token çıkarır', () => {
    expect(tokenAyikla('https://avskamp.com/r/' + 'a'.repeat(43))).toBe('a'.repeat(43))
  })

  it('sorgu ve çapa eklerini atar', () => {
    expect(tokenAyikla('https://avskamp.com/r/' + 'b'.repeat(43) + '?utm=qr#x')).toBe('b'.repeat(43))
  })

  it('çıplak token’ı olduğu gibi döndürür', () => {
    expect(tokenAyikla('c'.repeat(43))).toBe('c'.repeat(43))
  })

  it('çok kısa ve boş girdiyi reddeder', () => {
    expect(tokenAyikla('kisa')).toBeNull()
    expect(tokenAyikla('')).toBeNull()
    expect(tokenAyikla(null)).toBeNull()
  })
})

describe('elle işaretleme uyarısı', () => {
  // Elle "astım" demek, yerinde doğrulamanın yerini tutmaz.
  it('bilinmeyende doğrulama sayılmayacağını söyler', () => {
    expect(elleIsaretUyarisi('unknown')).toMatch(/doğrulanmış sayılmaz/)
  })

  it('bayat etikette elle işaretin çözüm olmadığını söyler', () => {
    expect(elleIsaretUyarisi('stale')).toMatch(/çalışır hâle getirmez/)
  })

  it('diğer durumlarda okutmayı önerir', () => {
    expect(elleIsaretUyarisi('printed')).toMatch(/kamera çalışmadığında/)
  })
})
