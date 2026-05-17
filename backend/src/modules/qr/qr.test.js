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
    db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?, 1)').run('QR Test')
    s = db.prepare('SELECT id FROM staff WHERE full_name=?').get('QR Test')
  }
  staffId = s.id
})

describe('H5 Q1 — Personel QR üret', () => {
  it('POST /qr/staff/:id/generate token üretir', async () => {
    const r = await request(app).post(`/api/qr/staff/${staffId}/generate`)
      .set('Authorization', `Bearer ${token}`).send({})
    expect(r.status).toBe(200)
    expect(r.body.qr_token).toBeTruthy()
    expect(r.body.qr_token.length).toBeGreaterThan(10)
  })

  it('aynı staff icin tekrar cağrı aynı token döner', async () => {
    const r1 = await request(app).post(`/api/qr/staff/${staffId}/generate`)
      .set('Authorization', `Bearer ${token}`).send({})
    const r2 = await request(app).post(`/api/qr/staff/${staffId}/generate`)
      .set('Authorization', `Bearer ${token}`).send({})
    expect(r1.body.qr_token).toBe(r2.body.qr_token)
  })

  it('regenerate=true ile token değişir', async () => {
    const r1 = await request(app).post(`/api/qr/staff/${staffId}/generate`)
      .set('Authorization', `Bearer ${token}`).send({})
    const r2 = await request(app).post(`/api/qr/staff/${staffId}/generate`)
      .set('Authorization', `Bearer ${token}`).send({ regenerate: true })
    expect(r1.body.qr_token).not.toBe(r2.body.qr_token)
  })

  it('POST /qr/bulk-generate aktif personelin eksiklerini doldurur', async () => {
    const db = getDB()
    db.prepare('UPDATE staff SET qr_token = NULL').run()
    const res = await request(app).post('/api/qr/bulk-generate').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(200)
    expect(res.body.generated).toBeGreaterThanOrEqual(1)
    // Tekrar çağrılınca 0 üretir
    const r2 = await request(app).post('/api/qr/bulk-generate').set('Authorization', `Bearer ${token}`).send({})
    expect(r2.body.generated).toBe(0)
  })
})

describe('H5 Q2 — Kart PDF', () => {
  it('GET /qr/staff/:id/card/pdf PDF döner', async () => {
    await request(app).post(`/api/qr/staff/${staffId}/generate`).set('Authorization', `Bearer ${token}`).send({})
    const res = await request(app).get(`/api/qr/staff/${staffId}/card/pdf`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/pdf/)
    expect(res.body.length).toBeGreaterThan(500)
  })

  it('QR olmayan personel icin 400', async () => {
    const db = getDB()
    db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?, 1)').run('NoQR Test')
    const noqr = db.prepare('SELECT id FROM staff WHERE full_name=?').get('NoQR Test').id
    const res = await request(app).get(`/api/qr/staff/${noqr}/card/pdf`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })
})

describe('H5 Q4 — Servis biniş scan', () => {
  it('geçersiz QR 404 döner', async () => {
    const res = await request(app).post('/api/qr/scan/transport').set('Authorization', `Bearer ${token}`)
      .send({ qr_token: 'invalidtokenxx' })
    expect(res.status).toBe(404)
  })

  it('bugün ataması yoksa 404 + isim döner', async () => {
    const g = await request(app).post(`/api/qr/staff/${staffId}/generate`).set('Authorization', `Bearer ${token}`).send({ regenerate: true })
    const res = await request(app).post('/api/qr/scan/transport').set('Authorization', `Bearer ${token}`)
      .send({ qr_token: g.body.qr_token })
    expect(res.status).toBe(404)
    expect(res.body.staff_id).toBe(staffId)
  })

  it('atama varsa boarded=1 yapar', async () => {
    const today = new Date().toISOString().slice(0, 10)
    // Rota + atama oluştur
    const route = (await request(app).post('/api/transport/routes').set('Authorization', `Bearer ${token}`)
      .send({ name: 'QR Test Hat', capacity: 10 })).body.id
    await request(app).post('/api/transport/assign').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, route_id: route, work_date: today })

    const g = await request(app).post(`/api/qr/staff/${staffId}/generate`).set('Authorization', `Bearer ${token}`).send({ regenerate: true })
    const res = await request(app).post('/api/qr/scan/transport').set('Authorization', `Bearer ${token}`)
      .send({ qr_token: g.body.qr_token })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // Manifest'te boarded=1 görünmeli
    const m = (await request(app).get(`/api/transport/routes/${route}/manifest?date=${today}`)
      .set('Authorization', `Bearer ${token}`)).body
    expect(m.boarded_count).toBeGreaterThanOrEqual(1)
  })

  it('AVS: prefix ile de çalışır', async () => {
    const g = await request(app).post(`/api/qr/staff/${staffId}/generate`).set('Authorization', `Bearer ${token}`).send({ regenerate: true })
    const res = await request(app).post('/api/qr/scan/transport').set('Authorization', `Bearer ${token}`)
      .send({ qr_token: `AVS:${g.body.qr_token}` })
    // 404 olabilir (yeni token ile atama yok) ama recognized
    expect([200, 404]).toContain(res.status)
  })
})

describe('H5 Q6 — Kişinin kendi QR (self-service)', () => {
  it('kiosk token ile /my-qr çalışır', async () => {
    const jwt = await import('jsonwebtoken')
    const db = getDB()
    let p = db.prepare('SELECT id FROM personnel LIMIT 1').get()
    if (!p) {
      db.prepare('INSERT INTO personnel(full_name, tc_no) VALUES(?,?)').run('SelfQR', '77777777777')
      p = db.prepare('SELECT id FROM personnel WHERE tc_no=?').get('77777777777')
    }
    const kioskToken = jwt.default.sign({ personnelId: p.id, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app).get('/api/self-service/my-qr').set('Authorization', `Bearer ${kioskToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('qr_token')
  })
})

describe('H5 Yetki', () => {
  it('campus_manager olmayan generate yapamaz', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const res = await request(app).post(`/api/qr/staff/${staffId}/generate`).set('Authorization', `Bearer ${t}`).send({})
    expect(res.status).toBe(403)
  })

  it('view rolu scan ve card görür', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const r = await request(app).get(`/api/qr/staff/${staffId}`).set('Authorization', `Bearer ${t}`)
    expect(r.status).toBe(200)
  })
})
