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
    // Kullanılan gün kaynağı onaylı talep defteri (sayaç yalnız önbellek)
    db.prepare(`INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, status)
      VALUES(?, 'annual', ?, ?, 4, 'approved')`).run(staffId, `${new Date().getFullYear()}-02-02`, `${new Date().getFullYear()}-02-05`)
  })

  it('returns entitlement + remaining via the endpoint', async () => {
    const res = await request(app).get(`/api/shifts/leave/entitlement/${staffId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.has_started).toBe(true)
    expect(res.body.entitled_days).toBe(14)
    expect(res.body.annual_used).toBe(4)
    expect(res.body.remaining).toBe(10)
    expect(res.body.basis).toBe('legal')
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

describe('izin açılış bakiyesi (İK onaylı, tarihli)', () => {
  let managerToken, supervisorToken, staffId
  beforeAll(async () => {
    process.env.DB_PATH = ':memory:'
    initDB()
    seedDev()
    managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
    const db = getDB()
    staffId = db.prepare(`INSERT INTO staff(full_name, hire_date, is_active) VALUES('AÇILIŞ TESTKİŞİ', '2019-11-15', 1)`).run().lastInsertRowid
    db.prepare(`INSERT INTO staff(full_name, is_active) VALUES('İKİZ AD', 1), ('İKİZ AD', 1)`).run()
    db.prepare(`INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, status)
      VALUES(?, 'annual', '2026-10-05', '2026-10-06', 2, 'approved')`).run(staffId)
  })
  const auth = t => ({ Authorization: `Bearer ${t}` })

  it('belirsiz/bulunamayan isim varsa hiçbir satır yazılmaz (422)', async () => {
    const res = await request(app).post('/api/shifts/leave/opening-balances').set(auth(supervisorToken))
      .send({ as_of_date: '2026-09-30', source: 'excel', rows: [
        { name: 'Açılış Testkişi', days: 11 }, { name: 'İKİZ AD', days: 5 }, { name: 'YOK BÖYLE', days: 3 },
      ] })
    expect(res.status).toBe(422)
    expect(res.body.errors.map(e => e.line)).toEqual([2, 3])
    expect(getDB().prepare('SELECT COUNT(*) c FROM leave_opening_balances').get().c).toBe(0)
  })

  it('giriş beklemeye düşer; onaylanana kadar kalan değişmez', async () => {
    const before = (await request(app).get(`/api/shifts/leave/annual-balance/${staffId}`).set(auth(managerToken))).body
    expect(before.basis).toBe('legal')
    const res = await request(app).post('/api/shifts/leave/opening-balances').set(auth(supervisorToken))
      .send({ as_of_date: '2026-09-30', source: 'excel', source_label: '30.09 İK Excel', rows: [{ name: 'Açılış Testkişi', days: 11 }] })
    expect(res.status).toBe(201)
    const id = res.body.ids[0]
    const pending = (await request(app).get(`/api/shifts/leave/annual-balance/${staffId}`).set(auth(managerToken))).body
    expect(pending.basis).toBe('legal')
    expect(pending.pending_opening).toMatchObject({ id, days: 11 })
    // yıllık hak alanına yazılmadı
    expect(getDB().prepare('SELECT annual_total FROM leave_balance WHERE staff_id=?').get(staffId)?.annual_total ?? 15).toBe(15)

    // vardiya amiri onaylayamaz
    expect((await request(app).post(`/api/shifts/leave/opening-balances/${id}/decision`).set(auth(supervisorToken))
      .send({ decision: 'approve' })).status).toBe(403)
    const ok = await request(app).post(`/api/shifts/leave/opening-balances/${id}/decision`).set(auth(managerToken))
      .send({ decision: 'approve', note: 'İK ile mutabık' })
    expect(ok.status).toBe(200)
    // 11 gün açılış + 15.11.2026 yıl dönümü henüz gelmedi − 05.10 sonrası 2 gün = 9
    expect(ok.body.balance).toMatchObject({ basis: 'opening', remaining: 9, accrued: 0, used: 2 })
    // yıl dönümü geçince 20 gün eklenir (7 yıl)
    const later = (await request(app).get(`/api/shifts/leave/annual-balance/${staffId}?asOf=2026-11-20`).set(auth(managerToken))).body
    expect(later).toMatchObject({ basis: 'opening', accrued: 20, remaining: 29 })
    // ikinci karar reddedilir
    expect((await request(app).post(`/api/shifts/leave/opening-balances/${id}/decision`).set(auth(managerToken))
      .send({ decision: 'reject' })).status).toBe(409)
  })

  it('izin ekranı, kiosk ucu ve personel dosyası aynı kalanı verir', async () => {
    const a = (await request(app).get(`/api/shifts/leave/entitlement/${staffId}`).set(auth(managerToken))).body
    const b = (await request(app).get(`/api/shifts/leave/balance/${staffId}`).set(auth(managerToken))).body
    const c = (await request(app).get(`/api/personnel/${staffId}/dossier`).set(auth(managerToken))).body.annual_leave
    expect([a.remaining, b.remaining, c.remaining]).toEqual([9, 9, 9])
    expect([a.basis, b.basis, c.basis]).toEqual(['opening', 'opening', 'opening'])
  })
})
