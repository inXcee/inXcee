import { Router } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { z } from 'zod'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { login, loginKiosk, loginKioskById, searchKioskPersonnel, loginAvsKiosk, searchAvsWorkers, changeOwnPassword, refreshToken, verify2faChallenge, logoutToken, getMe } from './service.js'
import { get2faStatus, start2faSetupWithQr, enable2fa, disable2fa, getBackupCodeStatus, regenerateBackupCodes } from './totp.js'
import { getSetting } from '../../modules/email/queries.js'
import { sendPasswordResetEmail } from '../../modules/email/service.js'
import { requireAuth } from './middleware.js'
import { validate } from '../middleware/validate.js'
import { logger } from '../logger.js'
import { getDB } from '../db/index.js'
import { validatePassword } from './password-policy.js'

export const authRouter = Router()

// Güvenli httpOnly cookie — staff login oturumları için.
// sameSite: prod'da strict (CSRF), dev'de lax (cross-port localhost).
const COOKIE_NAME = 'yys_session'
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 12 * 60 * 60 * 1000, // 12 saat — token expiry ile eşleşir
  path: '/',
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS)
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, secure: COOKIE_OPTS.secure, sameSite: COOKIE_OPTS.sameSite })
}

// Kiosk / AVS PIN endpoint'lerine özel sıkı rate limit — 4 haneli PIN brute-force riski
// authLimiter 30/15dk şu an, kiosk-PIN için yetersiz (5dkdaki 30 attempt 4-hane uzayını
// günlerle gezer). Buraya 10/15dk per IP daha gerçekçi.
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Çok fazla PIN denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
})

const loginSchema = z.object({
  username: z.string().min(1, 'Kullanıcı adı gerekli').max(64),
  password: z.string().min(1, 'Şifre gerekli').max(256),
})

authRouter.post('/login', validate(loginSchema), (req, res) => {
  const { username, password } = req.validated
  const result = login(username, password)
  if (!result) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' })
  if (result.require_2fa) return res.json(result)
  // Staff login: httpOnly cookie set et, body'de user döndür.
  // Test ortamında token da body'de döndür — supertest cookie'yi takip etmez.
  setSessionCookie(res, result.token)
  const body = process.env.NODE_ENV === 'test'
    ? { token: result.token, user: result.user }
    : { user: result.user }
  res.json(body)
})

authRouter.post('/kiosk-login', pinLimiter, (req, res) => {
  const { tc_no, pin, personnel_id } = req.body
  if (personnel_id) {
    if (!pin) return res.status(400).json({ error: 'PIN gerekli' })
    const result = loginKioskById(Number(personnel_id), pin)
    if (result.error) return res.status(result.status).json({ error: result.error })
    return res.json(result)
  }
  if (!tc_no || !pin) return res.status(400).json({ error: 'TC No ve PIN gerekli' })
  const result = loginKiosk(tc_no, pin)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

// Kiosk arama — kiosk cihaza fiziksel erişim varsayımı ama anonim listeleme
// pratik bir saldırı vektörü. pinLimiter ile birlikte 2+ karakter zorunlu.
authRouter.get('/kiosk-search', pinLimiter, (req, res) => {
  const q = (req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  res.json(searchKioskPersonnel(q))
})

authRouter.get('/kiosk-config', (req, res) => {
  res.json({ login_method: getSetting('kiosk_login_method') ?? 'both' })
})

authRouter.get('/avs-search', pinLimiter, (req, res) => {
  const q = (req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  res.json(searchAvsWorkers(q))
})

authRouter.post('/avs-login', pinLimiter, (req, res) => {
  const { worker_id, pin } = req.body
  if (!worker_id || !pin) return res.status(400).json({ error: 'worker_id ve pin gerekli' })
  const result = loginAvsKiosk(Number(worker_id), pin)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

authRouter.post('/refresh', (req, res) => {
  // Cookie'den veya header'dan token al
  const cookieToken = req.cookies?.[COOKIE_NAME]
  const headerToken = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
  const oldToken = cookieToken || headerToken
  if (!oldToken) return res.status(401).json({ error: 'Oturum bulunamadı' })
  const result = refreshToken(oldToken)
  if (result.error) return res.status(result.status).json({ error: result.error })
  setSessionCookie(res, result.token)
  const refreshBody = process.env.NODE_ENV === 'test'
    ? { token: result.token, user: result.user }
    : { user: result.user }
  res.json(refreshBody)
})

// Mevcut oturumu sorgula — sayfa yenilemede user bilgisini restore etmek için
authRouter.get('/me', (req, res) => {
  const cookieToken = req.cookies?.[COOKIE_NAME]
  const headerToken = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
  const token = cookieToken || headerToken
  if (!token) return res.status(401).json({ error: 'Oturum yok' })
  const result = getMe(token)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

// Logout — cookie temizle, token'ı blacklist'e ekle
authRouter.post('/logout', (req, res) => {
  const cookieToken = req.cookies?.[COOKIE_NAME]
  const headerToken = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
  const token = cookieToken || headerToken
  if (token) logoutToken(token)
  clearSessionCookie(res)
  res.json({ ok: true })
})

// ── 2FA ──
// TOTP doğrulama — 6 haneli kod (1M uzayı), 5dk challenge_token penceresi içinde
// authLimiter zaten 30/15dk veriyor; pinLimiter ile birlikte 10/15dk düşer.
authRouter.post('/2fa/verify-login', pinLimiter, (req, res) => {
  const { challenge_token, code } = req.body
  if (!challenge_token || !code) return res.status(400).json({ error: 'challenge_token ve code gerekli' })
  const result = verify2faChallenge(challenge_token, code)
  if (result.error) return res.status(result.status).json({ error: result.error })
  // 2FA başarılı: cookie set et, body'de user döndür
  setSessionCookie(res, result.token)
  const body = process.env.NODE_ENV === 'test'
    ? { token: result.token, user: result.user }
    : { user: result.user }
  res.json(body)
})

authRouter.get('/2fa/status', requireAuth, (req, res) => {
  res.json(get2faStatus(req.user.id))
})

authRouter.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const result = await start2faSetupWithQr(req.user.id)
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json({ secret: result.secret, qr: result.qr, uri: result.uri })
  } catch (e) {
    logger.error('[2FA setup]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

authRouter.post('/2fa/enable', requireAuth, (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'Kod gerekli' })
  const result = enable2fa(req.user.id, code)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

authRouter.post('/2fa/disable', requireAuth, (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'Kod gerekli' })
  const result = disable2fa(req.user.id, code)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

// Yedek kod sayısı — kaldı/toplam (kod içerik dönmez)
authRouter.get('/2fa/backup-codes', requireAuth, (req, res) => {
  res.json(getBackupCodeStatus(req.user.id))
})

// Yedek kodları yenile — TOTP kodu zorunlu, eski kodlar geçersiz olur
authRouter.post('/2fa/backup-codes/regenerate', requireAuth, (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'Kod gerekli' })
  const result = regenerateBackupCodes(req.user.id, code)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

authRouter.patch('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mevcut ve yeni şifre gerekli' })
  }
  const result = changeOwnPassword(req.user.id, currentPassword, newPassword)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Çok fazla istek. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
})

// Şifre sıfırlama isteği — email gönderir (email ayarlıysa)
authRouter.post('/forgot-password', resetLimiter, (req, res) => {
  const { username } = req.body
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Kullanıcı adı gerekli' })
  }
  const db = getDB()
  const user = db.prepare('SELECT id, username, email FROM users WHERE username=?').get(username.trim())
  // Her durumda aynı response (timing attack / enumeration önlemi)
  if (!user?.email) {
    return res.json({ ok: true, message: 'Kayıtlı e-posta adresinize sıfırlama bağlantısı gönderildi.' })
  }
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60 // 15 dk
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').run(user.id)
  db.prepare('INSERT INTO password_reset_tokens(token_hash, user_id, expires_at) VALUES(?,?,?)').run(tokenHash, user.id, expiresAt)
  logger.info({ userId: user.id }, '[Auth] Şifre sıfırlama token üretildi')

  // Email gönderimi — SMTP yapılandırılmamışsa sessiz başarısızlık (enumeration koruması).
  // APP_BASE_URL set edilmemişse origin header'dan türet; ikisi de yoksa link path-only.
  const baseUrl = process.env.APP_BASE_URL || req.headers.origin || ''
  const resetUrl = `${baseUrl}/reset-password/${rawToken}`
  sendPasswordResetEmail(user.email, resetUrl, { username: user.username })
    .catch(e => logger.warn({ err: e.message, userId: user.id }, '[Auth] Şifre sıfırlama e-postası gönderilemedi'))

  res.json({ ok: true, message: 'Kayıtlı e-posta adresinize sıfırlama bağlantısı gönderildi.' })
})

// Sıfırlama token'ını doğrula
authRouter.get('/reset-password/:token', (req, res) => {
  const rawToken = req.params.token
  if (!rawToken) return res.status(400).json({ error: 'Token gerekli' })
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const db = getDB()
  const row = db.prepare('SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token_hash=?').get(tokenHash)
  if (!row || row.used || row.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş sıfırlama bağlantısı' })
  }
  res.json({ ok: true })
})

// Yeni şifre belirle
authRouter.post('/reset-password/:token', resetLimiter, (req, res) => {
  const rawToken = req.params.token
  const { newPassword } = req.body
  if (!rawToken || !newPassword) return res.status(400).json({ error: 'Token ve yeni şifre gerekli' })
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const db = getDB()
  const row = db.prepare('SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token_hash=?').get(tokenHash)
  if (!row || row.used || row.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş sıfırlama bağlantısı' })
  }
  const user = db.prepare('SELECT username FROM users WHERE id=?').get(row.user_id)
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' })
  const pwCheck = validatePassword(newPassword, { username: user.username })
  if (!pwCheck.ok) return res.status(400).json({ error: pwCheck.errors.join(' · ') })
  const hash = bcrypt.hashSync(newPassword, 10)
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, row.user_id)
    db.prepare('UPDATE password_reset_tokens SET used=1 WHERE token_hash=?').run(tokenHash)
  })()
  logger.info({ userId: row.user_id }, '[Auth] Şifre sıfırlama tamamlandı')
  res.json({ ok: true })
})
