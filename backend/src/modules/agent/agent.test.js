import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { backupStatusService, BACKUP_STALE_HOURS } from './service.js'

const TOKEN = 'a'.repeat(40)
let tmpDir, backupDir, userToken

const agentGet = (url, token = TOKEN) => request(app).get(url).set('Authorization', `Bearer ${token}`)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yys-agent-test-'))
  backupDir = path.join(tmpDir, 'backups')
  process.env.BACKUP_DIR = backupDir
  initDB()
  seedDev()
  userToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

afterAll(() => {
  delete process.env.BACKUP_DIR
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

beforeEach(() => {
  process.env.AGENT_API_TOKEN = TOKEN
  fs.rmSync(backupDir, { recursive: true, force: true })
})
afterEach(() => { delete process.env.AGENT_API_TOKEN })

function writeBackup(name, hoursAgo) {
  fs.mkdirSync(backupDir, { recursive: true })
  const full = path.join(backupDir, name)
  fs.writeFileSync(full, 'x')
  const t = new Date(Date.now() - hoursAgo * 3600000)
  fs.utimesSync(full, t, t)
}

describe('Agent API — kimlik', () => {
  it('AGENT_API_TOKEN tanımsızsa kapalıdır (503)', async () => {
    delete process.env.AGENT_API_TOKEN
    expect((await agentGet('/api/agent/overview')).status).toBe(503)
  })

  it('kısa token kabul edilmez, uç kapalı kalır (503)', async () => {
    process.env.AGENT_API_TOKEN = 'kisa-token'
    expect((await agentGet('/api/agent/overview', 'kisa-token')).status).toBe(503)
  })

  it('token yoksa veya yanlışsa 401', async () => {
    expect((await request(app).get('/api/agent/overview')).status).toBe(401)
    expect((await agentGet('/api/agent/overview', 'b'.repeat(40))).status).toBe(401)
  })

  it('müdür JWT si bile ajan ucunu açmaz', async () => {
    expect((await agentGet('/api/agent/overview', userToken)).status).toBe(401)
  })

  it('yazma ucu yoktur', async () => {
    const res = await request(app).post('/api/agent/overview').set('Authorization', `Bearer ${TOKEN}`).send({})
    expect(res.status).toBe(404)
  })
})

describe('Agent API — içerik', () => {
  it('overview KPI, sağlık skoru, anomali, su ve yedek özetini döner', async () => {
    const res = await agentGet('/api/agent/overview?today=2026-10-05')
    expect(res.status).toBe(200)
    expect(res.body.kpi).toHaveProperty('occupancy_pct')
    expect(res.body.health_score).toHaveProperty('score')
    expect(Array.isArray(res.body.anomalies)).toBe(true)
    expect(res.body.water).toHaveProperty('total')
    expect(res.body.backups).toMatchObject({ total: 0, stale: true })
  })

  it('occupancy blok bazında toplar döner', async () => {
    const res = await agentGet('/api/agent/occupancy')
    expect(res.status).toBe(200)
    expect(res.body.blocks.length).toBeGreaterThan(0)
    expect(res.body.totals).toHaveProperty('empty')
  })

  it('water/alerts özet ve ürün listelerini döner', async () => {
    const res = await agentGet('/api/agent/water/alerts?today=2026-10-05')
    expect(res.status).toBe(200)
    expect(res.body.date).toBe('2026-10-05')
    expect(res.body.summary).toHaveProperty('total')
    expect(Array.isArray(res.body.low_stock)).toBe(true)
  })

  it('hiçbir yanıt personel adı, TC veya telefon içermez (KVKK)', async () => {
    const people = getDB().prepare('SELECT full_name, tc_no, phone_number FROM personnel').all()
    expect(people.length).toBeGreaterThan(0)
    const secrets = people.flatMap(p => [p.full_name, p.tc_no, p.phone_number]).filter(v => v && String(v).length >= 5)
    for (const url of ['/api/agent/overview', '/api/agent/occupancy', '/api/agent/anomalies', '/api/agent/water/alerts', '/api/agent/backups']) {
      const body = JSON.stringify((await agentGet(url)).body)
      for (const s of secrets) expect(body, `${url} → ${s}`).not.toContain(String(s))
    }
  })
})

describe('Agent API — yedek durumu', () => {
  it('taze yedek: stale=false, son 24 saat sayılır', async () => {
    writeBackup('yys_2026-10-05_03-00-00.db', 2)
    writeBackup('yys_2026-10-04_03-00-00.db', 30)
    const res = await agentGet('/api/agent/backups')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 2, last_24h: 1, stale: false })
    expect(res.body.latest.name).toBe('yys_2026-10-05_03-00-00.db')
  })

  it(`son yedek ${BACKUP_STALE_HOURS} saatten eskiyse stale=true`, () => {
    writeBackup('yys_2026-10-03_03-00-00.db', BACKUP_STALE_HOURS + 1)
    const status = backupStatusService()
    expect(status.stale).toBe(true)
    expect(status.latest.age_hours).toBeGreaterThan(BACKUP_STALE_HOURS)
  })
})
