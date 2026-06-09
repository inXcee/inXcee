import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

const auth = (r) => r.set('Authorization', `Bearer ${managerToken}`)

describe('safety incidents', () => {
  let incidentId

  it('POST /safety/incidents — olay oluşturur (201)', async () => {
    const res = await auth(request(app).post('/api/safety/incidents')).send({
      occurred_at: '2026-06-10 08:30',
      location: 'M1 blok merdiven',
      incident_type: 'near_miss',
      severity: 'moderate',
      description: 'Islak zeminde kayma — ramak kala',
    })
    expect(res.status).toBe(201)
    incidentId = res.body.id
    const row = getDB().prepare('SELECT * FROM safety_incidents WHERE id=?').get(incidentId)
    expect(row.status).toBe('open')
    expect(row.incident_type).toBe('near_miss')
  })

  it('geçersiz tip/şiddet 400 (Zod)', async () => {
    expect((await auth(request(app).post('/api/safety/incidents')).send({
      occurred_at: '2026-06-10 08:30', incident_type: 'foo', description: 'x',
    })).status).toBe(400)
    expect((await auth(request(app).post('/api/safety/incidents')).send({
      occurred_at: '2026-06-10 08:30', incident_type: 'injury', severity: 'mega', description: 'x',
    })).status).toBe(400)
  })

  it('kritik olay campus_manager bildirimi üretir', async () => {
    const before = getDB().prepare(`SELECT COUNT(*) c FROM notifications WHERE event_kind='safety.incident'`).get()?.c ?? 0
    const res = await auth(request(app).post('/api/safety/incidents')).send({
      occurred_at: '2026-06-10 09:00',
      incident_type: 'injury',
      severity: 'critical',
      description: 'Yüksekten düşme — ambulans çağrıldı',
    })
    expect(res.status).toBe(201)
    const after = getDB().prepare(`SELECT COUNT(*) c FROM notifications WHERE event_kind='safety.incident'`).get()?.c ?? 0
    expect(after).toBe(before + 1)
  })

  it('GET /safety/incidents — liste + status filtresi', async () => {
    const res = await auth(request(app).get('/api/safety/incidents?status=open'))
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(2)
    expect(res.body.every(i => i.status === 'open')).toBe(true)
  })

  it('PATCH /safety/incidents/:id — duruma geçiş; closed olunca closed_at set', async () => {
    const inv = await auth(request(app).patch(`/api/safety/incidents/${incidentId}`))
      .send({ status: 'investigating', actions_taken: 'Zemin kurutuldu, uyarı levhası' })
    expect(inv.status).toBe(200)
    const close = await auth(request(app).patch(`/api/safety/incidents/${incidentId}`))
      .send({ status: 'closed' })
    expect(close.status).toBe(200)
    const row = getDB().prepare('SELECT * FROM safety_incidents WHERE id=?').get(incidentId)
    expect(row.status).toBe('closed')
    expect(row.closed_at).toBeTruthy()
    expect(row.actions_taken).toContain('kurutuldu')
  })

  it('token olmadan 401', async () => {
    expect((await request(app).get('/api/safety/incidents')).status).toBe(401)
  })
})
