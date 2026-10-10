import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateDailyTasks } from './queries.js'
import { archiveUntouchedTasks, isDailyGenerationEnabled } from './generation.js'

let supervisor
let housekeeper
const login = async (u) => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  supervisor = await login('vardiya')
  housekeeper = await login('meydanci')
})

describe('Günlük temizlik üretimi aç/kapa', () => {
  it('varsayılan açık; vardiya amiri kapatıp açabilir, meydancı değiştiremez', async () => {
    expect(isDailyGenerationEnabled()).toBe(true)
    const get = await request(app).get('/api/housekeeping/generation').set('Authorization', `Bearer ${housekeeper}`)
    expect(get.status).toBe(200)
    expect(get.body.enabled).toBe(true)

    const denied = await request(app).patch('/api/housekeeping/generation')
      .set('Authorization', `Bearer ${housekeeper}`).send({ enabled: false })
    expect(denied.status).toBe(403)

    const bad = await request(app).patch('/api/housekeeping/generation')
      .set('Authorization', `Bearer ${supervisor}`).send({ enabled: 'hayır' })
    expect(bad.status).toBe(400)

    const off = await request(app).patch('/api/housekeeping/generation')
      .set('Authorization', `Bearer ${supervisor}`).send({ enabled: false })
    expect(off.status).toBe(200)
    expect(off.body.enabled).toBe(false)
    expect(isDailyGenerationEnabled()).toBe(false)

    const on = await request(app).patch('/api/housekeeping/generation')
      .set('Authorization', `Bearer ${supervisor}`).send({ enabled: true })
    expect(on.body.enabled).toBe(true)
  })
})

describe('Dokunulmamış eski görevlerin arşivi', () => {
  it('yalnız yapılmamış/atlanmamış/fotoğrafsız eski görevleri taşır', () => {
    const db = getDB()
    generateDailyTasks(new Date('2031-03-01T10:00:00'))
    generateDailyTasks(new Date('2031-03-02T10:00:00'))
    const day1 = (qr) => db.prepare("SELECT id FROM cleaning_tasks WHERE qr_location=? AND DATE(scheduled_at)='2031-03-01'").get(qr).id
    db.prepare("UPDATE cleaning_tasks SET completed_at='2031-03-01 09:00:00' WHERE id=?").run(day1('M1-101'))
    db.prepare("UPDATE cleaning_tasks SET skipped=1, skip_reason='x' WHERE id=?").run(day1('M1-102'))
    const before = db.prepare("SELECT COUNT(*) n FROM cleaning_tasks WHERE DATE(scheduled_at)='2031-03-01'").get().n
    const day2 = db.prepare("SELECT COUNT(*) n FROM cleaning_tasks WHERE DATE(scheduled_at)='2031-03-02'").get().n

    const r = archiveUntouchedTasks('2031-03-02')
    expect(r.moved).toBe(before - 2)
    expect(db.prepare("SELECT COUNT(*) n FROM cleaning_tasks WHERE DATE(scheduled_at)='2031-03-01'").get().n).toBe(2)
    expect(db.prepare("SELECT COUNT(*) n FROM cleaning_tasks WHERE DATE(scheduled_at)='2031-03-02'").get().n).toBe(day2)
    expect(db.prepare("SELECT COUNT(*) n FROM cleaning_tasks_archive WHERE DATE(scheduled_at)='2031-03-01'").get().n).toBe(before - 2)
    expect(() => archiveUntouchedTasks('dün')).toThrow()
  })
})
