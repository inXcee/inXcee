import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Arıza yaşam döngüsü: SLA önceliğe ve yeniden açılmaya göre güncellenir; kapalı talep tekrar
// kapatılamaz (closed_at ve ortalama çözüm süresi korunur); gecikme sayısı SLA cron'uyla aynı tanım.
let token
const auth = () => ({ Authorization: `Bearer ${token}` })
const db = () => getDB()
const hoursBetween = (a, b) => db().prepare('SELECT ROUND((julianday(?) - julianday(?)) * 24, 2) h').get(a, b).h

function seed({ priority = 'medium', status = 'open', openedHoursAgo = 1, deadlineHours = 23 } = {}) {
  return Number(db().prepare(`
    INSERT INTO maintenance_requests(location, description, priority, status, opened_at, sla_deadline)
    VALUES ('Yaşam Döngüsü Blok', 'test', ?, ?, datetime('now', ?), datetime('now', ?))
  `).run(priority, status, `-${openedHoursAgo} hours`, `${deadlineHours >= 0 ? '+' : ''}${deadlineHours} hours`).lastInsertRowid)
}
const row = id => db().prepare('SELECT * FROM maintenance_requests WHERE id=?').get(id)
const closeNotices = id => db().prepare("SELECT COUNT(*) c FROM notifications WHERE message LIKE ?").get(`Arıza #${id} %kapatıldı`).c

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

describe('öncelik değişince SLA', () => {
  it('orta→acil: deadline açılıştan 4 saat, düşük: 72 saat', async () => {
    const id = seed({ priority: 'medium', openedHoursAgo: 2, deadlineHours: 22 })
    expect((await request(app).patch(`/api/maintenance/requests/${id}/priority`).set(auth()).send({ priority: 'high' })).status).toBe(200)
    let r = row(id)
    expect(r.priority).toBe('high')
    expect(hoursBetween(r.sla_deadline, r.opened_at)).toBeCloseTo(4, 1)
    await request(app).patch(`/api/maintenance/requests/${id}/priority`).set(auth()).send({ priority: 'low' })
    r = row(id)
    expect(hoursBetween(r.sla_deadline, r.opened_at)).toBeCloseTo(72, 1)
  })

  it('olmayan talep 404', async () => {
    expect((await request(app).patch('/api/maintenance/requests/999999/priority').set(auth()).send({ priority: 'high' })).status).toBe(404)
  })
})

describe('kapatma', () => {
  it('kapalı talep tekrar kapatılamaz: 409, closed_at ve bildirim değişmez', async () => {
    const id = seed()
    expect((await request(app).patch(`/api/maintenance/requests/${id}/close`).set(auth()).send({})).status).toBe(200)
    const closedAt = row(id).closed_at
    expect(closeNotices(id)).toBe(1)
    const again = await request(app).patch(`/api/maintenance/requests/${id}/close`).set(auth()).send({})
    expect(again.status).toBe(409)
    expect(again.body.error).toMatch(/zaten kapalı/)
    expect(row(id).closed_at).toBe(closedAt)
    expect(closeNotices(id)).toBe(1)
  })

  it('olmayan talep 404 (eskiden "ok" dönüp bildirim üretiyordu)', async () => {
    expect((await request(app).patch('/api/maintenance/requests/999998/close').set(auth()).send({})).status).toBe(404)
    expect(closeNotices(999998)).toBe(0)
  })
})

describe('yeniden açma', () => {
  it('açık talep yeniden açılamaz (409)', async () => {
    const id = seed()
    expect((await request(app).patch(`/api/maintenance/requests/${id}/reopen`).set(auth())).status).toBe(409)
  })

  it('kapalı talep yeni SLA ile açılır (eski geçmiş deadline anında alarm vermez)', async () => {
    const id = seed({ priority: 'high', status: 'done', openedHoursAgo: 30, deadlineHours: -26 })
    db().prepare("UPDATE maintenance_requests SET closed_at=datetime('now','-1 hours'), started_at=datetime('now','-28 hours') WHERE id=?").run(id)
    expect((await request(app).patch(`/api/maintenance/requests/${id}/reopen`).set(auth())).status).toBe(200)
    const r = row(id)
    expect(r.status).toBe('open')
    expect(r.closed_at).toBeNull()
    expect(r.started_at).toBeNull()
    const now = db().prepare("SELECT datetime('now') n").get().n
    expect(hoursBetween(r.sla_deadline, now)).toBeCloseTo(4, 1)
  })

  it('durum ucuyla done→open da yeni SLA verir; open→open deadline\'a dokunmaz', async () => {
    const done = seed({ status: 'done', deadlineHours: -10 })
    await request(app).patch(`/api/maintenance/requests/${done}/status`).set(auth()).send({ status: 'open' })
    const now = db().prepare("SELECT datetime('now') n").get().n
    expect(hoursBetween(row(done).sla_deadline, now)).toBeCloseTo(24, 1)
    const open = seed({ deadlineHours: 5 })
    const before = row(open).sla_deadline
    await request(app).patch(`/api/maintenance/requests/${open}/status`).set(auth()).send({ status: 'open' })
    expect(row(open).sla_deadline).toBe(before)
  })
})

describe('gecikme sayısı', () => {
  it('üzerinde çalışılan (in_progress) gecikmiş talep de sayılır — SLA cron tanımıyla aynı', async () => {
    const base = (await request(app).get('/api/maintenance/stats').set(auth())).body.overdue
    seed({ status: 'in_progress', deadlineHours: -2 })
    seed({ status: 'done', deadlineHours: -2 })
    const after = (await request(app).get('/api/maintenance/stats').set(auth())).body.overdue
    expect(after).toBe(base + 1)
  })
})
