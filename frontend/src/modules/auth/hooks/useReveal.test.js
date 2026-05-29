import { renderHook, render, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
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

  it('viewport\'a girince visible true olur', () => {
    let captured
    global.IntersectionObserver = vi.fn((cb) => { captured = cb; return { observe: vi.fn(), disconnect: vi.fn() } })
    let visibleVal
    function Probe() {
      const [ref, visible] = useReveal()
      visibleVal = visible
      return React.createElement('div', { ref })
    }
    render(React.createElement(Probe))
    act(() => captured([{ isIntersecting: true }]))
    expect(visibleVal).toBe(true)
  })
})
