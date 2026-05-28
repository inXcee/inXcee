import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyMigrations } from './runner.js'

let db, dir

beforeEach(() => {
  db = new Database(':memory:')
  dir = mkdtempSync(join(tmpdir(), 'yys-mig-'))
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('applyMigrations', () => {
  it('bekleyen migration\'ları sürüm sırasına göre uygular ve kaydeder', () => {
    writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE a (id INTEGER);')
    writeFileSync(join(dir, '002_b.sql'), 'CREATE TABLE b (id INTEGER);')
    const res = applyMigrations(db, dir)
    expect(res.map(r => r.version)).toEqual([1, 2])
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(r => r.version)
    expect(versions).toEqual([1, 2])
    // tablolar gerçekten oluştu
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='a'").get()).toBeTruthy()
  })

  it('zaten uygulanmış migration\'ı tekrar çalıştırmaz (idempotent)', () => {
    writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE a (id INTEGER);')
    applyMigrations(db, dir)
    // ikinci çağrı: 001 atlanmalı, yeni 002 uygulanmalı
    writeFileSync(join(dir, '002_b.sql'), 'CREATE TABLE b (id INTEGER);')
    const res = applyMigrations(db, dir)
    expect(res.map(r => r.version)).toEqual([2])
  })

  it('boş/yorum-only .sql dosyasını kaydeder ama hata vermez', () => {
    writeFileSync(join(dir, '000_baseline.sql'), '-- sadece yorum\n')
    const res = applyMigrations(db, dir)
    expect(res.map(r => r.version)).toEqual([0])
  })

  it('bir migration patlarsa fail-fast — sonrakiler uygulanmaz', () => {
    writeFileSync(join(dir, '001_ok.sql'), 'CREATE TABLE ok (id INTEGER);')
    writeFileSync(join(dir, '002_bad.sql'), 'CREATE TABLE bad (;')  // geçersiz SQL
    writeFileSync(join(dir, '003_never.sql'), 'CREATE TABLE never (id INTEGER);')
    expect(() => applyMigrations(db, dir)).toThrow()
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(r => r.version)
    expect(versions).toEqual([1])  // 001 başarılı, 002 fail, 003 hiç çalışmadı
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='never'").get()).toBeFalsy()
  })

  it('migrations dizini yoksa boş döner', () => {
    expect(applyMigrations(db, join(dir, 'yok'))).toEqual([])
  })
})
