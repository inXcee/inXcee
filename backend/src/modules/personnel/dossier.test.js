import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let supervisorToken
let lowToken
let staffId
let today

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login')
    .send({ username: 'vardiya', password: 'admin123' })).body.token
  lowToken = (await request(app).post('/api/auth/login')
    .send({ username: 'teknik', password: 'admin123' })).body.token

  const db = getDB()
  today = new Date().toISOString().slice(0, 10)
  const departmentId = db.prepare('SELECT id FROM departments ORDER BY id LIMIT 1').get().id
  const roleId = db.prepare('SELECT id FROM staff_roles ORDER BY id LIMIT 1').get().id
  const shiftId = db.prepare('SELECT id FROM shift_definitions ORDER BY id LIMIT 1').get().id
  staffId = db.prepare(`
    INSERT INTO staff(
      tc_no, full_name, department_id, role_id, salary, iban, contract_end, is_active
    ) VALUES(?, ?, ?, ?, ?, ?, date('now', '+20 days'), 1)
  `).run(
    '71111111111', 'Dossier Test Personeli', departmentId, roleId,
    45000, 'TR330006100519786457841326',
  ).lastInsertRowid
  const personnelId = db.prepare(`
    INSERT INTO personnel(tc_no, full_name, discipline_points)
    VALUES(?, ?, 1)
  `).run('71111111111', 'Dossier Test Personeli').lastInsertRowid
  db.prepare(`
    INSERT INTO staff_personnel_links(staff_id, personnel_id, link_method, link_status)
    VALUES(?, ?, 'tc_unique', 'confirmed')
  `).run(staffId, personnelId)

  db.prepare(`
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status)
    VALUES(?, ?, ?, ?, 'worked')
  `).run(staffId, departmentId, shiftId, today)
  db.prepare(`
    INSERT INTO documents(
      category, title, file_name, file_path, related_type,
      staff_id, document_kind, visibility, version_group
    ) VALUES('id_doc', 'Kimlik', 'kimlik.pdf', 'test/kimlik.pdf', 'personnel',
      ?, 'identity', 'sensitive', 'test-identity')
  `).run(staffId)
  db.prepare(`
    INSERT INTO staff_followups(
      staff_id, title, priority, due_at, status
    ) VALUES(?, 'Eksik belgeyi tamamla', 'high', datetime('now', '-1 day'), 'open')
  `).run(staffId)
  db.prepare(`
    INSERT INTO performance_reviews(staff_id, period, productivity, total_score)
    VALUES(?, '2026-Q2', 4, 4)
  `).run(staffId)
})

describe('unified personnel dossier api', () => {
  it('returns overview counters, document health and risks', async () => {
    const res = await request(app).get(`/api/personnel/${staffId}/dossier`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.person.id).toBe(staffId)
    expect(res.body.identity_link.status).toBe('confirmed')
    expect(res.body.today.shift.status).toBe('worked')
    expect(res.body.work_30d.worked).toBeGreaterThanOrEqual(1)
    expect(res.body.documents.required).toBeGreaterThan(1)
    expect(res.body.documents.completed).toBeGreaterThanOrEqual(1)
    expect(res.body.counters.open_followups).toBe(1)
    expect(res.body.counters.overdue_followups).toBe(1)
    expect(res.body.latest_performance.total_score).toBe(4)
    expect(res.body.risks.some(risk => risk.code === 'overdue_followups')).toBe(true)
    expect(Array.isArray(res.body.upcoming)).toBe(true)
    expect(res.body.data_quality).toHaveProperty('missing_fields')
    expect(Array.isArray(res.body.recent_activity)).toBe(true)
  })

  it('applies field-level masking to supervisor response', async () => {
    const res = await request(app).get(`/api/personnel/${staffId}/dossier`)
      .set('Authorization', `Bearer ${supervisorToken}`)
    expect(res.status).toBe(200)
    expect(res.body.person.tc_no).toBe('711******11')
    expect(res.body.person).not.toHaveProperty('salary')
    expect(res.body.person).not.toHaveProperty('iban')
    expect(res.body.access.can_view_sensitive_fields).toBe(false)

    const sensitiveTimeline = await request(app)
      .get(`/api/personnel/${staffId}/dossier/timeline?types=document&from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
    expect(sensitiveTimeline.status).toBe(200)
    expect(sensitiveTimeline.body.total).toBe(0)
  })

  it('rejects low roles and returns 404 for an unknown staff id', async () => {
    const forbidden = await request(app).get(`/api/personnel/${staffId}/dossier`)
      .set('Authorization', `Bearer ${lowToken}`)
    expect(forbidden.status).toBe(403)

    const missing = await request(app).get('/api/personnel/99999999/dossier')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(missing.status).toBe(404)
  })

  it('reports a safe runtime match when a canonical link is not persisted yet', async () => {
    const db = getDB()
    const unlinkedStaffId = db.prepare(`
      INSERT INTO staff(tc_no, full_name, is_active)
      VALUES('72222222222', 'Bağlantısız Personel', 1)
    `).run().lastInsertRowid
    db.prepare(`
      INSERT INTO personnel(tc_no, full_name)
      VALUES('72222222222', 'Bağlantısız Personel')
    `).run()

    const res = await request(app).get(`/api/personnel/${unlinkedStaffId}/dossier`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.identity_link.status).toBe('unique_match_unlinked')
    expect(res.body.identity_link.personnel_id).toBeTruthy()
    expect(res.body.risks.some(risk => risk.code === 'identity_link')).toBe(true)
  })

  it('returns filtered and paginated timeline events', async () => {
    const filtered = await request(app)
      .get(`/api/personnel/${staffId}/dossier/timeline?types=shift,performance&from=${today}&to=${today}&limit=1`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(filtered.status).toBe(200)
    expect(filtered.body.limit).toBe(1)
    expect(filtered.body.total).toBeGreaterThanOrEqual(2)
    expect(filtered.body.items).toHaveLength(1)
    expect(['shift', 'performance']).toContain(filtered.body.items[0].kind)

    const secondPage = await request(app)
      .get(`/api/personnel/${staffId}/dossier/timeline?types=shift,performance&from=${today}&to=${today}&limit=1&page=2`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(secondPage.status).toBe(200)
    expect(secondPage.body.page).toBe(2)
    expect(secondPage.body.items).toHaveLength(1)
    expect(secondPage.body.items[0].id).not.toBe(filtered.body.items[0].id)

    const invalidType = await request(app)
      .get(`/api/personnel/${staffId}/dossier/timeline?types=unknown_type&from=invalid&to=invalid`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(invalidType.status).toBe(200)
    expect(invalidType.body.total).toBe(0)
  })
})
