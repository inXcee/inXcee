import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { applyMigrations } from './runner.js'

const migrationPath = fileURLToPath(new URL('./migrations/062_campus_fault_location.sql', import.meta.url))
const tempDirectories = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('062 campus fault location migration', () => {
  it('tireli, bosluklu ve blok-geneli kayitlari guvenli backfill eder', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE rooms (
        id INTEGER PRIMARY KEY,
        block TEXT NOT NULL,
        room_no TEXT NOT NULL
      );
      CREATE TABLE maintenance_requests (
        id INTEGER PRIMARY KEY,
        location TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
      );
      INSERT INTO rooms(id, block, room_no) VALUES
        (1, 'M1', '203'), (2, 'A', '101'), (3, 'A1', '210');
      INSERT INTO maintenance_requests(id, location) VALUES
        (1, 'M1-203'),
        (2, 'M1 203'),
        (3, 'M1 Ortak Alan'),
        (4, 'A1 Kat 2 Oda 210'),
        (5, 'Bilinmeyen Nokta');
    `)
    const directory = mkdtempSync(join(tmpdir(), 'yys-migration-'))
    tempDirectories.push(directory)
    writeFileSync(join(directory, '062_campus_fault_location.sql'), readFileSync(migrationPath, 'utf8'))

    expect(applyMigrations(db, directory)).toHaveLength(1)
    expect(applyMigrations(db, directory)).toEqual([])

    const rows = db.prepare('SELECT id, block, room_id FROM maintenance_requests ORDER BY id').all()
    expect(rows).toEqual([
      { id: 1, block: 'M1', room_id: 1 },
      { id: 2, block: 'M1', room_id: 1 },
      { id: 3, block: 'M1', room_id: null },
      { id: 4, block: 'A1', room_id: 3 },
      { id: 5, block: null, room_id: null },
    ])
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })
})
