import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let mgrToken, laundryToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  mgrToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  laundryToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
  // Bir feedback + audit (AVS) ekle
  const db = getDB()
  const r = db.prepare("INSERT INTO feedback(personnel_id, type, message) VALUES(NULL,'suggestion','Admin görünüm testi için geri bildirim mesajı')").run()
  db.prepare("INSERT INTO audit_log(user_id, action, module, target_id, detail) VALUES(NULL,'kiosk_avs_feedback','avs-self-service',?,?)").run(r.lastInsertRowid, JSON.stringify({ workerId: 1 }))
})

describe('Feedback admin', () => {
  it('campus_manager listeyi görür (source_name dahil)', async () => {
    const res = await request(app).get('/api/feedback').set('Authorization', `Bearer ${mgrToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(f => f.type === 'suggestion')).toBe(true)
    expect(res.body[0]).toHaveProperty('source_name')
  })
  it('yetkisiz rol (laundry) 403', async () => {
    const res = await request(app).get('/api/feedback').set('Authorization', `Bearer ${laundryToken}`)
    expect(res.status).toBe(403)
  })
  it('resolve çözüldü işaretler', async () => {
    const list = (await request(app).get('/api/feedback').set('Authorization', `Bearer ${mgrToken}`)).body
    const id = list[0].id
    const res = await request(app).patch(`/api/feedback/${id}/resolve`).set('Authorization', `Bearer ${mgrToken}`).send({ resolved: true })
    expect(res.status).toBe(200)
    const after = getDB().prepare('SELECT resolved_at FROM feedback WHERE id=?').get(id)
    expect(after.resolved_at).toBeTruthy()
  })
})
