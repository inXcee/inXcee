import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCountUp } from './useCountUp.js'

describe('useCountUp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // rAF stub: passes Date.now() as timestamp so fake timer advances are visible to the hook
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 16))
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('aktif değilken 0 döner', () => {
    const { result } = renderHook(() => useCountUp(100, false))
    expect(result.current).toBe(0)
  })

  it('aktif olunca hedefe yükselir', () => {
    const { result } = renderHook(() => useCountUp(100, true, 500))
    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current).toBe(100)
  })

  it('reduced-motion: anında hedef', () => {
    const { result } = renderHook(() => useCountUp(50, true, 500, true))
    expect(result.current).toBe(50)
  })
})
