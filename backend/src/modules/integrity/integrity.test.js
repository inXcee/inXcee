import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

describe('H12 S1 — Tutarsızlık taraması', () => {
  it('GET /integrity/scan döner', async () => {
    const r = await request(app).get('/api/integrity/scan').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body).toHaveProperty('counts')
    expect(r.body).toHaveProperty('issues')
    expect(r.body.counts).toHaveProperty('critical')
    expect(r.body.counts).toHaveProperty('warning')
    expect(r.body.counts).toHaveProperty('info')
  })
})

describe('H12 S2 — KVKK V2', () => {
  it('CREATE + LIST', async () => {
    const c = await request(app).post('/api/integrity/kvkk').set('Authorization', `Bearer ${token}`)
      .send({ kind: 'access', target_type: 'staff', target_id: 1, requester_name: 'Test Kişi', details: 'Veri talebi' })
    expect(c.status).toBe(201)
    const id = c.body.id

    const list = await request(app).get('/api/integrity/kvkk').set('Authorization', `Bearer ${token}`)
    expect(list.body.find(x => x.id === id)).toBeTruthy()
  })

  it('eksik alan 400', async () => {
    const r = await request(app).post('/api/integrity/kvkk').set('Authorization', `Bearer ${token}`)
      .send({ kind: 'access' })
    expect(r.status).toBe(400)
  })

  it('LIST bekleyen talepte 30 günlük yasal kalan süreyi (days_left) döndürür', async () => {
    const c = await request(app).post('/api/integrity/kvkk').set('Authorization', `Bearer ${token}`)
      .send({ kind: 'erase', target_type: 'personnel', target_id: 1, requester_name: 'Süre Testi' })
    const list = await request(app).get('/api/integrity/kvkk').set('Authorization', `Bearer ${token}`)
    const item = list.body.find(x => x.id === c.body.id)
    expect(typeof item.days_left).toBe('number')
    expect(item.days_left).toBeGreaterThanOrEqual(29) // yeni talep: ~30 gün
    expect(item.days_left).toBeLessThanOrEqual(30)
  })

  it('geçersiz kind 400', async () => {
    const r = await request(app).post('/api/integrity/kvkk').set('Authorization', `Bearer ${token}`)
      .send({ kind: 'invalid', target_type: 'staff', target_id: 1, requester_name: 'X' })
    expect(r.status).toBe(400)
  })

  it('approve flow → execute', async () => {
    const db = getDB()
    db.prepare('INSERT INTO staff(full_name, tc_no, is_active) VALUES(?,?,1)').run('KVKK Test', '55555555555')
    const sid = db.prepare('SELECT id FROM staff WHERE full_name=?').get('KVKK Test').id

    const c = await request(app).post('/api/integrity/kvkk').set('Authorization', `Bearer ${token}`)
      .send({ kind: 'erase', target_type: 'staff', target_id: sid, requester_name: 'Kişi' })
    const id = c.body.id

    const d = await request(app).post(`/api/integrity/kvkk/${id}/decide`).set('Authorization', `Bearer ${token}`)
      .send({ decision: 'approved' })
    expect(d.status).toBe(200)
    expect(d.body.executes_at).toBeTruthy()

    const ex = await request(app).post(`/api/integrity/kvkk/${id}/execute`).set('Authorization', `Bearer ${token}`)
    expect(ex.status).toBe(200)

    // Staff anonimleşti mi?
    const after = db.prepare('SELECT tc_no, full_name, is_active FROM staff WHERE id=?').get(sid)
    expect(after.tc_no).toBeNull()
    expect(after.full_name).toMatch(/^KVKK-/)
    expect(after.is_active).toBe(0)
  })

  it('pending olmadan execute 400', async () => {
    const c = await request(app).post('/api/integrity/kvkk').set('Authorization', `Bearer ${token}`)
      .send({ kind: 'access', target_type: 'staff', target_id: 1, requester_name: 'X' })
    const r = await request(app).post(`/api/integrity/kvkk/${c.body.id}/execute`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(400)
  })
})

describe('H12 S3 — Audit summary', () => {
  it('GET /integrity/audit-summary', async () => {
    const r = await request(app).get('/api/integrity/audit-summary?days=30').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body).toHaveProperty('by_action')
    expect(r.body).toHaveProperty('by_user')
    expect(r.body).toHaveProperty('daily_trend')
  })
})

describe('H12 S4 — Backup status', () => {
  it('GET /integrity/backup-status', async () => {
    const r = await request(app).get('/api/integrity/backup-status').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    // backup_log tablosu yoksa message, varsa backups dizisi
    expect(r.body).toBeTypeOf('object')
  })
})

describe('H12 Yetki', () => {
  it('campus_manager olmayan KVKK karar veremez', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const r = await request(app).get('/api/integrity/kvkk').set('Authorization', `Bearer ${t}`)
    expect(r.status).toBe(403)
  })
})
