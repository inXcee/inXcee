import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Migration 103 `cards` tablosunu YENİDEN KURUYOR (SQLite'ta CHECK kısıtı ALTER
// ile genişletilemez). Canlıda bu tabloda gerçek kartlar var ve access_events
// ile attendance_events ona referans veriyor.
//
// Bu test veri kaybını ve kopan referansı yakalar. Boş bir geliştirme
// veritabanında her şey "çalışır" görünür; tehlike dolu tabloda.

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'migrations/103_laundry_card_system.sql'), 'utf-8')

// 103 öncesi şema: card_type yalnız access/meal
const oncekiSema = `
  CREATE TABLE personnel (id INTEGER PRIMARY KEY, full_name TEXT);
  CREATE TABLE rooms (id INTEGER PRIMARY KEY);
  CREATE TABLE users (id INTEGER PRIMARY KEY);
  CREATE TABLE staff (id INTEGER PRIMARY KEY);
  CREATE TABLE laundry_items (id INTEGER PRIMARY KEY);
  CREATE TABLE laundry_global_settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holder_type TEXT NOT NULL CHECK(holder_type IN ('staff','personnel','visitor')),
    holder_id INTEGER NOT NULL,
    card_type TEXT NOT NULL CHECK(card_type IN ('access','meal')),
    code TEXT UNIQUE NOT NULL, nfc_uid TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','lost')),
    issued_at TEXT DEFAULT CURRENT_TIMESTAMP, issued_by INTEGER,
    revoked_at TEXT, valid_until TEXT, photo_url TEXT);
  CREATE TABLE access_events (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER REFERENCES cards(id));
  CREATE TABLE attendance_events (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER REFERENCES cards(id));
  INSERT INTO personnel VALUES (10, 'Ali Veli');
  INSERT INTO cards(holder_type,holder_id,card_type,code,nfc_uid,status,valid_until,photo_url) VALUES
    ('personnel',10,'access','AVS-A:1','04AA','active','2027-01-01','/u/a.png'),
    ('personnel',10,'meal','AVS-M:1',NULL,'revoked',NULL,NULL),
    ('staff',5,'access','AVS-A:2',NULL,'lost',NULL,NULL);
  INSERT INTO access_events(card_id) VALUES (1),(2);
  INSERT INTO attendance_events(card_id) VALUES (1);
`

// Runner'ın davranışını birebir taklit eder: FK zorlaması transaction DIŞINDA
// kapatılır (içeride PRAGMA no-op'tur), migration transaction içinde koşar.
function migrasyonuUygula() {
  const db = new Database(':memory:')
  db.exec(oncekiSema)
  const once = db.prepare('SELECT * FROM cards ORDER BY id').all()
  db.pragma('foreign_keys = OFF')
  db.transaction(() => db.exec(migration))()
  db.pragma('foreign_keys = ON')
  return { db, once }
}

describe('migration 103 — cards tablosunun yeniden kurulumu', () => {
  it('mevcut kartları birebir korur', () => {
    const { db, once } = migrasyonuUygula()
    expect(db.prepare('SELECT * FROM cards ORDER BY id').all()).toEqual(once)
    db.close()
  })

  // Referans veren tablolar dropa rağmen bozulmamalı.
  it('referans veren tabloları ve bütünlüğü korur', () => {
    const { db } = migrasyonuUygula()
    expect(db.prepare('SELECT COUNT(*) c FROM access_events').get().c).toBe(2)
    expect(db.prepare('SELECT COUNT(*) c FROM attendance_events').get().c).toBe(1)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok')
    db.close()
  })

  // Drop/rename sonrası FK adları yeni tabloya bağlanmalı, yoksa zorlama ölür.
  it('yeniden kurulumdan sonra FK zorlaması çalışmaya devam eder', () => {
    const { db } = migrasyonuUygula()
    expect(() => db.prepare('INSERT INTO access_events(card_id) VALUES (99999)').run()).toThrow()
    db.close()
  })

  it('laundry tipini kabul eder, uydurma tipi hâlâ reddeder', () => {
    const { db } = migrasyonuUygula()
    expect(() => db.prepare("INSERT INTO cards(holder_type,holder_id,card_type,code) VALUES('personnel',10,'laundry','AVS-C:1')").run()).not.toThrow()
    expect(() => db.prepare("INSERT INTO cards(holder_type,holder_id,card_type,code) VALUES('personnel',10,'sacma','X')").run()).toThrow()
    db.close()
  })

  it('kod ve NFC benzersizliği korunur', () => {
    const { db } = migrasyonuUygula()
    expect(() => db.prepare("INSERT INTO cards(holder_type,holder_id,card_type,code) VALUES('personnel',10,'laundry','AVS-A:1')").run()).toThrow()
    expect(() => db.prepare("INSERT INTO cards(holder_type,holder_id,card_type,code,nfc_uid) VALUES('personnel',10,'laundry','AVS-C:9','04AA')").run()).toThrow()
    db.close()
  })

  // Kart dağıtılmadan zorunluluk açık gelirse her teslim gerekçe ister.
  it('kart zorunluluğunu KAPALI başlatır', () => {
    const { db } = migrasyonuUygula()
    const ayar = Object.fromEntries(db.prepare('SELECT key, value FROM laundry_global_settings').all().map(r => [r.key, r.value]))
    expect(ayar).toEqual({ card_required_intake: '0', card_required_delivery: '0' })
    db.close()
  })

  // Ayar zaten varsa migration onu ezmemeli (yeniden çalıştırma güvenliği).
  it('mevcut ayarı ezmez', () => {
    const db = new Database(':memory:')
    db.exec(oncekiSema)
    db.prepare("INSERT INTO laundry_global_settings(key,value) VALUES('card_required_delivery','1')").run()
    db.pragma('foreign_keys = OFF')
    db.transaction(() => db.exec(migration))()
    db.pragma('foreign_keys = ON')
    expect(db.prepare("SELECT value FROM laundry_global_settings WHERE key='card_required_delivery'").get().value).toBe('1')
    db.close()
  })
})
