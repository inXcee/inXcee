import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsNarrow, useMediaQuery } from './useMediaQuery.js'

const install = (matches, { legacy = false } = {}) => {
  const listeners = new Set()
  const list = {
    matches,
    media: '',
    ...(legacy
      ? { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
      : { addEventListener: (_e, fn) => listeners.add(fn), removeEventListener: (_e, fn) => listeners.delete(fn) }),
  }
  window.matchMedia = vi.fn(() => list)
  return { list, fire: value => { list.matches = value; listeners.forEach(fn => fn({ matches: value })) }, listeners }
}

afterEach(() => { delete window.matchMedia })

describe('useMediaQuery', () => {
  it('başlangıç değerini matchMedia’dan alır', () => {
    install(true)
    const { result } = renderHook(() => useMediaQuery('(max-width: 900px)'))
    expect(result.current).toBe(true)
  })

  it('ekran değişince günceller', () => {
    const mq = install(false)
    const { result } = renderHook(() => useMediaQuery('(max-width: 900px)'))
    expect(result.current).toBe(false)
    act(() => mq.fire(true))
    expect(result.current).toBe(true)
  })

  it('eski Safari addListener API’siyle de çalışır', () => {
    const mq = install(false, { legacy: true })
    const { result } = renderHook(() => useMediaQuery('(max-width: 900px)'))
    act(() => mq.fire(true))
    expect(result.current).toBe(true)
  })

  it('unmount’ta dinleyiciyi bırakır', () => {
    const mq = install(false)
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 900px)'))
    expect(mq.listeners.size).toBe(1)
    unmount()
    expect(mq.listeners.size).toBe(0)
  })

  it('matchMedia yoksa güvenle false döner', () => {
    delete window.matchMedia
    const { result } = renderHook(() => useMediaQuery('(max-width: 900px)'))
    expect(result.current).toBe(false)
  })

  it('useIsNarrow eşiği sorguya çevirir', () => {
    install(false)
    renderHook(() => useIsNarrow(900))
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 900px)')
  })
})
