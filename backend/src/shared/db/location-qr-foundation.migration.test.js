import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'migrations/105_location_qr_foundation.sql'),
  'utf8',
)

function database() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY);
    CREATE TABLE rooms(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block TEXT NOT NULL,
      floor INTEGER NOT NULL,
      room_no TEXT NOT NULL,
      UNIQUE(block, room_no)
    );
    CREATE TABLE system_settings(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO users(id) VALUES(1);
    INSERT INTO rooms(block,floor,room_no) VALUES
      ('M1',1,'101'),
      ('M1',1,'102'),
      ('S1',2,'201');
  `)
  db.exec(migration)
  return db
}

describe('migration 105 — oda QR altyapısı', () => {
  it('odaları ve yalnız M blok ortak alanlarını geri doldurur', () => {
    const db = database()
    expect(db.prepare("SELECT COUNT(*) c FROM service_locations WHERE location_type='room'").get().c).toBe(3)
    expect(db.prepare("SELECT COUNT(*) c FROM service_locations WHERE location_type='common_area'").get().c).toBe(4)
    expect(db.prepare("SELECT display_name FROM service_locations WHERE qr_location='M1-1-bathroom'").get().display_name)
      .toContain('Banyo')
    expect(db.prepare("SELECT 1 FROM service_locations WHERE qr_location LIKE 'S1-%-corridor'").get()).toBeUndefined()
    db.close()
  })

  it('ayarları kapalı seed eder ve mevcut tercihi ezmez', () => {
    const db = database()
    const rows = db.prepare("SELECT key,value FROM system_settings WHERE key LIKE 'location_portal_%'").all()
    expect(rows).toHaveLength(8)
    expect(rows.every(row => row.value === '0')).toBe(true)
    db.prepare("UPDATE system_settings SET value='1' WHERE key='location_portal_enabled'").run()
    db.exec(migration)
    expect(db.prepare("SELECT value FROM system_settings WHERE key='location_portal_enabled'").get().value).toBe('1')
    db.close()
  })

  it('yeni oda, numara değişikliği ve silmeyi otomatik eşitler', () => {
    const db = database()
    const roomId = db.prepare("INSERT INTO rooms(block,floor,room_no) VALUES('M2',3,'301')").run().lastInsertRowid
    expect(db.prepare('SELECT qr_location FROM service_locations WHERE room_id=?').get(roomId).qr_location).toBe('M2-301')
    expect(db.prepare("SELECT COUNT(*) c FROM service_locations WHERE block='M2' AND location_type='common_area' AND is_active=1").get().c).toBe(4)

    db.prepare("UPDATE rooms SET room_no='399' WHERE id=?").run(roomId)
    expect(db.prepare('SELECT qr_location FROM service_locations WHERE room_id=?').get(roomId).qr_location).toBe('M2-399')

    db.prepare('DELETE FROM rooms WHERE id=?').run(roomId)
    const archived = db.prepare("SELECT room_id,is_active FROM service_locations WHERE qr_location='M2-399'").get()
    expect(archived).toEqual({ room_id: null, is_active: 0 })
    expect(db.prepare("SELECT COUNT(*) c FROM service_locations WHERE block='M2' AND location_type='common_area' AND is_active=1").get().c).toBe(0)
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('konum başına yalnız bir aktif QR ve benzersiz token zorlar', () => {
    const db = database()
    const locationId = db.prepare("SELECT id FROM service_locations WHERE qr_location='M1-101'").get().id
    const token1 = 'a'.repeat(43)
    const token2 = 'b'.repeat(43)
    db.prepare(`
      INSERT INTO location_qr_codes(location_id,token,token_hash,created_by)
      VALUES(?,?,?,1)
    `).run(locationId, token1, '1'.repeat(64))
    expect(() => db.prepare(`
      INSERT INTO location_qr_codes(location_id,token,token_hash,created_by)
      VALUES(?,?,?,1)
    `).run(locationId, token2, '2'.repeat(64))).toThrow()
    db.prepare("UPDATE location_qr_codes SET status='revoked' WHERE token=?").run(token1)
    expect(() => db.prepare(`
      INSERT INTO location_qr_codes(location_id,token,token_hash,created_by)
      VALUES(?,?,?,1)
    `).run(locationId, token2, '2'.repeat(64))).not.toThrow()
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })
})
