import { describe, it, expect, afterEach, vi } from 'vitest'
import { ymd, toLocalDate, startOfWeek, addDays, parseSqlUtc, utcSqlToLocalYmd } from './localDate.js'

// Tarihler UTC'ye çevrilip geri okunuyordu: Türkiye UTC+3 olduğu için yerel
// gece yarısı ile 03:00 arasında toISOString() BİR ÖNCEKİ günü veriyordu.
// Vardiya sistemi gece de kullanılıyor — "bugün" dünü, hafta başı bir önceki
// haftayı gösteriyordu. Bu testler o saat aralığını özellikle deniyor.
const GECE = new Date(2026, 7, 8, 0, 30)   // 8 Ağustos 2026 Cumartesi 00:30
const SABAH = new Date(2026, 7, 8, 9, 30)

afterEach(() => vi.useRealTimers())

describe('ymd', () => {
  it('yerel takvim gününü verir, UTC gününü değil', () => {
    expect(ymd(GECE)).toBe('2026-08-08')
    expect(ymd(SABAH)).toBe('2026-08-08')
  })

  it('ay ve günü iki haneye tamamlar', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('toLocalDate', () => {
  it('metni yerel gün olarak okur (UTC gece yarısı değil)', () => {
    expect(toLocalDate('2026-08-08').getDate()).toBe(8)
    expect(toLocalDate('2026-08-08').getHours()).toBe(0)
  })

  it('Date girdisini saatinden arındırır', () => {
    expect(ymd(toLocalDate(GECE))).toBe('2026-08-08')
  })
})

describe('startOfWeek', () => {
  // Kullanıcı "takvime göre yeni haftadan başlasın" dedi: hafta pazartesi başlar.
  it('haftayı pazartesiye çeker', () => {
    expect(startOfWeek(new Date(2026, 7, 8))).toBe('2026-08-03')   // Cumartesi
    expect(startOfWeek(new Date(2026, 7, 3))).toBe('2026-08-03')   // Pazartesi
    expect(startOfWeek(new Date(2026, 7, 9))).toBe('2026-08-03')   // Pazar
    expect(startOfWeek(new Date(2026, 7, 10))).toBe('2026-08-10')  // sonraki Pazartesi
  })

  // Asıl hata buydu: gece yarısından sonra hafta bir gün geri kayıyordu.
  it('gece yarısı ile 03:00 arasında da doğru haftayı verir', () => {
    expect(startOfWeek(GECE)).toBe('2026-08-03')
    expect(startOfWeek(new Date(2026, 7, 8, 2, 59))).toBe('2026-08-03')
  })

  it('ay ve yıl sınırını doğru geçer', () => {
    expect(startOfWeek(new Date(2026, 0, 1))).toBe('2025-12-29')
  })
})

describe('addDays', () => {
  it('gün ekler ve çıkarır', () => {
    expect(addDays('2026-08-08', 1)).toBe('2026-08-09')
    expect(addDays('2026-08-08', -1)).toBe('2026-08-07')
    expect(addDays('2026-08-08', 7)).toBe('2026-08-15')
  })

  it('ay ve yıl sınırını doğru geçer', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  // Yaz saati uygulaması olan bölgelerde saat kaydırması gün atlatabiliyor.
  it('gün atlamaz: 7 gün eklemek hep aynı hafta gününü verir', () => {
    const bir = '2026-03-25'
    expect(new Date(addDays(bir, 7)).getDay()).toBe(new Date(bir).getDay())
  })
})

// Sunucu zaman damgaları SQLite datetime('now') biçiminde UTC'dir: '2026-10-22 22:30:00' (Z'siz).
// `new Date('2026-10-22 22:30:00')` bunu YEREL saat sanar (İstanbul'da 3 saat kayar), `.startsWith(bugün)`
// ise UTC gününe bakar: gece 00:00–03:00 arası açılan arıza 'bugün' sayılmıyordu.
describe('parseSqlUtc', () => {
  it('Z\'siz SQLite metnini UTC an olarak okur', () => {
    expect(parseSqlUtc('2026-10-22 22:30:00').getTime()).toBe(Date.UTC(2026, 9, 22, 22, 30))
  })

  it('zaten ISO (Z ya da ofsetli) değeri olduğu gibi okur', () => {
    expect(parseSqlUtc('2026-10-22T22:30:00Z').getTime()).toBe(Date.UTC(2026, 9, 22, 22, 30))
    expect(parseSqlUtc('2026-10-23T01:30:00+03:00').getTime()).toBe(Date.UTC(2026, 9, 22, 22, 30))
  })

  it('boş ya da bozuk değerde null döner', () => {
    expect(parseSqlUtc(null)).toBeNull()
    expect(parseSqlUtc('')).toBeNull()
    expect(parseSqlUtc('tarih değil')).toBeNull()
  })
})

describe('utcSqlToLocalYmd', () => {
  it('UTC zaman damgasının yerel takvim gününü verir', () => {
    // İstanbul'da 23 Ekim 01:30 — metnin ilk 10 hanesi (UTC günü) 22 Ekim diyor
    expect(utcSqlToLocalYmd('2026-10-22 22:30:00')).toBe(ymd(new Date(Date.UTC(2026, 9, 22, 22, 30))))
  })

  it('boş değerde null döner', () => {
    expect(utcSqlToLocalYmd(undefined)).toBeNull()
  })
})
