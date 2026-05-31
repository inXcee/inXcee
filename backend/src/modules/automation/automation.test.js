import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = r.body.token
})

describe('Automation Rules', () => {
  it('gecersiz trigger reddedilir', async () => {
    const res = await request(app).post('/api/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', trigger_type: 'xxx', trigger_threshold: 50, action_type: 'log' })
    expect(res.status).toBe(400)
  })

  it('kural olustur + listele + test + sil', async () => {
    const c = await request(app).post('/api/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Doluluk %50 ustu',
        trigger_type: 'occupancy_high', trigger_threshold: 50,
        action_type: 'log', cooldown_hours: 1,
      })
    expect(c.status).toBe(201)
    const id = c.body.id

    const list = await request(app).get('/api/automation').set('Authorization', `Bearer ${token}`)
    expect(list.body.some(r => r.id === id)).toBe(true)

    const test = await request(app).post(`/api/automation/${id}/test`).set('Authorization', `Bearer ${token}`)
    expect(test.status).toBe(200)
    expect(test.body).toHaveProperty('firing')
    expect(test.body).toHaveProperty('value')

    const del = await request(app).delete(`/api/automation/${id}`).set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })

  it('evaluator: contract_expiring trigger calisir', async () => {
    const db = getDB()
    // 10 gun sonra biten firma ekle
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0,10)
    db.prepare("INSERT INTO companies (name, contract_end, is_active) VALUES ('Bitecek', ?, 1)").run(future)

    const c = await request(app).post('/api/automation').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sozlesme 30 gun', trigger_type: 'contract_expiring', trigger_threshold: 30, action_type: 'log' })
    const id = c.body.id

    const test = await request(app).post(`/api/automation/${id}/test`).set('Authorization', `Bearer ${token}`)
    expect(test.body.firing).toBe(true)
    expect(test.body.value).toBeGreaterThanOrEqual(1)
  })

  it('evaluator: access_overdue_inside trigger (16+ saat çıkışsız içeride)', async () => {
    const db = getDB()
    db.prepare('INSERT INTO personnel(full_name) VALUES(?)').run('Otomasyon Icerde')
    const pid = db.prepare("SELECT id FROM personnel WHERE full_name='Otomasyon Icerde'").get().id
    db.prepare(`INSERT INTO access_events(holder_type,holder_id,event_type,result,scanned_at)
      VALUES('personnel',?,'entry','ok',datetime('now','-20 hours'))`).run(pid)

    const c = await request(app).post('/api/automation').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Çıkışsız 16s', trigger_type: 'access_overdue_inside', trigger_threshold: 16, action_type: 'log' })
    expect(c.status).toBe(201)
    const test = await request(app).post(`/api/automation/${c.body.id}/test`).set('Authorization', `Bearer ${token}`)
    expect(test.body.firing).toBe(true)
    expect(test.body.value).toBeGreaterThanOrEqual(1)
  })
})
