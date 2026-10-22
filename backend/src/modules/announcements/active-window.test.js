// Duyuru geçerlilik penceresi (Ekim 2026 taraması):
// - Ekran (TV) uç noktası olmayan 'active_until' kolonunu soruyordu → sorgu hep hata verip duyuru hiç görünmüyordu.
// - Bitiş formdaki datetime-local alanından YEREL saatle gelir ('2026-10-25T18:00'); UTC datetime('now') ile ve
//   'T' ↔ boşluk farkıyla kıyaslanınca bugün içinde süresi dolan duyuru gece 03:00'e kadar görünmeye devam ediyordu.
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { istanbulNowNaive } from '../../shared/time.js'

let token
const localInput = (offsetMs) => istanbulNowNaive(new Date(Date.now() + offsetMs)).replace(' ', 'T').slice(0, 16)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const ins = getDB().prepare('INSERT INTO announcements(title, body, expires_at, created_by) VALUES(?, ?, ?, 1)')
  ins.run('Süresiz', 'gövde', null)
  ins.run('Bir saat önce bitti', 'gövde', localInput(-3600 * 1000))
  ins.run('Bir saat sonra bitecek', 'gövde', localInput(3600 * 1000))
})

const titles = rows => rows.map(r => r.title).sort()
const EXPECTED = ['Bir saat sonra bitecek', 'Süresiz']

describe('aktif duyurular', () => {
  it('ekran özeti duyuruları gösterir; süresi dolan görünmez', async () => {
    const res = await request(app).get('/api/display/snapshot').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(titles(res.body.announcements)).toEqual(EXPECTED)
  })

  it('self-servis duyuruları süresi yerel saatle dolan duyuruyu göstermez', async () => {
    const res = await request(app).get('/api/self-service/announcements').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(titles(res.body)).toEqual(EXPECTED)
  })
})
