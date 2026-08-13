import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'migrations/106_location_portal_security.sql'),
  'utf8',
)

function database() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE rooms(id INTEGER PRIMARY KEY);
    CREATE TABLE personnel(id INTEGER PRIMARY KEY);
    CREATE TABLE staff(id INTEGER PRIMARY KEY);
    CREATE TABLE service_locations(id INTEGER PRIMARY KEY);
    CREATE TABLE location_qr_codes(id INTEGER PRIMARY KEY);
    INSERT INTO rooms VALUES(1);
    INSERT INTO personnel VALUES(2);
    INSERT INTO staff VALUES(3);
    INSERT INTO service_locations VALUES(4);
    INSERT INTO location_qr_codes VALUES(5);
  `)
  db.exec(migration)
  return db
}

describe('migration 106 — public portal güvenliği', () => {
  it('oturum tokenını yalnız hash olarak ve konuma bağlı saklar', () => {
    const db = database()
    db.prepare(`
      INSERT INTO location_portal_sessions(
        location_id,personnel_id,token_hash,created_ip_hash,expires_at
      ) VALUES(4,2,?,?,datetime('now','+15 minutes'))
    `).run('a'.repeat(64), 'b'.repeat(64))
    const row = db.prepare('SELECT * FROM location_portal_sessions').get()
    expect(row.token_hash).toBe('a'.repeat(64))
    expect(Object.hasOwn(row, 'token')).toBe(false)
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('işlem olayında ham IP yerine 64 karakter özet zorlar', () => {
    const db = database()
    expect(() => db.prepare(`
      INSERT INTO location_portal_events(location_id,event_type,result,ip_hash)
      VALUES(4,'scan','opened','127.0.0.1')
    `).run()).toThrow()
    expect(() => db.prepare(`
      INSERT INTO location_portal_events(location_id,event_type,result,ip_hash)
      VALUES(4,'scan','opened',?)
    `).run('c'.repeat(64))).not.toThrow()
    db.close()
  })

  it('aynı konum, işlem ve client_request_id için tek makbuz zorlar', () => {
    const db = database()
    const insert = db.prepare(`
      INSERT INTO location_portal_receipts(
        receipt_code,location_id,action_type,client_request_id
      ) VALUES(?,?,?,?)
    `)
    insert.run('R'.repeat(22), 4, 'fault', 'request-123')
    expect(() => insert.run('S'.repeat(22), 4, 'fault', 'request-123')).toThrow()
    expect(() => insert.run('T'.repeat(22), 4, 'survey', 'request-123')).not.toThrow()
    db.close()
  })
})
