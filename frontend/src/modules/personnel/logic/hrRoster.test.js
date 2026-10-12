import { describe, it, expect } from 'vitest'
import { ageLabel, fmtDate, maskTc, fillSummary, runLine } from './hrRoster.js'

describe('İK kadro yardımcıları', () => {
  it('yaş etiketi', () => {
    expect(ageLabel(0.2)).toBe('az önce')
    expect(ageLabel(5)).toBe('5 saat önce')
    expect(ageLabel(50)).toBe('2 gün önce')
  })
  it('TC maskelenir, tarih TR biçiminde', () => {
    expect(maskTc('10000000146')).toBe('100******46')
    expect(fmtDate('2026-10-05')).toBe('05.10.2026')
  })
  it('doldurma özeti proje id yazmaz', () => {
    expect(fillSummary({ tc_no: '10000000146', hire_date: '2025-05-05', position: 'Aşçı', project_id: 2 }))
      .toBe('TC: 100******46 · işe giriş: 05.05.2025 · görev: Aşçı · proje')
  })
  it('ajan turu satırı', () => {
    expect(runLine({ counts: { written: 4, conflicts: 2, manual: 2, unmatched: 10 } }))
      .toBe('4 hücre yazıldı · 2 çakışma · 2 elle işlenecek · 10 eşleşmeyen ad')
    expect(runLine({ counts: { written: 0 } })).toBe('0 hücre yazıldı')
    expect(runLine(null)).toBeNull()
  })
})
