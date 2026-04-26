import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'

beforeEach(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  // Hiç kullanıcı olmamalı — boş DB
  getDB().prepare('DELETE FROM users').run()
})

describe('Setup — needs_setup', () => {
  it('hiç kullanıcı yoksa needs_setup=true döner', async () => {
    const res = await request(app).get('/api/setup/status')
    expect(res.status).toBe(200)
    expect(res.body.needs_setup).toBe(true)
  })

  it('kullanıcı varsa needs_setup=false döner', async () => {
    await request(app).post('/api/setup/init').send({
      username: 'admin', password: 'parola12', full_name: 'İlk Admin',
    })
    const res = await request(app).get('/api/setup/status')
    expect(res.status).toBe(200)
    expect(res.body.needs_setup).toBe(false)
  })
})

describe('Setup — init', () => {
  it('geçerli payload ile admin oluşturur', async () => {
    const res = await request(app).post('/api/setup/init').send({
      username: 'admin', password: 'parola12', full_name: 'İlk Admin', email: 'a@b.com',
    })
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.username).toBe('admin')
    // login test
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'parola12' })
    expect(login.status).toBe(200)
    expect(login.body.user.role).toBe('campus_manager')
  })

  it('mevcut kurulumdan sonra reddeder (409)', async () => {
    await request(app).post('/api/setup/init').send({
      username: 'admin', password: 'parola12', full_name: 'İlk Admin',
    })
    const res = await request(app).post('/api/setup/init').send({
      username: 'second', password: 'parola12', full_name: 'İkinci',
    })
    expect(res.status).toBe(409)
  })

  it('kısa şifreyi reddeder', async () => {
    const res = await request(app).post('/api/setup/init').send({
      username: 'admin', password: 'kısa', full_name: 'Admin',
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/8 karakter/)
  })

  it('kısa kullanıcı adını reddeder', async () => {
    const res = await request(app).post('/api/setup/init').send({
      username: 'ab', password: 'parola12', full_name: 'Admin',
    })
    expect(res.status).toBe(400)
  })

  it('geçersiz karakter içeren kullanıcı adını reddeder', async () => {
    const res = await request(app).post('/api/setup/init').send({
      username: 'admin user', password: 'parola12', full_name: 'Admin',
    })
    expect(res.status).toBe(400)
  })

  it('geçersiz e-posta reddeder', async () => {
    const res = await request(app).post('/api/setup/init').send({
      username: 'admin', password: 'parola12', full_name: 'Admin', email: 'gecersiz',
    })
    expect(res.status).toBe(400)
  })

  it('Ad Soyad boş ise reddeder', async () => {
    const res = await request(app).post('/api/setup/init').send({
      username: 'admin', password: 'parola12',
    })
    expect(res.status).toBe(400)
  })
})
