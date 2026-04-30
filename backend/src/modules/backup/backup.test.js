import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let adminToken, userToken
let tmpDir, dbPath, backupDir

beforeAll(async () => {
  // İzole geçici DB dosyası — backup için file-based gerekli (memory backup edilemez)
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yys-backup-test-'))
  dbPath = path.join(tmpDir, 'test.db')
  backupDir = path.join(tmpDir, 'backups')
  process.env.DB_PATH = dbPath
  process.env.BACKUP_DIR = backupDir
  initDB()
  seedDev()

  const r1 = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  adminToken = r1.body.token
  const r2 = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
  userToken = r2.body.token
})

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

beforeEach(() => {
  // Mevcut yedekleri sil
  if (fs.existsSync(backupDir)) {
    fs.readdirSync(backupDir).forEach(f => fs.unlinkSync(path.join(backupDir, f)))
  }
})

describe('Backup — list', () => {
  it('admin yedek listesi alabilir (boş)', async () => {
    const res = await request(app).get('/api/backup/list')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(0)
  })

  it('non-admin reddedilir', async () => {
    const res = await request(app).get('/api/backup/list')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})

describe('Backup — run', () => {
  it('admin manuel yedek alabilir', async () => {
    const res = await request(app).post('/api/backup/run')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.name).toMatch(/^yys_.+\.db$/)
    expect(res.body.size).toBeGreaterThan(0)
  })

  it('yedek alındıktan sonra liste görünür', async () => {
    await request(app).post('/api/backup/run').set('Authorization', `Bearer ${adminToken}`)
    const list = await request(app).get('/api/backup/list')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.length).toBe(1)
    expect(list.body[0].name).toMatch(/^yys_.+\.db$/)
  })
})

describe('Backup — download & delete', () => {
  it('admin yedek indirebilir', async () => {
    const r = await request(app).post('/api/backup/run').set('Authorization', `Bearer ${adminToken}`)
    const name = r.body.name
    const dl = await request(app).get(`/api/backup/download/${name}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(dl.status).toBe(200)
    expect(dl.body.length).toBeGreaterThan(0)
  })

  it('path traversal saldırısı reddedilir', async () => {
    const dl = await request(app).get('/api/backup/download/..%2F..%2Fetc%2Fpasswd')
      .set('Authorization', `Bearer ${adminToken}`)
    expect([400, 404]).toContain(dl.status)
  })

  it('admin yedek silebilir', async () => {
    const r = await request(app).post('/api/backup/run').set('Authorization', `Bearer ${adminToken}`)
    const name = r.body.name
    const del = await request(app).delete(`/api/backup/${name}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(del.status).toBe(200)
    expect(del.body.ok).toBe(true)
    const list = await request(app).get('/api/backup/list')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.length).toBe(0)
  })

  it('var olmayan dosyayı silmek 404 döner', async () => {
    const del = await request(app).delete('/api/backup/yys_nonexistent.db')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(del.status).toBe(404)
  })
})

describe('Backup — restore', () => {
  it('geçersiz dosya formatı reddedilir', async () => {
    const res = await request(app).post('/api/backup/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('backup', Buffer.from('not a sqlite file'), 'fake.db')
    expect(res.status).toBe(400)
  })

  it('non-admin reddedilir', async () => {
    const res = await request(app).post('/api/backup/restore')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('backup', Buffer.from('x'), 'fake.db')
    expect(res.status).toBe(403)
  })
})

describe('Backup — off-site (Y11)', () => {
  it('OFFSITE_BACKUP_CMD tanimli degilse skipped doner', async () => {
    delete process.env.OFFSITE_BACKUP_CMD
    const res = await request(app).post('/api/backup/run')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(201)
    expect(res.body.offsite).toBeDefined()
    expect(res.body.offsite.skipped).toBe(true)
  })

  it('OFFSITE_BACKUP_CMD basarili calisirsa ok=true doner', async () => {
    // Plat-uyumsuz minimal komut: node icindeki process exit 0 cagir
    // Cross-platform: noop komut secelim — node -e 'process.exit(0)'
    process.env.OFFSITE_BACKUP_CMD = `node -e "process.exit(0)"`
    const res = await request(app).post('/api/backup/run')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(201)
    expect(res.body.offsite.ok).toBe(true)
    expect(res.body.offsite.code).toBe(0)
    delete process.env.OFFSITE_BACKUP_CMD
  })

  it('OFFSITE_BACKUP_CMD hata kodu donerse offsite.ok=false ama local backup yine basarili', async () => {
    process.env.OFFSITE_BACKUP_CMD = `node -e "process.exit(2)"`
    const res = await request(app).post('/api/backup/run')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true) // local hala ok
    expect(res.body.offsite.ok).toBe(false)
    expect(res.body.offsite.code).toBe(2)
    delete process.env.OFFSITE_BACKUP_CMD
  })
})
