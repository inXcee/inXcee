import { describe, it, expect } from 'vitest'
import { gateStatus, staffInfoComplete, missingLocationLines } from './importGate.js'

const report = {
  blockers: [
    { kind: 'unknown_codes', message: 'kod', items: [{ code: 'PROTOKOL', count: 10, examples: [] }] },
    { kind: 'ambiguous_staff', message: 'fuzzy', items: [{ excelName: 'MELIKE', matchedTo: 'MELİKE' }] },
    { kind: 'new_staff_incomplete', message: 'yeni', items: [{ name: 'A KİŞİ' }, { name: 'B KİŞİ' }, { name: 'C KİŞİ' }] },
  ],
}
const full = { hire_date: '2026-10-01', position: 'Garson', project_id: 2 }

describe('importGate', () => {
  it('hiçbir çözüm yokken üç engel açık', () => {
    expect(gateStatus(report).open.map(b => b.kind)).toEqual(['unknown_codes', 'ambiguous_staff', 'new_staff_incomplete'])
  })

  it('kod/eşleşme onayı + her yeni kişi için bilgi, atlama ya da eşleştirme → çözüldü', () => {
    const st = gateStatus(report, {
      confirm: { unrecognized: true, fuzzy: true },
      newStaff: { 'A KİŞİ': full },
      skipNames: ['B KİŞİ'],
      mappings: { 'C KİŞİ': 42 },
    })
    expect(st.resolved).toBe(true)
  })

  it('eksik alanlı kişi açık kalır', () => {
    const st = gateStatus(report, {
      confirm: { unrecognized: true, fuzzy: true },
      newStaff: { 'A KİŞİ': { ...full, position: ' ' } },
      skipNames: ['B KİŞİ', 'C KİŞİ'],
    })
    expect(st.resolved).toBe(false)
    expect(st.open[0].items.map(i => i.name)).toEqual(['A KİŞİ'])
  })

  it('staffInfoComplete tarih biçimini ister', () => {
    expect(staffInfoComplete(full)).toBe(true)
    expect(staffInfoComplete({ ...full, hire_date: '01.10.2026' })).toBe(false)
  })

  it('eksik görev yeri satırları kişi/gün', () => {
    expect(missingLocationLines([{ name: 'X', deptName: 'D', days: [
      { date: '2026-10-12', reason: 'empty' }, { date: '2026-10-13', reason: 'unmatched', raw: 'Lokal 9' },
    ] }])).toEqual([{ name: 'X', deptName: 'D', text: '12.10 (boş), 13.10 (tanımsız: Lokal 9)' }])
  })
})
