import { describe, it, expect } from 'vitest'
import { groupPuantajRows, groupKeyOf } from './puantajSummary.js'

const SATIRLAR = [
  { dept_name: 'Mutfak', project_name: 'FPU', worked_days: 20, absent_days: 1, overtime_hours: 4, leave_days: 2, gross: 1000, net: 800, employer_total_cost: 1200 },
  { dept_name: 'Temizlik', project_name: 'FPU', worked_days: 22, absent_days: 0, overtime_hours: 0, leave_days: 0, gross: 900, net: 700, employer_total_cost: 1100 },
  { dept_name: 'Mutfak', project_name: 'Kamp Alanı', worked_days: 18, absent_days: 3, overtime_hours: 6, leave_days: 1, gross: 800, net: 600, employer_total_cost: 950 },
  { dept_name: 'Mutfak', project_name: null, worked_days: 10, absent_days: 0, overtime_hours: 0, leave_days: 0, gross: 400, net: 300, employer_total_cost: 500 },
]

describe('Puantaj özeti gruplama', () => {
  it('departmana göre gruplar', () => {
    const g = groupPuantajRows(SATIRLAR, 'dept')
    const mutfak = g.find(x => x.name === 'Mutfak')
    expect(mutfak.staff).toBe(3)
    expect(mutfak.worked).toBe(48)
    expect(mutfak.employer).toBe(2650)
    expect(g.map(x => x.name)).toContain('Temizlik')
  })

  it('projeye göre gruplar', () => {
    const g = groupPuantajRows(SATIRLAR, 'project')
    const fpu = g.find(x => x.name === 'FPU')
    expect(fpu.staff).toBe(2)
    expect(fpu.worked).toBe(42)
    expect(fpu.gross).toBe(1900)
    expect(fpu.employer).toBe(2300)
    expect(g.find(x => x.name === 'Kamp Alanı').staff).toBe(1)
  })

  // Kadrosu olmayan kişi bir projeye karışırsa o projenin maliyeti yanlış okunur.
  it('kadrosu olmayan kişi ayrı kovada toplanır', () => {
    const g = groupPuantajRows(SATIRLAR, 'project')
    const belirsiz = g.find(x => x.name === 'Kadrosu belirsiz')
    expect(belirsiz.staff).toBe(1)
    expect(belirsiz.employer).toBe(500)
    expect(g.find(x => x.name === 'FPU').staff).toBe(2)
  })

  it('en pahalı grup üstte gelir', () => {
    const g = groupPuantajRows(SATIRLAR, 'project')
    expect(g.map(x => x.name)).toEqual(['FPU', 'Kamp Alanı', 'Kadrosu belirsiz'])
  })

  it('boş liste boş dizi döner', () => {
    expect(groupPuantajRows([], 'project')).toEqual([])
    expect(groupPuantajRows(undefined)).toEqual([])
  })

  it('eksik ad varsayılana düşer', () => {
    expect(groupKeyOf({}, 'dept')).toBe('Departmansız')
    expect(groupKeyOf({}, 'project')).toBe('Kadrosu belirsiz')
  })
})
