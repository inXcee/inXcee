import { describe, it, expect } from 'vitest'
import {
  crossoverState, summarizeCrossover, crossoverDirections, CROSSOVER_STATE,
} from './projectCrossover.js'

const ROWS = [
  { staff_id: 1, full_name: 'ALİ VELİ', work_date: '2026-08-03', roster_project_name: 'FPU', worked_project_name: 'Kamp Alanı', work_location_name: 'Kamp' },
  { staff_id: 1, full_name: 'ALİ VELİ', work_date: '2026-08-01', roster_project_name: 'FPU', worked_project_name: 'Kamp Alanı', work_location_name: 'Kamp' },
  { staff_id: 1, full_name: 'ALİ VELİ', work_date: '2026-08-05', roster_project_name: 'FPU', worked_project_name: 'Kamp Alanı', work_location_name: 'OTC Lokal' },
  { staff_id: 2, full_name: 'AYŞE YILMAZ', work_date: '2026-08-02', roster_project_name: 'Kamp Alanı', worked_project_name: 'FPU', work_location_name: 'Tas Bina' },
]

describe('Çapraz çalışma durumu', () => {
  // Asıl tuzak: liste boş diye "çapraz çalışan yok" demek. Noktalar projeye
  // bağlanmadıysa liste zaten boş gelir — bu bir cevap değil, kurulum eksiği.
  it('boş liste + eşlenmemiş nokta = kurulmamış', () => {
    expect(crossoverState({ rows: [], setup: { unmapped_locations: 6 } }))
      .toBe(CROSSOVER_STATE.UNCONFIGURED)
  })

  it('boş liste + tüm noktalar eşli = gerçekten çapraz çalışan yok', () => {
    expect(crossoverState({ rows: [], setup: { unmapped_locations: 0 } }))
      .toBe(CROSSOVER_STATE.EMPTY)
  })

  it('satır varsa eşlenmemiş nokta olsa bile sonuç gösterilir', () => {
    expect(crossoverState({ rows: ROWS, setup: { unmapped_locations: 3 } }))
      .toBe(CROSSOVER_STATE.HAS_ROWS)
  })

  it('eksik veride patlamaz', () => {
    expect(crossoverState(null)).toBe(CROSSOVER_STATE.EMPTY)
    expect(crossoverState({})).toBe(CROSSOVER_STATE.EMPTY)
  })
})

describe('Çapraz çalışma özeti', () => {
  it('kişi bazında gün sayar', () => {
    const ozet = summarizeCrossover(ROWS)
    expect(ozet).toHaveLength(2)
    expect(ozet[0]).toMatchObject({ staffId: 1, name: 'ALİ VELİ', days: 3, rosterProject: 'FPU', workedProject: 'Kamp Alanı' })
  })

  it('en çok karşı sahada geçen üstte', () => {
    expect(summarizeCrossover(ROWS).map(x => x.name)).toEqual(['ALİ VELİ', 'AYŞE YILMAZ'])
  })

  it('ilk ve son tarihi verir, noktaları tekilleştirir', () => {
    const ali = summarizeCrossover(ROWS)[0]
    expect(ali.firstDate).toBe('2026-08-01')
    expect(ali.lastDate).toBe('2026-08-05')
    expect(ali.locations).toEqual(['Kamp', 'OTC Lokal'])
  })

  it('boş girdide boş dizi', () => {
    expect(summarizeCrossover([])).toEqual([])
    expect(summarizeCrossover()).toEqual([])
  })
})

describe('Çapraz çalışma yönleri', () => {
  it('yön bazında kişi ve gün toplar', () => {
    const yonler = crossoverDirections(ROWS)
    expect(yonler[0]).toMatchObject({ from: 'FPU', to: 'Kamp Alanı', people: 1, days: 3 })
    expect(yonler[1]).toMatchObject({ from: 'Kamp Alanı', to: 'FPU', people: 1, days: 1 })
  })

  it('boş girdide boş dizi', () => {
    expect(crossoverDirections([])).toEqual([])
  })
})
