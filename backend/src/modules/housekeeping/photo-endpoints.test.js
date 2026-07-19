import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')

let managerToken, housekeeperToken, taskId
const auth = token => ({ Authorization: `Bearer ${token}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB(); seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  housekeeperToken = (await request(app).post('/api/auth/login').send({ username: 'meydanci', password: 'admin123' })).body.token
  taskId = getDB().prepare(
    "INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location) VALUES('M1 Oda 101','M1',1,'room',datetime('now','localtime'),'M1-101')"
  ).run().lastInsertRowid
})

describe('housekeeping çoklu fotoğraf uçları', () => {
  it('bir göreve birden fazla foto ekler (kategori + açıklama) ve listeler', async () => {
    const res = await request(app).post(`/api/housekeeping/tasks/${taskId}/photos`)
      .set(auth(housekeeperToken))
      .field('category', 'oncesi')
      .field('caption', 'giriş durumu')
      .attach('photos', JPEG, 'a.jpg')
      .attach('photos', JPEG, 'b.jpg')
    expect(res.status).toBe(201)
    expect(res.body.photos).toHaveLength(2)
    expect(res.body.photos[0].category).toBe('oncesi')
    expect(res.body.photos[0].caption).toBe('giriş durumu')

    const list = await request(app).get(`/api/housekeeping/tasks/${taskId}/photos`).set(auth(managerToken))
    expect(list.status).toBe(200)
    expect(list.body.photos).toHaveLength(2)
    // kapak ilk fotoya senkronlandı
    const cover = getDB().prepare('SELECT photo_url FROM cleaning_tasks WHERE id=?').get(taskId).photo_url
    expect(cover).toBe(list.body.photos[0].photo_url)
  })

  it('fotoğrafsız ekleme 400 döner', async () => {
    const res = await request(app).post(`/api/housekeeping/tasks/${taskId}/photos`)
      .set(auth(housekeeperToken)).field('category', 'genel')
    expect(res.status).toBe(400)
  })

  it('kategori/açıklama düzenler (PATCH)', async () => {
    const list = await request(app).get(`/api/housekeeping/tasks/${taskId}/photos`).set(auth(managerToken))
    const photoId = list.body.photos[0].id
    const res = await request(app).patch(`/api/housekeeping/tasks/${taskId}/photos/${photoId}`)
      .set(auth(housekeeperToken)).send({ category: 'hasar', caption: 'çatlak' })
    expect(res.status).toBe(200)
    expect(res.body.category).toBe('hasar')
    expect(res.body.caption).toBe('çatlak')
  })

  it('geçersiz kategori 400 döner', async () => {
    const list = await request(app).get(`/api/housekeeping/tasks/${taskId}/photos`).set(auth(managerToken))
    const res = await request(app).patch(`/api/housekeeping/tasks/${taskId}/photos/${list.body.photos[0].id}`)
      .set(auth(managerToken)).send({ category: 'olmayan' })
    expect(res.status).toBe(400)
  })

  it('silmeyi yalnızca yönetici yapar (housekeeper 403), yönetici silince liste kısalır', async () => {
    const before = await request(app).get(`/api/housekeeping/tasks/${taskId}/photos`).set(auth(managerToken))
    const photoId = before.body.photos.at(-1).id

    const forbidden = await request(app).delete(`/api/housekeeping/tasks/${taskId}/photos/${photoId}`).set(auth(housekeeperToken))
    expect(forbidden.status).toBe(403)

    const ok = await request(app).delete(`/api/housekeeping/tasks/${taskId}/photos/${photoId}`).set(auth(managerToken))
    expect(ok.status).toBe(200)
    const after = await request(app).get(`/api/housekeeping/tasks/${taskId}/photos`).set(auth(managerToken))
    expect(after.body.photos.length).toBe(before.body.photos.length - 1)
  })

  it('complete çoklu photos alanı ile birden fazla foto kaydeder + kapak yazar', async () => {
    const t = getDB().prepare(
      "INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location) VALUES('M2 Oda 120','M2',1,'room',datetime('now','localtime'),'M2-120')"
    ).run().lastInsertRowid
    const res = await request(app).post(`/api/housekeeping/tasks/${t}/complete`)
      .set(auth(housekeeperToken))
      .field('checklist', JSON.stringify(['bed', 'floor']))
      .attach('photos', JPEG, 'x.jpg')
      .attach('photos', JPEG, 'y.jpg')
    expect(res.status).toBe(200)
    const list = await request(app).get(`/api/housekeeping/tasks/${t}/photos`).set(auth(managerToken))
    expect(list.body.photos).toHaveLength(2)
    const row = getDB().prepare('SELECT photo_url, completed_at FROM cleaning_tasks WHERE id=?').get(t)
    expect(row.completed_at).toBeTruthy()
    expect(row.photo_url).toMatch(/^\/uploads\/housekeeping-/)
  })

  it('photo-overview foto sayısını döner', async () => {
    const res = await request(app).get('/api/housekeeping/photo-overview?days=7').set(auth(managerToken))
    expect(res.status).toBe(200)
    const withPhotos = res.body.items.find(i => i.photo_count > 0)
    expect(withPhotos).toBeTruthy()
  })
})
