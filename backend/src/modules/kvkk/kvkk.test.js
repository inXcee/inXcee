import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let adminToken, userToken, personnelId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r1 = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  adminToken = r1.body.token
  const r2 = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
  userToken = r2.body.token

  const r = getDB().prepare(`
    INSERT INTO personnel(tc_no, full_name, company) VALUES('12345678901', 'Test Personel', 'TestCo')
  `).run()
  personnelId = r.lastInsertRowid
})

describe('KVKK — policy', () => {
  it('public olarak default metin alınır', async () => {
    const res = await request(app).get('/api/kvkk/policy')
    expect(res.status).toBe(200)
    expect(res.body.text).toMatch(/KVKK/)
    expect(res.body.is_default).toBe(true)
  })

  it('admin metni güncelleyebilir', async () => {
    const newText = 'Bu özelleştirilmiş bir KVKK aydınlatma metnidir. Toplam 50 karakter üstü olmalı.'
    const res = await request(app).put('/api/kvkk/policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ text: newText })
    expect(res.status).toBe(200)

    const get = await request(app).get('/api/kvkk/policy')
    expect(get.body.text).toBe(newText)
    expect(get.body.is_default).toBe(false)
  })

  it('non-admin metni güncelleyemez', async () => {
    const res = await request(app).put('/api/kvkk/policy')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ text: 'x'.repeat(60) })
    expect(res.status).toBe(403)
  })

  it('çok kısa metin reddedilir', async () => {
    const res = await request(app).put('/api/kvkk/policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ text: 'kısa' })
    expect(res.status).toBe(400)
  })
})

describe('KVKK — personnel export', () => {
  it('admin personel verisini export edebilir', async () => {
    const res = await request(app).get(`/api/kvkk/personnel/${personnelId}/export`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.personnel.id).toBe(personnelId)
    expect(res.body.personnel.full_name).toBe('Test Personel')
    expect(res.body.exported_at).toBeTruthy()
    expect(Array.isArray(res.body.room_assignments)).toBe(true)
    expect(res.headers['content-disposition']).toMatch(/attachment/)
  })

  it('var olmayan personel 404 döner', async () => {
    const res = await request(app).get('/api/kvkk/personnel/99999/export')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('non-admin reddedilir', async () => {
    const res = await request(app).get(`/api/kvkk/personnel/${personnelId}/export`)
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})

describe('KVKK — anonymize (m.11)', () => {
  let personId
  beforeAll(() => {
    const r = getDB().prepare(`
      INSERT INTO personnel(tc_no, full_name, phone_number, company)
      VALUES('98765432109', 'Anonymize Test', '5551234567', 'TestCo')
    `).run()
    personId = r.lastInsertRowid
  })

  it('checkout yapmamış personel anonimleştirilemez', async () => {
    const res = await request(app).post(`/api/kvkk/personnel/${personId}/anonymize`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/çıkış yapmış/i)
  })

  it('checkout sonrası anonimleştirme TC/telefon/ad alanlarını siler', async () => {
    getDB().prepare("UPDATE personnel SET check_out_date=datetime('now') WHERE id=?").run(personId)
    const res = await request(app).post(`/api/kvkk/personnel/${personId}/anonymize`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const after = getDB().prepare('SELECT full_name, tc_no, phone_number FROM personnel WHERE id=?').get(personId)
    expect(after.tc_no).toBeNull()
    expect(after.phone_number).toBeNull()
    expect(after.full_name).toMatch(/^Anonim #/)
  })

  it('non-admin reddedilir', async () => {
    const res = await request(app).post(`/api/kvkk/personnel/${personnelId}/anonymize`)
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })

  it('var olmayan personel 404 döner', async () => {
    const res = await request(app).post('/api/kvkk/personnel/99999/anonymize')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })
})
