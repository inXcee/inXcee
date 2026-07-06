import { describe, it, expect } from 'vitest'
import { HOLDER_LABEL, fmtTs, PRESENCE_EXPORT_COLS, presenceFilename } from './presenceExport.js'

const col = (key) => PRESENCE_EXPORT_COLS.find(c => c.key === key)

describe('presenceExport', () => {
  it('holder türünü Türkçe etikete çevirir, bilinmeyeni aynen geçirir', () => {
    const c = col('holder_type')
    expect(c.format({ holder_type: 'staff' })).toBe('Personel')
    expect(c.format({ holder_type: 'personnel' })).toBe('İşçi')
    expect(c.format({ holder_type: 'visitor' })).toBe('Ziyaretçi')
    expect(c.format({ holder_type: 'other' })).toBe('other')
  })

  it('ad boşsa "Bilinmiyor" yazar', () => {
    const c = col('full_name')
    expect(c.format({ full_name: 'Ali Veli' })).toBe('Ali Veli')
    expect(c.format({ full_name: null })).toBe('Bilinmiyor')
    expect(c.format({})).toBe('Bilinmiyor')
  })

  it('giriş zamanı yoksa "—" döner, varsa biçimlenir', () => {
    const c = col('since')
    expect(c.format({ since: null })).toBe('—')
    const out = c.format({ since: '2026-05-31 18:30:00' })
    expect(out).not.toBe('—')
    // tr-TR locale: gün/ay + saat:dakika (ayraç ortama göre . veya / olabilir)
    expect(out).toContain('31')
    expect(out).toContain('05')
    expect(out).toMatch(/18[:.]30/)
  })

  it('fmtTs geçersiz tarihte ham değeri döndürür', () => {
    expect(fmtTs('not-a-date')).toBe('not-a-date')
    expect(fmtTs(null)).toBe('—')
  })

  it('export kolonları Ad/Tür/Giriş sırasında ve etiketli', () => {
    expect(PRESENCE_EXPORT_COLS.map(c => c.label)).toEqual(['Ad', 'Tür', 'Giriş'])
  })

  it('dosya adı tarih damgalı', () => {
    expect(presenceFilename('xlsx')).toMatch(/^iceridekiler-\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(presenceFilename('csv')).toMatch(/^iceridekiler-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('HOLDER_LABEL üç türü kapsar', () => {
    expect(HOLDER_LABEL).toMatchObject({ staff: 'Personel', personnel: 'İşçi', visitor: 'Ziyaretçi' })
  })
})
