import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import {
  buildWaterDailyDigestEmail,
  dailyDigestDeliveriesService,
  queueWaterDailyDigestEmail,
} from './daily-digest.js'

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
const previousEnv = Object.fromEntries(SMTP_KEYS.map(key => [key, process.env[key]]))

let managerToken
let supervisorToken

function setSetting(key, value) {
  getDB().prepare(`
    INSERT INTO system_settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, value)
}

function configureSmtp() {
  setSetting('smtp_host', 'smtp.example.com')
  setSetting('smtp_user', 'yys@example.com')
  setSetting('smtp_pass', 'secret')
  setSetting('smtp_from', 'yys@example.com')
}

function digestFixture(date = '2027-03-20') {
  return {
    date,
    actionable: true,
    notified: true,
    parts: ['1 eksi stok', '1 sipariş önerisi'],
    summary: { pending: 0, negative: 1, low: 0, idle_zones: 0 },
    order_count: 1,
    overdue_order_count: 1,
    due_soon_order_count: 0,
    soon_count: 1,
    details: {
      pending: [],
      negative: [{ product_name: 'Damacana', balance_human: '-5 damacana' }],
      low: [],
      over_distributed: [],
      idle_zones: [],
      lots: [{
        product_name: '0.5 L Su',
        lot_no: 'LOT-053',
        expiry_date: '2027-03-19',
        health: 'expired',
        remaining_human: '20 koli',
      }],
      orders: [{
        product_name: 'Damacana',
        balance_human: '10 damacana',
        order_by_date: '2027-03-18',
        suggested_human: '80 damacana',
      }],
    },
  }
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  for (const key of SMTP_KEYS) process.env[key] = ''
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

beforeEach(() => {
  getDB().exec(`
    DELETE FROM water_daily_digest_deliveries;
    DELETE FROM job_queue;
    DELETE FROM system_settings WHERE key IN ('smtp_host','smtp_user','smtp_pass','smtp_from');
    UPDATE users SET email=NULL WHERE role IN ('campus_manager','shift_supervisor');
  `)
})

afterAll(() => {
  for (const key of SMTP_KEYS) {
    if (previousEnv[key] === undefined) delete process.env[key]
    else process.env[key] = previousEnv[key]
  }
})

describe('Su günlük operasyon özeti e-posta teslimi', () => {
  it('SMTP kapalıyken nedeni kalıcı kaydeder ve iş kuyruğu oluşturmaz', () => {
    const result = queueWaterDailyDigestEmail(digestFixture())

    expect(result.status).toBe('smtp_disabled')
    expect(result.error).toMatch(/SMTP yapılandırması eksik/)
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM job_queue').get().count).toBe(0)
    expect(getDB().prepare('SELECT status FROM water_daily_digest_deliveries').get().status).toBe('smtp_disabled')
  })

  it('iki operasyon rolünü tek kalıcı işe alır ve aynı gün tekrarını engeller', () => {
    configureSmtp()
    getDB().prepare("UPDATE users SET email='mudur@example.com' WHERE role='campus_manager'").run()
    getDB().prepare("UPDATE users SET email='vardiya@example.com' WHERE role='shift_supervisor'").run()

    const first = queueWaterDailyDigestEmail(digestFixture(), { source: 'cron' })
    const second = queueWaterDailyDigestEmail(digestFixture(), { force: true, source: 'manual' })

    expect(first.status).toBe('queued')
    expect(first.recipients).toEqual(['mudur@example.com', 'vardiya@example.com'])
    expect(second.already_queued).toBe(true)
    expect(second.job_id).toBe(first.job_id)
    expect(getDB().prepare("SELECT COUNT(*) AS count FROM job_queue WHERE type='water.daily-digest-mail'").get().count).toBe(1)

    const status = dailyDigestDeliveriesService()
    expect(status.smtp.configured).toBe(true)
    expect(status.schedule).toEqual({ time: '06:15', timezone: 'Europe/Istanbul' })
    expect(status.rows[0].summary.order_count).toBe(1)
  })

  it('HTML içeriğinde ürün adını kaçırır ve sipariş planını gösterir', () => {
    const digest = digestFixture()
    digest.details.orders[0].product_name = '<Damacana & Cam>'
    const email = buildWaterDailyDigestEmail(digest)

    expect(email.subject).toContain('2027-03-20')
    expect(email.html).toContain('&lt;Damacana &amp; Cam&gt;')
    expect(email.html).toContain('LOT-053')
    expect(email.html).toContain('SKT geçti')
    expect(email.text).toContain('80 damacana')
  })

  it('teslim geçmişini vardiya sorumlusuna açar, elle çalıştırmayı müdürle sınırlar', async () => {
    configureSmtp()
    getDB().prepare("UPDATE users SET email='mudur@example.com' WHERE role='campus_manager'").run()
    getDB().prepare("UPDATE users SET email='vardiya@example.com' WHERE role='shift_supervisor'").run()

    const forbidden = await request(app).post('/api/water/daily-digest/run')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ force: true })
    expect(forbidden.status).toBe(403)

    const queued = await request(app).post('/api/water/daily-digest/run')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ force: true })
    expect(queued.status).toBe(202)
    expect(queued.body.email.status).toBe('queued')
    expect(queued.body.email.source).toBe('manual')

    const history = await request(app).get('/api/water/daily-digest')
      .set('Authorization', `Bearer ${supervisorToken}`)
    expect(history.status).toBe(200)
    expect(history.body.rows).toHaveLength(1)
    expect(history.body.rows[0].job_status).toBe('pending')
  })
})
