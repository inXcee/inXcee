import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll } from 'vitest'
import { getDB, initDB, resolveDatabasePath } from './index.js'

beforeAll(() => { process.env.DB_PATH = ':memory:'; initDB() })

describe('DB schema', () => {
  it('göreli geliştirme DB yolunu çalışma klasöründen bağımsız proje köküne çözer', () => {
    const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url))
    expect(resolveDatabasePath(undefined)).toBe(path.join(projectRoot, 'yys.db'))
    expect(resolveDatabasePath('var/dev.db')).toBe(path.join(projectRoot, 'var', 'dev.db'))
    expect(resolveDatabasePath(':memory:')).toBe(':memory:')
  })

  it('creates personnel table', () => {
    const db = getDB()
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='personnel'").get()
    expect(row).toBeTruthy()
  })
  it('enforces S2 floor 2 max 4 capacity', () => {
    const db = getDB()
    // S2 kat 2 → max 4
    expect(() => db.prepare("INSERT INTO rooms(block,floor,room_no,capacity,active_beds,status) VALUES('S2',2,'t1',5,5,'active')").run()).toThrow()
    // S2 kat 1 → max 6 (should work)
    expect(() => db.prepare("INSERT INTO rooms(block,floor,room_no,capacity,active_beds,status) VALUES('S2',1,'t2',6,6,'active')").run()).not.toThrow()
    // S2 kat 2 → 4 should work
    expect(() => db.prepare("INSERT INTO rooms(block,floor,room_no,capacity,active_beds,status) VALUES('S2',2,'t3',4,4,'active')").run()).not.toThrow()
  })
  it('enforces max 6 for other blocks', () => {
    const db = getDB()
    expect(() => db.prepare("INSERT INTO rooms(block,floor,room_no,capacity,active_beds,status) VALUES('M1',1,'t4',7,7,'active')").run()).toThrow()
  })
})
