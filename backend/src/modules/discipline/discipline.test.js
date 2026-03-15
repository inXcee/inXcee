import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, personnelId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = (await import('../../shared/db/index.js')).getDB()
  personnelId = db.prepare("INSERT INTO personnel(tc_no,full_name) VALUES('55555','Test P')").run().lastInsertRowid
})

describe('Discipline', () => {
  it('adds yellow card', async () => {
    const res = await request(app)
      .post('/api/discipline/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: personnelId, card_type: 'yellow', reason: 'Sigara ihlali' })
    expect(res.status).toBe(201)
  })
  it('auto-notifies at 3 yellow cards', async () => {
    for (let i = 0; i < 2; i++) {
      await request(app).post('/api/discipline/records').set('Authorization', `Bearer ${token}`)
        .send({ personnel_id: personnelId, card_type: 'yellow', reason: 'Test ihlal' })
    }
    const db = (await import('../../shared/db/index.js')).getDB()
    const notif = db.prepare("SELECT * FROM notifications WHERE message LIKE '%fesih%'").get()
    expect(notif).toBeTruthy()
  })
})
