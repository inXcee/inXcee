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
