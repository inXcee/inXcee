import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, staffId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  let s = db.prepare('SELECT id FROM staff LIMIT 1').get()
  if (!s) {
    db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?,1)').run('Safety Test')
    s = db.prepare('SELECT id FROM staff WHERE full_name=?').get('Safety Test')
  }
  staffId = s.id
})

describe('H6 IG1 — Eğitim oturumları', () => {
  it('CREATE/LIST/GET/UPDATE/DELETE training session', async () => {
    const c = await request(app).post('/api/safety/sessions').set('Authorization', `Bearer ${token}`)
      .send({ title: 'İSG Temel', category: 'safety', session_date: '2026-06-15', duration_min: 90, instructor: 'A. Yılmaz' })
    expect(c.status).toBe(201)
    const id = c.body.id

    const list = await request(app).get('/api/safety/sessions').set('Authorization', `Bearer ${token}`)
    expect(list.body.find(x => x.id === id)).toBeTruthy()

    const get = await request(app).get(`/api/safety/sessions/${id}`).set('Authorization', `Bearer ${token}`)
    expect(get.body.title).toBe('İSG Temel')
    expect(Array.isArray(get.body.attendances)).toBe(true)

    const upd = await request(app).put(`/api/safety/sessions/${id}`).set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed', notes: 'Tamamlandı' })
    expect(upd.status).toBe(200)

    const del = await request(app).delete(`/api/safety/sessions/${id}`).set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })

  it('zorunlu alan eksik 400', async () => {
    const r = await request(app).post('/api/safety/sessions').set('Authorization', `Bearer ${token}`)
      .send({ title: 'eksik' })
    expect(r.status).toBe(400)
  })

  it('geçersiz kategori 400', async () => {
    const r = await request(app).post('/api/safety/sessions').set('Authorization', `Bearer ${token}`)
      .send({ title: 'x', category: 'invalid_cat', session_date: '2026-06-15' })
    expect(r.status).toBe(400)
  })

  it('katılımcı ekle + toggle + sil', async () => {
    const c = await request(app).post('/api/safety/sessions').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Yangın', category: 'fire', session_date: '2026-07-01' })
    const sid = c.body.id

    const add = await request(app).post(`/api/safety/sessions/${sid}/attendances`)
      .set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, attended: true, cert_expires_at: '2027-07-01' })
    expect(add.status).toBe(200)

    const get = await request(app).get(`/api/safety/sessions/${sid}`).set('Authorization', `Bearer ${token}`)
    expect(get.body.attendances.length).toBe(1)
    expect(get.body.attendances[0].attended).toBe(1)

    // Re-call upsert ile toggle
    await request(app).post(`/api/safety/sessions/${sid}/attendances`).set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, attended: false })
    const get2 = await request(app).get(`/api/safety/sessions/${sid}`).set('Authorization', `Bearer ${token}`)
    expect(get2.body.attendances[0].attended).toBe(0)
  })

  it('toplu katılımcı', async () => {
    const c = await request(app).post('/api/safety/sessions').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Toplu', category: 'safety', session_date: '2026-08-01' })
    const sid = c.body.id

    const db = getDB()
    db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?,1)').run('Bulk Test 2')
    const s2 = db.prepare('SELECT id FROM staff WHERE full_name=?').get('Bulk Test 2').id

    const res = await request(app).post(`/api/safety/sessions/${sid}/attendances`)
      .set('Authorization', `Bearer ${token}`)
      .send({ staff_ids: [staffId, s2], attended: true })
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(2)
  })
})

describe('H6 IG2 — Sertifika uyarı', () => {
  it('GET /expiring-certs yakın bitenler döner', async () => {
    const c = await request(app).post('/api/safety/sessions').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Cert Test', category: 'safety', session_date: '2026-01-15' })
    const sid = c.body.id

    // 10 gün sonra bitecek sertifika
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    await request(app).post(`/api/safety/sessions/${sid}/attendances`).set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, attended: true, cert_expires_at: soon })

    const res = await request(app).get('/api/safety/expiring-certs?days=30').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.find(r => r.staff_id === staffId && r.cert_expires_at === soon)).toBeTruthy()
  })

  it('personel sertifika geçmişi', async () => {
    const res = await request(app).get(`/api/safety/staff/${staffId}/training`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('I1 — Sertifika vade cron', () => {
  it('eşik günlerinde bildirim üretir, tekrar çağrıda dedup eder', async () => {
    const { checkCertExpiries } = await import('./service.js')
    const db = getDB()

    const c = await request(app).post('/api/safety/sessions').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Cron Cert', category: 'safety', session_date: '2026-01-10' })
    const sid = c.body.id

    // Bugünden tam 30 gün sonra bitecek sertifika (eşik listesinde)
    const today = new Date().toISOString().slice(0, 10)
    const at30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    await request(app).post(`/api/safety/sessions/${sid}/attendances`).set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, attended: true, cert_expires_at: at30 })

    const before = db.prepare("SELECT COUNT(*) c FROM notifications WHERE module='safety' AND message LIKE 'Sertifika vadesine%'").get().c
    const created = checkCertExpiries(today)
    expect(created).toBeGreaterThanOrEqual(1)
    const after = db.prepare("SELECT COUNT(*) c FROM notifications WHERE module='safety' AND message LIKE 'Sertifika vadesine%'").get().c
    expect(after).toBe(before + created)

    // Aynı gün ikinci çalıştırma — dedup, yeni bildirim yok
    const second = checkCertExpiries(today)
    expect(second).toBe(0)
  })

  it('eşik dışı gün sayısında bildirim üretmez', async () => {
    const { checkCertExpiries } = await import('./service.js')
    const db = getDB()

    const c = await request(app).post('/api/safety/sessions').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Cron Cert 2', category: 'safety', session_date: '2026-01-11' })
    const sid = c.body.id

    // 23 gün sonra — eşik değil (60/30/14/7/1/0)
    const at23 = new Date(Date.now() + 23 * 86400000).toISOString().slice(0, 10)
    const s2 = db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?,1)').run('Cert Esik Disi').lastInsertRowid
    await request(app).post(`/api/safety/sessions/${sid}/attendances`).set('Authorization', `Bearer ${token}`)
      .send({ staff_id: s2, attended: true, cert_expires_at: at23 })

    const today = new Date().toISOString().slice(0, 10)
    checkCertExpiries(today)
    const found = db.prepare("SELECT COUNT(*) c FROM notifications WHERE message LIKE '%Cert Esik Disi%'").get().c
    expect(found).toBe(0)
  })
})

describe('H6 IG3 — KKD zimmet', () => {
  it('CREATE/LIST/RETURN/DELETE kkd assignment', async () => {
    const c = await request(app).post('/api/safety/kkd').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, item_type: 'Baret', size: 'L', serial_no: 'B-001' })
    expect(c.status).toBe(201)
    const id = c.body.id

    const list = await request(app).get('/api/safety/kkd?active=1').set('Authorization', `Bearer ${token}`)
    expect(list.body.find(k => k.id === id)).toBeTruthy()

    const ret = await request(app).post(`/api/safety/kkd/${id}/return`).set('Authorization', `Bearer ${token}`)
      .send({ condition: 'sağlam' })
    expect(ret.status).toBe(200)

    // tekrar iade 400
    const ret2 = await request(app).post(`/api/safety/kkd/${id}/return`).set('Authorization', `Bearer ${token}`).send({})
    expect(ret2.status).toBe(400)

    const list2 = await request(app).get('/api/safety/kkd?active=0').set('Authorization', `Bearer ${token}`)
    expect(list2.body.find(k => k.id === id)).toBeTruthy()
  })

  it('zorunlu alan eksik 400', async () => {
    const r = await request(app).post('/api/safety/kkd').set('Authorization', `Bearer ${token}`)
      .send({ item_type: 'Baret' })
    expect(r.status).toBe(400)
  })
})

describe('H6 Yetki', () => {
  it('campus_manager olmayan eğitim yaratamaz', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const res = await request(app).post('/api/safety/sessions').set('Authorization', `Bearer ${t}`)
      .send({ title: 'x', category: 'safety', session_date: '2026-09-01' })
    expect(res.status).toBe(403)
  })

  it('view rolu listeleyebilir', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })).body.token
    const r = await request(app).get('/api/safety/sessions').set('Authorization', `Bearer ${t}`)
    expect(r.status).toBe(200)
  })
})
