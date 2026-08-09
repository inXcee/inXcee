import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Uç gerçek şemaya karşı çalışmalı: readiness.test.js sorguları elde kurulmuş
// bir DB'de doğruluyor, burada asıl migration'larla oluşan şemaya bakılıyor.
// Kolon adı değişirse (ör. dept_id ↔ department_id) burası düşer.

let managerToken, supervisorToken, technicalToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  supervisorToken = await giris('vardiya')
  technicalToken = await giris('teknik')
})

describe('GET /api/shifts/readiness', () => {
  it('müdür için 200 ve madde listesi döner', async () => {
    const res = await request(app).get('/api/shifts/readiness').set('Authorization', `Bearer ${managerToken}`)
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(res.body.items.length).toBeGreaterThan(5)
  })

  // Gerçek şemada sorgular patlarsa hepsi 'unknown' olur — sessizce "hazır"
  // demesin diye burada açıkça kontrol ediliyor.
  it('gerçek şemada hiçbir kontrol ölçülemedi durumunda kalmaz', async () => {
    const res = await request(app).get('/api/shifts/readiness').set('Authorization', `Bearer ${managerToken}`)
    const olcusuz = res.body.items.filter(i => i.status === 'unknown')
    expect(olcusuz.map(i => i.key)).toEqual([])
  })

  it('her maddede anahtar, etiket, durum ve yönlendirme var', async () => {
    const res = await request(app).get('/api/shifts/readiness').set('Authorization', `Bearer ${managerToken}`)
    res.body.items.forEach(item => {
      expect(item.key).toBeTruthy()
      expect(item.label).toBeTruthy()
      expect(['ok', 'warning', 'critical', 'unknown']).toContain(item.status)
      expect(item.action?.route).toBeTruthy()
    })
  })

  it('özet madde sayısıyla tutarlı', async () => {
    const { body } = await request(app).get('/api/shifts/readiness').set('Authorization', `Bearer ${managerToken}`)
    const { ok, warning, critical, unknown, total } = body.summary
    expect(ok + warning + critical + unknown).toBe(total)
    expect(total).toBe(body.items.length)
  })

  it('vardiya amiri de görebilir', async () => {
    const res = await request(app).get('/api/shifts/readiness').set('Authorization', `Bearer ${supervisorToken}`)
    expect(res.status).toBe(200)
  })

  it('yetkisiz rol 403 alır', async () => {
    const res = await request(app).get('/api/shifts/readiness').set('Authorization', `Bearer ${technicalToken}`)
    expect(res.status).toBe(403)
  })

  it('token olmadan 401', async () => {
    expect((await request(app).get('/api/shifts/readiness')).status).toBe(401)
  })
})
