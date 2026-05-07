import { describe, it, expect, beforeEach } from 'vitest'
import { initDB, getDB } from './index.js'
import { seedProdRooms } from './seedProdRooms.js'

beforeEach(() => {
  process.env.DB_PATH = ':memory:'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-vitest'
  initDB()
})

describe('seedProdRooms', () => {
  it('M1-M3 + S1-S3 + yeni 13 blok toplam 814 oda olusturur', () => {
    const stats = seedProdRooms()
    expect(stats.inserted).toBe(814)
    expect(stats.skipped).toBe(0)
    expect(stats.total_in_db).toBe(814)
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
    expect(stats.skipped).toBe(814)
    expect(stats.total_in_db).toBe(814)
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

  it('A, A1-A4, B, C bloklari her biri 40 oda (2 kat x 20), tumu kapasite 6', () => {
    seedProdRooms()
    const db = getDB()
    for (const block of ['A', 'A1', 'A2', 'A3', 'A4', 'B', 'C']) {
      const count = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE block=?').get(block).c
      expect(count).toBe(40)
      const cap6 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND capacity=6").get(block).c
      expect(cap6).toBe(40)
    }
  })

  it('E ve G her biri 60 oda (3 kat x 20), F 30 oda (3 kat x 10), kapasite 6', () => {
    seedProdRooms()
    const db = getDB()
    for (const block of ['E', 'G']) {
      const count = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE block=?').get(block).c
      expect(count).toBe(60)
    }
    const fCount = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block='F'").get().c
    expect(fCount).toBe(30)
    for (const block of ['E', 'G', 'F']) {
      const cap6 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND capacity=6").get(block).c
      const total = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=?").get(block).c
      expect(cap6).toBe(total)
    }
  })

  it('D 20 oda (101-120), H ve J 20 oda (1-20 duz numarali), kapasite 6', () => {
    seedProdRooms()
    const db = getDB()
    for (const block of ['D', 'H', 'J']) {
      const count = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE block=?').get(block).c
      expect(count).toBe(20)
      const cap6 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND capacity=6").get(block).c
      expect(cap6).toBe(20)
    }
  })

  it('H ve J oda numaralari 1-20 araliginda (100lu format degil)', () => {
    seedProdRooms()
    const db = getDB()
    for (const block of ['H', 'J']) {
      const range = db.prepare("SELECT MIN(CAST(room_no AS INTEGER)) as mn, MAX(CAST(room_no AS INTEGER)) as mx FROM rooms WHERE block=?").get(block)
      expect(range.mn).toBe(1)
      expect(range.mx).toBe(20)
    }
  })

  it('D blok oda numaralari 101-120 araliginda', () => {
    seedProdRooms()
    const db = getDB()
    const range = db.prepare("SELECT MIN(CAST(room_no AS INTEGER)) as mn, MAX(CAST(room_no AS INTEGER)) as mx FROM rooms WHERE block='D'").get()
    expect(range.mn).toBe(101)
    expect(range.mx).toBe(120)
  })

  it('E blok 3 kat (101-120, 201-220, 301-320), G blok ayni, F blok 3 kat 10ar oda', () => {
    seedProdRooms()
    const db = getDB()
    for (const block of ['E', 'G']) {
      for (let floor = 1; floor <= 3; floor++) {
        const count = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND floor=?").get(block, floor).c
        expect(count).toBe(20)
        const range = db.prepare("SELECT MIN(CAST(room_no AS INTEGER)) as mn, MAX(CAST(room_no AS INTEGER)) as mx FROM rooms WHERE block=? AND floor=?").get(block, floor)
        expect(range.mn).toBe(floor * 100 + 1)
        expect(range.mx).toBe(floor * 100 + 20)
      }
    }
    for (let floor = 1; floor <= 3; floor++) {
      const count = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block='F' AND floor=?").get(floor).c
      expect(count).toBe(10)
      const range = db.prepare("SELECT MIN(CAST(room_no AS INTEGER)) as mn, MAX(CAST(room_no AS INTEGER)) as mx FROM rooms WHERE block='F' AND floor=?").get(floor)
      expect(range.mn).toBe(floor * 100 + 1)
      expect(range.mx).toBe(floor * 100 + 10)
    }
  })

  it('yeni bloklar eklendiginde M/S bloklarinin kapasiteleri korunur', () => {
    seedProdRooms()
    const db = getDB()
    const mCap = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block IN ('M1','M2','M3') AND capacity=6").get().c
    expect(mCap).toBe(180)
    const s1s3Cap = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block IN ('S1','S3') AND capacity=6").get().c
    expect(s1s3Cap).toBe(96)
    const s2f1Cap = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block='S2' AND floor=1 AND capacity=6").get().c
    expect(s2f1Cap).toBe(24)
    const s2f2Cap = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block='S2' AND floor=2 AND capacity=4").get().c
    expect(s2f2Cap).toBe(24)
  })
})
