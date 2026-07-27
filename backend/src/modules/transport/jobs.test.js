import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./routing.js', () => ({ computeRoadRoute: vi.fn() }))

import { initDB, getDB } from '../../shared/db/index.js'
import { enqueue, tickOnce } from '../../shared/jobs/index.js'
import { handlers } from '../../shared/jobs/handlers.js'
import { computeRoadRoute } from './routing.js'
import { recomputeRoutePathJob, recomputeRoutePathSync } from './jobs.js'
import * as q from './queries.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  initDB()
  handlers['transport.recompute-path'] = recomputeRoutePathJob
})

function makeRouteWithStops() {
  const db = getDB()
  const ppA = db.prepare(`INSERT INTO pickup_points(name, lat, lng) VALUES('A', 41.40, 31.70)`).run().lastInsertRowid
  const ppB = db.prepare(`INSERT INTO pickup_points(name, lat, lng) VALUES('B', 41.42, 31.75)`).run().lastInsertRowid
  const routeId = db.prepare(`INSERT INTO routes(name) VALUES('Test Hat')`).run().lastInsertRowid
  db.prepare(`INSERT INTO route_stops(route_id, pickup_point_id, sequence_order) VALUES(?,?,1)`).run(routeId, ppA)
  db.prepare(`INSERT INTO route_stops(route_id, pickup_point_id, sequence_order) VALUES(?,?,2)`).run(routeId, ppB)
  return routeId
}

beforeEach(() => {
  getDB().exec('DELETE FROM job_queue; DELETE FROM route_stops; DELETE FROM routes; DELETE FROM pickup_points;')
  computeRoadRoute.mockReset()
})

describe('transport.recompute-path job', () => {
  it('basarili OSRM cevabinda path_geometry kaydeder ve path_is_manual sifirlar', async () => {
    const routeId = makeRouteWithStops()
    getDB().prepare('UPDATE routes SET path_is_manual=1 WHERE id=?').run(routeId)
    computeRoadRoute.mockResolvedValue([[41.40, 31.70], [41.41, 31.72], [41.42, 31.75]])

    enqueue('transport.recompute-path', { routeId })
    await tickOnce()

    const saved = q.getRoutePath(routeId)
    expect(saved.geometry).toEqual([[41.40, 31.70], [41.41, 31.72], [41.42, 31.75]])
    expect(saved.is_manual).toBe(false)
  })

  it('OSRM basarisiz olursa is yeniden denenir, eski geometri korunur', async () => {
    const routeId = makeRouteWithStops()
    q.saveRoutePath(routeId, [[41.40, 31.70], [41.42, 31.75]], { isManual: false })
    computeRoadRoute.mockResolvedValue(null)

    enqueue('transport.recompute-path', { routeId }, { maxAttempts: 5 })
    await tickOnce()

    const row = getDB().prepare('SELECT status, attempts FROM job_queue WHERE type=?').get('transport.recompute-path')
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    const saved = q.getRoutePath(routeId)
    expect(saved.geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
  })

  it('koordinatsiz durak yoksa atlanir, OSRM cagrilmaz', async () => {
    const db = getDB()
    const routeId = db.prepare(`INSERT INTO routes(name) VALUES('Bos Hat')`).run().lastInsertRowid
    enqueue('transport.recompute-path', { routeId })
    await tickOnce()
    expect(computeRoadRoute).not.toHaveBeenCalled()
    const row = getDB().prepare('SELECT status FROM job_queue WHERE type=?').get('transport.recompute-path')
    expect(row.status).toBe('done')
  })
})

describe('recomputeRoutePathSync', () => {
  it('basarili olursa geometry doner ve kaydeder', async () => {
    const routeId = makeRouteWithStops()
    computeRoadRoute.mockResolvedValue([[41.40, 31.70], [41.42, 31.75]])
    const geometry = await recomputeRoutePathSync(routeId)
    expect(geometry).toEqual([[41.40, 31.70], [41.42, 31.75]])
    expect(q.getRoutePath(routeId).is_manual).toBe(false)
  })

  it('OSRM basarisiz olursa null doner', async () => {
    const routeId = makeRouteWithStops()
    computeRoadRoute.mockResolvedValue(null)
    const geometry = await recomputeRoutePathSync(routeId)
    expect(geometry).toBeNull()
  })
})
