import { describe, expect, it } from 'vitest'
import { istanbulDate } from './time.js'

describe('istanbulDate', () => {
  it('UTC gece sinirini Europe/Istanbul gunune cevirir', () => {
    expect(istanbulDate(new Date('2026-07-25T22:30:00.000Z'))).toBe('2026-07-26')
  })

  it('gecersiz tarihi reddeder', () => {
    expect(() => istanbulDate('gecersiz')).toThrow('Gecersiz tarih')
  })
})

// Gece 00:00–03:00 (TR) arası UTC günü bir önceki gündür. Aşağıdaki dosyalarda "bugün" eskiden
// toISOString().slice(0,10) ile hesaplanıyordu: gececi 01:00'de ulaşım/QR/temizlik raporu açınca DÜNÜ görüyordu.
// Bu koruma kalıbın bu dosyalara geri gelmesini engeller (CSV dosya adı / tekrar anahtarı gibi
// zararsız kullanımlar listede yok).
describe('yerel gün koruması', () => {
  const FILES = [
    'modules/transport/routes.js', 'modules/transport/operations-service.js', 'modules/transport/queries.js',
    'modules/transport/analytics-service.js', 'modules/qr/routes.js', 'modules/self-service/routes.js',
    'modules/reports/routes/housekeeping.js', 'modules/safety/routes.js', 'modules/safety/service.js',
    'modules/personnel/dossier.js', 'modules/personnel/staff-documents.js', 'modules/personnel/queries.js',
    'modules/hr/queries.js', 'modules/email/service.js', 'modules/email/weekly.js', 'modules/drills/routes.js',
  ]
  const UTC_TODAY = /new Date\((?:Date\.now\(\)[^)]*)?\)\.toISOString\(\)\.(?:slice\(0, ?10\)|split\('T'\)\[0\])/

  it.each(FILES)('%s UTC "bugün" kullanmaz', async (rel) => {
    const fs = await import('node:fs')
    const src = fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
    expect(src).not.toMatch(UTC_TODAY)
  })
})

// SQL tarafı: date('now') / DATE('now') / strftime(..., 'now') UTC günüdür. "Bugün", "bu ay" ya da kalan gün
// İstanbul günüyle hesaplanmalı (istanbulDate(), istanbulDayBoundsUtc(), julianday(?) + bugün). Ekim 2026'da 36 kullanım
// temizlendi; bu koruma kalıbın geri gelmesini engeller. Bilerek UTC kalanlar (iç tekrar kontrolü) izin listesinde.
describe('SQL yerel gün koruması', () => {
  // "bugün" (değiştiricisiz date('now')), "bu ay" (strftime ... 'now') ve takvim günü farkı (CAST/BETWEEN ile
  // julianday('now')). Zaman damgası üzerindeki kayan pencereler (date('now','-30 days')) kapsam dışı: sınırın
  // birkaç saat kayması sonucu değiştirmez. Bilinçli istisna: satırda 'utc-bilinçli' işareti.
  const SQL_UTC_TODAY = /\b(?:date|DATE)\(\s*'now'\s*\)|strftime\(\s*'%Y-%m(?:-%d)?'\s*,\s*'now'\s*\)/
  const JULIAN_DAY_DIFF = /julianday\([^)]*\)\s*-\s*julianday\(\s*'now'\s*\)\s*(?:AS\s+INTEGER|BETWEEN)/i
  const ALLOW = new Set([
    'shared/notifications/service.js', // aynı-gün tekrar kontrolü (iç)
    'modules/laundry/whatsapp.js', // tablonun benzersiz indeksi de UTC günüyle tanımlı — tutarlı kalmalı
    'shared/db/schema.js', // fiş tarihi varsayılanı; rota istanbulDate() ile açıkça doldurur
  ])

  it('backend kaynaklarında UTC "bugün" SQL kalıbı yok', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
    const hits = []
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.js') && !e.name.includes('.test.')) {
          const rel = path.relative(root, p).replace(/\\/g, '/')
          if (ALLOW.has(rel)) continue
          fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((line, i) => {
            if (line.includes('utc-bilinçli')) return
            const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/--.*$/, '')
            if (SQL_UTC_TODAY.test(code) || JULIAN_DAY_DIFF.test(code)) hits.push(`${rel}:${i + 1}: ${line.trim()}`)
          })
        }
      }
    }
    walk(root)
    expect(hits).toEqual([])
  })
})

describe('istanbulNowNaive', () => {
  it('İstanbul yerel saatini SQLite metni olarak verir', async () => {
    const { istanbulNowNaive } = await import('./time.js')
    expect(istanbulNowNaive(new Date('2026-07-25T22:30:05.000Z'))).toBe('2026-07-26 01:30:05')
  })
})

describe('istanbulDayStartUtc', () => {
  it("İstanbul 00:00'ı UTC metnine çevirir (TR = UTC+3)", async () => {
    const { istanbulDayStartUtc } = await import('./time.js')
    expect(istanbulDayStartUtc('2026-03-01')).toBe('2026-02-28 21:00:00')
    expect(istanbulDayStartUtc('2026-01-01')).toBe('2025-12-31 21:00:00')
  })

  it('addDays ay/yıl sınırını geçer', async () => {
    const { addDays } = await import('./time.js')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -6)).toBe('2026-02-23')
  })
})
