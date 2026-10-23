import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { reportErrorService } from './service.js'

let adminToken, userToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r1 = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  adminToken = r1.body.token
  const r2 = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
  userToken = r2.body.token
})

beforeEach(() => {
  getDB().prepare('DELETE FROM error_log').run()
})

describe('Error Log — POST /', () => {
  it('anonim kullanıcı hata raporlayabilir', async () => {
    const res = await request(app).post('/api/error-log').send({
      source: 'frontend',
      message: 'Test error',
      stack: 'Error: Test\n  at foo:1:2',
      url: '/test',
    })
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
  })

  it('giriş yapmış kullanıcı user_id ile kaydeder', async () => {
    const res = await request(app).post('/api/error-log')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ source: 'frontend', message: 'User error' })
    expect(res.status).toBe(201)
    const list = await request(app).get('/api/error-log')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.items[0].user_id).toBeTruthy()
  })

  it('mesaj boşsa reddeder', async () => {
    const res = await request(app).post('/api/error-log').send({
      source: 'frontend', message: '',
    })
    expect(res.status).toBe(400)
  })

  it('geçersiz source reddeder', async () => {
    const res = await request(app).post('/api/error-log').send({
      source: 'invalid', message: 'x',
    })
    expect(res.status).toBe(400)
  })

  it('uzun mesajları kırpar (overflow korur)', async () => {
    const longMsg = 'x'.repeat(5000)
    const res = await request(app).post('/api/error-log').send({
      source: 'frontend', message: longMsg,
    })
    expect(res.status).toBe(201)
  })

  it('mesaj 500 karaktere kirpilir (Y10)', async () => {
    const longMsg = 'a'.repeat(2000)
    const res = await request(app).post('/api/error-log')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ source: 'frontend', message: longMsg })
    expect(res.status).toBe(201)
    const stored = getDB().prepare('SELECT message FROM error_log ORDER BY id DESC LIMIT 1').get()
    expect(stored.message.length).toBeLessThanOrEqual(500)
  })

  it('stack 4000 karaktere kirpilir', async () => {
    const longStack = 'b'.repeat(8000)
    const res = await request(app).post('/api/error-log')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ source: 'frontend', message: 'short', stack: longStack })
    expect(res.status).toBe(201)
    const stored = getDB().prepare('SELECT stack FROM error_log ORDER BY id DESC LIMIT 1').get()
    expect(stored.stack.length).toBeLessThanOrEqual(4000)
  })
})

describe('Error Log — POST / güvenliği', () => {
  // 'backend' kaydını yalnız sunucu yazar (globalErrorHandler, ajan uçları). HTTP'den kabul edilince oturumsuz biri
  // sahte "sunucu hatası" yazabiliyordu; Hermes bunları Telegram'a "🐞 YYS sunucu hatası" diye taşıyor.
  it('oturumsuz istek backend kaydı yazamaz', async () => {
    const res = await request(app).post('/api/error-log').send({ source: 'backend', message: 'sahte sunucu hatası' })
    expect(res.status).toBe(400)
    expect(getDB().prepare('SELECT COUNT(*) c FROM error_log').get().c).toBe(0)
  })

  it('oturumlu istek de HTTP üzerinden backend kaydı yazamaz', async () => {
    const res = await request(app).post('/api/error-log').set('Authorization', `Bearer ${adminToken}`)
      .send({ source: 'backend', message: 'yine sahte' })
    expect(res.status).toBe(400)
  })

  // Oturumsuz rapor kaydedilir ama müdürlere bildirim açmaz: anonim istekle bildirim yağdırılamasın.
  it('oturumsuz error raporu kaydedilir ama bildirim açmaz', async () => {
    const res = await request(app).post('/api/error-log').send({ source: 'frontend', severity: 'error', message: 'anonim-bildirim-denemesi' })
    expect(res.status).toBe(201)
    const n = getDB().prepare("SELECT COUNT(*) c FROM notifications WHERE message LIKE '%anonim-bildirim-denemesi%'").get().c
    expect(n).toBe(0)
  })

  it('oturumlu error raporu müdüre bildirim açar', async () => {
    const res = await request(app).post('/api/error-log').set('Authorization', `Bearer ${userToken}`)
      .send({ source: 'frontend', severity: 'error', message: 'oturumlu-bildirim' })
    expect(res.status).toBe(201)
    const n = getDB().prepare("SELECT COUNT(*) c FROM notifications WHERE message LIKE '%oturumlu-bildirim%'").get().c
    expect(n).toBe(1)
  })

  // Web oturumu çerezdedir (yys_session); route yalnız Authorization başlığına bakıyordu.
  it('çerez oturumu raporu kullanıcıya bağlar', async () => {
    const res = await request(app).post('/api/error-log').set('Cookie', `yys_session=${userToken}`)
      .send({ source: 'frontend', message: 'cerezli' })
    expect(res.status).toBe(201)
    expect(getDB().prepare('SELECT user_id FROM error_log WHERE id=?').get(res.body.id).user_id).toBeTruthy()
  })
})

describe('Error Log — GET /', () => {
  beforeEach(async () => {
    await request(app).post('/api/error-log').send({ source: 'frontend', message: 'A' })
    // 'backend' kaydını yalnız sunucu yazar (HTTP'den kabul edilmez) — fikstür sunucunun yolundan
    reportErrorService({ source: 'backend', severity: 'warning', message: 'B' })
  })

  it('admin tüm hataları listeler', async () => {
    const res = await request(app).get('/api/error-log')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBe(2)
    expect(res.body.total).toBe(2)
  })

  it('source filtresi çalışır', async () => {
    const res = await request(app).get('/api/error-log?source=backend')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.body.items.length).toBe(1)
    expect(res.body.items[0].source).toBe('backend')
  })

  it('non-admin reddedilir', async () => {
    const res = await request(app).get('/api/error-log')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})

describe('Error Log — DELETE', () => {
  it('admin tek bir hatayı silebilir', async () => {
    const r = await request(app).post('/api/error-log').send({ source: 'frontend', message: 'X' })
    const id = r.body.id
    const del = await request(app).delete(`/api/error-log/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(del.status).toBe(200)
  })

  it('admin tüm hataları silebilir', async () => {
    await request(app).post('/api/error-log').send({ source: 'frontend', message: 'X' })
    await request(app).post('/api/error-log').send({ source: 'frontend', message: 'Y' })
    const del = await request(app).delete('/api/error-log/all')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(del.status).toBe(200)
    expect(del.body.deleted).toBe(2)
  })
})
