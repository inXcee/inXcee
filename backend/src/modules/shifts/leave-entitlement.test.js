import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { computeAnnualEntitlement } from './leave-entitlement.js'

describe('computeAnnualEntitlement (İş Kanunu m.53)', () => {
  it('grants no entitlement before one year of service', () => {
    const r = computeAnnualEntitlement({ hireDate: '2026-01-01', asOf: '2026-07-01' })
    expect(r.has_started).toBe(false)
    expect(r.entitled_days).toBe(0)
    expect(r.entitlement_start_date).toBe('2027-01-01')
    expect(r.days_to_start).toBeGreaterThan(0)
  })

  it('grants 14 days for 1–5 years of service', () => {
    const r = computeAnnualEntitlement({ hireDate: '2023-01-01', asOf: '2026-01-01' })
    expect(r.has_started).toBe(true)
    expect(r.service_years).toBe(3)
    expect(r.entitled_days).toBe(14)
  })

  it('grants 20 days for 5–15 years and 26 days for 15+', () => {
    expect(computeAnnualEntitlement({ hireDate: '2016-01-01', asOf: '2026-01-01' }).entitled_days).toBe(20)
    expect(computeAnnualEntitlement({ hireDate: '2005-01-01', asOf: '2026-01-01' }).entitled_days).toBe(26)
    // 5 yıl tam → hâlâ 14 (5 dahil ilk dilim)
    expect(computeAnnualEntitlement({ hireDate: '2021-01-01', asOf: '2026-01-01' }).entitled_days).toBe(14)
  })

  it('applies the age rule (>=50) with a minimum of 20 days', () => {
    const r = computeAnnualEntitlement({ hireDate: '2023-01-01', birthDate: '1970-01-01', asOf: '2026-01-01' })
    expect(r.entitled_days).toBe(20) // 3 yıl → normalde 14 ama yaş kuralı 20'ye çeker
    expect(r.age_rule_applied).toBe(true)
  })

  it('handles a missing hire date gracefully', () => {
    const r = computeAnnualEntitlement({ hireDate: null })
    expect(r.has_hire_date).toBe(false)
    expect(r.entitled_days).toBe(0)
  })
})

describe('leave entitlement api + dossier integration', () => {
  let managerToken
  let staffId

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:'
    initDB()
    seedDev()
    managerToken = (await request(app).post('/api/auth/login')
      .send({ username: 'mudur', password: 'admin123' })).body.token
    const db = getDB()
    staffId = db.prepare(`
      INSERT INTO staff(tc_no, full_name, hire_date, is_active)
      VALUES('75555555555', 'İzin Hak Test', date('now','-3 years'), 1)
    `).run().lastInsertRowid
    db.prepare('INSERT INTO leave_balance(staff_id, year, annual_total, annual_used) VALUES(?,?,?,?)')
      .run(staffId, new Date().getFullYear(), 14, 4)
  })

  it('returns entitlement + remaining via the endpoint', async () => {
    const res = await request(app).get(`/api/shifts/leave/entitlement/${staffId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.has_started).toBe(true)
    expect(res.body.entitled_days).toBe(14)
    expect(res.body.annual_used).toBe(4)
    expect(res.body.remaining).toBe(10)
  })

  it('exposes annual_leave inside the dossier payload', async () => {
    const res = await request(app).get(`/api/personnel/${staffId}/dossier`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.annual_leave.entitled_days).toBe(14)
    expect(res.body.annual_leave.remaining).toBe(10)
    expect(res.body.annual_leave.entitlement_start_date).toBeTruthy()
  })
})
