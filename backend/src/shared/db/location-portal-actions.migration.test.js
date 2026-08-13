import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'migrations/107_location_portal_fault_surveys.sql'),
  'utf8',
)

function database() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE personnel(id INTEGER PRIMARY KEY);
    CREATE TABLE service_locations(id INTEGER PRIMARY KEY);
    CREATE TABLE maintenance_requests(
      id INTEGER PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'genel',
      status TEXT NOT NULL DEFAULT 'open'
    );
    CREATE TABLE satisfaction_surveys(
      id INTEGER PRIMARY KEY,
      personnel_id INTEGER REFERENCES personnel(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO personnel VALUES(1);
    INSERT INTO service_locations VALUES(2);
    INSERT INTO maintenance_requests(id,category,status) VALUES(10,'genel','open');
    INSERT INTO satisfaction_surveys(id,personnel_id) VALUES(20,1);
  `)
  db.exec(migration)
  return db
}

describe('migration 107 — QR arıza ve anket bağları', () => {
  it('mevcut bakım ve anket kayıtlarını koruyup geriye uyumlu kaynak atar', () => {
    const db = database()
    expect(db.prepare('SELECT id,request_source,identity_mode FROM maintenance_requests WHERE id=10').get())
      .toEqual({ id: 10, request_source: 'internal', identity_mode: null })
    expect(db.prepare('SELECT id,survey_source,identity_mode FROM satisfaction_surveys WHERE id=20').get())
      .toEqual({ id: 20, survey_source: 'general', identity_mode: null })
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('portal kayıtlarında konum ve kimlik modu bütünlüğünü zorlar', () => {
    const db = database()
    db.prepare(`
      INSERT INTO maintenance_requests(id,category,status,service_location_id,request_source,identity_mode)
      VALUES(11,'tesisat','open',2,'room_qr','resident_pin')
    `).run()
    expect(() => db.prepare(`
      INSERT INTO maintenance_requests(id,category,status,request_source,identity_mode)
      VALUES(12,'genel','open','room_qr','invalid')
    `).run()).toThrow()
    expect(() => db.prepare(`
      INSERT INTO satisfaction_surveys(id,service_location_id,survey_source,identity_mode)
      VALUES(21,999,'room_qr','anonymous')
    `).run()).toThrow()
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('çoklu bakım fotoğraflarını kayda bağlar ve bakım silinince temizler', () => {
    const db = database()
    db.prepare(`
      INSERT INTO maintenance_request_media(request_id,file_url,added_by_personnel_id)
      VALUES(10,'/uploads/room-portal-fault-a.jpg',1)
    `).run()
    expect(db.prepare('SELECT COUNT(*) AS count FROM maintenance_request_media WHERE request_id=10').get().count).toBe(1)
    db.prepare('DELETE FROM maintenance_requests WHERE id=10').run()
    expect(db.prepare('SELECT COUNT(*) AS count FROM maintenance_request_media').get().count).toBe(0)
    db.close()
  })
})
