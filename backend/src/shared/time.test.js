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
