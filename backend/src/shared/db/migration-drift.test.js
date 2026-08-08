import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 2026-08-09 dersi: deploy "BAŞARILI" dedi, kod ve build indi, /api/health 200
// döndü — ama çalışan süreç eski şemayla devam ediyordu (090/091 uygulanmamış).
// Personel Takip Merkezi ekranda "veri alınamadı" diyordu, sunucu logunda hiçbir
// iz yoktu. health yalnız DB'deki migration SAYISINI bildiriyordu; diskteki
// beklenenle karşılaştırmadığı için "şema geride" hâli görünmüyordu.
//
// Bu testler o karşılaştırmanın var olduğunu ve eksikte sessiz kalmadığını
// güvenceye alır.

let migrationFileVersions, pendingMigrations, app

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  const runner = await import('./runner.js')
  migrationFileVersions = runner.migrationFileVersions
  pendingMigrations = runner.pendingMigrations
  app = (await import('../../app.js')).default
  const { initDB } = await import('./index.js')
  initDB()
})

describe('migration dosya listesi', () => {
  it('gerçek migrations klasörünü okur', () => {
    const versions = migrationFileVersions()
    expect(versions.length).toBeGreaterThan(80)
    expect(versions).toEqual([...versions].sort((a, b) => a - b))
  })

  it('sürüm numaralarını dosya adından çıkarır', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'))
    try {
      writeFileSync(join(dir, '007_ornek.sql'), 'SELECT 1;')
      writeFileSync(join(dir, '012_baska.sql'), 'SELECT 1;')
      writeFileSync(join(dir, 'okuma.md'), 'sql degil')
      expect(migrationFileVersions(dir)).toEqual([7, 12])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('klasör yoksa boş döner, patlamaz', () => {
    expect(migrationFileVersions(join(tmpdir(), 'boyle-bir-klasor-yok-123'))).toEqual([])
  })
})

describe('bekleyen migration tespiti', () => {
  it('her şey uygulanmışsa boş liste', async () => {
    const { getDB } = await import('./index.js')
    expect(pendingMigrations(getDB())).toEqual([])
  })

  // Asıl senaryo: dosya var, DB'de kaydı yok — süreç eski şemayla koşuyor.
  it('uygulanmamış sürümü yakalar', async () => {
    const { getDB } = await import('./index.js')
    const db = getDB()
    db.prepare('DELETE FROM schema_migrations WHERE version = (SELECT MAX(version) FROM schema_migrations)').run()
    const bekleyen = pendingMigrations(db)
    expect(bekleyen.length).toBe(1)
    // Geri koy ki sonraki testler etkilenmesin
    const enBuyuk = migrationFileVersions().at(-1)
    db.prepare('INSERT INTO schema_migrations(version, name) VALUES(?, ?)').run(enBuyuk, 'geri-konuldu')
  })
})

describe('/api/health şema sürüklenmesini bildirir', () => {
  it('beklenen ve bekleyen sayıyı döner', async () => {
    const res = await request(app).get('/api/health')
    expect(res.body.migrations).toMatchObject({
      applied: expect.any(Number),
      expected: expect.any(Number),
      pending: expect.any(Number),
    })
    expect(res.body.migrations.expected).toBe(migrationFileVersions().length)
  })

  // Bekleyen varken 'ok' demek, bugün yaşanan sessiz hatayı tekrar üretir.
  it('bekleyen migration varsa şema degraded olur', async () => {
    const { getDB } = await import('./index.js')
    const db = getDB()
    const silinen = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1').get()
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(silinen.version)
    try {
      const res = await request(app).get('/api/health')
      expect(res.body.migrations.pending).toBeGreaterThan(0)
      expect(res.body.schema).toBe('degraded')
    } finally {
      db.prepare('INSERT INTO schema_migrations(version, name) VALUES(?, ?)').run(silinen.version, silinen.name)
    }
  })
})
