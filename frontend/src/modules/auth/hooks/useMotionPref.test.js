import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMotionPref } from './useMotionPref.js'

describe('useMotionPref', () => {
  beforeEach(() => {
    // jsdom localStorage stub — tam Storage API'si sağlar
    const store = {}
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
      clear: () => { for (const k in store) delete store[k] },
    })
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  })

  it('varsayılan motion "slow", rain açık', () => {
    const { result } = renderHook(() => useMotionPref())
    expect(result.current.motion).toBe('slow')
    expect(result.current.rain).toBe(true)
  })

  it('reduced-motion: motion "calm", rain kapalı', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const { result } = renderHook(() => useMotionPref())
    expect(result.current.motion).toBe('calm')
    expect(result.current.rain).toBe(false)
    expect(result.current.reduced).toBe(true)
  })

  it('setMotion localStorage\'a yazar', () => {
    const { result } = renderHook(() => useMotionPref())
    act(() => result.current.setMotion('normal'))
    expect(result.current.motion).toBe('normal')
    expect(localStorage.getItem('yys-login-motion')).toBe('normal')
  })

  it('OS reduced-motion değişince motion calm + rain false olur', () => {
    let mqHandler
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: (_e, h) => { mqHandler = h },
      removeEventListener: vi.fn(),
    })
    const { result } = renderHook(() => useMotionPref())
    expect(result.current.reduced).toBe(false)
    act(() => mqHandler({ matches: true }))
    expect(result.current.motion).toBe('calm')
    expect(result.current.rain).toBe(false)
    expect(result.current.reduced).toBe(true)
  })
})
