import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Saf mantık scheduleVersions.test.js'te elde kurulmuş şemaya karşı doğrulanıyor.
// Burada asıl migration'larla oluşan şema ve rol yetkileri deneniyor.

let managerToken, supervisorToken, technicalToken, hafta

const auth = t => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  supervisorToken = await giris('vardiya')
  technicalToken = await giris('teknik')
  // Seed'in çizelge ürettiği bir haftayı seç — boş hafta yayınlanamıyor.
  hafta = getDB().prepare(`
    SELECT date(work_date, 'weekday 1', '-7 day') AS w, COUNT(*) c
    FROM shift_schedule GROUP BY w ORDER BY c DESC LIMIT 1
  `).get().w
})

describe('çizelge yayın uçları', () => {
  it('yayınlanmamış hafta taslak döner', async () => {
    const res = await request(app).get('/api/shifts/schedule/version').query({ week: hafta }).set(auth(managerToken))
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 150)}`).toContain('200')
    expect(res.body.status).toBe('draft')
    expect(res.body.changes).toBeNull()
  })

  it('müdür yayınlar, durum published olur', async () => {
    const res = await request(app).post('/api/shifts/schedule/version/publish')
      .set(auth(managerToken)).send({ week: hafta, note: 'Haftalık plan' })
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 150)}`).toContain('200')
    expect(res.body.version).toBeGreaterThan(0)
    expect(res.body.entries).toBeGreaterThan(0)

    const durum = await request(app).get('/api/shifts/schedule/version').query({ week: hafta }).set(auth(managerToken))
    expect(durum.body.status).toBe('published')
    expect(durum.body.changes.total).toBe(0)
  })

  // Yayından sonraki değişiklik görünmezse "kesin vardiya" güveni kalmaz.
  it('yayından sonraki değişiklik farkta görünür', async () => {
    const db = getDB()
    const satir = db.prepare(`SELECT id, shift_def_id FROM shift_schedule
      WHERE work_date BETWEEN ? AND date(?, '+6 day') LIMIT 1`).get(hafta, hafta)
    const yeniVardiya = db.prepare('SELECT id FROM shift_definitions WHERE id != ? LIMIT 1').get(satir.shift_def_id ?? 0)
    db.prepare('UPDATE shift_schedule SET shift_def_id = ? WHERE id = ?').run(yeniVardiya.id, satir.id)

    const durum = await request(app).get('/api/shifts/schedule/version').query({ week: hafta }).set(auth(managerToken))
    expect(durum.body.changes.total).toBeGreaterThan(0)
  })

  it('vardiya amiri görebilir ama yayınlayamaz', async () => {
    expect((await request(app).get('/api/shifts/schedule/version').query({ week: hafta }).set(auth(supervisorToken))).status).toBe(200)
    expect((await request(app).post('/api/shifts/schedule/version/publish').set(auth(supervisorToken)).send({ week: hafta })).status).toBe(403)
  })

  it('yetkisiz rol göremez', async () => {
    expect((await request(app).get('/api/shifts/schedule/version').query({ week: hafta }).set(auth(technicalToken))).status).toBe(403)
  })

  it('token olmadan 401', async () => {
    expect((await request(app).get('/api/shifts/schedule/version').query({ week: hafta })).status).toBe(401)
  })

  it('boş hafta yayınlanamaz (400)', async () => {
    const res = await request(app).post('/api/shifts/schedule/version/publish')
      .set(auth(managerToken)).send({ week: '2019-01-07' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/boş hafta/i)
  })

  it('geri çekilince taslağa döner', async () => {
    const res = await request(app).post('/api/shifts/schedule/version/withdraw').set(auth(managerToken)).send({ week: hafta })
    expect(res.status).toBe(200)
    const durum = await request(app).get('/api/shifts/schedule/version').query({ week: hafta }).set(auth(managerToken))
    expect(durum.body.status).toBe('draft')
  })

  it('yayında olmayan hafta geri çekilemez (400)', async () => {
    const res = await request(app).post('/api/shifts/schedule/version/withdraw').set(auth(managerToken)).send({ week: hafta })
    expect(res.status).toBe(400)
  })
})
