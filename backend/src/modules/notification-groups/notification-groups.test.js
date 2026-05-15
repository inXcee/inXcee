import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, userId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = r.body.token
  userId = getDB().prepare("SELECT id FROM users WHERE username='teknik'").get().id
})

describe('Notification Groups', () => {
  let gid
  it('grup adi olmadan reddedilir', async () => {
    const res = await request(app).post('/api/notification-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('grup olusturur + duplicate reddedilir', async () => {
    const c = await request(app).post('/api/notification-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acil Bakim', description: 'Acil ariza ekibi', channels: ['app', 'whatsapp'] })
    expect(c.status).toBe(201)
    gid = c.body.id

    const d = await request(app).post('/api/notification-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acil Bakim' })
    expect(d.status).toBe(409)
  })

  it('uye ekle + cikar + detay', async () => {
    const add = await request(app).post(`/api/notification-groups/${gid}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: userId })
    expect(add.status).toBe(201)

    const detail = await request(app).get(`/api/notification-groups/${gid}`)
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.members.some(m => m.id === userId)).toBe(true)
    expect(detail.body.channels).toContain('whatsapp')

    const rem = await request(app).delete(`/api/notification-groups/${gid}/members/${userId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(rem.status).toBe(200)
  })

  it('grup sil', async () => {
    const d = await request(app).delete(`/api/notification-groups/${gid}`)
      .set('Authorization', `Bearer ${token}`)
    expect(d.status).toBe(200)
  })
})
