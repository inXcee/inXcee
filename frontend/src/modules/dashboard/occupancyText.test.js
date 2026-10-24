import { describe, expect, it } from 'vitest'
import { occupancySubtitle } from './occupancyText.js'

// Panel "Doluluk" KPI alt satırı: saha verisi varsa oda bazlı kapsam, yoksa yatak sayısı (spec §8).
describe('occupancySubtitle', () => {
  it('yatak bazlı kaynakta dolu / toplam yatak', () => {
    expect(occupancySubtitle({ occupancy_source: 'beds', occupied: 12, total_beds: 6276 })).toBe('12/6276 yatak')
  })

  it('saha kaynağında dolu / oda ve bilinmeyen sayısı', () => {
    expect(occupancySubtitle({ occupancy_source: 'field', rooms_occupied: 412, rooms_empty: 214, rooms_unknown: 214 }))
      .toBe('412 dolu / 840 oda · 214 bilinmiyor')
  })

  it('bilinmeyen yoksa kapsam kısmı yazılmaz', () => {
    expect(occupancySubtitle({ occupancy_source: 'field', rooms_occupied: 3, rooms_empty: 1, rooms_unknown: 0 })).toBe('3 dolu / 4 oda')
  })
})
