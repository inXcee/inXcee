import { describe, it, expect, beforeEach } from 'vitest'
import { initDB, getDB } from './index.js'
import { seedProdRooms } from './seedProdRooms.js'

beforeEach(() => {
  process.env.DB_PATH = ':memory:'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-vitest'
  initDB()
})

describe('seedProdRooms', () => {
  it('M1-M3 + S1-S3 toplam 324 oda olusturur', () => {
    const stats = seedProdRooms()
    expect(stats.inserted).toBe(324)
    expect(stats.skipped).toBe(0)
    expect(stats.total_in_db).toBe(324)
  })

  it('her M blogu 60 oda (2 kat x 30), tumu kapasite 6', () => {
    seedProdRooms()
    const db = getDB()
    for (const block of ['M1', 'M2', 'M3']) {
      const count = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE block=?').get(block).c
      expect(count).toBe(60)
      const cap6 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND capacity=6").get(block).c
      expect(cap6).toBe(60)
    }
  })

  it('S1 ve S3 her biri 48 oda, hepsi kapasite 6', () => {
    seedProdRooms()
    const db = getDB()
    for (const block of ['S1', 'S3']) {
      const count = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE block=?').get(block).c
      expect(count).toBe(48)
      const cap6 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND capacity=6").get(block).c
      expect(cap6).toBe(48)
    }
  })

  it('S2 1.kat kapasite 6, S2 2.kat kapasite 4 (DB CHECK kisiti)', () => {
    seedProdRooms()
    const db = getDB()
    const f1cap6 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block='S2' AND floor=1 AND capacity=6").get().c
    const f2cap4 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block='S2' AND floor=2 AND capacity=4").get().c
    expect(f1cap6).toBe(24)
    expect(f2cap4).toBe(24)
  })

  it('idempotent — ikinci cagrida yeni oda eklenmez', () => {
    seedProdRooms()
    const stats = seedProdRooms()
    expect(stats.inserted).toBe(0)
    expect(stats.skipped).toBe(324)
    expect(stats.total_in_db).toBe(324)
  })

  it('butun odalar status=active baslar', () => {
    seedProdRooms()
    const db = getDB()
    const inactive = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE status != 'active'").get().c
    expect(inactive).toBe(0)
  })

  it('oda numaralari 101-130 (M) ve 101-124 (S) araligindadir', () => {
    seedProdRooms()
    const db = getDB()
    const m1f1 = db.prepare("SELECT MIN(CAST(room_no AS INTEGER)) as mn, MAX(CAST(room_no AS INTEGER)) as mx FROM rooms WHERE block='M1' AND floor=1").get()
    expect(m1f1.mn).toBe(101)
    expect(m1f1.mx).toBe(130)
    const s2f2 = db.prepare("SELECT MIN(CAST(room_no AS INTEGER)) as mn, MAX(CAST(room_no AS INTEGER)) as mx FROM rooms WHERE block='S2' AND floor=2").get()
    expect(s2f2.mn).toBe(201)
    expect(s2f2.mx).toBe(224)
  })

  it('mevcut oda kayitlarini ezmez (INSERT OR IGNORE)', () => {
    const db = getDB()
    // Önceden farklı durumda var olan oda
    db.prepare("INSERT INTO rooms(block,floor,room_no,capacity,active_beds,status) VALUES('M1',1,'101',3,2,'maintenance')").run()
    seedProdRooms()
    const room = db.prepare("SELECT * FROM rooms WHERE block='M1' AND room_no='101'").get()
    expect(room.capacity).toBe(3)
    expect(room.active_beds).toBe(2)
    expect(room.status).toBe('maintenance')
  })

  it('active_beds = capacity (her oda tam dolu yatakla baslar)', () => {
    seedProdRooms()
    const db = getDB()
    const mismatch = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE active_beds != capacity").get().c
    expect(mismatch).toBe(0)
  })
})
