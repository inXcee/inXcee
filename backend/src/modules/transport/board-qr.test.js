import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken, staffId, routeId, assignmentId
const today = new Date().toISOString().slice(0, 10)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token

  const db = getDB()
  db.prepare(`INSERT INTO staff(full_name, is_active, qr_token) VALUES ('Qr Biniş Personeli', 1, 'BOARD-QR-1')`).run()
  staffId = db.prepare(`SELECT id FROM staff WHERE qr_token='BOARD-QR-1'`).get().id
  db.prepare(`INSERT INTO routes(name, is_active) VALUES ('QR Test Rotası', 1)`).run()
  routeId = db.prepare(`SELECT id FROM routes WHERE name='QR Test Rotası'`).get().id
  db.prepare(`INSERT INTO route_assignments(route_id, staff_id, work_date) VALUES (?, ?, ?)`).run(routeId, staffId, today)
  assignmentId = db.prepare(`SELECT id FROM route_assignments WHERE staff_id=? AND work_date=?`).get(staffId, today).id
  // atamasız ikinci personel
  db.prepare(`INSERT INTO staff(full_name, is_active, qr_token) VALUES ('Atamasız Personel', 1, 'BOARD-QR-2')`).run()
})

describe('POST /api/transport/board-qr', () => {
  it('token olmadan 401', async () => {
    const res = await request(app).post('/api/transport/board-qr').send({ qr_token: 'BOARD-QR-1' })
    expect(res.status).toBe(401)
  })

  it('QR ile bugünkü atamayı boarded işaretler, personel+rota döndürür', async () => {
    const res = await request(app).post('/api/transport/board-qr')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ qr_token: 'BOARD-QR-1' })
    expect(res.status).toBe(200)
    expect(res.body.staff_name).toBe('Qr Biniş Personeli')
    expect(res.body.route_name).toBe('QR Test Rotası')
    const row = getDB().prepare(`SELECT boarded FROM route_assignments WHERE id=?`).get(assignmentId)
    expect(row.boarded).toBe(1)
  })

  it('AVS: önekli token da kabul edilir + ikinci okutma 409 (zaten bindi)', async () => {
    const res = await request(app).post('/api/transport/board-qr')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ qr_token: 'AVS:BOARD-QR-1' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/bindi/i)
    expect(res.body.staff_name).toBe('Qr Biniş Personeli')
  })

  it('bilinmeyen token 404', async () => {
    const res = await request(app).post('/api/transport/board-qr')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ qr_token: 'YOK-BOYLE-TOKEN' })
    expect(res.status).toBe(404)
  })

  it('bugün ataması olmayan personel 404 (açıklayıcı mesaj)', async () => {
    const res = await request(app).post('/api/transport/board-qr')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ qr_token: 'BOARD-QR-2' })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/atama/i)
  })

  it('boş gövde 400 (Zod)', async () => {
    const res = await request(app).post('/api/transport/board-qr')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
    expect(res.status).toBe(400)
  })
})
