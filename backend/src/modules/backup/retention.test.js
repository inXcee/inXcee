import { describe, it, expect } from 'vitest'
import { backupsToPrune, RETENTION } from './retention.js'

const NOW = Date.parse('2026-10-15T18:00:00Z')   // İstanbul 21:00
const at = (iso, name) => ({ name: name || `yys_${iso.replace(/[:T]/g, '-').slice(0, 19)}.db`, created_at: new Date(iso).toISOString() })

describe('Yedek saklama planı', () => {
  it('son 7 gündeki her yedek kalır', () => {
    const list = [at('2026-10-15T17:00:00Z'), at('2026-10-12T05:00:00Z'), at('2026-10-09T00:00:00Z'), at('2026-10-08T19:00:00Z')]
    expect(backupsToPrune(list, NOW)).toEqual([])
  })

  it('7–30 gün arası her gün için yalnız o günün en yeni yedeği kalır', () => {
    // 05.10 (İstanbul) dört yedek + elle alınmış pre-migration; 04.10 tek yedek
    const list = [
      at('2026-10-04T23:00:00Z', 'yys_2026-10-05_02-00-00.db'),
      at('2026-10-05T05:00:00Z', 'yys_2026-10-05_08-00-00.db'),
      at('2026-10-05T11:00:00Z', 'yys_2026-10-05_14-00-00.db'),
      at('2026-10-05T16:40:00Z', 'yys_pre-112-leave_20261005-194000.db'),
      at('2026-10-05T17:00:00Z', 'yys_2026-10-05_20-00-00.db'),
      at('2026-10-04T11:00:00Z', 'yys_2026-10-04_14-00-00.db'),
    ]
    expect(backupsToPrune(list, NOW).sort()).toEqual([
      'yys_2026-10-05_02-00-00.db', 'yys_2026-10-05_08-00-00.db', 'yys_2026-10-05_14-00-00.db',
      'yys_pre-112-leave_20261005-194000.db',
    ])
  })

  it('gün sınırı İstanbul saatine göre: 23:30 UTC ertesi güne sayılır', () => {
    const list = [at('2026-10-03T23:30:00Z', 'gece.db'), at('2026-10-03T20:00:00Z', 'aksam.db')]
    // gece.db = 04.10 02:30 İstanbul, aksam.db = 03.10 23:00 İstanbul → farklı günler, ikisi de kalır
    expect(backupsToPrune(list, NOW)).toEqual([])
  })

  it('30 günden eski silinir; pre-restore hiç silinmez', () => {
    const list = [at('2026-09-10T00:00:00Z', 'eski.db'), at('2026-08-01T00:00:00Z', 'yys_pre-restore_20260801.db')]
    expect(backupsToPrune(list, NOW)).toEqual(['eski.db'])
  })

  it('canlıdaki gibi 30 gün × 5 yedek → ~7×5 + 23 = 58 dosya kalır', () => {
    const list = []
    for (let d = 0; d < 35; d += 1) {
      for (const h of [23, 0, 5, 11, 17]) list.push(at(new Date(NOW - d * 864e5 - h * 36e5).toISOString(), `y_${d}_${h}.db`))
    }
    const kept = list.length - backupsToPrune(list, NOW).length
    expect(kept).toBeGreaterThanOrEqual(7 * 5 + 22)
    expect(kept).toBeLessThanOrEqual(7 * 5 + 24)
    expect(RETENTION).toEqual({ fullDays: 7, dailyDays: 30 })
  })
})
