import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'meydanci', password: 'admin123' })
  token = r.body.token
})

describe('Housekeeping — Zod sweep', () => {
  it('bos aciklamali ariza bildirimi 400 doner', async () => {
    const res = await request(app).post('/api/housekeeping/fault-report')
      .set('Authorization', `Bearer ${token}`).send({ location: 'M1 101', description: '' })
    expect(res.status).toBe(400)
  })

  it('cok uzun temizlik personeli ismi 400 doner', async () => {
    const res = await request(app).post('/api/housekeeping/staff')
      .set('Authorization', `Bearer ${token}`).send({ full_name: 'A'.repeat(201) })
    expect(res.status).toBe(400)
  })
})

describe('Housekeeping — hub complete foto kanıtı', () => {
  it('multipart photo ile tamamlama photo_url yazar, checklist string parse edilir', async () => {
    const { getDB } = await import('../../shared/db/index.js')
    const db = getDB()
    const t = db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location)
      VALUES('M2 Oda 120','M2',1,'room',datetime('now','localtime'),'M2-120')`).run()
    const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')
    const res = await request(app).post(`/api/housekeeping/tasks/${t.lastInsertRowid}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .field('checklist', JSON.stringify(['bed', 'floor']))
      .attach('photo', jpeg, 'oda.jpg')
    expect(res.status).toBe(200)
    const after = db.prepare('SELECT photo_url, checklist, completed_at FROM cleaning_tasks WHERE id=?').get(t.lastInsertRowid)
    expect(after.photo_url).toMatch(/^\/uploads\//)
    expect(JSON.parse(after.checklist)).toEqual(['bed', 'floor'])
    expect(after.completed_at).toBeTruthy()
  })

  it('fotosuz JSON tamamlama eskisi gibi çalışır', async () => {
    const { getDB } = await import('../../shared/db/index.js')
    const db = getDB()
    const t = db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location)
      VALUES('M2 Oda 121','M2',1,'room',datetime('now','localtime'),'M2-121')`).run()
    const res = await request(app).post(`/api/housekeeping/tasks/${t.lastInsertRowid}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ checklist: ['bed'] })
    expect(res.status).toBe(200)
    const after = db.prepare('SELECT photo_url, completed_at FROM cleaning_tasks WHERE id=?').get(t.lastInsertRowid)
    expect(after.photo_url).toBe(null)
    expect(after.completed_at).toBeTruthy()
  })
})

describe('Housekeeping — task history (foto kanıtlı)', () => {
  it('oda geçmişi qr_location ile döner: tamamlanan + atlanan + foto', async () => {
    const { getDB } = await import('../../shared/db/index.js')
    const db = getDB()
    db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location, completed_at, photo_url)
      VALUES('M2 Oda 110','M2',1,'room',datetime('now','localtime'),'M2-110',datetime('now'),'/uploads/x.jpg')`).run()
    db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location, skipped, skip_reason)
      VALUES('M2 Oda 110','M2',1,'room',datetime('now','localtime','-1 day'),'M2-110',1,'kapı kilitli')`).run()
    const res = await request(app).get('/api/housekeeping/task-history?qr_location=M2-110&days=14')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(2)
    expect(res.body[0].photo_url).toBe('/uploads/x.jpg')
    expect(res.body.some(h => h.skipped === 1 && h.skip_reason === 'kapı kilitli')).toBe(true)
  })

  it('ortak alan (WC/banyo) geçmişi common anahtarıyla döner', async () => {
    const { getDB } = await import('../../shared/db/index.js')
    const db = getDB()
    db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location, completed_at, photo_url)
      VALUES('M3 1.Kat Ortak Alan','M3',1,'common_area',datetime('now','localtime'),'M3-1-common',datetime('now'),'/uploads/wc.jpg')`).run()
    const res = await request(app).get('/api/housekeeping/task-history?qr_location=M3-1-common&days=14')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body[0].task_type).toBe('common_area')
    expect(res.body[0].photo_url).toBe('/uploads/wc.jpg')
  })

  it('qr_location olmadan 400', async () => {
    const res = await request(app).get('/api/housekeeping/task-history')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })
})

describe('Housekeeping', () => {
  it('creates daily tasks', async () => {
    const res = await request(app).post('/api/housekeeping/tasks/generate-daily').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(201)
    expect(res.body.count).toBeGreaterThan(0)
  })
  it('creates room tasks for Y bloklar (A, A1-A4, B, C, D, E, F, G, H, J)', async () => {
    const tasksRes = await request(app).get('/api/housekeeping/tasks').set('Authorization', `Bearer ${token}`)
    expect(tasksRes.status).toBe(200)
    const yBlocks = ['A', 'A1', 'A2', 'A3', 'A4', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']
    for (const yb of yBlocks) {
      const ybTasks = tasksRes.body.filter(t => t.block === yb && t.task_type === 'room')
      expect(ybTasks.length, `Y blok ${yb} için en az 1 oda task'i olmali`).toBeGreaterThan(0)
    }
  })
  it('does NOT create common_area task for Y bloklar (sadece M ortak banyolu)', async () => {
    const tasksRes = await request(app).get('/api/housekeeping/tasks').set('Authorization', `Bearer ${token}`)
    const yBlocks = ['A', 'A1', 'A2', 'A3', 'A4', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']
    for (const yb of yBlocks) {
      const commonTasks = tasksRes.body.filter(t => t.block === yb && t.task_type === 'common_area')
      expect(commonTasks.length, `Y blok ${yb} için common_area task olmamali`).toBe(0)
    }
  })
  it('completes task by QR', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const task = db.prepare('SELECT * FROM cleaning_tasks LIMIT 1').get()
    const res = await request(app)
      .post(`/api/housekeeping/tasks/${task.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
  it('lists tasks for housekeeper', async () => {
    const res = await request(app).get('/api/housekeeping/tasks').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
  it('filters uncleaned tasks only', async () => {
    const all = await request(app).get('/api/housekeeping/tasks').set('Authorization', `Bearer ${token}`)
    const uncleaned = await request(app).get('/api/housekeeping/tasks?uncleaned=true').set('Authorization', `Bearer ${token}`)
    expect(uncleaned.status).toBe(200)
    expect(Array.isArray(uncleaned.body)).toBe(true)
    // uncleaned should exclude completed and skipped tasks
    uncleaned.body.forEach(t => {
      expect(t.completed_at).toBeNull()
      expect(t.skipped).toBe(0)
    })
    // uncleaned count should be <= total count
    expect(uncleaned.body.length).toBeLessThanOrEqual(all.body.length)
  })
})
