// "Bugün" İstanbul takvim günüdür. new Date().toISOString() UTC'dir: TR'de (UTC+3)
// 00:00–03:00 arası DÜNÜ verir — gece vardiyası servis bilgisini, vardiya ekranları
// varsayılan günü bir gün geriden görüyordu. Bugün her zaman shared/time.js
// istanbulDate() ile üretilir (frontend'deki localDate.guard.test.js'in eşi).
//
// Bilinçli UTC kullanımı (ör. SQLite CURRENT_TIMESTAMP ile karşılaştırma, dedup
// kovası) satıra `utc-bilinçli` yorumu eklenerek işaretlenir.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { istanbulDate } from './time.js'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NOW_UTC_DAY = /new Date\(\)\.toISOString\(\)\.(?:(?:slice|substring|substr)\(0, ?(?:10|7)\)|split\('T'\)\[0\])/

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') files(p, out)
    } else if (/\.js$/.test(e.name) && !/\.test\./.test(e.name) && !p.includes(`${path.sep}db${path.sep}seed`)) {
      out.push(p)
    }
  }
  return out
}

describe('İstanbul günü koruması (backend)', () => {
  it('src altında "bugün" / "bu ay" new Date().toISOString() ile üretilmez', () => {
    const bad = []
    for (const f of files(SRC)) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (NOW_UTC_DAY.test(line) && !line.includes('utc-bilinçli')) bad.push(`${path.relative(SRC, f)}:${i + 1}`)
      })
    }
    expect(bad).toEqual([])
  })

  it('istanbulDate gece yarısından sonra İstanbul gününü verir (UTC dünü vermez)', () => {
    // 18 Eki 2026 22:30 UTC = 19 Eki 01:30 İstanbul
    expect(istanbulDate(new Date('2026-10-18T22:30:00Z'))).toBe('2026-10-19')
    expect(new Date('2026-10-18T22:30:00Z').toISOString().slice(0, 10)).toBe('2026-10-18')
  })
})
