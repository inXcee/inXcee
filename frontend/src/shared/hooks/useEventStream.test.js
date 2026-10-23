import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEventStream } from './useEventStream.js'

// Sunucuyu taklit eden akış: push(metin) olay yollar, end() sunucunun bağlantıyı kesmesidir.
function fakeServer() {
  const conns = []
  const fetchMock = vi.fn((url, { signal }) => {
    const queue = []
    let wake = null
    const conn = {
      url, signal, ended: false,
      push(text) { queue.push(new TextEncoder().encode(text)); wake?.() },
      end() { conn.ended = true; wake?.() },
    }
    signal.addEventListener('abort', () => conn.end())
    conns.push(conn)
    const reader = {
      read: () => new Promise(resolve => {
        const tryRead = () => {
          if (queue.length) { wake = null; return resolve({ done: false, value: queue.shift() }) }
          if (conn.ended) { wake = null; return resolve({ done: true, value: undefined }) }
          wake = tryRead
        }
        tryRead()
      }),
    }
    return Promise.resolve({ ok: true, body: { getReader: () => reader } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, conns }
}

const URL = '/api/notifications/stream'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Her kanca (kenar menüsü, zil, panel, doluluk…) ayrı akış açıyordu: panel sekmesi tek başına 4 akış. Sunucunun kişi
// başı 4 bağlantı sınırı ikinci sekmede aşılıyor, sunucu en eskiyi kesiyor, kanca 5 sn sonra yeniden bağlanıp bir
// başkasını düşürüyordu (11 Eki 2026: bir günde 2.755 bağlantı, bildirimler fiilen kopuk).
describe('useEventStream — paylaşılan bağlantı', () => {
  it('aynı akışa bağlanan kancalar tek bağlantı paylaşır, her olay hepsine gider', async () => {
    const { fetchMock, conns } = fakeServer()
    const a = vi.fn()
    const b = vi.fn()
    const h1 = renderHook(() => useEventStream(URL, null, a))
    const h2 = renderHook(() => useEventStream(URL, null, b))
    await vi.waitFor(() => expect(conns).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    conns[0].push('event: notification\ndata: {"id":7}\n\n')
    await vi.waitFor(() => {
      expect(a).toHaveBeenCalledWith({ event: 'notification', data: { id: 7 } })
      expect(b).toHaveBeenCalledWith({ event: 'notification', data: { id: 7 } })
    })
    h1.unmount()
    h2.unmount()
  })

  it('son kanca ayrılana kadar bağlantı açık kalır', async () => {
    const { conns } = fakeServer()
    const h1 = renderHook(() => useEventStream(URL, null, () => {}))
    const h2 = renderHook(() => useEventStream(URL, null, () => {}))
    await vi.waitFor(() => expect(conns).toHaveLength(1))
    h1.unmount()
    expect(conns[0].signal.aborted).toBe(false)
    h2.unmount()
    expect(conns[0].signal.aborted).toBe(true)
  })

  it('hemen kopan bağlantıda bekleme katlanır, uzun süren bağlantıdan sonra 5 sn\'ye döner', async () => {
    vi.useFakeTimers()
    const { fetchMock, conns } = fakeServer()
    const h = renderHook(() => useEventStream(URL, null, () => {}))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    conns[0].end()                                    // sunucu hemen kesti
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)        // ilk deneme 5 sn

    conns[1].end()                                    // yine hemen kesti
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)        // 5 sn yetmez: bekleme katlandı
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)        // 10 sn

    await vi.advanceTimersByTimeAsync(60_000)         // bağlantı bir dakika sağlam kaldı
    conns[2].end()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMock).toHaveBeenCalledTimes(4)        // yeniden 5 sn
    h.unmount()
  })
})
