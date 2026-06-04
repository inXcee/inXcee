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

describe('Visitors', () => {
  it('ad olmadan reddedilir', async () => {
    const res = await request(app)
      .post('/api/visitors')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0532' })
    expect(res.status).toBe(400)
  })

  it('ziyaretci giris + cikis akisi', async () => {
    const res = await request(app)
      .post('/api/visitors')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Ahmet Ziyaretci', phone: '0532123', purpose: 'aile ziyareti' })
    expect(res.status).toBe(201)
    const id = res.body.id

    const list = await request(app)
      .get('/api/visitors?active=1')
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.some(v => v.id === id)).toBe(true)

    const out = await request(app)
      .post(`/api/visitors/${id}/checkout`)
      .set('Authorization', `Bearer ${token}`)
    expect(out.status).toBe(200)

    // Tekrar checkout reddedilir
    const out2 = await request(app)
      .post(`/api/visitors/${id}/checkout`)
      .set('Authorization', `Bearer ${token}`)
    expect(out2.status).toBe(404)
  })

  it('cok uzun ziyaretci adi 400 doner (Zod sweep)', async () => {
    const res = await request(app)
      .post('/api/visitors')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'A'.repeat(201) })
    expect(res.status).toBe(400)
  })

  it('cok uzun ziyaret amaci 400 doner (Zod sweep)', async () => {
    const res = await request(app)
      .post('/api/visitors')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Geçerli Ad', purpose: 'p'.repeat(501) })
    expect(res.status).toBe(400)
  })

  it('stats endpoint', async () => {
    const res = await request(app)
      .get('/api/visitors/stats')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBeGreaterThanOrEqual(1)
  })
})

describe('Visitors — ön-kayıt + QR', () => {
  const auth = (r) => r.set('Authorization', `Bearer ${token}`)

  it('ön-kayıt oluşturur ve qr_token döner', async () => {
    const res = await auth(request(app).post('/api/visitors/preregister'))
      .send({ full_name: 'Beklenen Kişi', purpose: 'toplantı', expected_at: '2026-06-10 14:00' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    expect(res.body.qr_token).toBeTruthy()
    expect(res.body.qr_token.length).toBeGreaterThan(10)
  })

  it('ön-kayıtlı ziyaretçi upcoming listede görünür, active listede görünmez', async () => {
    const pre = await auth(request(app).post('/api/visitors/preregister')).send({ full_name: 'Liste Testi' })
    const id = pre.body.id
    const upcoming = await auth(request(app).get('/api/visitors?status=upcoming'))
    expect(upcoming.body.some(v => v.id === id)).toBe(true)
    const active = await auth(request(app).get('/api/visitors?status=active'))
    expect(active.body.some(v => v.id === id)).toBe(false)
  })

  it('QR token ile check-in yapar, status checked_in olur ve ev sahibi bildirimi düşer', async () => {
    const pre = await auth(request(app).post('/api/visitors/preregister'))
      .send({ full_name: 'Gelen Kişi', visiting_block: 'M1' })
    const { id, qr_token } = pre.body

    const ci = await auth(request(app).post('/api/visitors/checkin')).send({ qr_token })
    expect(ci.status).toBe(200)
    expect(ci.body.status).toBe('checked_in')

    const active = await auth(request(app).get('/api/visitors?status=active'))
    expect(active.body.some(v => v.id === id)).toBe(true)

    const db = getDB()
    const n = db.prepare('SELECT * FROM notifications WHERE dedup_key = ?').get(`visitor_checkin_${id}`)
    expect(n).toBeTruthy()
    expect(n.module).toBe('visitors')
  })

  it('AVS: prefix ile check-in çalışır', async () => {
    const pre = await auth(request(app).post('/api/visitors/preregister')).send({ full_name: 'Prefix Kişi' })
    const ci = await auth(request(app).post('/api/visitors/checkin')).send({ qr_token: `AVS:${pre.body.qr_token}` })
    expect(ci.status).toBe(200)
  })

  it('geçersiz token 404 döner', async () => {
    const ci = await auth(request(app).post('/api/visitors/checkin')).send({ qr_token: 'gecersiztokenxxxx' })
    expect(ci.status).toBe(404)
  })

  it('zaten check-in yapılmış token tekrar 409 döner', async () => {
    const pre = await auth(request(app).post('/api/visitors/preregister')).send({ full_name: 'Çift Giriş' })
    await auth(request(app).post('/api/visitors/checkin')).send({ qr_token: pre.body.qr_token })
    const again = await auth(request(app).post('/api/visitors/checkin')).send({ qr_token: pre.body.qr_token })
    expect(again.status).toBe(409)
  })

  it('QR kart PDF döner', async () => {
    const pre = await auth(request(app).post('/api/visitors/preregister')).send({ full_name: 'Kart Kişi' })
    const pdf = await auth(request(app).get(`/api/visitors/${pre.body.id}/card/pdf`))
    expect(pdf.status).toBe(200)
    expect(pdf.headers['content-type']).toContain('application/pdf')
  })
})
