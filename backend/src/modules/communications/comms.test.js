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
    db.prepare('INSERT INTO staff(full_name, phone, is_active) VALUES(?,?,1)').run('Comm Test', '05551112233')
    s = db.prepare('SELECT id FROM staff WHERE full_name=?').get('Comm Test')
  }
  staffId = s.id
})

describe('Comms — Zod sweep', () => {
  it('cok uzun SMS metni 400 doner', async () => {
    const res = await request(app).post('/api/comms/sms/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '05551112233', body: 'm'.repeat(1001) })
    expect(res.status).toBe(400)
  })

  it('gecersiz broadcast channel 400 doner', async () => {
    const res = await request(app).post('/api/comms/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'email', target_type: 'all', body: 'merhaba' })
    expect(res.status).toBe(400)
  })
})

describe('H10 IB2 — SMS gönder', () => {
  it('SMS_PROVIDER yokken queued loglar', async () => {
    delete process.env.SMS_PROVIDER
    const r = await request(app).post('/api/comms/sms/send').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, body: 'Test mesaj' })
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('queued')
    expect(r.body.id).toBeTruthy()
  })

  it('body yoksa 400', async () => {
    const r = await request(app).post('/api/comms/sms/send').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId })
    expect(r.status).toBe(400)
  })

  it('staff_id ve phone yoksa 400', async () => {
    const r = await request(app).post('/api/comms/sms/send').set('Authorization', `Bearer ${token}`)
      .send({ body: 'x' })
    expect(r.status).toBe(400)
  })
})

describe('H10 IB4 — Broadcast', () => {
  it('all hedefe broadcast', async () => {
    const r = await request(app).post('/api/comms/broadcast').set('Authorization', `Bearer ${token}`)
      .send({ channel: 'toast', target_type: 'all', body: 'Tüm personele' })
    expect(r.status).toBe(200)
    expect(r.body.stats.total).toBeGreaterThan(0)
  })

  it('geçersiz channel 400', async () => {
    const r = await request(app).post('/api/comms/broadcast').set('Authorization', `Bearer ${token}`)
      .send({ channel: 'fax', target_type: 'all', body: 'x' })
    expect(r.status).toBe(400)
  })

  it('geçersiz target_type 400', async () => {
    const r = await request(app).post('/api/comms/broadcast').set('Authorization', `Bearer ${token}`)
      .send({ channel: 'sms', target_type: 'random', body: 'x' })
    expect(r.status).toBe(400)
  })
})

describe('H10 IB3 — Push subscription', () => {
  it('subscription kaydet/sil', async () => {
    const r = await request(app).post('/api/comms/push/subscribe').set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://fcm.example/x', keys: { auth: 'aaa', p256dh: 'bbb' } })
    expect(r.status).toBe(201)

    // Aynı endpoint yine
    const r2 = await request(app).post('/api/comms/push/subscribe').set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://fcm.example/x', keys: { auth: 'aaa', p256dh: 'bbb' } })
    expect(r2.status).toBe(200)
    expect(r2.body.ok).toBe(true)
  })

  it('eksik anahtar 400', async () => {
    const r = await request(app).post('/api/comms/push/subscribe').set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'x' })
    expect(r.status).toBe(400)
  })
})

describe('H10 — Log', () => {
  it('GET /comms/log', async () => {
    const r = await request(app).get('/api/comms/log').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body)).toBe(true)
  })

  it('channel filtre', async () => {
    const r = await request(app).get('/api/comms/log?channel=sms').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    r.body.forEach(l => expect(l.channel).toBe('sms'))
  })
})

describe('H10 Yetki', () => {
  it('campus_manager olmayan SMS atamaz', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const r = await request(app).post('/api/comms/sms/send').set('Authorization', `Bearer ${t}`)
      .send({ staff_id: staffId, body: 'x' })
    expect(r.status).toBe(403)
  })
})
