import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDB, getDB } from '../../shared/db/index.js'
import { cleanupHousekeepingPhotos } from './photo-retention.js'

let uploadsDir

beforeEach(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'housekeeping-photo-test-'))
})

afterEach(() => {
  fs.rmSync(uploadsDir, { recursive: true, force: true })
})

describe('housekeeping photo retention', () => {
  it('suresi dolan fotografi siler ama temizlik kaydini korur', () => {
    const db = getDB()
    const oldFile = path.join(uploadsDir, 'housekeeping-old.jpg')
    const recentFile = path.join(uploadsDir, 'housekeeping-recent.jpg')
    fs.writeFileSync(oldFile, 'old')
    fs.writeFileSync(recentFile, 'recent')
    const old = db.prepare(`
      INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location, completed_at, photo_url)
      VALUES('M1 Oda 101','M1',1,'room','2026-07-01 08:00:00','M1-101','2026-07-01 09:00:00','/uploads/housekeeping-old.jpg')
    `).run().lastInsertRowid
    const recent = db.prepare(`
      INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location, completed_at, photo_url)
      VALUES('M1 Oda 102','M1',1,'room','2026-07-18 08:00:00','M1-102','2026-07-18 09:00:00','/uploads/housekeeping-recent.jpg')
    `).run().lastInsertRowid

    const result = cleanupHousekeepingPhotos({
      uploadsDir,
      retentionDays: 7,
      now: new Date('2026-07-19T12:00:00Z'),
    })

    expect(result.references_cleared).toBe(1)
    expect(fs.existsSync(oldFile)).toBe(false)
    expect(fs.existsSync(recentFile)).toBe(true)
    expect(db.prepare('SELECT photo_url FROM cleaning_tasks WHERE id=?').get(old).photo_url).toBe(null)
    expect(db.prepare('SELECT photo_url FROM cleaning_tasks WHERE id=?').get(recent).photo_url).toContain('recent')
    expect(db.prepare('SELECT COUNT(*) AS count FROM cleaning_tasks').get().count).toBe(2)
  })

  it('eski yetim housekeeping dosyalarini temizler, diger modullere dokunmaz', () => {
    const orphan = path.join(uploadsDir, 'housekeeping-orphan.jpg')
    const other = path.join(uploadsDir, 'maintenance-old.jpg')
    fs.writeFileSync(orphan, 'old')
    fs.writeFileSync(other, 'old')
    const oldTime = new Date('2026-07-01T00:00:00Z')
    fs.utimesSync(orphan, oldTime, oldTime)
    fs.utimesSync(other, oldTime, oldTime)

    const result = cleanupHousekeepingPhotos({
      uploadsDir,
      retentionDays: 3,
      now: new Date('2026-07-19T12:00:00Z'),
    })

    expect(result.orphan_files_deleted).toBe(1)
    expect(fs.existsSync(orphan)).toBe(false)
    expect(fs.existsSync(other)).toBe(true)
  })
})
