import { describe, it, expect, beforeAll } from 'vitest'
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
