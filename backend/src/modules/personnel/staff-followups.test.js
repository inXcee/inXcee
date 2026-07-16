import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

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
