import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useReveal } from './useReveal.js'

describe('useReveal', () => {
  beforeEach(() => {
    global.IntersectionObserver = vi.fn((cb) => ({ observe: vi.fn(), disconnect: vi.fn() }))
  })

  it('başlangıçta görünmez (false)', () => {
    const { result } = renderHook(() => useReveal())
    expect(result.current[1]).toBe(false)
  })

  it('reduced-motion ise anında görünür (true)', () => {
    const { result } = renderHook(() => useReveal(true))
    expect(result.current[1]).toBe(true)
  })
})
