import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'migrations/104_cards_integrity.sql'),
  'utf-8',
)

const post103Schema = `
  CREATE TABLE users (id INTEGER PRIMARY KEY);
  CREATE TABLE cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holder_type TEXT NOT NULL CHECK(holder_type IN ('staff','personnel','visitor')),
    holder_id INTEGER NOT NULL,
    card_type TEXT NOT NULL CHECK(card_type IN ('access','meal','laundry')),
    code TEXT UNIQUE NOT NULL,
    nfc_uid TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','lost')),
    issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
    issued_by INTEGER,
    revoked_at TEXT,
    valid_until TEXT,
    photo_url TEXT
  );
  CREATE TABLE access_events (id INTEGER PRIMARY KEY, card_id INTEGER REFERENCES cards(id));
  CREATE TABLE attendance_events (id INTEGER PRIMARY KEY, card_id INTEGER REFERENCES cards(id));
  INSERT INTO users VALUES (7);
  INSERT INTO cards
    (holder_type,holder_id,card_type,code,nfc_uid,status,issued_by,valid_until,photo_url)
  VALUES
    ('personnel',10,'laundry','AVS-C:1','04AA','active',7,'2027-01-01','/u/c.png'),
    ('staff',5,'access','AVS-A:1',NULL,'revoked',7,NULL,NULL);
  INSERT INTO access_events VALUES (1,1);
  INSERT INTO attendance_events VALUES (1,2);
`

function migrate() {
  const db = new Database(':memory:')
  db.exec(post103Schema)
  const before = db.prepare('SELECT * FROM cards ORDER BY id').all()
  db.pragma('foreign_keys = OFF')
  db.transaction(() => db.exec(migration))()
  db.pragma('foreign_keys = ON')
  return { db, before }
}

describe('migration 104 — cards bütünlük invariantları', () => {
  it('dolu tabloyu ve dış referansları korur', () => {
    const { db, before } = migrate()
    expect(db.prepare('SELECT * FROM cards ORDER BY id').all()).toEqual(before)
    expect(db.prepare('SELECT card_id FROM access_events').get().card_id).toBe(1)
    expect(db.prepare('SELECT card_id FROM attendance_events').get().card_id).toBe(2)
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('issued_by foreign key zorlamasını geri getirir', () => {
    const { db } = migrate()
    const fks = db.pragma('foreign_key_list(cards)')
    expect(fks.some(fk => fk.from === 'issued_by' && fk.table === 'users')).toBe(true)
    expect(() => db.prepare(`
      INSERT INTO cards(holder_type,holder_id,card_type,code,issued_by)
      VALUES('personnel',11,'laundry','AVS-C:FK',999)
    `).run()).toThrow()
    db.close()
  })

  it('kişi ve tip başına yalnız bir aktif karta izin verir', () => {
    const { db } = migrate()
    expect(() => db.prepare(`
      INSERT INTO cards(holder_type,holder_id,card_type,code)
      VALUES('personnel',10,'laundry','AVS-C:2')
    `).run()).toThrow()
    expect(() => db.prepare(`
      INSERT INTO cards(holder_type,holder_id,card_type,code,status)
      VALUES('personnel',10,'laundry','AVS-C:3','revoked')
    `).run()).not.toThrow()
    db.close()
  })

  it('önceden oluşmuş aktif kart çakışmasında sessiz veri silmez', () => {
    const db = new Database(':memory:')
    db.exec(post103Schema)
    db.prepare(`
      INSERT INTO cards(holder_type,holder_id,card_type,code)
      VALUES('personnel',10,'laundry','AVS-C:DUP')
    `).run()
    const count = db.prepare('SELECT COUNT(*) AS c FROM cards').get().c
    db.pragma('foreign_keys = OFF')
    expect(() => db.transaction(() => db.exec(migration))()).toThrow()
    db.pragma('foreign_keys = ON')
    expect(db.prepare('SELECT COUNT(*) AS c FROM cards').get().c).toBe(count)
    db.close()
  })
})
