import { describe, it, expect } from 'vitest'
import { splitNavTabs } from './navTabs.js'

const mk = n => Array.from({ length: n }, (_, i) => ({ key: `t${i}`, label: `T${i}` }))

describe('splitNavTabs', () => {
  it('maxSlots altında/eşit → hepsi birincil, taşan yok', () => {
    const { primary, overflow } = splitNavTabs(mk(5), 5)
    expect(primary).toHaveLength(5)
    expect(overflow).toHaveLength(0)
  })

  it('maxSlots üstünde → ilk (max-1) birincil + kalan taşar (kiosk: 9 sekme, max 5)', () => {
    const { primary, overflow } = splitNavTabs(mk(9), 5)
    expect(primary).toHaveLength(4)
    expect(overflow).toHaveLength(5)
    expect(primary[0].key).toBe('t0')
    expect(overflow[0].key).toBe('t4')
  })

  it('birincil + taşan birleşimi tüm sekmeleri ve sırayı korur', () => {
    const tabs = mk(9)
    const { primary, overflow } = splitNavTabs(tabs, 5)
    expect([...primary, ...overflow].map(t => t.key)).toEqual(tabs.map(t => t.key))
  })

  it('tek fazla sekme bile taşmayı tetikler (6 > 5)', () => {
    const { primary, overflow } = splitNavTabs(mk(6), 5)
    expect(primary).toHaveLength(4)
    expect(overflow).toHaveLength(2)
  })

  it('boş/geçersiz girdi güvenli', () => {
    expect(splitNavTabs([], 5)).toEqual({ primary: [], overflow: [] })
    expect(splitNavTabs(null, 5)).toEqual({ primary: [], overflow: [] })
  })
})
