import { describe, expect, it } from 'vitest'
import {
  acmaUyarisi,
  gunlukOrtalama,
  pinAnahtariDurumu,
  sayiGerekcesi,
  sessizlikOzeti,
  HIZMET_ANAHTARLARI,
  PIN_ANAHTARLARI,
} from './qrPortalAdmin.js'

describe('portal açma uyarısı', () => {
  // Etiketi kapıda olmayan portal, açık olsa da kimsenin ulaşamadığı hizmettir.
  it('hiçbir etiket kapıda kayıtlı değilse uyarır', () => {
    const u = acmaUyarisi({ unknown: 1078, printed: 0, installed: 0, verified: 0 })
    expect(u.seviye).toBe('uyari')
    expect(u.metin).toMatch(/okutabilecek kimse olmayabilir/)
  })

  it('yarıdan azsa oranı yazar', () => {
    const u = acmaUyarisi({ unknown: 70, installed: 20, verified: 10 })
    expect(u.seviye).toBe('uyari')
    expect(u.metin).toMatch(/%30/)
    expect(u.metin).toMatch(/30\/100/)
  })

  it('kapsama yeterliyse onaylar', () => {
    const u = acmaUyarisi({ unknown: 10, installed: 40, verified: 50 })
    expect(u.seviye).toBe('ok')
    expect(u.metin).toMatch(/90\/100/)
  })

  // Okunamayan durum "kapsama yok" diye okunmamalı.
  it('etiket durumu okunamazsa bilinmiyor der', () => {
    expect(acmaUyarisi(null).seviye).toBe('bilinmiyor')
    expect(acmaUyarisi({}).seviye).toBe('bilinmiyor')
  })
})

describe('PIN anahtarları', () => {
  // Bağlı hizmet kapalıyken PIN ayarının etkisi yok; ekranda da öyle görünmeli.
  it('bağlı hizmet kapalıysa devre dışı ve gerekçeli', () => {
    const d = pinAnahtariDurumu({ location_portal_fault_enabled: false }, PIN_ANAHTARLARI[0])
    expect(d.disabled).toBe(true)
    expect(d.hint).toMatch(/Bağlı hizmet kapalı/)
  })

  it('hizmet açıksa etkin', () => {
    const d = pinAnahtariDurumu({ location_portal_fault_enabled: true }, PIN_ANAHTARLARI[0])
    expect(d).toEqual({ disabled: false, hint: null })
  })

  it('her PIN anahtarı gerçek bir hizmete bağlıdır', () => {
    const hizmetler = HIZMET_ANAHTARLARI.map(h => h.key)
    for (const p of PIN_ANAHTARLARI) expect(hizmetler).toContain(p.bagli)
  })
})

describe('sıfırın gerekçesi', () => {
  it('portal kapalıyken sıfırı portala bağlar', () => {
    expect(sayiGerekcesi({ enabled: true, events: 0 }, false)).toBe('Portal kapalı')
  })

  it('hizmet kapalıyken sıfırı hizmete bağlar', () => {
    expect(sayiGerekcesi({ enabled: false, events: 0 }, true)).toBe('Hizmet kapalı')
  })

  // Asıl bilgi bu: her şey açık, yine de kayıt yok.
  it('her şey açıkken sıfırı olduğu gibi söyler', () => {
    expect(sayiGerekcesi({ enabled: true, events: 0 }, true)).toBe('Hizmet açık — kayıt yok')
  })

  it('kayıt varsa gerekçe üretmez', () => {
    expect(sayiGerekcesi({ enabled: true, events: 4 }, true)).toBeNull()
  })
})

describe('sessizlik özeti', () => {
  it('etiket kanıtı yokken bunun kullanım ölçüsü olmadığını söyler', () => {
    const s = sessizlikOzeti({ zero_scan_locations: 342, explained_by_label: 342, genuinely_unused: 0, measurable: false })
    expect(s.seviye).toBe('bilinmiyor')
    expect(s.metin).toMatch(/kullanım ölçüsü değil/)
  })

  it('ölçülebilirse üç sayıyı ayrı ayrı verir', () => {
    const s = sessizlikOzeti({ zero_scan_locations: 10, explained_by_label: 7, genuinely_unused: 3, measurable: true })
    expect(s.metin).toMatch(/10 konum hiç okutulmadı/)
    expect(s.metin).toMatch(/7 tanesinde etiket kapıda değil/)
    expect(s.metin).toMatch(/gerçekten kullanılmayan 3/)
  })

  it('sessiz konum yoksa olumlu döner', () => {
    expect(sessizlikOzeti({ zero_scan_locations: 0 }).seviye).toBe('ok')
  })

  it('veri yoksa null döner', () => {
    expect(sessizlikOzeti(null)).toBeNull()
  })
})

describe('günlük ortalama', () => {
  // Ölçülemeyen pencerede ortalama üretmek uydurmadır.
  it('pencere ölçülemezse sayı üretmez', () => {
    const o = gunlukOrtalama({ measurable: false, note: 'Hiç portal olayı kaydedilmemiş' }, 0)
    expect(o.measurable).toBe(false)
    expect(o.reason).toMatch(/Hiç portal olayı/)
  })

  it('aralık uçları eksikse sayı üretmez', () => {
    expect(gunlukOrtalama({ measurable: true, data_from: null, data_to: null }, 50).measurable).toBe(false)
  })

  it('gerçek veri aralığına böler', () => {
    const o = gunlukOrtalama({ measurable: true, data_from: '2026-08-01', data_to: '2026-08-10' }, 50)
    expect(o.days).toBe(10)
    expect(o.value).toBe(5)
  })

  it('tek günlük veride bölme sıfıra düşmez', () => {
    const o = gunlukOrtalama({ measurable: true, data_from: '2026-08-01', data_to: '2026-08-01' }, 7)
    expect(o.days).toBe(1)
    expect(o.value).toBe(7)
  })
})
