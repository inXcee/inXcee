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
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
})

describe('Bulk Actions — list personnel', () => {
  it('aktif personel listesi döner', async () => {
    const res = await request(app)
      .get('/api/bulk-actions/personnel')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('blok filtresi çalışır', async () => {
    const res = await request(app)
      .get('/api/bulk-actions/personnel?block=M1')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    res.body.forEach(p => {
      if (p.block) expect(p.block).toBe('M1')
    })
  })

  it('non-mgmt rolü 403 alır', async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })
    const techToken = login.body.token
    const res = await request(app)
      .get('/api/bulk-actions/personnel')
      .set('Authorization', `Bearer ${techToken}`)
    expect(res.status).toBe(403)
  })
})

describe('Bulk Actions — bulk checkout', () => {
  it('boş id listesi reddedilir', async () => {
    const res = await request(app)
      .post('/api/bulk-actions/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [] })
    expect(res.status).toBe(400)
  })

  it('zimmeti olmayan kişileri çıkarır, zimmetli olanları atlar', async () => {
    const db = getDB()
    const p1 = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('11111111111', 'Bulk Test 1', date('now'))").run().lastInsertRowid
    const p2 = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('22222222222', 'Bulk Test 2', date('now'))").run().lastInsertRowid
    const p3 = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('33333333333', 'Bulk Test 3', date('now'))").run().lastInsertRowid
    db.prepare("INSERT INTO zimmet (personnel_id, item_name, quantity, created_by) VALUES (?, 'Battaniye', 1, 1)").run(p1)

    const res = await request(app)
      .post('/api/bulk-actions/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [p1, p2, p3] })

    expect(res.status).toBe(200)
    expect(res.body.skipped.length).toBe(1)
    expect(res.body.skipped[0].reason).toMatch(/zimmet/)
    expect(res.body.success.length).toBe(2)

    const after = db.prepare('SELECT check_out_date FROM personnel WHERE id=?').get(p2)
    expect(after.check_out_date).toBeTruthy()
    const stillIn = db.prepare('SELECT check_out_date FROM personnel WHERE id=?').get(p1)
    expect(stillIn.check_out_date).toBeNull()
  })

  it('100\'den fazla id reddedilir', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1)
    const res = await request(app)
      .post('/api/bulk-actions/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids })
    expect(res.status).toBe(400)
  })
})

describe('Bulk Actions — bulk transfer', () => {
  it('hedef yoksa reddedilir', async () => {
    const res = await request(app)
      .post('/api/bulk-actions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [1] })
    expect(res.status).toBe(400)
  })

  it('hedef bloga toplu yerlestirir', async () => {
    const db = getDB()
    const p1 = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('44444444444', 'Transfer Test 1', date('now'))").run().lastInsertRowid
    const p2 = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('55555555555', 'Transfer Test 2', date('now'))").run().lastInsertRowid

    const res = await request(app)
      .post('/api/bulk-actions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [p1, p2], target_block: 'M1' })

    expect(res.status).toBe(200)
    expect(res.body.success.length).toBe(2)

    const assigned = db.prepare(`
      SELECT r.block FROM room_assignments ra JOIN rooms r ON r.id=ra.room_id
      WHERE ra.personnel_id=? AND ra.check_out_at IS NULL
    `).get(p1)
    expect(assigned.block).toBe('M1')
  })

  it('vardiya filtresi ile listele', async () => {
    const db = getDB()
    const p = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('77777777777', 'Gece Test', date('now'))").run().lastInsertRowid
    db.prepare("INSERT INTO shifts(personnel_id, shift_type, start_hour, end_hour) VALUES(?, 'night', 19, 7)").run(p)
    const res = await request(app).get('/api/bulk-actions/personnel?shift_type=night').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.some(r => r.id === p)).toBe(true)
    expect(res.body.every(r => r.shift_type === 'night')).toBe(true)
  })

  it('zimmeti olan filtresi', async () => {
    const res = await request(app).get('/api/bulk-actions/personnel?has_zimmet=1').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.every(r => r.unreturned_zimmet > 0)).toBe(true)
  })

  it('stats endpoint ozet doner', async () => {
    const res = await request(app).get('/api/bulk-actions/stats').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('by_block')
    expect(res.body).toHaveProperty('by_shift')
    expect(res.body.total).toBeGreaterThan(0)
  })

  it('CSV export', async () => {
    const res = await request(app).get('/api/bulk-actions/export').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/csv/)
    expect(res.text.split('\r\n')[0]).toContain('Ad Soyad')
  })
})

describe('Bulk Actions — yeni bulk islemler', () => {
  it('toplu vardiya degistir', async () => {
    const db = getDB()
    const p1 = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('88888888888', 'Vardiya Test', date('now'))").run().lastInsertRowid

    const res = await request(app).post('/api/bulk-actions/set-shift')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [p1], shift_type: 'night' })
    expect(res.status).toBe(200)
    expect(res.body.success.length).toBe(1)

    const s = db.prepare('SELECT shift_type FROM shifts WHERE personnel_id=?').get(p1)
    expect(s.shift_type).toBe('night')
  })

  it('gecersiz shift_type reddedilir', async () => {
    const res = await request(app).post('/api/bulk-actions/set-shift')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [1], shift_type: 'xxx' })
    expect(res.status).toBe(400)
  })

  it('toplu kara liste + cikar', async () => {
    const db = getDB()
    const p = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('99999999999', 'KL Test', date('now'))").run().lastInsertRowid

    const add = await request(app).post('/api/bulk-actions/blacklist')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [p], blacklisted: true, reason: 'Disiplinsizlik' })
    expect(add.status).toBe(200)
    expect(add.body.success.length).toBe(1)
    const after = db.prepare('SELECT is_blacklisted FROM personnel WHERE id=?').get(p)
    expect(after.is_blacklisted).toBe(1)

    const rem = await request(app).post('/api/bulk-actions/blacklist')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [p], blacklisted: false })
    expect(rem.status).toBe(200)
    const after2 = db.prepare('SELECT is_blacklisted FROM personnel WHERE id=?').get(p)
    expect(after2.is_blacklisted).toBe(0)
  })

  it('kara liste sebep yoksa reddedilir', async () => {
    const res = await request(app).post('/api/bulk-actions/blacklist')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [1], blacklisted: true, reason: 'ab' })
    expect(res.status).toBe(400)
  })

  it('toplu disiplin puani', async () => {
    const db = getDB()
    const p = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('10101010101', 'Dis Test', date('now'))").run().lastInsertRowid
    const res = await request(app).post('/api/bulk-actions/discipline')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [p], points: 5, reason: 'Toplu test ihlali' })
    expect(res.status).toBe(200)
    const after = db.prepare('SELECT discipline_points FROM personnel WHERE id=?').get(p)
    expect(after.discipline_points).toBeGreaterThanOrEqual(5)
  })

  it('disiplin puan 0 reddedilir', async () => {
    const res = await request(app).post('/api/bulk-actions/discipline')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [1], points: 0, reason: 'test' })
    expect(res.status).toBe(400)
  })

  it('toplu firma atama', async () => {
    const db = getDB()
    const c = db.prepare("INSERT INTO companies (name) VALUES ('Bulk Co')").run().lastInsertRowid
    const p = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('11211121112', 'Firma Test', date('now'))").run().lastInsertRowid
    const res = await request(app).post('/api/bulk-actions/set-company')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [p], company_id: c })
    expect(res.status).toBe(200)
    const after = db.prepare('SELECT company, company_id FROM personnel WHERE id=?').get(p)
    expect(after.company_id).toBe(c)
    expect(after.company).toBe('Bulk Co')
  })
})

describe('Bulk Actions — bulk transfer mevcut akis', () => {
  it('mevcut atamayi kapatip yenisini olusturur', async () => {
    const db = getDB()
    const p = db.prepare("INSERT INTO personnel (tc_no, full_name, check_in_date) VALUES ('66666666666', 'Move Test', date('now'))").run().lastInsertRowid
    // Once M1'e ata
    await request(app).post('/api/bulk-actions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [p], target_block: 'M1' })
    // Sonra M2'ye transfer
    const res = await request(app).post('/api/bulk-actions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [p], target_block: 'M2' })
    expect(res.status).toBe(200)
    expect(res.body.success.length).toBe(1)

    const active = db.prepare(`
      SELECT r.block FROM room_assignments ra JOIN rooms r ON r.id=ra.room_id
      WHERE ra.personnel_id=? AND ra.check_out_at IS NULL
    `).all(p)
    expect(active.length).toBe(1)
    expect(active[0].block).toBe('M2')
  })
})
