import { describe, it, expect } from 'vitest'
import { buildRoutePolyline, pointsWithCoords, pointsWithoutCoords } from './routeMap.js'

const workSite = { lat: 41.575, lng: 32.0264 }

describe('transport/logic/routeMap', () => {
  it('buildRoutePolyline sirali stop\'lari + workSite\'i koordinat dizisine cevirir', () => {
    const route = { stops: [
      { sequence_order: 1, lat: 41.45, lng: 31.79 },
      { sequence_order: 2, lat: 41.43, lng: 31.74 },
    ] }
    expect(buildRoutePolyline(route, workSite)).toEqual([
      [41.45, 31.79],
      [41.43, 31.74],
      [41.575, 32.0264],
    ])
  })

  it('buildRoutePolyline konumsuz stop\'lari atlar', () => {
    const route = { stops: [
      { sequence_order: 1, lat: 41.45, lng: 31.79 },
      { sequence_order: 2, lat: null, lng: null },
    ] }
    expect(buildRoutePolyline(route, workSite)).toEqual([
      [41.45, 31.79],
      [41.575, 32.0264],
    ])
  })

  it('buildRoutePolyline stop\'lari sequence_order\'a gore siralar', () => {
    const route = { stops: [
      { sequence_order: 2, lat: 41.43, lng: 31.74 },
      { sequence_order: 1, lat: 41.45, lng: 31.79 },
    ] }
    expect(buildRoutePolyline(route, workSite)[0]).toEqual([41.45, 31.79])
  })

  it('buildRoutePolyline koordinatli stop yoksa bos dizi doner (cizgi yok)', () => {
    expect(buildRoutePolyline({ stops: [] }, workSite)).toEqual([])
    expect(buildRoutePolyline({ stops: [{ sequence_order: 1, lat: null, lng: null }] }, workSite)).toEqual([])
  })

  it('pointsWithCoords / pointsWithoutCoords ayirir', () => {
    const points = [
      { id: 1, lat: 41.4, lng: 31.7 },
      { id: 2, lat: null, lng: null },
      { id: 3, lat: 41.5, lng: 31.8 },
    ]
    expect(pointsWithCoords(points).map(p => p.id)).toEqual([1, 3])
    expect(pointsWithoutCoords(points).map(p => p.id)).toEqual([2])
  })
})
