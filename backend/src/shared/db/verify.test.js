import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from './index.js'
import { seedDev } from './seed.js'
import { verifySchemaObjects, EXPECTED_OBJECTS } from './verify.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
})

describe('Migration verify', () => {
  it('taze DB üzerinde tüm kritik nesneler mevcut', () => {
    const r = verifySchemaObjects()
    expect(r.ok).toBe(true)
    expect(r.missing).toEqual([])
  })

  it('index silinince missing olarak raporlar', () => {
    const db = getDB()
    const idx = EXPECTED_OBJECTS.index[0]
    db.exec(`DROP INDEX IF EXISTS ${idx}`)
    const r = verifySchemaObjects()
    expect(r.ok).toBe(false)
    expect(r.missing).toContain(`index:${idx}`)
    // Geri oluştur — diğer testler etkilenmesin
    initDB()
  })

  it('GET /api/health schema alanını döner', async () => {
    const r = await request(app).get('/api/health')
    expect(r.status).toBe(200)
    expect(['ok', 'degraded']).toContain(r.body.schema)
    expect(Array.isArray(r.body.schema_missing)).toBe(true)
  })
})
