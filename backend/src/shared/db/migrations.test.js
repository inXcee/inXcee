import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from './index.js'
import { MIGRATIONS, runVersionedMigrations, getMigrationStatus } from './migrations.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'; initDB()
})

describe('T2 — versiyonlu migration runner', () => {
  it('initDB tüm migrationları uygular ve kaydeder', () => {
    const db = getDB()
    const rows = db.prepare('SELECT name FROM schema_migrations ORDER BY id').all()
    expect(rows.map(r => r.name)).toEqual(MIGRATIONS.map(m => m.name))
  })

  it('ikinci çalıştırma idempotent (0 yeni migration)', () => {
    const r = runVersionedMigrations(getDB())
    expect(r.ran).toBe(0)
    expect(r.errors).toEqual([])
  })

  it('başarısız migration kaydedilmez ve hata raporlanır', () => {
    const db = getDB()
    const bad = [{ name: '999-bilerek-bozuk', up() { throw new Error('kasıtlı hata') } }]
    const r = runVersionedMigrations(db, bad)
    expect(r.ran).toBe(0)
    expect(r.errors.length).toBe(1)
    expect(r.errors[0].name).toBe('999-bilerek-bozuk')
    // Kaydedilmedi → sonraki boot'ta yeniden denenecek
    const saved = db.prepare("SELECT * FROM schema_migrations WHERE name='999-bilerek-bozuk'").get()
    expect(saved).toBeUndefined()

    // Temizlik: modül state'ini sıfırla (health testleri etkilenmesin)
    runVersionedMigrations(db, [])
  })

  it('başarısız migration transaction ile geri alınır (yarım iş kalmaz)', () => {
    const db = getDB()
    const partial = [{
      name: '998-yarim-is',
      up(d) {
        d.exec('CREATE TABLE t2_partial_test (id INTEGER)')
        throw new Error('ikinci adım patladı')
      },
    }]
    runVersionedMigrations(db, partial)
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='t2_partial_test'").get()
    expect(table).toBeUndefined()
    runVersionedMigrations(db, [])
  })

  it('getMigrationStatus uygulanan sayıyı döner', () => {
    const s = getMigrationStatus(getDB())
    expect(s.applied).toBeGreaterThanOrEqual(MIGRATIONS.length)
    expect(s.total).toBe(MIGRATIONS.length)
    expect(s.errors).toEqual([])
  })

  it('GET /api/health migrations alanını döner', async () => {
    const r = await request(app).get('/api/health')
    expect(r.status).toBe(200)
    expect(r.body.migrations).toBeTruthy()
    expect(r.body.migrations.total).toBe(MIGRATIONS.length)
    expect(Array.isArray(r.body.migrations.errors)).toBe(true)
  })
})
