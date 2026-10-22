// Zimmet iade mantık taraması (Eki 2026).
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, db, aliId, veliId, aliZimmet, veliZimmet
const auth = () => ({ Authorization: `Bearer ${token}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  db = getDB()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
  const userId = db.prepare("SELECT id FROM users WHERE username='mudur'").get().id
  aliId = db.prepare("INSERT INTO personnel(tc_no, full_name) VALUES('70000000001', 'Zimmet Ali')").run().lastInsertRowid
  veliId = db.prepare("INSERT INTO personnel(tc_no, full_name) VALUES('70000000002', 'Zimmet Veli')").run().lastInsertRowid
  const ins = db.prepare('INSERT INTO zimmet(personnel_id, item_name, quantity, created_by) VALUES(?,?,1,?)')
  aliZimmet = ins.run(aliId, 'Battaniye', userId).lastInsertRowid
  veliZimmet = ins.run(veliId, 'Kask', userId).lastInsertRowid
})

const z = (id) => db.prepare('SELECT returned_at, return_condition FROM zimmet WHERE id=?').get(id)

describe('Zimmet iadesi', () => {
  it('çıkışta başka personelin zimmeti iade edilmiş sayılmaz', async () => {
    const res = await request(app).post('/api/checkout/process').set(auth())
      .send({ personnel_id: aliId, zimmet_actions: [
        { zimmet_id: aliZimmet, action: 'return' },
        { zimmet_id: veliZimmet, action: 'return' },
      ] })
    expect(res.status).toBe(200)
    expect(z(aliZimmet).returned_at).toBeTruthy()
    expect(z(veliZimmet).returned_at).toBeNull()
  })

  it('iade edilmiş zimmet tekrar iade edilince durumu ezilmez', async () => {
    const lost = await request(app).post('/api/checkin/zimmet/return').set(auth())
      .send({ zimmet_id: veliZimmet, condition: 'lost' })
    expect(lost.status).toBe(200)
    const first = z(veliZimmet)
    expect(first.return_condition).toBe('lost')
    const again = await request(app).post('/api/checkin/zimmet/return').set(auth())
      .send({ zimmet_id: veliZimmet, condition: 'normal' })
    expect(again.status).toBe(200)
    expect(z(veliZimmet)).toEqual(first)
  })
})
