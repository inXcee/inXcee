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

  it('groups uploads that share a version_group and exposes version history', async () => {
    const first = await upload(managerToken, { document_kind: 'contract', title: 'Sözleşme v1' })
    expect(first.status).toBe(201)
    created.push(first.body.id)
    const group = first.body.version_group

    const second = await upload(managerToken, { document_kind: 'contract', title: 'Sözleşme v2', version_group: group })
    expect(second.status).toBe(201)
    expect(second.body.version_group).toBe(group)
    created.push(second.body.id)

    const list = await request(app).get(`/api/personnel/${staffId}/documents`)
      .set('Authorization', `Bearer ${managerToken}`)
    const grouped = list.body.documents.find(d => d.version_group === group)
    expect(grouped.version_count).toBe(2)
    expect(grouped.versions).toHaveLength(2)
    // Güncel = en yeni yükleme (v2)
    expect(grouped.title).toBe('Sözleşme v2')
  })

  it('labels leave attachments with their leave type and supports download', async () => {
    const list = await request(app).get(`/api/personnel/${staffId}/documents`)
      .set('Authorization', `Bearer ${managerToken}`)
    const leave = list.body.attachments.find(a => a.source === 'leave')
    expect(leave.leave_type).toBe('annual')
    expect(leave.kind_label).toContain('Yıllık izin')

    // Diskte gerçek ek dosyası oluştur ve indirmeyi doğrula (UPLOADS_DIR + basename)
    const base = process.env.UPLOADS_DIR || 'uploads'
    fs.mkdirSync(base, { recursive: true })
    const fileName = `leave-att-${Date.now()}.pdf`
    fs.writeFileSync(`${base}/${fileName}`, '%PDF-1.4 leave attachment')
    const db = getDB()
    db.prepare('UPDATE leave_documents SET file_url=? WHERE id=?')
      .run(`/uploads/${fileName}`, leave.attachment_id)
    try {
      const dl = await request(app).get(`/api/personnel/documents/attachment/${leave.attachment_id}/download`)
        .set('Authorization', `Bearer ${managerToken}`)
      expect(dl.status).toBe(200)
    } finally {
      try { fs.unlinkSync(`${base}/${fileName}`) } catch { /* yok */ }
    }
  })
})

describe('staff document requirements (type management)', () => {
  let requirementId

  it('lets the manager create, list, update and delete a requirement', async () => {
    const create = await request(app).post('/api/personnel/document-requirements')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ document_kind: 'certificate', display_name: 'Yüksekte Çalışma Sertifikası', requires_expiry: true })
    expect(create.status).toBe(201)
    requirementId = create.body.id

    const list = await request(app).get('/api/personnel/document-requirements')
      .set('Authorization', `Bearer ${managerToken}`)
    const row = list.body.requirements.find(r => r.id === requirementId)
    expect(row.display_name).toBe('Yüksekte Çalışma Sertifikası')
    expect(row.requires_expiry).toBe(1)
    expect(row.kind_label).toBe('Sertifika')

    const patch = await request(app).patch(`/api/personnel/document-requirements/${requirementId}`)
      .set('Authorization', `Bearer ${managerToken}`).send({ is_active: false })
    expect(patch.status).toBe(200)

    const del = await request(app).delete(`/api/personnel/document-requirements/${requirementId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
  })

  it('blocks the supervisor from managing requirement rules', async () => {
    const res = await request(app).post('/api/personnel/document-requirements')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ document_kind: 'other', display_name: 'X' })
    expect(res.status).toBe(403)
  })
})

describe('cross-staff document catalog', () => {
  it('lists documents across staff with kind filter and masks sensitive for supervisor', async () => {
    const all = await request(app).get('/api/personnel/documents/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(all.status).toBe(200)
    expect(all.body.documents.length).toBeGreaterThan(0)
    expect(all.body.documents[0].staff_name).toBeTruthy()

    const filtered = await request(app).get('/api/personnel/documents/catalog?document_kind=bank')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(filtered.body.documents.every(d => d.document_kind === 'bank')).toBe(true)

    // Vardiya sorumlusu hassas belgeyi maskeli görür (restricted)
    const supervisorView = await request(app).get('/api/personnel/documents/catalog?document_kind=bank')
      .set('Authorization', `Bearer ${supervisorToken}`)
    expect(supervisorView.body.documents.every(d => d.restricted === true && d.file_name === null)).toBe(true)
  })
})
