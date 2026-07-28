import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { setTransportV2Enabled } from './v2-core.js'

let managerToken
let supervisorToken

const auth = (call, token = managerToken) => call.set('Authorization', `Bearer ${token}`)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  initDB()
  seedDev()
  setTransportV2Enabled(false)
  managerToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login')
    .send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Transport V2 staged rollout', () => {
  it('reports migration and legacy parity readiness', async () => {
    const response = await auth(request(app).get('/api/transport/v2/status'))

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      enabled: false,
      legacy_writes_enabled: true,
      ready: true,
      blockers: [],
    })
    expect(response.body.readiness).toMatchObject({
      missing_tables: [],
      foreign_key_violations: 0,
      legacy_assignments: response.body.readiness.mirrored_assignments,
    })
  })

  it('allows only a campus manager to switch the UI flag', async () => {
    const forbidden = await auth(
      request(app).patch('/api/transport/v2/status'),
      supervisorToken,
    ).send({ enabled: true, reason: 'Pilot geçişi' })
    expect(forbidden.status).toBe(403)

    const enabled = await auth(request(app).patch('/api/transport/v2/status'))
      .send({ enabled: true, reason: 'Kontrollü üretim geçişi' })
    expect(enabled.status).toBe(200)
    expect(enabled.body).toMatchObject({
      enabled: true,
      legacy_writes_enabled: false,
      ready: true,
    })
    expect(enabled.body.transport_revision).toBeGreaterThan(0)

    const audit = getDB().prepare(`
      SELECT action, detail FROM audit_log
      WHERE action='transport_v2_enable' ORDER BY id DESC LIMIT 1
    `).get()
    expect(audit).toMatchObject({
      action: 'transport_v2_enable',
      detail: 'Kontrollü üretim geçişi',
    })
  })

  it('closes only legacy operational writes after activation and can roll back', async () => {
    const legacy = await auth(request(app).post('/api/transport/assign')).send({})
    expect(legacy.status).toBe(410)
    expect(legacy.body).toMatchObject({
      code: 'TRANSPORT_V2_REQUIRED',
    })

    const v2 = await auth(request(app).get('/api/transport/operations'))
    expect(v2.status).toBe(200)

    const disabled = await auth(request(app).patch('/api/transport/v2/status'))
      .send({ enabled: false, reason: 'Test geri alma doğrulaması' })
    expect(disabled.status).toBe(200)
    expect(disabled.body).toMatchObject({
      enabled: false,
      legacy_writes_enabled: true,
    })
  })
})
