import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeRoadRoute } from './routing.js'

afterEach(() => { vi.unstubAllGlobals() })

describe('transport/routing computeRoadRoute', () => {
  it('2\'den az waypoint icin fetch atmadan null doner', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await computeRoadRoute([{ lat: 41.5, lng: 32.0 }])
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('basarili OSRM cevabini [lat,lng] dizisine cevirir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ geometry: { coordinates: [[32.0, 41.5], [32.01, 41.51]] } }] }),
    }))
    const result = await computeRoadRoute([{ lat: 41.5, lng: 32.0 }, { lat: 41.51, lng: 32.01 }])
    expect(result).toEqual([[41.5, 32.0], [41.51, 32.01]])
  })

  it('OSRM 4xx/5xx donerse null doner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await computeRoadRoute([{ lat: 41.5, lng: 32.0 }, { lat: 41.51, lng: 32.01 }])
    expect(result).toBeNull()
  })

  it('ag hatasinda null doner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    const result = await computeRoadRoute([{ lat: 41.5, lng: 32.0 }, { lat: 41.51, lng: 32.01 }])
    expect(result).toBeNull()
  })

  it('bos routes dizisi donerse null doner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [] }) }))
    const result = await computeRoadRoute([{ lat: 41.5, lng: 32.0 }, { lat: 41.51, lng: 32.01 }])
    expect(result).toBeNull()
  })
})
