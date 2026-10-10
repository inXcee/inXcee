import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let supervisor
let laundry
const login = async (u) => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
const auth = (t) => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  supervisor = await login('vardiya')
  laundry = await login('camasir')
})

describe('Öğün başı sayım', () => {
  it('yazar, aynı öğünü düzeltir (toplamaz), önceki değeri döner; listeler', async () => {
    const put = (body) => request(app).put('/api/meals/counts').set(auth(supervisor)).send(body)
    const first = await put({ meal_date: '2031-05-01', meal_type: 'lunch', count: 340, source: 'telegram' })
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ count: 340, previous: null, source: 'telegram', location: '' })

    const fix = await put({ meal_date: '2031-05-01', meal_type: 'lunch', count: 352, note: 'düzeltme' })
    expect(fix.body).toMatchObject({ count: 352, previous: 340, id: first.body.id })

    await put({ meal_date: '2031-05-01', meal_type: 'night', count: 60 })
    await put({ meal_date: '2031-05-01', meal_type: 'lunch', location: 'Büyük Lokal', count: 40 })
    await put({ meal_date: '2031-05-02', meal_type: 'breakfast', count: 200 })

    const day = await request(app).get('/api/meals/counts?date=2031-05-01').set(auth(laundry))
    expect(day.status).toBe(200)
    expect(day.body.rows).toHaveLength(3)
    expect(day.body.total).toBe(452)

    const range = await request(app).get('/api/meals/counts?from=2031-05-01&to=2031-05-02').set(auth(laundry))
    expect(range.body.by_day).toEqual({ '2031-05-01': 452, '2031-05-02': 200 })
  })

  it('doğrular ve yetki uygular; siler', async () => {
    const bad = await request(app).put('/api/meals/counts').set(auth(supervisor))
      .send({ meal_date: '2031-05-03', meal_type: 'brunch', count: 5 })
    expect(bad.status).toBe(400)
    const neg = await request(app).put('/api/meals/counts').set(auth(supervisor))
      .send({ meal_date: '2031-05-03', meal_type: 'lunch', count: -1 })
    expect(neg.status).toBe(400)
    const denied = await request(app).put('/api/meals/counts').set(auth(laundry))
      .send({ meal_date: '2031-05-03', meal_type: 'lunch', count: 5 })
    expect(denied.status).toBe(403)

    const made = await request(app).put('/api/meals/counts').set(auth(supervisor))
      .send({ meal_date: '2031-05-03', meal_type: 'dinner', count: 7 })
    const del = await request(app).delete(`/api/meals/counts/${made.body.id}`).set(auth(supervisor))
    expect(del.status).toBe(200)
    const again = await request(app).delete(`/api/meals/counts/${made.body.id}`).set(auth(supervisor))
    expect(again.status).toBe(404)
  })
})
