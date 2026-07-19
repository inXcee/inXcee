import { beforeEach, describe, expect, it } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { addTaskPhotos, listTaskPhotos, deleteTaskPhoto, CLEANING_PHOTO_CATEGORIES } from './queries.js'

let taskId
const cover = () => getDB().prepare('SELECT photo_url FROM cleaning_tasks WHERE id=?').get(taskId).photo_url

beforeEach(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  taskId = getDB().prepare(
    "INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location) VALUES('M1 Oda 101','M1',1,'room','2026-07-19 08:00:00','M1-101')"
  ).run().lastInsertRowid
})

describe('cleaning task çoklu fotoğraf', () => {
  it('birden fazla foto ekler, kategoriyi normalize eder, kapağı ilk fotoya senkronlar', () => {
    const added = addTaskPhotos(taskId, [
      { photo_url: '/uploads/housekeeping-1.jpg', category: 'oncesi', caption: 'giriş' },
      { photo_url: '/uploads/housekeeping-2.jpg', category: 'GEÇERSİZ' },
    ], null)
    expect(added).toHaveLength(2)
    const list = listTaskPhotos(taskId)
    expect(list.map(p => p.photo_url)).toEqual(['/uploads/housekeeping-1.jpg', '/uploads/housekeeping-2.jpg'])
    expect(list[0].category).toBe('oncesi')
    expect(list[0].caption).toBe('giriş')
    expect(list[1].category).toBe('genel') // geçersiz kategori → genel
    expect(cover()).toBe('/uploads/housekeeping-1.jpg')
  })

  it('sonradan eklenen foto sona eklenir (sort_order artar)', () => {
    addTaskPhotos(taskId, [{ photo_url: '/uploads/a.jpg' }], null)
    addTaskPhotos(taskId, [{ photo_url: '/uploads/b.jpg' }], null)
    expect(listTaskPhotos(taskId).map(p => p.photo_url)).toEqual(['/uploads/a.jpg', '/uploads/b.jpg'])
  })

  it('foto silince kapak resenkronlanır; hepsi silinince kapak null olur', () => {
    const [p1] = addTaskPhotos(taskId, [{ photo_url: '/uploads/a.jpg' }], null)
    addTaskPhotos(taskId, [{ photo_url: '/uploads/b.jpg' }], null)
    const del = deleteTaskPhoto(taskId, p1.id)
    expect(del.photo_url).toBe('/uploads/a.jpg')
    expect(cover()).toBe('/uploads/b.jpg')
    const [remaining] = listTaskPhotos(taskId)
    deleteTaskPhoto(taskId, remaining.id)
    expect(cover()).toBe(null)
  })

  it('yanlış göreve ait foto silme null döner (güvenlik)', () => {
    const [p1] = addTaskPhotos(taskId, [{ photo_url: '/uploads/a.jpg' }], null)
    expect(deleteTaskPhoto(9999, p1.id)).toBe(null)
    expect(listTaskPhotos(taskId)).toHaveLength(1)
  })

  it('kategori listesi bilinen değerleri içerir', () => {
    expect(CLEANING_PHOTO_CATEGORIES).toEqual(['genel', 'oncesi', 'sonrasi', 'detay', 'hasar'])
  })
})
