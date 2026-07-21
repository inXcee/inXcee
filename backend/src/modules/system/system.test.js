import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let adminToken, userToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r1 = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  adminToken = r1.body.token
  const r2 = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
  userToken = r2.body.token
})

describe('System Info', () => {
  it('admin sistem bilgisini alabilir', async () => {
    const res = await request(app).get('/api/system/info')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.server.node_version).toBeTruthy()
    expect(res.body.server.uptime_sec).toBeGreaterThanOrEqual(0)
    expect(res.body.server.memory.heap_used_mb).toBeGreaterThan(0)
    expect(res.body.database).toBeTruthy()
    expect(res.body.stats.users).toBeGreaterThan(0)
    expect(res.body.backups).toBeTruthy()
    expect(res.body.cron).toBeTruthy()
  })

  it('non-admin reddedilir', async () => {
    const res = await request(app).get('/api/system/info')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })

  it('auth olmadan reddedilir', async () => {
    const res = await request(app).get('/api/system/info')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/system/metrics', () => {
  const ORIGINAL_TOKEN = process.env.METRICS_TOKEN

  beforeEach(() => { delete process.env.METRICS_TOKEN })
  afterAll(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.METRICS_TOKEN
    else process.env.METRICS_TOKEN = ORIGINAL_TOKEN
  })

  it('returns 503 when METRICS_TOKEN not set', async () => {
    const res = await request(app).get('/api/system/metrics')
    expect(res.status).toBe(503)
  })

  it('returns 401 when token missing', async () => {
    process.env.METRICS_TOKEN = 'secret123'
    const res = await request(app).get('/api/system/metrics')
    expect(res.status).toBe(401)
  })

  it('returns 401 when token wrong', async () => {
    process.env.METRICS_TOKEN = 'secret123'
    const res = await request(app).get('/api/system/metrics')
      .set('Authorization', 'Bearer wrong')
    expect(res.status).toBe(401)
  })

  it('returns 200 with prom-text when token correct', async () => {
    process.env.METRICS_TOKEN = 'secret123'
    const res = await request(app).get('/api/system/metrics')
      .set('Authorization', 'Bearer secret123')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.text).toContain('# HELP')
    expect(res.text).toContain('http_request_duration_seconds')
  })
})

describe('Job kuyruğu — başarısız işleri görme ve yeniden deneme', () => {
  it('başarısız işler listelenir ve kuyruğa geri konur', async () => {
    const { getDB } = await import('../../shared/db/index.js')
    const db = getDB()
    db.prepare(`INSERT INTO job_queue(type, payload, run_after, max_attempts, attempts, status, last_error)
      VALUES('water.daily-digest-mail', '{}', 0, 5, 5, 'failed', 'Invalid login: 535-5.7.8')`).run()
    db.prepare(`INSERT INTO job_queue(type, payload, run_after, max_attempts, attempts, status, last_error)
      VALUES('email.send', '{}', 0, 3, 3, 'failed', 'Invalid login: 535-5.7.8')`).run()

    const list = await request(app).get('/api/system/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(list.status).toBe(200)
    expect(list.body.failed.length).toBeGreaterThanOrEqual(2)
    expect(list.body.stats).toBeTruthy()

    // Yalnız tek türü kuyruğa al
    const retry = await request(app).post('/api/system/jobs/retry')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'water.daily-digest-mail' })
    expect(retry.status).toBe(200)
    expect(retry.body.requeued).toBe(1)

    const row = db.prepare("SELECT status, attempts, last_error FROM job_queue WHERE type='water.daily-digest-mail'").get()
    expect(row).toMatchObject({ status: 'pending', attempts: 0, last_error: null })
    const untouched = db.prepare("SELECT status FROM job_queue WHERE type='email.send'").get()
    expect(untouched.status).toBe('failed')
  })

  it('yetkisiz rol kuyruğa dokunamaz', async () => {
    expect((await request(app).get('/api/system/jobs')
      .set('Authorization', `Bearer ${userToken}`)).status).toBe(403)
    expect((await request(app).post('/api/system/jobs/retry')
      .set('Authorization', `Bearer ${userToken}`).send({})).status).toBe(403)
    expect((await request(app).post('/api/system/jobs/retry').send({})).status).toBe(401)
  })
})
