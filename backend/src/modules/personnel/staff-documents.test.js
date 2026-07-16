import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let supervisorToken
let lowToken
let staffId
const created = []

const pdf = () => Buffer.from('%PDF-1.4\n%staff document test', 'utf-8')

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
  staffId = db.prepare(`
    INSERT INTO staff(tc_no, full_name, is_active) VALUES('73333333333', 'Belge Test', 1)
  `).run().lastInsertRowid

  // Salt-okunur izin eki: leave_request → leave_documents
  const leaveId = db.prepare(`
    INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, status)
    VALUES(?, 'annual', date('now'), date('now','+1 day'), 2, 'approved')
  `).run(staffId).lastInsertRowid
  db.prepare(`
    INSERT INTO leave_documents(leave_request_id, file_url, file_name, mime_type, file_size, document_kind)
    VALUES(?, 'uploads/leave/x.pdf', 'izin-belgesi.pdf', 'application/pdf', 1024, 'evidence')
  `).run(leaveId)
})

afterAll(() => {
  const db = getDB()
  for (const id of created) {
    const row = db.prepare('SELECT file_path FROM documents WHERE id=?').get(id)
    if (row?.file_path) { try { fs.unlinkSync(row.file_path) } catch { /* yok */ } }
  }
})

async function upload(token, fields) {
  const req = request(app).post(`/api/personnel/${staffId}/documents`)
    .set('Authorization', `Bearer ${token}`)
  for (const [key, value] of Object.entries(fields)) req.field(key, value)
  return req.attach('file', pdf(), { filename: 'belge.pdf', contentType: 'application/pdf' })
}

describe('unified staff documents api', () => {
  it('manager uploads an operational document and it appears in the catalog', async () => {
    const res = await upload(managerToken, {
      document_kind: 'training', title: 'İSG eğitimi', document_no: 'EGT-1',
      issued_on: '2026-01-10', expires_on: '2027-01-10',
    })
    expect(res.status).toBe(201)
    expect(res.body.visibility).toBe('operational')
    created.push(res.body.id)

    const list = await request(app).get(`/api/personnel/${staffId}/documents`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(list.status).toBe(200)
    const doc = list.body.documents.find(d => d.id === res.body.id)
    expect(doc).toBeTruthy()
    expect(doc.can_access).toBe(true)
    expect(doc.document_no).toBe('EGT-1')
    expect(doc.status).toBe('active')
    expect(list.body.requirements.length).toBeGreaterThan(0)
    expect(list.body.summary.attachments).toBe(1)
    // izin eki salt-okunur listelenir
    expect(list.body.attachments.some(a => a.source === 'leave' && a.read_only)).toBe(true)
  })

  it('forces sensitive kinds and blocks supervisor from managing them', async () => {
    // identity → daima sensitive; vardiya sorumlusu yükleyemez
    const forbidden = await upload(supervisorToken, { document_kind: 'identity', title: 'Kimlik' })
    expect(forbidden.status).toBe(403)

    const res = await upload(managerToken, { document_kind: 'bank', title: 'IBAN belgesi', visibility: 'operational' })
    expect(res.status).toBe(201)
    expect(res.body.visibility).toBe('sensitive') // banka kullanıcı 'operational' dese de hassas
    created.push(res.body.id)

    // Vardiya sorumlusu hassas belgeyi metadata olarak görür ama içeriğe erişemez
    const list = await request(app).get(`/api/personnel/${staffId}/documents`)
      .set('Authorization', `Bearer ${supervisorToken}`)
    const doc = list.body.documents.find(d => d.id === res.body.id)
    expect(doc.restricted).toBe(true)
    expect(doc.file_name).toBeNull()
    expect(doc.document_kind).toBe('bank') // operasyonel metadata görünür

    // İndirme reddedilir
    const dl = await request(app).get(`/api/personnel/documents/${res.body.id}/download`)
      .set('Authorization', `Bearer ${supervisorToken}`)
    expect(dl.status).toBe(403)
  })

  it('lets the manager download, update and archive a document', async () => {
    const res = await upload(managerToken, { document_kind: 'certificate', title: 'Yükseklik sertifikası' })
    created.push(res.body.id)
    const id = res.body.id

    const dl = await request(app).get(`/api/personnel/documents/${id}/download`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(dl.status).toBe(200)

    const patch = await request(app).patch(`/api/personnel/documents/${id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ document_no: 'SRT-9', expires_on: '2028-05-01' })
    expect(patch.status).toBe(200)

    const archive = await request(app).post(`/api/personnel/documents/${id}/archive`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(archive.status).toBe(200)

    const list = await request(app).get(`/api/personnel/${staffId}/documents`)
      .set('Authorization', `Bearer ${managerToken}`)
    const doc = list.body.documents.find(d => d.id === id)
    expect(doc.status).toBe('archived')
    expect(doc.document_no).toBe('SRT-9')
    expect(list.body.summary.archived).toBeGreaterThanOrEqual(1)
  })

  it('validates document kind and dates', async () => {
    const badKind = await upload(managerToken, { document_kind: 'not_a_kind', title: 'X' })
    expect(badKind.status).toBe(400)
    const badDate = await upload(managerToken, { document_kind: 'other', title: 'X', expires_on: '15-01-2026' })
    expect(badDate.status).toBe(400)
  })

  it('rejects unauthorized roles', async () => {
    const res = await request(app).get(`/api/personnel/${staffId}/documents`)
      .set('Authorization', `Bearer ${lowToken}`)
    expect(res.status).toBe(403)
  })
})
