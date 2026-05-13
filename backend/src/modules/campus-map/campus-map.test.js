import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let mgrToken, supToken
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  mgrToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Campus Map pins', () => {
  it('GET /pins returns empty object initially', async () => {
    const res = await request(app).get('/api/campus-map/pins').set('Authorization', `Bearer ${mgrToken}`)
    expect(res.status).toBe(200)
    expect(res.body.pins).toEqual({})
  })

  it('GET requires auth', async () => {
    const res = await request(app).get('/api/campus-map/pins')
    expect(res.status).toBe(401)
  })

  it('PUT requires campus_manager (supervisor rejected)', async () => {
    const res = await request(app).put('/api/campus-map/pins')
      .set('Authorization', `Bearer ${supToken}`)
      .send({ pins: { M1: { x: 100, y: 200 } } })
    expect(res.status).toBe(403)
  })

  it('PUT saves and GET returns same data', async () => {
    const pins = { M1: { x: 100, y: 200 }, S2: { x: 300, y: 400 } }
    const put = await request(app).put('/api/campus-map/pins')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ pins })
    expect(put.status).toBe(200)
    expect(put.body.ok).toBe(true)
    expect(put.body.count).toBe(2)

    const get = await request(app).get('/api/campus-map/pins').set('Authorization', `Bearer ${supToken}`)
    expect(get.body.pins).toEqual(pins)
  })

  it('PUT sanitizes invalid entries', async () => {
    const res = await request(app).put('/api/campus-map/pins')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ pins: {
        VALID: { x: 50, y: 60 },
        BAD_NO_Y: { x: 10 },
        BAD_STR: { x: 'abc', y: 5 },
        BAD_RANGE: { x: -1, y: 5 },
        BAD_HUGE: { x: 99999, y: 0 },
      }})
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(1)

    const get = await request(app).get('/api/campus-map/pins').set('Authorization', `Bearer ${mgrToken}`)
    expect(get.body.pins).toEqual({ VALID: { x: 50, y: 60 } })
  })

  it('PUT rejects non-object body', async () => {
    const res = await request(app).put('/api/campus-map/pins')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ pins: 'not-an-object' })
    expect(res.status).toBe(400)
  })
})
