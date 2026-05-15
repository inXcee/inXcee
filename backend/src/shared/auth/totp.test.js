import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { authenticator } from 'otplib'
import app from '../../app.js'
import { initDB, getDB } from '../db/index.js'
import { seedDev } from '../db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
})

describe('2FA — setup + enable + login flow', () => {
  it('status başlangıçta enabled=false', async () => {
    const res = await request(app)
      .get('/api/auth/2fa/status')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.enabled).toBe(false)
  })

  it('setup secret + qr döner', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.secret).toBeTruthy()
    expect(res.body.qr).toMatch(/^data:image\/png/)
  })

  it('hatalı kod ile enable reddedilir', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '000000' })
    expect(res.status).toBe(401)
  })

  it('doğru kod ile enable + sonraki login challenge döner', async () => {
    const db = getDB()
    const secret = db.prepare("SELECT totp_secret FROM users WHERE username='mudur'").get().totp_secret
    const code = authenticator.generate(secret)

    const enable = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code })
    expect(enable.status).toBe(200)

    // Yeni login — challenge döner
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.require_2fa).toBe(true)
    expect(loginRes.body.challenge_token).toBeTruthy()

    // Doğru kod ile challenge'i geç
    const code2 = authenticator.generate(secret)
    const verify = await request(app).post('/api/auth/2fa/verify-login').send({
      challenge_token: loginRes.body.challenge_token,
      code: code2,
    })
    expect(verify.status).toBe(200)
    expect(verify.body.token).toBeTruthy()
  })

  it('yanlış kod ile challenge reddedilir', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
    const verify = await request(app).post('/api/auth/2fa/verify-login').send({
      challenge_token: loginRes.body.challenge_token,
      code: '111111',
    })
    expect(verify.status).toBe(401)
  })

  it('disable ile 2FA kapatılır', async () => {
    const db = getDB()
    const secret = db.prepare("SELECT totp_secret FROM users WHERE username='mudur'").get().totp_secret
    const code = authenticator.generate(secret)
    // Yeni login token al (eski tokenı kullanabilir ama netlik için)
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
    const verify = await request(app).post('/api/auth/2fa/verify-login').send({
      challenge_token: loginRes.body.challenge_token,
      code: authenticator.generate(secret),
    })
    const fresh = verify.body.token

    const disable = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${fresh}`)
      .send({ code: authenticator.generate(secret) })
    expect(disable.status).toBe(200)

    // Login artık direkt token döner
    const again = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
    expect(again.body.token).toBeTruthy()
    expect(again.body.require_2fa).toBeFalsy()
  })
})
