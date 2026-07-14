import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanupWaterFiles, removeUploadFile, uploadFilePathFromUrl } from './file-lifecycle.js'

const tempRoots = []

function tempUploads() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yys-water-files-'))
  tempRoots.push(root)
  return root
}

function writeFile(root, relative, content = 'test') {
  const filePath = path.join(root, relative)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  return filePath
}

function setAge(filePath, date) {
  fs.utimesSync(filePath, date, date)
}

afterEach(() => {
  tempRoots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }))
})

describe('Su dosya yaşam döngüsü', () => {
  it('upload URL yolunu kök dizin dışına çıkarmadan çözer ve siler', () => {
    const root = tempUploads()
    const filePath = writeFile(root, 'water-waybill-delete.jpg')

    expect(uploadFilePathFromUrl('/uploads/water-waybill-delete.jpg', { uploadsDir: root })).toBe(filePath)
    expect(uploadFilePathFromUrl('/uploads/../secret.txt', { uploadsDir: root })).toBeNull()
    expect(uploadFilePathFromUrl('/uploads/subdir/file.jpg', { uploadsDir: root })).toBeNull()
    expect(removeUploadFile('/uploads/../secret.txt', { uploadsDir: root }).status).toBe('ignored')
    expect(removeUploadFile('/uploads/water-waybill-delete.jpg', { uploadsDir: root }).status).toBe('deleted')
    expect(fs.existsSync(filePath)).toBe(false)
    expect(removeUploadFile('/uploads/water-waybill-delete.jpg', { uploadsDir: root }).status).toBe('missing')
  })

  it('yalnız eski ve referanssız su dosyaları ile retention süresi dolan PDF raporları temizler', () => {
    const root = tempUploads()
    const now = new Date('2026-07-15T00:00:00.000Z')
    const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

    const orphan = writeFile(root, 'water-waybill-orphan.jpg')
    const referenced = writeFile(root, 'water-waybill-referenced.jpg')
    const recentOrphan = writeFile(root, 'water-waybill-recent.jpg')
    const unrelated = writeFile(root, 'other-module-old.jpg')
    const oldReport = writeFile(root, 'reports/su-kapanis-old.pdf')
    const recentReport = writeFile(root, 'reports/su-kapanis-recent.pdf')
    const reportNote = writeFile(root, 'reports/notlar.txt')

    ;[orphan, referenced, unrelated, oldReport, reportNote].forEach(filePath => setAge(filePath, old))
    ;[recentOrphan, recentReport].forEach(filePath => setAge(filePath, recent))

    const result = cleanupWaterFiles({
      now,
      uploadsDir: root,
      orphanGraceDays: 7,
      reportRetentionDays: 30,
      referencedUrls: ['/uploads/water-waybill-referenced.jpg'],
    })

    expect(result).toMatchObject({ orphan_files_deleted: 1, reports_deleted: 1, errors: [] })
    expect(fs.existsSync(orphan)).toBe(false)
    expect(fs.existsSync(oldReport)).toBe(false)
    expect(fs.existsSync(referenced)).toBe(true)
    expect(fs.existsSync(recentOrphan)).toBe(true)
    expect(fs.existsSync(unrelated)).toBe(true)
    expect(fs.existsSync(recentReport)).toBe(true)
    expect(fs.existsSync(reportNote)).toBe(true)
  })
})
