import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Kapinin asil isi ENGELLEMEK: donem hazir degilken kesin banka dosyasi
// uretilmemeli. Canlida onceki aylarda 1299 gun hala "planli"; o aylardan biri
// icin dosya cekilirse eksik odeme cikar.

let managerToken, technicalToken
const AY = '2026-06'
const auth = t => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  technicalToken = await giris('teknik')
})

describe('GET /api/shifts/payroll/gate', () => {
  it('gercek semada tum kontroller olculebilir', async () => {
    const res = await request(app).get('/api/shifts/payroll/gate').query({ month: AY }).set(auth(managerToken))
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(res.body.unknown).toEqual([])
    expect(res.body.checks.length).toBeGreaterThan(4)
  })

  it('her kontrolde durum ve yonlendirme var', async () => {
    const { body } = await request(app).get('/api/shifts/payroll/gate').query({ month: AY }).set(auth(managerToken))
    body.checks.forEach(c => {
      expect(['ok', 'blocked', 'unknown']).toContain(c.status)
      expect(c.action?.route).toBeTruthy()
    })
  })

  it('gecersiz ay 400', async () => {
    expect((await request(app).get('/api/shifts/payroll/gate').query({ month: '2026-6' }).set(auth(managerToken))).status).toBe(400)
  })

  it('yetkisiz rol 403, tokensiz 401', async () => {
    expect((await request(app).get('/api/shifts/payroll/gate').query({ month: AY }).set(auth(technicalToken))).status).toBe(403)
    expect((await request(app).get('/api/shifts/payroll/gate').query({ month: AY })).status).toBe(401)
  })
})

describe('banka dosyasi kapisi', () => {
  it('donem hazir degilken KESIN dosya 409 ile reddedilir', async () => {
    const res = await request(app).get('/api/shifts/bank-transfer').query({ month: AY }).set(auth(managerToken))
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/hazir degil|hazır değil/i)
    // Sebep gorunmeli: kullanici neyi duzeltecegini bilmeli.
    expect(res.body.gate.blocking.length).toBeGreaterThan(0)
  })

  it('taslak her zaman alinabilir ve TASLAK damgasi tasir', async () => {
    const res = await request(app).get('/api/shifts/bank-transfer').query({ month: AY, draft: '1' }).set(auth(managerToken))
    expect(res.status).toBe(200)
    expect(res.text.startsWith('# TASLAK')).toBe(true)
    expect(res.text).toMatch(/Dogrulama No: T-202606-|Doğrulama No: T-202606-/)
    expect(res.headers['content-disposition']).toContain('TASLAK')
  })

  it('damgada donem, olusturan ve tarih bulunur', async () => {
    const res = await request(app).get('/api/shifts/bank-transfer').query({ month: AY, draft: '1' }).set(auth(managerToken))
    const ilkSatir = res.text.split('\r\n')[0]
    expect(ilkSatir).toContain('2026-06')
    expect(ilkSatir).toMatch(/Olusturan:|Oluşturan:/)
    expect(res.headers['x-output-verification']).toBeTruthy()
  })

  // Kapi acilinca kesin dosya uretilebilmeli — engel kalici olmamali.
  it('kosullar saglaninca KESIN dosya uretilir', async () => {
    const db = getDB()
    db.prepare("DELETE FROM shift_schedule WHERE work_date BETWEEN '2026-06-01' AND '2026-06-30' AND status='scheduled'").run()
    db.prepare("DELETE FROM leave_requests WHERE status='pending' AND start_date <= '2026-06-30' AND end_date >= '2026-06-01'").run()
    db.prepare("DELETE FROM overtime_requests WHERE status='pending' AND work_date BETWEEN '2026-06-01' AND '2026-06-30'").run()
    db.prepare("DELETE FROM shift_swap_requests WHERE status='pending' AND swap_date BETWEEN '2026-06-01' AND '2026-06-30'").run()
    db.prepare("INSERT INTO puantaj_period_approvals(period, status) VALUES(?, 'approved')").run(AY)
    db.prepare('INSERT OR IGNORE INTO period_locks(period) VALUES(?)').run(AY)

    const kapi = await request(app).get('/api/shifts/payroll/gate').query({ month: AY }).set(auth(managerToken))
    expect(`${kapi.body.ready} ${JSON.stringify(kapi.body.blocking)}`).toContain('true')

    const res = await request(app).get('/api/shifts/bank-transfer').query({ month: AY }).set(auth(managerToken))
    expect(res.status).toBe(200)
    expect(res.text.startsWith('# KESIN') || res.text.startsWith('# KESİN')).toBe(true)
    expect(res.headers['x-output-verification']).toMatch(/^K-202606-/)
  })
})
