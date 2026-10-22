// Gösterge "bugün" = İstanbul günü (Ekim 2026 taraması). Eskiden DATE(check_out_date) = DATE('now') UTC günü
// karşılaştırıyordu: İstanbul 00:30'daki çıkış (UTC'de dün 21:30) bugünün çıkışı sayılmıyordu.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { istanbulDayBoundsUtc } from '../../shared/time.js'
import { getAnomalies } from './queries.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
})

describe('anomali kuralları İstanbul gününe göre sayar', () => {
  it('İstanbul 00:30 çıkışları bugünün ani doluluk düşüşüne girer', () => {
    const start = new Date(istanbulDayBoundsUtc().from.replace(' ', 'T') + 'Z')
    start.setUTCMinutes(30)
    const earlyToday = start.toISOString().slice(0, 19).replace('T', ' ') // utc-bilinçli: UTC metin kolonu
    const ins = getDB().prepare(`INSERT INTO personnel(full_name, check_in_date, check_out_date)
      VALUES(?, datetime('now', '-40 days'), ?)`)
    for (let i = 0; i < 6; i++) ins.run(`Gece Çıkış ${i}`, earlyToday)

    const { anomalies } = getAnomalies()
    expect(anomalies.find(a => a.id === 'occ-drop')?.detail).toMatch(/^Bugün 6 çıkış/)
  })
})
