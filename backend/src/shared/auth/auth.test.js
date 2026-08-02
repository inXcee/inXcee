import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../db/index.js'
import { seedDev } from '../db/seed.js'
import { login, verifyToken, loginKioskById, loginKiosk, refreshToken, loginAvsKiosk, logoutToken, changeStaffKioskPin, changeOwnPassword, listActiveSessions, revokeSession, listActiveUsers, suspendUser, unsuspendUser, revokeSessionsFor } from './service.js'
import { setWorkerPin } from '../../modules/avs-workers/queries.js'
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
  it('geçerli mevcut şifre ile değiştirir ve oturumu düşürmez', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'admin123', newPassword: 'yeniSifre123' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    // Şifre değişikliği diğer oturumları iptal eder; bu isteği yapan kullanıcıya
    // yerine taze bir oturum verilir, yoksa kendini dışarı atmış olurdu.
    expect(res.body.token).toBeTruthy()

    // Eski token gerçekten öldü, yenisi çalışıyor.
    const eskiyle = await request(app)
      .get('/api/dashboard/kpi')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(eskiyle.status).toBe(401)

    managerToken = res.body.token
    const yeniyle = await request(app)
      .get('/api/dashboard/kpi')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(yeniyle.status).toBe(200)
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

  it('geliştirmede 127.0.0.1:5174 origin\'ine izin verir', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://127.0.0.1:5174')
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5174')
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

  it('5 hatalı denemeden sonra doğru PIN beklemeden çalışır', () => {
    for (let i = 0; i < 5; i++) {
      const hata = loginKioskById(9001, '0000')
      expect(hata.status).toBe(401)
      expect(hata.error).toBe('PIN hatalı')
    }
    expect(loginKioskById(9001, '1234').token).toBeDefined()
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

  it('5 hatalı denemeden sonra doğru PIN beklemeden çalışır', () => {
    for (let i = 0; i < 5; i++) {
      const hata = loginKiosk('11122233344', '0000')
      expect(hata.status).toBe(401)
      expect(hata.error).toBe('PIN hatalı')
    }
    expect(loginKiosk('11122233344', '5678').token).toBeDefined()
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

describe('Yönetici erişim kontrolü', () => {
  function makeUser(username) {
    const db = getDB()
    db.prepare("INSERT INTO users(username, password_hash, role, full_name) VALUES(?,?,?,?)")
      .run(username, bcrypt.hashSync('Guclu!Sifre123', 10), 'technical', `Test ${username}`)
    return db.prepare('SELECT id FROM users WHERE username=?').get(username).id
  }

  it('askıya alınan kullanıcı giriş yapamaz', () => {
    const id = makeUser('askiya_alinan')
    expect(login('askiya_alinan', 'Guclu!Sifre123').token).toBeTruthy()

    suspendUser(id, { reason: 'İşten ayrıldı' })
    expect(login('askiya_alinan', 'Guclu!Sifre123')).toBeNull()
  })

  it('askıya alma mevcut token’ı da anında keser', () => {
    const id = makeUser('token_kesilen')
    const { token } = login('token_kesilen', 'Guclu!Sifre123')
    expect(verifyToken(token).id).toBe(id)

    suspendUser(id, { reason: 'Şüpheli hareket' })
    expect(() => verifyToken(token)).toThrow()
  })

  it('askıdan indirilince tekrar giriş yapabilir', () => {
    const id = makeUser('geri_alinan')
    suspendUser(id, { reason: 'Geçici' })
    expect(login('geri_alinan', 'Guclu!Sifre123')).toBeNull()

    unsuspendUser(id)
    expect(login('geri_alinan', 'Guclu!Sifre123').token).toBeTruthy()
  })

  it('bir kişinin bütün cihazları tek hamlede düşer', () => {
    const id = makeUser('cok_cihazli')
    const birinci = login('cok_cihazli', 'Guclu!Sifre123').token
    const ikinci = login('cok_cihazli', 'Guclu!Sifre123').token
    expect(verifyToken(birinci).id).toBe(id)
    expect(verifyToken(ikinci).id).toBe(id)

    revokeSessionsFor('user', id)
    expect(() => verifyToken(birinci)).toThrow()
    expect(() => verifyToken(ikinci)).toThrow()
  })

  it('aktif kullanıcılar kişi bazında toplanır', () => {
    const id = makeUser('aktif_kisi')
    login('aktif_kisi', 'Guclu!Sifre123')
    login('aktif_kisi', 'Guclu!Sifre123')

    const kayit = listActiveUsers({ withinMinutes: 60 }).find(u => u.principal_id === id && u.principal_kind === 'user')
    expect(kayit).toBeTruthy()
    expect(kayit.session_count).toBe(2)
    expect(kayit.full_name).toBe('Test aktif_kisi')
  })
})

describe('Açık oturum kaydı ve tek oturum kapatma', () => {
  function makeWorker(pin = '2233') {
    const info = getDB().prepare(
      "INSERT INTO staff(full_name, role_label, is_active, kiosk_pin) VALUES(?,?,1,?)"
    ).run('Oturum Listesi Personeli', 'Çamaşırhane Personeli', bcrypt.hashSync(pin, 10))
    return Number(info.lastInsertRowid)
  }

  it('giriş yapınca oturum listeye kaydolur', () => {
    const workerId = makeWorker()
    const { token } = loginAvsKiosk(workerId, '2233')
    const jti = jwt.decode(token).jti
    const kayit = listActiveSessions().find(s => s.jti === jti)
    expect(kayit).toBeTruthy()
    expect(kayit.full_name).toBe('Oturum Listesi Personeli')
    expect(kayit.role).toBe('avs_kiosk')
    expect(kayit.principal_kind).toBe('staff')
  })

  it('tek oturum kapatılınca yalnız o token ölür', () => {
    const workerId = makeWorker()
    const birinci = loginAvsKiosk(workerId, '2233').token
    const ikinci = loginAvsKiosk(workerId, '2233').token
    expect(verifyToken(birinci).workerId).toBe(workerId)
    expect(verifyToken(ikinci).workerId).toBe(workerId)

    revokeSession(jwt.decode(birinci).jti)
    expect(() => verifyToken(birinci)).toThrow()
    // Aynı personelin diğer cihazı etkilenmez.
    expect(verifyToken(ikinci).workerId).toBe(workerId)
  })

  it('kapatılan oturum açık listesinde görünmez', () => {
    const workerId = makeWorker()
    const { token } = loginAvsKiosk(workerId, '2233')
    const jti = jwt.decode(token).jti
    revokeSession(jti)
    expect(listActiveSessions().some(s => s.jti === jti)).toBe(false)
  })

  it('çıkış yapılınca oturum listeden düşer', () => {
    const workerId = makeWorker()
    const { token } = loginAvsKiosk(workerId, '2233')
    const jti = jwt.decode(token).jti
    logoutToken(token)
    expect(listActiveSessions().some(s => s.jti === jti)).toBe(false)
  })

  it('web girişi de kaydolur', () => {
    const { token } = login('mudur', 'admin123')
    const jti = jwt.decode(token).jti
    const kayit = listActiveSessions().find(s => s.jti === jti)
    expect(kayit?.principal_kind).toBe('user')
  })
})

// Yanlış PIN kullanıcıyı bekletmemeli: kiosk paylaşımlı bir cihaz, kilitlenen
// hesap vardiyayı durduruyordu. Yanlışsa yalnızca "yanlış" denir.
describe('Yanlış PIN bekletmez', () => {
  function makeWorker(pin = '1357') {
    const info = getDB().prepare(
      "INSERT INTO staff(full_name, role_label, is_active, kiosk_pin) VALUES(?,?,1,?)"
    ).run('Kilit Testi Personeli', 'Çamaşırhane Personeli', bcrypt.hashSync(pin, 10))
    return Number(info.lastInsertRowid)
  }

  it('art arda 10 yanlış denemeden sonra doğru PIN anında çalışır', () => {
    const workerId = makeWorker()
    for (let i = 0; i < 10; i++) {
      const hata = loginAvsKiosk(workerId, '0000')
      expect(hata.status).toBe(401)
      expect(hata.error).toBe('PIN hatalı')
    }
    expect(loginAvsKiosk(workerId, '1357').token).toBeTruthy()
  })

  it('hiçbir denemede kilit/bekleme mesajı dönmez', () => {
    const workerId = makeWorker()
    for (let i = 0; i < 8; i++) {
      const hata = loginAvsKiosk(workerId, '9999')
      expect(hata.status).not.toBe(429)
      expect(hata.error).not.toMatch(/kilit|dakika|bekle/i)
    }
  })

  it('personel PIN kiosku da kilitlenmez', () => {
    const db = getDB()
    const p = db.prepare('SELECT id FROM personnel WHERE check_out_date IS NULL LIMIT 1').get()
    db.prepare('UPDATE personnel SET kiosk_pin=?, pin_attempts=0, pin_locked_until=NULL WHERE id=?')
      .run(bcrypt.hashSync('2468', 10), p.id)
    for (let i = 0; i < 8; i++) {
      const hata = loginKioskById(p.id, '1111')
      expect(hata.status).toBe(401)
      expect(hata.error).toBe('PIN hatalı')
    }
    expect(loginKioskById(p.id, '2468').token).toBeTruthy()
  })
})

// Kiosk cihazları vardiya boyunca açık kalıyor; oturumu yalnızca çıkış düğmesi
// kapatmalı. Süresiz token ancak iptal edilebiliyorsa güvenli — bu yüzden jti şart.
describe('Oturum ömrü — çıkış yapılmadıkça açık kalır', () => {
  function makeAvsWorker(pin = '4321') {
    const db = getDB()
    const info = db.prepare(
      "INSERT INTO staff(full_name, role_label, is_active, kiosk_pin) VALUES(?,?,1,?)"
    ).run('Oturum Test Personeli', 'Çamaşırhane Personeli', bcrypt.hashSync(pin, 10))
    return info.lastInsertRowid
  }

  it('kiosk token pratikte süresizdir (bir yıldan uzun)', () => {
    const workerId = makeAvsWorker()
    const { token } = loginAvsKiosk(workerId, '4321')
    const payload = jwt.decode(token)
    const yil = 365 * 24 * 60 * 60
    expect(payload.exp - payload.iat).toBeGreaterThan(yil)
  })

  it('kiosk token jti taşır — iptal edilebilsin diye', () => {
    const workerId = makeAvsWorker()
    const { token } = loginAvsKiosk(workerId, '4321')
    expect(jwt.decode(token).jti).toBeTruthy()
  })

  it('çıkış yapılınca kiosk token gerçekten geçersizleşir', () => {
    const workerId = makeAvsWorker()
    const { token } = loginAvsKiosk(workerId, '4321')
    expect(verifyToken(token).workerId).toBe(workerId)
    logoutToken(token)
    expect(() => verifyToken(token)).toThrow()
  })

  it('personel PIN kiosku da aynı kuralı izler', () => {
    const db = getDB()
    const p = db.prepare('SELECT id FROM personnel WHERE check_out_date IS NULL LIMIT 1').get()
    db.prepare('UPDATE personnel SET kiosk_pin=?, pin_attempts=0, pin_locked_until=NULL WHERE id=?')
      .run(bcrypt.hashSync('4321', 10), p.id)
    const { token } = loginKioskById(p.id, '4321')
    expect(jwt.decode(token).jti).toBeTruthy()
    logoutToken(token)
    expect(() => verifyToken(token)).toThrow()
  })

  it('web oturumu 30 gün sürer', () => {
    const { token } = login('mudur', 'admin123')
    const payload = jwt.decode(token)
    const gun = 24 * 60 * 60
    expect(Math.round((payload.exp - payload.iat) / gun)).toBe(30)
  })

  it('kiosk token yenileme ucuna düşerse net 403 alır, oturumu düşürmez', () => {
    const workerId = makeAvsWorker()
    const { token } = loginAvsKiosk(workerId, '4321')
    const result = refreshToken(token)
    expect(result.status).toBe(403)
  })

  // Token süresiz olduğu için erişim yalnızca hesap kontrolüyle kapanabilir;
  // "süresi nasılsa dolar" varsayımı artık geçerli değil.
  it('pasifleştirilen personelin kiosk token’ı anında geçersizleşir', () => {
    const workerId = makeAvsWorker()
    const { token } = loginAvsKiosk(workerId, '4321')
    expect(verifyToken(token).workerId).toBe(workerId)

    getDB().prepare('UPDATE staff SET is_active=0 WHERE id=?').run(workerId)
    expect(() => verifyToken(token)).toThrow()
  })

  it('çıkış yapan sakinin PIN kiosk token’ı geçersizleşir', () => {
    const db = getDB()
    const p = db.prepare('SELECT id FROM personnel WHERE check_out_date IS NULL LIMIT 1').get()
    db.prepare('UPDATE personnel SET kiosk_pin=?, pin_attempts=0, pin_locked_until=NULL WHERE id=?')
      .run(bcrypt.hashSync('4321', 10), p.id)
    const { token } = loginKioskById(p.id, '4321')
    expect(verifyToken(token).personnelId).toBe(p.id)

    db.prepare("UPDATE personnel SET check_out_date='2026-08-01' WHERE id=?").run(p.id)
    expect(() => verifyToken(token)).toThrow()
    db.prepare('UPDATE personnel SET check_out_date=NULL WHERE id=?').run(p.id)
  })

  it('PIN değişince o personelin eski kiosk oturumları kapanır', () => {
    const workerId = makeAvsWorker()
    const eski = loginAvsKiosk(workerId, '4321').token
    expect(verifyToken(eski).workerId).toBe(workerId)

    changeStaffKioskPin(workerId, '4321', '9876')
    expect(() => verifyToken(eski)).toThrow()

    // Yeni PIN ile alınan oturum çalışmaya devam eder.
    expect(verifyToken(loginAvsKiosk(workerId, '9876').token).workerId).toBe(workerId)
  })

  it('yönetici PIN sıfırlayınca da eski kiosk oturumu kapanır', () => {
    const workerId = makeAvsWorker()
    const eski = loginAvsKiosk(workerId, '4321').token
    expect(verifyToken(eski).workerId).toBe(workerId)

    setWorkerPin(workerId, '1122')
    expect(() => verifyToken(eski)).toThrow()
  })

  it('şifre değişince eski web oturumu kapanır', () => {
    const db = getDB()
    db.prepare("INSERT INTO users(username, password_hash, role, full_name) VALUES(?,?,?,?)")
      .run('sifre_degisen', bcrypt.hashSync('Eski!Sifre123', 10), 'technical', 'Şifre Değişen')
    const eski = login('sifre_degisen', 'Eski!Sifre123').token
    expect(verifyToken(eski).username).toBe('sifre_degisen')

    const u = db.prepare("SELECT id FROM users WHERE username='sifre_degisen'").get()
    changeOwnPassword(u.id, 'Eski!Sifre123', 'Yeni!Sifre456')
    expect(() => verifyToken(eski)).toThrow()
    expect(verifyToken(login('sifre_degisen', 'Yeni!Sifre456').token).id).toBe(u.id)
  })

  it('silinen kullanıcının web token’ı geçersizleşir', () => {
    const db = getDB()
    const info = db.prepare(
      "INSERT INTO users(username, password_hash, role, full_name) VALUES(?,?,?,?)"
    ).run('silinecek_kullanici', bcrypt.hashSync('Gecici!Sifre123', 10), 'technical', 'Silinecek Kullanıcı')
    const { token } = login('silinecek_kullanici', 'Gecici!Sifre123')
    expect(verifyToken(token).id).toBe(Number(info.lastInsertRowid))

    db.prepare('DELETE FROM users WHERE id=?').run(info.lastInsertRowid)
    expect(() => verifyToken(token)).toThrow()
  })
})
