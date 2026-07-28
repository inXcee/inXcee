import { describe, it, expect } from 'vitest'
import {
  buildRoutePolyline, pointsWithCoords, pointsWithoutCoords,
  nearestPathIndex, insertViaAtPoint, moveStopInOrder, nextAutoStopName,
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

describe('nearestPathIndex', () => {
  const path = [[41.40, 31.70], [41.41, 31.71], [41.42, 31.72], [41.43, 31.73]]

  it('en yakin geometri noktasinin indeksini doner', () => {
    expect(nearestPathIndex(path, [41.4201, 31.7201])).toBe(2)
    expect(nearestPathIndex(path, [41.40, 31.70])).toBe(0)
    expect(nearestPathIndex(path, [41.43, 31.73])).toBe(3)
  })

  it('bos geometride 0 doner', () => {
    expect(nearestPathIndex([], [41.40, 31.70])).toBe(0)
  })
})

describe('insertViaAtPoint', () => {
  // Yol: durak1 → durak2 → isyeri, duz hat uzerinde artan sirada.
  const geometry = [
    [41.40, 31.70], [41.41, 31.71], [41.42, 31.72], [41.43, 31.73], [41.44, 31.74],
  ]
  const stops = [
    { id: 1, sequence_order: 1, lat: 41.40, lng: 31.70 },
    { id: 2, sequence_order: 2, lat: 41.43, lng: 31.73 },
  ]

  it('tiklama iki durak arasindaysa ilk duraga capalanir', () => {
    const result = insertViaAtPoint({ geometry, stops, viaPoints: [], point: [41.41, 31.71] })
    expect(result).toEqual([{ after_stop_id: 1, lat: 41.41, lng: 31.71 }])
  })

  it('tiklama son duraktan sonraysa son duraga capalanir', () => {
    const result = insertViaAtPoint({ geometry, stops, viaPoints: [], point: [41.44, 31.74] })
    expect(result).toEqual([{ after_stop_id: 2, lat: 41.44, lng: 31.74 }])
  })

  it('ayni bacaktaki ugraklar yol boyunca dogru sirada dizilir', () => {
    const existing = [{ after_stop_id: 1, lat: 41.42, lng: 31.72 }]
    const result = insertViaAtPoint({ geometry, stops, viaPoints: existing, point: [41.41, 31.71] })
    expect(result).toEqual([
      { after_stop_id: 1, lat: 41.41, lng: 31.71 },
      { after_stop_id: 1, lat: 41.42, lng: 31.72 },
    ])
  })

  it('yeni ugrak mevcut ugragin ilerisindeyse ardina eklenir', () => {
    const existing = [{ after_stop_id: 1, lat: 41.41, lng: 31.71 }]
    const result = insertViaAtPoint({ geometry, stops, viaPoints: existing, point: [41.42, 31.72] })
    expect(result).toEqual([
      { after_stop_id: 1, lat: 41.41, lng: 31.71 },
      { after_stop_id: 1, lat: 41.42, lng: 31.72 },
    ])
  })

  it('baska capaya bagli ugraklar korunur', () => {
    const existing = [{ after_stop_id: 2, lat: 41.44, lng: 31.74 }]
    const result = insertViaAtPoint({ geometry, stops, viaPoints: existing, point: [41.41, 31.71] })
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ after_stop_id: 1, lat: 41.41, lng: 31.71 })
    expect(result).toContainEqual({ after_stop_id: 2, lat: 41.44, lng: 31.74 })
  })

  it('koordinatli durak yoksa dizi degismez', () => {
    const existing = [{ after_stop_id: 1, lat: 41.41, lng: 31.71 }]
    expect(insertViaAtPoint({ geometry, stops: [], viaPoints: existing, point: [41.41, 31.71] }))
      .toEqual(existing)
  })
})

describe('moveStopInOrder', () => {
  it('ortadaki durağı yukari tasir', () => {
    expect(moveStopInOrder([1, 2, 3], 2, 'up')).toEqual([2, 1, 3])
  })

  it('ortadaki durağı asagi tasir', () => {
    expect(moveStopInOrder([1, 2, 3], 2, 'down')).toEqual([1, 3, 2])
  })

  it('ilk durağı yukari tasimaya calisinca degismez', () => {
    expect(moveStopInOrder([1, 2, 3], 1, 'up')).toEqual([1, 2, 3])
  })

  it('son durağı asagi tasimaya calisinca degismez', () => {
    expect(moveStopInOrder([1, 2, 3], 3, 'down')).toEqual([1, 2, 3])
  })

  it('bilinmeyen durak id degisiklik yapmaz', () => {
    expect(moveStopInOrder([1, 2, 3], 99, 'up')).toEqual([1, 2, 3])
  })
})

describe('nextAutoStopName', () => {
  it('bos listede 1 ile baslar', () => {
    expect(nextAutoStopName([])).toBe('Yeni Durak 1')
  })

  it('numarasiz "Yeni Durak" 1 sayilir', () => {
    expect(nextAutoStopName(['Yeni Durak'])).toBe('Yeni Durak 2')
  })

  it('en buyuk numaranin bir fazlasini kullanir', () => {
    expect(nextAutoStopName(['Yeni Durak 7', 'Yeni Durak 3'])).toBe('Yeni Durak 8')
  })

  it('alakasiz isimleri saymaz', () => {
    expect(nextAutoStopName(['Kozlu Meydan', 'Seka Sinema'])).toBe('Yeni Durak 1')
  })

  it('benzer ama eslesmeyen isimleri saymaz', () => {
    expect(nextAutoStopName(['Yeni Durak A', 'Eski Yeni Durak 9'])).toBe('Yeni Durak 1')
  })
})
