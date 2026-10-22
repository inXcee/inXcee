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

  // Ekim 2026: yanlış kolon/tablo adları (check_in_at, discipline_cards, personnel_notes) yüzünden oda atamaları
  // ve disiplin kayıtları her talepte sessizce BOŞ dönüyordu.
  it('oda ataması, disiplin, zimmet bölümleri dolu gelir; okunamayan bölüm yok', async () => {
    const db = getDB()
    const pid = Number(db.prepare("INSERT INTO personnel(full_name, check_in_date) VALUES('KVKK Dolu', datetime('now','-10 days'))").run().lastInsertRowid)
    const roomId = db.prepare("SELECT id FROM rooms WHERE status='active' LIMIT 1").get().id
    db.prepare("INSERT INTO room_assignments(personnel_id, room_id, bed_no, assigned_by, assigned_at) VALUES(?, ?, 1, 1, datetime('now','-10 days'))").run(pid, roomId)
    db.prepare("INSERT INTO discipline_records(personnel_id, card_type, reason, created_by) VALUES(?, 'yellow', 'gürültü', 1)").run(pid)
    db.prepare("INSERT INTO zimmet(personnel_id, item_name, quantity, digital_signature, created_by) VALUES(?, 'Battaniye', 1, 'data:image/png;base64,AAA', 1)").run(pid)
    // Oda arkadaşının kalıştan ÖNCEKİ torbası dışa aktarılmaz; kalış içindeki torbada başkasının adı yok
    db.prepare("INSERT INTO laundry_items(room_id, status, item_count, intake_name, created_at) VALUES(?, 'delivered', 2, 'Eski Sakin', datetime('now','-40 days'))").run(roomId)
    db.prepare("INSERT INTO laundry_items(room_id, status, item_count, intake_name, created_at) VALUES(?, 'dirty', 3, 'Oda Arkadaşı', datetime('now','-2 days'))").run(roomId)

    const res = await request(app).get(`/api/kvkk/personnel/${pid}/export`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.eksik_bolumler).toEqual([])
    expect(res.body.room_assignments).toHaveLength(1)
    expect(res.body.discipline_records.map(d => d.reason)).toEqual(['gürültü'])
    expect(res.body.zimmet.map(z => z.item_name)).toEqual(['Battaniye'])
    expect(res.body.laundry_items.map(l => l.item_count)).toEqual([3])
    expect(res.body.laundry_items[0]).not.toHaveProperty('intake_name')
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

  it('anonimleştirme memleket, zimmet imzası ve push aboneliğini de temizler; zimmet kaydı kalır', async () => {
    const db = getDB()
    const pid = Number(db.prepare(`INSERT INTO personnel(full_name, hometown, check_out_date)
      VALUES('İmzalı Kişi', 'Çaycuma', datetime('now'))`).run().lastInsertRowid)
    db.prepare("INSERT INTO zimmet(personnel_id, item_name, quantity, digital_signature, created_by) VALUES(?, 'Kask', 1, 'data:image/png;base64,BBB', 1)").run(pid)
    db.prepare("INSERT INTO push_subscriptions(personnel_id, endpoint, auth_key, p256dh_key) VALUES(?, 'https://push.example/x', 'a', 'p')").run(pid)

    const res = await request(app).post(`/api/kvkk/personnel/${pid}/anonymize`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(db.prepare('SELECT hometown FROM personnel WHERE id=?').get(pid).hometown).toBeNull()
    expect(db.prepare('SELECT item_name, digital_signature FROM zimmet WHERE personnel_id=?').get(pid))
      .toEqual({ item_name: 'Kask', digital_signature: null })
    expect(db.prepare('SELECT COUNT(*) c FROM push_subscriptions WHERE personnel_id=?').get(pid).c).toBe(0)
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

describe('KVKK — retention policy', () => {
  it('default policy enabled=false (henüz set edilmemiş)', async () => {
    const res = await request(app).get('/api/kvkk/retention-policy')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.enabled).toBe(false)
    expect(res.body.days).toBe(0)
  })

  it('admin retention süresi belirleyebilir', async () => {
    const res = await request(app).put('/api/kvkk/retention-policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ days: 365 })
    expect(res.status).toBe(200)
    expect(res.body.days).toBe(365)
    expect(res.body.enabled).toBe(true)
  })

  it('geçersiz retention süresi reddedilir', async () => {
    const negative = await request(app).put('/api/kvkk/retention-policy')
      .set('Authorization', `Bearer ${adminToken}`).send({ days: -10 })
    expect(negative.status).toBe(400)
    const tooLong = await request(app).put('/api/kvkk/retention-policy')
      .set('Authorization', `Bearer ${adminToken}`).send({ days: 5000 })
    expect(tooLong.status).toBe(400)
  })

  it('non-admin retention policy değiştiremez', async () => {
    const res = await request(app).put('/api/kvkk/retention-policy')
      .set('Authorization', `Bearer ${userToken}`).send({ days: 365 })
    expect(res.status).toBe(403)
  })

  it('manuel enforce — eski checkout kayıtlarını anonimleştirir', async () => {
    const db = getDB()
    // 400 gün önce check-out yapmış bir kayıt oluştur
    const oldDate = new Date(Date.now() - 400 * 86400000).toISOString()
    const oldRes = db.prepare(`
      INSERT INTO personnel(tc_no, full_name, phone_number, company, check_out_date)
      VALUES('77777777771', 'Eski Personel', '5559876543', 'X', ?)
    `).run(oldDate)
    const oldId = oldRes.lastInsertRowid

    // 10 gün önce check-out — retention (365) altında, korunmalı
    const recent = new Date(Date.now() - 10 * 86400000).toISOString()
    const recentRes = db.prepare(`
      INSERT INTO personnel(tc_no, full_name, phone_number, company, check_out_date)
      VALUES('77777777772', 'Yakın Personel', '5559876544', 'X', ?)
    `).run(recent)
    const recentId = recentRes.lastInsertRowid

    // Policy 365 gün (yukarıda set edildi)
    const res = await request(app).post('/api/kvkk/retention-enforce')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.processed).toBeGreaterThanOrEqual(1)

    const oldAfter = db.prepare('SELECT full_name, tc_no FROM personnel WHERE id=?').get(oldId)
    expect(oldAfter.tc_no).toBeNull()
    expect(oldAfter.full_name).toMatch(/^Anonim #/)

    const recentAfter = db.prepare('SELECT full_name, tc_no FROM personnel WHERE id=?').get(recentId)
    expect(recentAfter.tc_no).toBe('77777777772') // henüz anonim değil
    expect(recentAfter.full_name).toBe('Yakın Personel')
  })

  it('policy disabled iken enforce no-op', async () => {
    await request(app).put('/api/kvkk/retention-policy')
      .set('Authorization', `Bearer ${adminToken}`).send({ days: 0 })
    const res = await request(app).post('/api/kvkk/retention-enforce')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.skipped).toBe(true)
    expect(res.body.reason).toBe('disabled')
  })
})
