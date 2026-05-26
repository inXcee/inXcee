import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

describe('AVS Workers', () => {
  it('campus_manager olmayan erişemez', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
    const res = await request(app).get('/api/avs-workers').set('Authorization', `Bearer ${t}`)
    expect(res.status).toBe(403)
  })

  it('GET / boş liste döner', async () => {
    const res = await request(app).get('/api/avs-workers').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST / yeni çalışan ekler', async () => {
    const res = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Ahmet Kaya', role_label: 'Çamaşırhane' })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.full_name).toBe('Ahmet Kaya')
  })

  it('POST / kısa isim reddedilir', async () => {
    const res = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'A' })
    expect(res.status).toBe(400)
  })

  it('PUT /:id/pin PIN atar', async () => {
    const created = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Test Worker' })
    const res = await request(app).put(`/api/avs-workers/${created.body.id}/pin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: '1234' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('PUT /:id/pin hatalı PIN reddedilir', async () => {
    const created = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Pin Test Worker' })
    const res = await request(app).put(`/api/avs-workers/${created.body.id}/pin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: 'abcd' })
    expect(res.status).toBe(400)
  })

  it('PUT /:id/toggle aktif/pasif değiştirir', async () => {
    const created = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Toggle Worker' })
    const res = await request(app).put(`/api/avs-workers/${created.body.id}/toggle`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.is_active).toBe(0)
  })

  it('DELETE /:id siler', async () => {
    const created = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Delete Worker' })
    const res = await request(app).delete(`/api/avs-workers/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})

describe('AVS Auth', () => {
  it('GET /auth/avs-search boş query için boş array döner', async () => {
    const res = await request(app).get('/api/auth/avs-search?q=a')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /auth/avs-search PIN tanımsız aktif worker da döner (has_pin falsy)', async () => {
    const name = 'Pinsiz Arama Testi'
    await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: name })
    const res = await request(app).get(`/api/auth/avs-search?q=${encodeURIComponent('Pinsiz Arama')}`)
    expect(res.status).toBe(200)
    const found = res.body.find(w => w.full_name === name)
    expect(found).toBeTruthy()
    expect(found.has_pin).toBeFalsy()
  })

  it('POST /auth/avs-login PIN tanımlı değilse 403', async () => {
    const w = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Auth Test Worker' })
    const res = await request(app).post('/api/auth/avs-login')
      .send({ worker_id: w.body.id, pin: '1234' })
    expect(res.status).toBe(403)
  })

  it('POST /auth/avs-login doğru PIN ile token döner', async () => {
    const w = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Login Test Worker' })
    await request(app).put(`/api/avs-workers/${w.body.id}/pin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: '5678' })
    const res = await request(app).post('/api/auth/avs-login')
      .send({ worker_id: w.body.id, pin: '5678' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
  })

  it('POST /auth/avs-login yanlış PIN ile 401', async () => {
    const w = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Wrong Pin Worker' })
    await request(app).put(`/api/avs-workers/${w.body.id}/pin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: '9999' })
    const res = await request(app).post('/api/auth/avs-login')
      .send({ worker_id: w.body.id, pin: '0000' })
    expect(res.status).toBe(401)
  })

  it('POST /auth/avs-login pasif çalışan 401', async () => {
    const w = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Inactive Worker' })
    await request(app).put(`/api/avs-workers/${w.body.id}/pin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: '1111' })
    await request(app).put(`/api/avs-workers/${w.body.id}/toggle`)
      .set('Authorization', `Bearer ${token}`)
    const res = await request(app).post('/api/auth/avs-login')
      .send({ worker_id: w.body.id, pin: '1111' })
    expect(res.status).toBe(401)
  })
})
