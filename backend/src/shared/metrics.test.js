import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import { register, httpMetricsMiddleware, observeDbQuery, _resetForTests } from './metrics.js'

beforeEach(() => {
  _resetForTests()
})

describe('metrics registry', () => {
  it('exposes default node metrics', async () => {
    const text = await register.metrics()
    expect(text).toContain('process_cpu_user_seconds_total')
    expect(text).toContain('nodejs_eventloop_lag_seconds')
  })

  it('http histogram defined', async () => {
    const text = await register.metrics()
    expect(text).toContain('# HELP http_request_duration_seconds')
    expect(text).toContain('# TYPE http_request_duration_seconds histogram')
  })
})

describe('httpMetricsMiddleware', () => {
  it('records request after route match', async () => {
    const app = express()
    app.use(httpMetricsMiddleware)
    app.get('/users/:id', (req, res) => res.json({ id: req.params.id }))
    await supertest(app).get('/users/42').expect(200)
    const text = await register.metrics()
    // Label route normalize edildi — :id ile, 42 ile degil
    expect(text).toMatch(/http_requests_total\{[^}]*route="\/users\/:id"[^}]*\}\s+1/)
  })

  it('uses "unknown" route for 404s', async () => {
    const app = express()
    app.use(httpMetricsMiddleware)
    app.use((req, res) => res.status(404).end())
    await supertest(app).get('/nope').expect(404)
    const text = await register.metrics()
    expect(text).toMatch(/http_requests_total\{[^}]*route="unknown"[^}]*\}\s+1/)
  })

  it('records status_code label', async () => {
    const app = express()
    app.use(httpMetricsMiddleware)
    app.get('/ok', (req, res) => res.json({ ok: true }))
    await supertest(app).get('/ok').expect(200)
    const text = await register.metrics()
    expect(text).toMatch(/http_requests_total\{[^}]*status_code="200"[^}]*\}/)
  })
})

describe('observeDbQuery', () => {
  it('records duration', async () => {
    observeDbQuery('select', 0.123)
    const text = await register.metrics()
    expect(text).toContain('# TYPE db_query_duration_seconds histogram')
    expect(text).toMatch(/db_query_duration_seconds_count\{operation="select"\}\s+1/)
  })
})
