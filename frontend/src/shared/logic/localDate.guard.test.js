// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ymd } from './localDate.js'

// toISOString() UTC'dir: TR'de (UTC+3) 00:00–03:00 arası "bugün" DÜNÜ verir. Gececi personel ekranları
// (vardiya, ulaşım, temizlik, self-servis) gece yarısından sonra dünün verisini açıyordu (9 Eki 2026: 46 yer).
// Tarih metni her zaman localDate.js (ymd / todayStr / addDays) ile üretilir.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const UTC_DAY = /toISOString\(\)\.(?:slice\(0, ?10\)|split\('T'\)\[0\]|substring\(0, ?10\))/

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) files(p, out)
    else if (/\.(js|jsx)$/.test(e.name) && !/\.test\./.test(e.name) && !p.endsWith(`localDate.js`)) out.push(p)
  }
  return out
}

describe('yerel gün koruması', () => {
  it('src altında toISOString() ile gün üretilmez', () => {
    const bad = files(SRC).filter(f => UTC_DAY.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(SRC, f))
    expect(bad).toEqual([])
  })

  it('ymd yerel gece yarısını kendi gününde tutar (eski kalıp dünü verirdi)', () => {
    const geceYarisi = new Date(2026, 9, 10, 0, 30) // 10 Ekim 00:30 yerel
    expect(ymd(geceYarisi)).toBe('2026-10-10')
  })
})
