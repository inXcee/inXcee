import { describe, it, expect } from 'vitest'
import { replaceSheetName, signatureReportText } from './signatureReport.js'

describe('replaceSheetName', () => {
  it('yalnız satır başındaki tam ismi değiştirir, numarayı ve işareti korur', () => {
    const text = '1. Mehmt Kaya - off\nMehmt Kayalı\nAyşe Demir - rapor - Mehmt Kaya söyledi\nMehmt Kaya\t✓\t✓\t✓'
    expect(replaceSheetName(text, 'Mehmt Kaya', 'Mehmet Kaya')).toBe(
      '1. Mehmet Kaya - off\nMehmt Kayalı\nAyşe Demir - rapor - Mehmt Kaya söyledi\nMehmet Kaya\t✓\t✓\t✓',
    )
  })

  it('regex özel karakterlerinden etkilenmez', () => {
    expect(replaceSheetName('A.(B) - off', 'A.(B)', 'Ali Bek')).toBe('Ali Bek - off')
  })
})

describe('signatureReportText', () => {
  const base = {
    dates: ['2026-10-07'],
    summary: { signed_ok: 3, not_working_ok: 1, warnings: 1 },
    items: [
      { full_name: 'Ayşe Demir', date: '2026-10-07', mark: 'blank', level: 'warn', text: 'çizelgede çalışıyor ama imza yok' },
      { full_name: 'Can Er', date: '2026-10-07', mark: 'signed', level: 'ok', text: 'imzalı' },
    ],
    unmatched: [{ name: 'Mehmt Kaya', reason: 'isim personel listesinde bulunamadı', suggestions: [{ full_name: 'Mehmet Kaya' }] }],
    not_on_sheet: [{ full_name: 'Burak Ak', date: '2026-10-07' }],
  }

  it('uyarı, eşleşmeyen + öneri ve föyde olmayanları yazar; sorunsuzları yazmaz', () => {
    const t = signatureReportText(base)
    expect(t).toMatch(/— 07\.10/)
    expect(t).toMatch(/• Ayşe Demir — Boş: çizelgede çalışıyor ama imza yok/)
    expect(t).toMatch(/Mehmt Kaya: .* → Mehmet Kaya\?/)
    expect(t).toMatch(/föyde yok \(1\):\n• Burak Ak/)
    expect(t).not.toMatch(/Can Er/)
  })

  it('çok günlükte aralık ve satır tarihi gösterir', () => {
    const t = signatureReportText({ ...base, dates: ['2026-10-05', '2026-10-11'] })
    expect(t).toMatch(/05\.10–11\.10/)
    expect(t).toMatch(/Ayşe Demir \(07\.10\)/)
  })

  it('fark yoksa açıkça söyler', () => {
    const t = signatureReportText({ ...base, items: [], unmatched: [], not_on_sheet: [], summary: { signed_ok: 2, not_working_ok: 0, warnings: 0 } })
    expect(t).toMatch(/✅ Fark yok/)
  })
})
