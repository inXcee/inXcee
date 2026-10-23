import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { listFollowups } from './staff-followups.js'

let managerToken
let supervisorToken
let lowToken
let staffId
let supervisorUserId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  const supervisorLogin = await request(app).post('/api/auth/login')
    .send({ username: 'vardiya', password: 'admin123' })
  supervisorToken = supervisorLogin.body.token
  supervisorUserId = supervisorLogin.body.user.id
  lowToken = (await request(app).post('/api/auth/login')
    .send({ username: 'teknik', password: 'admin123' })).body.token

  const db = getDB()
  staffId = db.prepare(`
    INSERT INTO staff(tc_no, full_name, is_active) VALUES('74444444444', 'Görev Test', 1)
  `).run().lastInsertRowid
})

describe('staff followups api', () => {
  let followupId

  it('creates a followup, assigns a user and notifies the assignee', async () => {
    const res = await request(app).post(`/api/personnel/${staffId}/followups`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: 'Sözleşme yenile', priority: 'high', category: 'document', assigned_user_id: supervisorUserId, due_at: '2020-01-01' })
    expect(res.status).toBe(201)
    followupId = res.body.id

    // atanan kullanıcıya bildirim düştü
    const db = getDB()
    const notif = db.prepare(
      "SELECT * FROM notifications WHERE target_user_id=? AND entity_type='staff_followup' AND entity_id=?"
    ).get(supervisorUserId, followupId)
    expect(notif).toBeTruthy()

    const list = await request(app).get(`/api/personnel/${staffId}/followups`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(list.status).toBe(200)
    const item = list.body.followups.find(f => f.id === followupId)
    expect(item.assigned_user_name).toBeTruthy()
    expect(item.is_overdue).toBe(true) // due 2020 → gecikmiş
    expect(list.body.summary.overdue).toBeGreaterThanOrEqual(1)
  })

  it('completes a followup and rejects a second transition', async () => {
    const done = await request(app).post(`/api/personnel/followups/${followupId}/complete`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(done.status).toBe(200)

    const again = await request(app).post(`/api/personnel/followups/${followupId}/cancel`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(again.status).toBe(400) // artık açık değil

    const list = await request(app).get(`/api/personnel/${staffId}/followups?status=done`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(list.body.followups.some(f => f.id === followupId && f.completed_by_name)).toBe(true)
  })

  it('supervisor can create and manage operational followups', async () => {
    const res = await request(app).post(`/api/personnel/${staffId}/followups`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ title: 'Devam kontrolü', priority: 'medium' })
    expect(res.status).toBe(201)
    const cancel = await request(app).post(`/api/personnel/followups/${res.body.id}/cancel`)
      .set('Authorization', `Bearer ${supervisorToken}`)
    expect(cancel.status).toBe(200)
  })

  it('rejects unknown staff and low roles', async () => {
    const missing = await request(app).post('/api/personnel/99999/followups')
      .set('Authorization', `Bearer ${managerToken}`).send({ title: 'X' })
    expect(missing.status).toBe(404)
    const forbidden = await request(app).get(`/api/personnel/${staffId}/followups`)
      .set('Authorization', `Bearer ${lowToken}`)
    expect(forbidden.status).toBe(403)
  })
})

describe('staff notes visibility', () => {
  it('keeps sensitive notes away from the supervisor', async () => {
    const sensitive = await request(app).post(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'Maaş görüşmesi gizli', category: 'general', visibility: 'sensitive' })
    expect(sensitive.status).toBe(201)
    const sensitiveId = sensitive.body.id

    const operational = await request(app).post(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ note: 'Operasyonel not', category: 'attendance' })
    expect(operational.status).toBe(201)

    // vardiya sorumlusu hassas not oluşturamaz
    const blocked = await request(app).post(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ note: 'Deneme', visibility: 'sensitive' })
    expect(blocked.status).toBe(403)

    // liste: müdür hassası görür, vardiya sorumlusu görmez
    const managerList = await request(app).get(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(managerList.body.some(n => n.id === sensitiveId)).toBe(true)
    const supervisorList = await request(app).get(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${supervisorToken}`)
    expect(supervisorList.body.some(n => n.id === sensitiveId)).toBe(false)

    // vardiya sorumlusu hassas notu patch edemez
    const patch = await request(app).patch(`/api/personnel/notes/${sensitiveId}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ note: 'değiştir' })
    expect(patch.status).toBe(403)

    // müdür arşivleyebilir
    const archive = await request(app).post(`/api/personnel/notes/${sensitiveId}/archive`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(archive.status).toBe(200)
  })
})

describe('takip görevi gecikmesi yerel saatle', () => {
  // due_at yerel saat metnidir ('…T23:59:59' ya da uyarıdan gelen '2026-10-23 06:40:00'). Eskiden
  // new Date().toISOString() (UTC, 'T'li) ile METİN olarak kıyaslanıyordu: gün sonu son tarihi 3 saat geç,
  // boşluklu biçim ise aynı günün başından 'gecikmiş' sayılıyordu.
  afterEach(() => vi.useRealTimers())
  const add = due => getDB().prepare(`INSERT INTO staff_followups(staff_id, title, due_at, status) VALUES(?, ?, ?, 'open')`)
    .run(staffId, `gecikme ${due}`, due).lastInsertRowid
  const overdueAt = (id, utcNow) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(utcNow))
    return listFollowups(staffId).followups.find(f => f.id === id).is_overdue
  }

  it('gün sonu son tarihi İstanbul gece yarısı geçince gecikmiştir', () => {
    const id = add('2026-10-23T23:59:59')
    expect(overdueAt(id, '2026-10-23T22:00:00Z')).toBe(true)    // İstanbul 24 Eki 01:00
    expect(overdueAt(id, '2026-10-23T20:00:00Z')).toBe(false)   // İstanbul 23:00, gün bitmedi
  })

  it('saatli son tarih o saat gelmeden gecikmiş sayılmaz', () => {
    const id = add('2026-10-23 06:40:00')
    expect(overdueAt(id, '2026-10-23T01:00:00Z')).toBe(false)   // İstanbul 04:00
    expect(overdueAt(id, '2026-10-23T04:00:00Z')).toBe(true)    // İstanbul 07:00
  })
})
