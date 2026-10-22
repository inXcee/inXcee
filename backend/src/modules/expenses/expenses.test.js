import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = r.body.token
})

describe('Expenses', () => {
  it('gecersiz tutar reddedilir', async () => {
    const res = await request(app).post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'food', description: 'Test', amount: -10, expense_date: '2026-05-15' })
    expect(res.status).toBe(400)
  })

  it('gecersiz kategori reddedilir', async () => {
    const res = await request(app).post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'xxx', description: 'Test', amount: 100, expense_date: '2026-05-15' })
    expect(res.status).toBe(400)
  })

  it('gider kaydet + listele + ozet + sil', async () => {
    const create = await request(app).post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'food', description: 'Aralik yemek alimi', amount: 12500.50,
        expense_date: new Date().toISOString().slice(0,10), invoice_no: 'FT2026-001'
      })
    expect(create.status).toBe(201)
    const id = create.body.id

    const list = await request(app).get('/api/expenses?category=food').set('Authorization', `Bearer ${token}`)
    expect(list.body.some(e => e.id === id)).toBe(true)

    const summary = await request(app).get('/api/expenses/summary?months=3').set('Authorization', `Bearer ${token}`)
    expect(summary.status).toBe(200)
    expect(summary.body.this_month_total).toBeGreaterThanOrEqual(12500)
    expect(summary.body.by_category.some(c => c.category === 'food')).toBe(true)
    expect(summary.body.per_resident).toBeGreaterThan(0)

    const del = await request(app).delete(`/api/expenses/${id}`).set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })
})

describe('Gider özeti ay sınırları', () => {
  it('months=1 yalnız bu ayı listeler (geçen ayın kuyruğu yarım ay olarak girmez)', async () => {
    const { istanbulDate, addDays } = await import('../../shared/time.js')
    const firstOfMonth = istanbulDate().slice(0, 7) + '-01'
    const lastOfPrev = addDays(firstOfMonth, -1)
    const c = await request(app).post('/api/expenses').set('Authorization', `Bearer ${token}`)
      .send({ category: 'other', description: 'Gecen ay son gun', amount: 10, expense_date: lastOfPrev })
    expect(c.status).toBe(201)
    const res = await request(app).get('/api/expenses/summary?months=1').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.monthly.map(m => m.month)).not.toContain(lastOfPrev.slice(0, 7))
  })

  it('"bu ay" İstanbul ayıdır (TR ayın 1i 00:30 = UTC önceki ay)', async () => {
    const { vi } = await import('vitest')
    const { istanbulDate, istanbulDayStartUtc } = await import('../../shared/time.js')
    // Gerçek bugünden sonraki ayın 1'i, İstanbul 00:30
    const [y, m] = istanbulDate().slice(0, 7).split('-').map(Number)
    const nextFirst = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`
    const fake = new Date(istanbulDayStartUtc(nextFirst).replace(' ', 'T') + 'Z')
    fake.setUTCMinutes(30)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(fake)
    try {
      const login = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
      const t = login.body.token
      const c = await request(app).post('/api/expenses').set('Authorization', `Bearer ${t}`)
        .send({ category: 'utilities', description: 'Ay basi fatura', amount: 777, expense_date: nextFirst })
      expect(c.status).toBe(201)
      const res = await request(app).get('/api/expenses/summary').set('Authorization', `Bearer ${t}`)
      expect(res.status).toBe(200)
      expect(res.body.this_month_total).toBe(777)
      expect(res.body.by_category).toEqual([{ category: 'utilities', total: 777, count: 1 }])
    } finally {
      vi.useRealTimers()
    }
  })
})
