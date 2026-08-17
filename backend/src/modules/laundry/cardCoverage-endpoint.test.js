import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Faz 8 — kart kapsama ucunun DUMAN TESTİ.
//
// Bu dosya somut bir hatadan doğdu: `/api/laundry/card-coverage` ucu
// `cardCoverage()` çağırıyordu ama fonksiyon routes.js'e import EDİLMEMİŞTİ.
// Birim testleri fonksiyonu doğrudan cardScan.js'ten aldığı için 2793 test
// geçiyordu; uç ise her çağrıda ReferenceError atıp 500 dönüyordu.
//
// Ders: fonksiyonu test etmek, ucun çalıştığını göstermez. Bağlantı da
// test edilmeli.

let adminToken, camasirToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  camasirToken = (await request(app).post('/api/auth/login')
    .send({ username: 'camasir', password: 'admin123' })).body.token
})

describe('kart kapsama ucu', () => {
  it('yönetici için gerçekten çalışır (import bağlantısı dahil)', async () => {
    const res = await request(app).get('/api/laundry/card-coverage')
      .set({ Authorization: `Bearer ${adminToken}` })

    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    // Sayı alanları gerçekten dönmeli; boş gövde "kapsama yok" diye okunurdu.
    expect(res.body).toHaveProperty('residents')
    expect(res.body).toHaveProperty('without_card')
    expect(typeof res.body.residents).toBe('number')
  })

  it('çamaşırhane rolü de okuyabilir', async () => {
    const res = await request(app).get('/api/laundry/card-coverage')
      .set({ Authorization: `Bearer ${camasirToken}` })
    expect(res.status).toBe(200)
  })

  it('yetkisiz erişim reddedilir', async () => {
    expect((await request(app).get('/api/laundry/card-coverage')).status).toBe(401)
  })

  // Zorunluluğu açmadan önce ölçülmesi gereken şey buydu; ayar ucu da ayakta olmalı.
  it('kart ayarları ucu da yanıt verir', async () => {
    const res = await request(app).get('/api/laundry/card-settings')
      .set({ Authorization: `Bearer ${adminToken}` })
    expect(res.status).toBe(200)
    expect(typeof res.body).toBe('object')
  })
})
