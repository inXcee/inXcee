import { describe, it, expect, beforeAll } from 'vitest'
import { getDB, initDB } from './index.js'

beforeAll(() => { process.env.DB_PATH = ':memory:'; initDB() })

describe('DB schema', () => {
  it('creates personnel table', () => {
    const db = getDB()
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='personnel'").get()
    expect(row).toBeTruthy()
  })
  it('enforces S2 max 4 capacity', () => {
    const db = getDB()
    expect(() => db.prepare("INSERT INTO rooms(block,floor,room_no,capacity,active_beds,status) VALUES('S2',1,1,5,5,'active')").run()).toThrow()
  })
  it('enforces max 6 for other blocks', () => {
    const db = getDB()
    expect(() => db.prepare("INSERT INTO rooms(block,floor,room_no,capacity,active_beds,status) VALUES('M1',1,1,7,7,'active')").run()).toThrow()
  })
})
