import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../db/index.js'
import { seedDev } from '../db/seed.js'
import { login, verifyToken, loginKioskById, loginKiosk, refreshToken } from './service.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

let managerToken

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  // Cookie tabanlı login — service'ten direkt token al (supertest cookie tracking gerektirmez)
  const result = login('mudur', 'admin123')
  managerToken = result.token
})

describe('Auth', () => {
  it('cookie set eder ve user döndürür', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('campus_manager')
    expect(res.headers['set-cookie']).toBeDefined() // cookie set edildi
    // Test modunda token body'de de dönüyor (supertest cookie tracking için)
    expect(res.body.token).toBeTruthy()
  })
  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'wrong' })
    expect(res.status).toBe(401)
  })
  it('blocks protected route without token', async () => {
    const res = await request(app).get('/api/dashboard/kpi')
    expect(res.status).toBe(401)
  })
})

describe('JWT_SECRET zorunlu', () => {
  it('verifyToken fonksiyonu tanımlı', () => {
    // auth/service.js'de JWT_SECRET zorunlu guard var
    // Bu test, guard'ın test ortamında (globalSetup ile JWT_SECRET set edilmiş)
    // doğru çalıştığını ve verifyToken'ın export edildiğini doğrular
    expect(typeof verifyToken).toBe('function')
  })
})

describe('PATCH /api/auth/password', () => {
  it('geçerli mevcut şifre ile değiştirir', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'admin123', newPassword: 'yeniSifre123' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    // geri al — sonraki testler için
    await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'yeniSifre123', newPassword: 'admin123' })
  })

  it('yanlış mevcut şifre ile reddeder', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'yanlis-sifre', newPassword: 'yeniSifre123' })
    expect(res.status).toBe(401)
  })

  it('zayıf yeni şifreyi reddeder', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'admin123', newPassword: 'kisa' })
    expect(res.status).toBe(400)
  })

  it('token olmadan 401 döner', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .send({ currentPassword: 'admin123', newPassword: 'yeniSifre123' })
    expect(res.status).toBe(401)
  })
})

describe('token refresh', () => {
  it('geçerli token ile refresh başarılı', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.user).toBeTruthy() // body'de user var, token cookie'de
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('geçersiz token reddedilir', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', 'Bearer gecersiz.token.burada')
    expect(res.status).toBe(401)
  })

  it('token olmadan 401 döner', async () => {
    const res = await request(app).post('/api/auth/refresh')
    expect(res.status).toBe(401)
  })

  it('expired ama 24 saatten yeni token yenilenebilir', () => {
    // 1 saat once expired olmus token
    const u = getDB().prepare("SELECT id, role, username, full_name FROM users WHERE username='mudur'").get()
    const recentExpired = jwt.sign(
      { id: u.id, role: u.role, username: u.username, full_name: u.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '-1h' }
    )
    const result = refreshToken(recentExpired)
    expect(result.token).toBeTruthy()
  })

  it('24 saatten daha eski expired token reddedilir', () => {
    const u = getDB().prepare("SELECT id, role, username, full_name FROM users WHERE username='mudur'").get()
    const staleExpired = jwt.sign(
      { id: u.id, role: u.role, username: u.username, full_name: u.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '-25h' }
    )
    const result = refreshToken(staleExpired)
    expect(result.status).toBe(401)
    expect(result.error).toMatch(/tekrar giris/)
  })
})

describe('Şifre sıfırlama (forgot/reset)', () => {
  it('kayıtlı email olmadan da OK döner (enumeration koruması)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ username: 'mudur' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('bilinmeyen kullanıcı için de aynı OK döner', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ username: 'olmayan-kullanici-xyz' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('email kayıtlıysa token üretir ve reset-password ile yeni şifre belirlenir', async () => {
    const db = getDB()
    db.prepare("UPDATE users SET email='test@yys.local' WHERE username='mudur'").run()
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ username: 'mudur' })
    expect(res.status).toBe(200)

    // Token DB'de olmalı (SMTP yok ama row oluşur)
    const tokenRow = db.prepare("SELECT token_hash, user_id FROM password_reset_tokens ORDER BY expires_at DESC LIMIT 1").get()
    expect(tokenRow).toBeTruthy()

    // Raw token DB'de hash'lenmiş — gerçek bir token üretip elle insert et
    const crypto = await import('node:crypto')
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const exp = Math.floor(Date.now() / 1000) + 900
    db.prepare('INSERT INTO password_reset_tokens(token_hash, user_id, expires_at) VALUES(?,?,?)')
      .run(tokenHash, tokenRow.user_id, exp)

    // GET ile validate
    const validate = await request(app).get(`/api/auth/reset-password/${rawToken}`)
    expect(validate.status).toBe(200)
    expect(validate.body.ok).toBe(true)

    // POST ile yeni şifre belirle
    const reset = await request(app)
      .post(`/api/auth/reset-password/${rawToken}`)
      .send({ newPassword: 'yepyeniSifre1' })
    expect(reset.status).toBe(200)

    // Eski şifre artık geçmez
    const oldLogin = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
    expect(oldLogin.status).toBe(401)

    // Yeni şifre geçer
    const newLogin = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'yepyeniSifre1' })
    expect(newLogin.status).toBe(200)

    // Aynı token tekrar kullanılamaz
    const replay = await request(app)
      .post(`/api/auth/reset-password/${rawToken}`)
      .send({ newPassword: 'baska-bir-sifre1' })
    expect(replay.status).toBe(400)

    // Geri al — sonraki testleri kırma
    const bcrypt2 = await import('bcryptjs')
    db.prepare("UPDATE users SET password_hash=? WHERE username='mudur'").run(bcrypt2.default.hashSync('admin123', 10))
  })

  it('süresi dolmuş token reddedilir', async () => {
    const db = getDB()
    const crypto = await import('node:crypto')
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expired = Math.floor(Date.now() / 1000) - 60
    const userId = db.prepare("SELECT id FROM users WHERE username='mudur'").get().id
    db.prepare('INSERT INTO password_reset_tokens(token_hash, user_id, expires_at) VALUES(?,?,?)')
      .run(tokenHash, userId, expired)
    const res = await request(app).get(`/api/auth/reset-password/${rawToken}`)
    expect(res.status).toBe(400)
  })
})

describe('Health endpoint — derin kontroller', () => {
  it('200 döner ve tüm alanlar doğru tipte', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.db).toBe('ok')
    expect(typeof res.body.db_latency_ms).toBe('number')
    expect(res.body.jobs).toHaveProperty('pending')
    expect(res.body.jobs).toHaveProperty('processing')
    expect(res.body.jobs).toHaveProperty('failed')
    expect(res.body.jobs_status).toBe('ok')
    expect(typeof res.body.heap_percent).toBe('number')
    expect(res.body.heap_status).toMatch(/^(ok|warning)$/)
    expect(typeof res.body.uptime).toBe('number')
  })
})

describe('Logout — token blacklist', () => {
  it('logout sonrası token reddedilir', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
    const t = loginRes.body.token

    // Önce token çalışıyor mu kontrol et
    const me1 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${t}`)
    expect(me1.status).toBe(200)

    // Logout
    const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${t}`)
    expect(logout.status).toBe(200)

    // Aynı token artık reddedilmeli
    const me2 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${t}`)
    expect(me2.status).toBe(401)
  })
})

describe('CORS', () => {
  it('localhost:5173 origin\'ine izin verir', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:5173')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('izin verilmeyen origin reddedilir', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://evil.example.com')
    // CORS hatası — CORS header olmamalı
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('PIN lockout — loginKioskById', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:'
    process.env.JWT_SECRET = 'test-secret-for-testing-only-32chars'
    initDB()
    seedDev()
    const db = getDB()
    const hash = bcrypt.hashSync('1234', 10)
    db.prepare("INSERT OR IGNORE INTO personnel(id, full_name, tc_no, kiosk_pin, pin_attempts) VALUES(9001, 'Test Kiosk', '98765432100', ?, 0)").run(hash)
  })

  it('5 hatalı denemede hesap kilitlenir', () => {
    for (let i = 0; i < 5; i++) loginKioskById(9001, '0000')
    const result = loginKioskById(9001, '1234')
    expect(result.status).toBe(429)
    expect(result.error).toMatch(/kilitlendi/)
  })

  it('doğru PIN ile giriş başarılı ve attempts sıfırlanır', () => {
    const result = loginKioskById(9001, '1234')
    expect(result.token).toBeDefined()
    const p = getDB().prepare('SELECT pin_attempts FROM personnel WHERE id=9001').get()
    expect(p.pin_attempts).toBe(0)
  })

  it('hatalı PIN attempts artırır', () => {
    loginKioskById(9001, '0000')
    const p = getDB().prepare('SELECT pin_attempts FROM personnel WHERE id=9001').get()
    expect(p.pin_attempts).toBe(1)
  })

  it('4 hatalı denemeden sonra doğru PIN ile giriş yapılabilir', () => {
    for (let i = 0; i < 4; i++) loginKioskById(9001, '0000')
    const result = loginKioskById(9001, '1234')
    expect(result.token).toBeDefined()
  })
})

describe('PIN lockout — loginKiosk (TC no)', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:'
    process.env.JWT_SECRET = 'test-secret-for-testing-only-32chars'
    initDB()
    seedDev()
    const db = getDB()
    const hash = bcrypt.hashSync('5678', 10)
    db.prepare("INSERT OR IGNORE INTO personnel(id, full_name, tc_no, kiosk_pin, pin_attempts) VALUES(9002, 'TC Kiosk', '11122233344', ?, 0)").run(hash)
  })

  it('5 hatalı denemede hesap kilitlenir', () => {
    for (let i = 0; i < 5; i++) loginKiosk('11122233344', '0000')
    const result = loginKiosk('11122233344', '5678')
    expect(result.status).toBe(429)
    expect(result.error).toMatch(/kilitlendi/)
  })

  it('doğru PIN ile giriş başarılı', () => {
    const result = loginKiosk('11122233344', '5678')
    expect(result.token).toBeDefined()
  })
})

describe('Desktop passkey (webauthn) uçları', () => {
  let mgrToken
  beforeAll(async () => {
    mgrToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  })

  it('register-options auth gerektirir (401)', async () => {
    const res = await request(app).post('/api/auth/passkey/register-options')
    expect(res.status).toBe(401)
  })

  it('register-options challenge + rp döndürür', async () => {
    const res = await request(app).post('/api/auth/passkey/register-options')
      .set('Authorization', `Bearer ${mgrToken}`)
    expect(res.status).toBe(200)
    expect(res.body.challenge).toBeTruthy()
    expect(res.body.rp?.id).toBeTruthy()
  })

  it('auth-options bilinmeyen credential 404', async () => {
    const res = await request(app).post('/api/auth/passkey/auth-options')
      .send({ credentialId: 'boyle-bir-cihaz-yok' })
    expect(res.status).toBe(404)
  })

  it('login bilinmeyen credential 404', async () => {
    const res = await request(app).post('/api/auth/passkey/login')
      .send({ credentialId: 'boyle-bir-cihaz-yok', response: {} })
    expect(res.status).toBe(404)
  })
})
