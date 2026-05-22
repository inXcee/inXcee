// Prometheus metrics — prom-client kullanir.
// Endpoint expozisyonu: backend/src/modules/system/routes.js icinde Bearer token korumali.
//
// Histogram cardinality icin route label'i normalize edilir (:id, :endpoint vs.)
// — req.route.path Express'in pattern'idir, ham URL degil.

import { Registry, collectDefaultMetrics, Histogram, Counter, Gauge } from 'prom-client'

export const register = new Registry()

collectDefaultMetrics({ register })

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
})

const httpTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
})

const dbDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'DB query duration in seconds (sampled, slow path only)',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
})

const jobQueueSize = new Gauge({
  name: 'job_queue_size',
  help: 'Number of jobs in queue by status',
  labelNames: ['status'],
  registers: [register],
})

// Test helper: vitest izole run icinde sayaclari sifirlar (metric tanimi degismez).
export function _resetForTests() {
  register.resetMetrics()
}

function normalizeRoute(req) {
  if (!req.route) return 'unknown'
  // baseUrl router mount path'i + route.path = full pattern (/api/users/:id gibi)
  return (req.baseUrl || '') + req.route.path
}

export function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9
    const labels = {
      method: req.method,
      route: normalizeRoute(req),
      status_code: String(res.statusCode),
    }
    httpDuration.observe(labels, seconds)
    httpTotal.inc(labels)
  })
  next()
}

export function observeDbQuery(operation, seconds) {
  dbDuration.observe({ operation }, seconds)
}

export function setJobQueueSize(status, count) {
  jobQueueSize.set({ status }, count)
}
