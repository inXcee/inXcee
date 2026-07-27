import { describe, it, expect } from 'vitest'
import {
  buildRoutePolyline, pointsWithCoords, pointsWithoutCoords,
  distanceToSegmentMeters, classifyDrop, reorderedStopIds, insertViaPoint,
} from './routeMap.js'

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

describe('transport/logic/routeMap — düzenleme yardımcıları', () => {
  it('distanceToSegmentMeters: nokta segmentin tam ortasındaysa ~0 döner', () => {
    const a = [41.40, 31.70]
    const b = [41.42, 31.70]
    const mid = [41.41, 31.70]
    expect(distanceToSegmentMeters(mid, a, b)).toBeLessThan(1)
  })

  it('distanceToSegmentMeters: segmentten uzak nokta büyük mesafe döner', () => {
    const a = [41.40, 31.70]
    const b = [41.42, 31.70]
    const far = [41.41, 31.80]
    expect(distanceToSegmentMeters(far, a, b)).toBeGreaterThan(5000)
  })

  it('classifyDrop: eşik içinde reorder döner', () => {
    const stops = [
      { id: 1, lat: 41.40, lng: 31.70 },
      { id: 2, lat: 41.42, lng: 31.70 },
      { id: 3, lat: 41.44, lng: 31.70 },
    ]
    const drop = [41.41, 31.70]
    expect(classifyDrop(drop, stops)).toEqual({ type: 'reorder', afterStopId: 1 })
  })

  it('classifyDrop: eşik dışında move döner', () => {
    const stops = [
      { id: 1, lat: 41.40, lng: 31.70 },
      { id: 2, lat: 41.42, lng: 31.70 },
    ]
    const drop = [41.41, 31.90]
    expect(classifyDrop(drop, stops)).toEqual({ type: 'move' })
  })

  it('classifyDrop: 2den az koordinatlı durakta move döner', () => {
    expect(classifyDrop([41.41, 31.70], [{ id: 1, lat: 41.40, lng: 31.70 }])).toEqual({ type: 'move' })
  })

  it('reorderedStopIds: durak doğru pozisyona eklenir', () => {
    const stops = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(reorderedStopIds(stops, 3, 1)).toEqual([1, 3, 2])
    expect(reorderedStopIds(stops, 1, 2)).toEqual([2, 1, 3])
  })

  it('insertViaPoint: diziye doğru indekse nokta ekler', () => {
    const geometry = [[41.40, 31.70], [41.42, 31.75]]
    expect(insertViaPoint(geometry, 0, [41.41, 31.72])).toEqual([
      [41.40, 31.70], [41.41, 31.72], [41.42, 31.75],
    ])
  })
})
