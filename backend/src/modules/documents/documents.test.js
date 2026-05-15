import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
const tmpDir = path.join(process.cwd(), 'test-uploads-' + Date.now())

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.DOCUMENTS_DIR = tmpDir
  initDB()
  seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = r.body.token
})

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('Documents', () => {
  it('dosyasiz reddedilir', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .field('category', 'contract')
      .field('title', 'Test')
    expect(res.status).toBe(400)
  })

  it('PDF upload + listele + download + sil', async () => {
    // minimal PDF
    const pdfBuffer = Buffer.from('%PDF-1.4\n%fake pdf content for test', 'utf-8')

    const upload = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pdfBuffer, { filename: 'sozlesme.pdf', contentType: 'application/pdf' })
      .field('category', 'contract')
      .field('title', 'ACME Sozlesme 2026')
      .field('related_type', 'company')
      .field('related_id', '1')
      .field('description', 'yillik sozlesme')
    expect(upload.status).toBe(201)
    const id = upload.body.id

    const list = await request(app)
      .get('/api/documents?category=contract')
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.some(d => d.id === id)).toBe(true)

    const down = await request(app)
      .get(`/api/documents/${id}/download`)
      .set('Authorization', `Bearer ${token}`)
    expect(down.status).toBe(200)
    expect(down.body.toString().includes('PDF-1.4')).toBe(true)

    const del = await request(app)
      .delete(`/api/documents/${id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })

  it('gecersiz kategori reddedilir', async () => {
    const buf = Buffer.from('test')
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buf, { filename: 'x.pdf', contentType: 'application/pdf' })
      .field('category', 'wrong_cat')
      .field('title', 'X')
    expect(res.status).toBe(400)
  })
})
