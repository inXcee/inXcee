import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Günlük temizlik raporu PDF'i CANLIDA HİÇ ÇALIŞMAMIŞTI: her çağrıda 500.
//
// Sebep dosya adındaki uzun tireydi (`Gunluk Temizlik Raporu — <tarih>`);
// HTTP başlıkları Latin-1 dışına çıkamaz ve `res.setHeader` "Invalid character
// in header content" atıyordu. Hatayı uç taraması (routes.smoke.test.js)
// buldu — ucun kendi testi yoktu.
//
// Bu test "500 dönmüyor" ile yetinmez: gerçekten PDF geldiğini doğrular.

let adminToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
})

const ikili = (yol) => request(app).get(yol)
  .set({ Authorization: `Bearer ${adminToken}` })
  .buffer(true).parse((res, cb) => {
    const p = []
    res.on('data', c => p.push(c))
    res.on('end', () => cb(null, Buffer.concat(p)))
  })

describe('günlük temizlik raporu', () => {
  it('gerçek PDF döndürür', async () => {
    const res = await ikili('/api/reports/housekeeping')
    expect(`${res.status} ${String(res.body).slice(0, 120)}`).toContain('200')
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')
    expect(res.body.length).toBeGreaterThan(500)
  }, 30000)

  // Uzun tire başlığı bozuyordu; ASCII yedek olmalı, gerçek ad da kaybolmamalı.
  it('dosya adı başlıkta ASCII yedek ve UTF-8 hâliyle gider', async () => {
    const res = await ikili('/api/reports/housekeeping')
    const cd = res.headers['content-disposition']
    expect(cd).toMatch(/filename="[\x20-\x7E]+"/)     // yedek saf ASCII
    expect(cd).toContain("filename*=UTF-8''")          // gerçek ad korunmuş
    expect(/^[\x20-\x7E]*$/.test(cd)).toBe(true)       // başlığın tamamı Latin-1
  }, 30000)

  it('tarih verilebilir', async () => {
    const res = await ikili('/api/reports/housekeeping?date=2026-08-01')
    expect(res.status).toBe(200)
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30000)

  it('veri ucu geçersiz tarihi reddeder', async () => {
    const res = await request(app).get('/api/reports/housekeeping/data?date=bozuk')
      .set({ Authorization: `Bearer ${adminToken}` })
    expect(res.status).toBe(400)
  })

  it('yetkisiz erişim reddedilir', async () => {
    expect((await request(app).get('/api/reports/housekeeping')).status).toBe(401)
  })
})
