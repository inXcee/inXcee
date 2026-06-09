import { describe, it, expect } from 'vitest'
import { allocateScenario } from './whatIf.js'

// bed-occupancy şekli: { block, total_beds, occupied, empty }
const blocks = [
  { block: 'A', total_beds: 20, occupied: 5, empty: 15 },
  { block: 'B', total_beds: 20, occupied: 18, empty: 2 },
  { block: 'M1', total_beds: 360, occupied: 300, empty: 60 },
]

describe('allocateScenario', () => {
  it('tek bloğa sığıyorsa tek blok kullanır (fewest: en boş önce)', () => {
    const r = allocateScenario(blocks, 10, 'fewest')
    expect(r.placed).toBe(10)
    expect(r.shortfall).toBe(0)
    expect(r.allocations).toEqual([
      { block: 'M1', take: 10, emptyBefore: 60, emptyAfter: 50 },
    ])
  })

  it('taşarsa sıradaki en boş bloğa devam eder', () => {
    const r = allocateScenario(blocks, 70, 'fewest')
    expect(r.placed).toBe(70)
    expect(r.allocations.map(a => [a.block, a.take])).toEqual([['M1', 60], ['A', 10]])
  })

  it('toplam boş yatak yetmezse shortfall raporlar', () => {
    const r = allocateScenario(blocks, 100, 'fewest')
    expect(r.placed).toBe(77) // 60+15+2
    expect(r.shortfall).toBe(23)
  })

  it('balanced: en düşük doluluk oranlı bloktan başlar', () => {
    const r = allocateScenario(blocks, 10, 'balanced')
    // A %25 dolu (en düşük) → önce A
    expect(r.allocations[0].block).toBe('A')
  })

  it('0 ya da geçersiz sayı boş plan döndürür', () => {
    expect(allocateScenario(blocks, 0).allocations).toEqual([])
    expect(allocateScenario(blocks, -5).allocations).toEqual([])
  })
})
