import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDB, getDB } from '../../shared/db/index.js'
import { cleanupLaundryPhotos, removeLaundryPhotoFile } from './photo-retention.js'
import { deleteItemService } from './service.js'

let uploadsDir
const originalUploadsDir = process.env.UPLOADS_DIR

function touch(name, mtime) {
  const file = path.join(uploadsDir, name)
  fs.writeFileSync(file, name)
  if (mtime) fs.utimesSync(file, mtime, mtime)
  return file
}

beforeEach(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laundry-photo-test-'))
})

afterEach(() => {
  fs.rmSync(uploadsDir, { recursive: true, force: true })
  if (originalUploadsDir === undefined) delete process.env.UPLOADS_DIR
  else process.env.UPLOADS_DIR = originalUploadsDir
})

const NOW = new Date('2026-07-30T12:00:00Z')
const OLD = new Date('2026-07-01T12:00:00Z')

describe('laundry photo retention', () => {
  it('referanssiz ve suresi dolan laundry-* dosyasini siler', () => {
    const orphanOld = touch('laundry-orphan-old.jpg', OLD)
    const orphanNew = touch('laundry-orphan-new.jpg', NOW)

    const result = cleanupLaundryPhotos({ uploadsDir, now: NOW, retentionDays: 7 })

    expect(result.orphan_files_deleted).toBe(1)
    expect(fs.existsSync(orphanOld)).toBe(false)
    expect(fs.existsSync(orphanNew)).toBe(true)
  })

  it('referansli dosyalara dokunmaz (torba / istisna / hasar / patlayan file)', () => {
    const db = getDB()
    const bagPhoto = touch('laundry-bag.jpg', OLD)
    const exceptionPhoto = touch('laundry-exception.jpg', OLD)
    const damagePhoto = touch('laundry-damage.jpg', OLD)
    const burstPhoto = touch('laundry-burst-piece.jpg', OLD)

    const itemId = db.prepare(
      "INSERT INTO laundry_items(item_count, photo_url) VALUES(1, '/uploads/laundry-bag.jpg')"
    ).run().lastInsertRowid
    const garmentId = db.prepare(
      "INSERT INTO premium_garments(item_id, garment_code, garment_type) VALUES(?, 'G1-01', 'Gömlek')"
    ).run(itemId).lastInsertRowid
    db.prepare(`
      INSERT INTO laundry_garment_exceptions(garment_id, item_id, stage, reason, photo_url)
      VALUES(?, ?, 'ironing', 'damaged', '/uploads/laundry-exception.jpg')
    `).run(garmentId, itemId)
    db.prepare(`
      INSERT INTO laundry_damages(item_id, description, photo_url)
      VALUES(?, 'yirtik', '/uploads/laundry-damage.jpg')
    `).run(itemId)
    const incidentId = db.prepare(`
      INSERT INTO laundry_burst_bag_incidents(item_id, found_location, estimated_piece_count)
      VALUES(?, 'Ayırma masası', 1)
    `).run(itemId).lastInsertRowid
    db.prepare(`
      INSERT INTO laundry_burst_bag_pieces(incident_id, garment_type, photo_url)
      VALUES(?, 'Gömlek', '/uploads/laundry-burst-piece.jpg')
    `).run(incidentId)

    const result = cleanupLaundryPhotos({ uploadsDir, now: NOW, retentionDays: 7 })

    expect(result.orphan_files_deleted).toBe(0)
    expect(fs.existsSync(bagPhoto)).toBe(true)
    expect(fs.existsSync(exceptionPhoto)).toBe(true)
    expect(fs.existsSync(damagePhoto)).toBe(true)
    expect(fs.existsSync(burstPhoto)).toBe(true)
  })

  it('baska modulun dosyalarina dokunmaz', () => {
    const foreign = touch('housekeeping-old.jpg', OLD)
    const unprefixed = touch('1750000000-123.jpg', OLD)

    cleanupLaundryPhotos({ uploadsDir, now: NOW, retentionDays: 7 })

    expect(fs.existsSync(foreign)).toBe(true)
    expect(fs.existsSync(unprefixed)).toBe(true)
  })
})

describe('deleteItemService fotograf temizligi', () => {
  it('torba silinince giris/istisna/hasar fotograflari da diskten gider', () => {
    process.env.UPLOADS_DIR = uploadsDir
    const db = getDB()
    const bagPhoto = touch('laundry-sil-bag.jpg')
    const exceptionPhoto = touch('laundry-sil-exception.jpg')
    const damagePhoto = touch('laundry-sil-damage.jpg')
    const survivor = touch('laundry-baska-torba.jpg')

    const itemId = db.prepare(
      "INSERT INTO laundry_items(item_count, status, photo_url) VALUES(1, 'dirty', '/uploads/laundry-sil-bag.jpg')"
    ).run().lastInsertRowid
    const otherId = db.prepare(
      "INSERT INTO laundry_items(item_count, status, photo_url) VALUES(1, 'dirty', '/uploads/laundry-baska-torba.jpg')"
    ).run().lastInsertRowid
    const garmentId = db.prepare(
      "INSERT INTO premium_garments(item_id, garment_code, garment_type) VALUES(?, 'G9-01', 'Gömlek')"
    ).run(itemId).lastInsertRowid
    db.prepare(`
      INSERT INTO laundry_garment_exceptions(garment_id, item_id, stage, reason, photo_url)
      VALUES(?, ?, 'ironing', 'damaged', '/uploads/laundry-sil-exception.jpg')
    `).run(garmentId, itemId)
    db.prepare("INSERT INTO laundry_damages(item_id, description, photo_url) VALUES(?, 'leke', '/uploads/laundry-sil-damage.jpg')")
      .run(itemId)

    deleteItemService(itemId, null)

    expect(fs.existsSync(bagPhoto)).toBe(false)
    expect(fs.existsSync(exceptionPhoto)).toBe(false)
    expect(fs.existsSync(damagePhoto)).toBe(false)
    expect(fs.existsSync(survivor)).toBe(true)
    expect(db.prepare('SELECT COUNT(*) AS c FROM laundry_items WHERE id=?').get(otherId).c).toBe(1)
  })
})

describe('removeLaundryPhotoFile', () => {
  it('uploads icindeki dosyayi siler', () => {
    const file = touch('laundry-tek.jpg')
    expect(removeLaundryPhotoFile('/uploads/laundry-tek.jpg', uploadsDir)).toBe(true)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('uploads disina cikan yolu reddeder', () => {
    const outside = path.join(uploadsDir, '..', 'laundry-disari.jpg')
    fs.writeFileSync(outside, 'x')
    try {
      expect(removeLaundryPhotoFile('/uploads/../laundry-disari.jpg', uploadsDir)).toBe(false)
      expect(fs.existsSync(outside)).toBe(true)
    } finally {
      fs.rmSync(outside, { force: true })
    }
  })

  it('bos veya harici url icin false doner', () => {
    expect(removeLaundryPhotoFile(null, uploadsDir)).toBe(false)
    expect(removeLaundryPhotoFile('https://cdn.example/a.jpg', uploadsDir)).toBe(false)
  })
})
