import { describe, it, expect } from 'vitest'
import { mergeOrder, moveInOrder } from './useDashboardLayout.js'

describe('useDashboardLayout helpers', () => {
  it('mergeOrder: kayıtlı sıra önce, yeni id sona, bilinmeyen düşer', () => {
    expect(mergeOrder(['a', 'b', 'c'], ['c', 'a'])).toEqual(['c', 'a', 'b'])
    expect(mergeOrder(['a', 'b'], [])).toEqual(['a', 'b'])
    expect(mergeOrder(['a', 'b'], ['x', 'a'])).toEqual(['a', 'b'])
    expect(mergeOrder(['a', 'b', 'c'], undefined)).toEqual(['a', 'b', 'c'])
  })

  it('moveInOrder: yukarı/aşağı taşır, sınırda değişmez, bilinmeyen no-op', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c'])
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b'])
    expect(moveInOrder(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c'])
    expect(moveInOrder(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c'])
    expect(moveInOrder(['a', 'b', 'c'], 'z', 'up')).toEqual(['a', 'b', 'c'])
  })
})
