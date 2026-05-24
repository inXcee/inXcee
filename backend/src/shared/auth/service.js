import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { getDB } from '../db/index.js'
import { validatePassword } from './password-policy.js'
import { verifyTotp, makeTotpChallengeToken, consumeTotpChallengeToken, verifyBackupCode } from './totp.js'
import { logger } from '../logger.js'

const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  logger.error('[Auth] JWT_SECRET env değişkeni tanımlı değil! Sunucu başlatılamaz.')
  process.exit(1)
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 12 saat

function makeToken(payload) {
  const jti = crypto.randomUUID()
  const token = jwt.sign({ ...payload, jti }, SECRET, { expiresIn: '12h' })
  return { token, jti }
}

// Token jti'sini blacklist'e ekle (logout, refresh sonrası eski token)
function blacklistJti(jti, expiresAt) {
  if (!jti) return
  const db = getDB()
  try {
    db.prepare('INSERT OR IGNORE INTO token_blacklist(jti, expires_at) VALUES(?,?)').run(jti, expiresAt)
  } catch { /* ignore duplicate */ }
}

function isBlacklisted(jti) {
  if (!jti) return false
  const db = getDB()
  const row = db.prepare('SELECT 1 FROM token_blacklist WHERE jti=? AND expires_at > ?').get(jti, Math.floor(Date.now() / 1000))
  return !!row
}

export function login(username, password) {
  const db = getDB()
  const user = db.prepare(
    'SELECT id, username, role, full_name, password_hash, totp_enabled FROM users WHERE username=?'
  ).get(username)
  if (!user) return null
  if (!bcrypt.compareSync(password, user.password_hash)) return null
  if (user.totp_enabled) {
    return { require_2fa: true, challenge_token: makeTotpChallengeToken(user.id) }
  }
  const { token, jti } = makeToken({ id: user.id, role: user.role, username: user.username, full_name: user.full_name })
  return { token, jti, user: { id: user.id, role: user.role, username: user.username, full_name: user.full_name } }
}

export function verify2faChallenge(challengeToken, code) {
  const userId = consumeTotpChallengeToken(challengeToken)
  if (!userId) return { error: 'Geçersiz veya süresi dolmuş istek', status: 401 }
  const db = getDB()
  const user = db.prepare(
    'SELECT id, username, role, full_name, totp_enabled, totp_secret FROM users WHERE id=?'
  ).get(userId)
  if (!user || !user.totp_enabled || !user.totp_secret) return { error: '2FA aktif değil', status: 400 }

  // TOTP kodu 6 haneliyse normal doğrulama, 8+ haneliyse yedek kod dene
  const isBackupAttempt = code.replace(/[-\s]/g, '').length >= 8
  if (isBackupAttempt) {
    const backupResult = verifyBackupCode(userId, code)
    if (!backupResult) return { error: 'Yedek kod geçersiz veya daha önce kullanılmış', status: 401 }
  } else {
    if (!verifyTotp(code, user.totp_secret)) return { error: 'Doğrulama kodu hatalı', status: 401 }
  }

  const { token, jti } = makeToken({ id: user.id, role: user.role, username: user.username, full_name: user.full_name })
  return { token, jti, user: { id: user.id, role: user.role, username: user.username, full_name: user.full_name } }
}

export function loginKiosk(tcNo, pin) {
  const db = getDB()
  const p = db.prepare('SELECT * FROM personnel WHERE tc_no=? AND check_out_date IS NULL').get(tcNo)
  if (!p) return { error: 'TC No bulunamadı veya çıkış yapılmış', status: 401 }
  if (!p.kiosk_pin) return { error: 'PIN tanımlı değil. Yöneticinizden PIN alın.', status: 403 }
  if (p.pin_locked_until && new Date(p.pin_locked_until) > new Date()) {
    return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
  }
  if (!bcrypt.compareSync(pin, p.kiosk_pin)) {
    const attempts = (p.pin_attempts || 0) + 1
    if (attempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      db.prepare('UPDATE personnel SET pin_attempts=?, pin_locked_until=? WHERE id=?').run(attempts, lockedUntil, p.id)
      return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
    }
    db.prepare('UPDATE personnel SET pin_attempts=? WHERE id=?').run(attempts, p.id)
    return { error: 'PIN hatalı', status: 401 }
  }
  db.prepare('UPDATE personnel SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(p.id)
  const token = jwt.sign(
    { personnelId: p.id, role: 'kiosk', full_name: p.full_name },
    SECRET,
    { expiresIn: '1h' }
  )
  return { token, personnel: { id: p.id, full_name: p.full_name } }
}

export function searchKioskPersonnel(q) {
  const db = getDB()
  const term = `%${q}%`
  return db.prepare(
    `SELECT id, full_name, company, kiosk_pin IS NOT NULL as has_pin
     FROM personnel WHERE check_out_date IS NULL AND full_name LIKE ?
     ORDER BY full_name LIMIT 10`
  ).all(term)
}

export function loginKioskById(personnelId, pin) {
  const db = getDB()
  const p = db.prepare('SELECT * FROM personnel WHERE id=? AND check_out_date IS NULL').get(personnelId)
  if (!p) return { error: 'Personel bulunamadı veya çıkış yapılmış', status: 401 }
  if (!p.kiosk_pin) return { error: 'PIN tanımlı değil. Yöneticinizden PIN alın.', status: 403 }
  if (p.pin_locked_until && new Date(p.pin_locked_until) > new Date()) {
    return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
  }
  if (!bcrypt.compareSync(pin, p.kiosk_pin)) {
    const attempts = (p.pin_attempts || 0) + 1
    if (attempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      db.prepare('UPDATE personnel SET pin_attempts=?, pin_locked_until=? WHERE id=?').run(attempts, lockedUntil, p.id)
      return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
    }
    db.prepare('UPDATE personnel SET pin_attempts=? WHERE id=?').run(attempts, p.id)
    return { error: 'PIN hatalı', status: 401 }
  }
  db.prepare('UPDATE personnel SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(p.id)
  const token = jwt.sign(
    { personnelId: p.id, role: 'kiosk', full_name: p.full_name },
    SECRET,
    { expiresIn: '1h' }
  )
  return { token, personnel: { id: p.id, full_name: p.full_name } }
}

export function searchAvsWorkers(q) {
  const db = getDB()
  return db.prepare(
    `SELECT id, full_name, role_label, kiosk_pin IS NOT NULL as has_pin
     FROM staff
     WHERE is_active=1 AND kiosk_pin IS NOT NULL AND full_name LIKE ?
     ORDER BY full_name LIMIT 10`
  ).all(`%${q}%`)
}

export function loginAvsKiosk(workerId, pin) {
  const db = getDB()
  const w = db.prepare('SELECT * FROM staff WHERE id=? AND is_active=1').get(workerId)
  if (!w) return { error: 'Çalışan bulunamadı veya pasif', status: 401 }
  if (!w.kiosk_pin) return { error: 'PIN tanımlı değil. Yöneticinizden PIN alın.', status: 403 }
  if (w.pin_locked_until && new Date(w.pin_locked_until) > new Date()) {
    return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
  }
  if (!bcrypt.compareSync(pin, w.kiosk_pin)) {
    const attempts = (w.pin_attempts || 0) + 1
    if (attempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      db.prepare('UPDATE staff SET pin_attempts=?, pin_locked_until=? WHERE id=?').run(attempts, lockedUntil, w.id)
      return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
    }
    db.prepare('UPDATE staff SET pin_attempts=? WHERE id=?').run(attempts, w.id)
    return { error: 'PIN hatalı', status: 401 }
  }
  db.prepare('UPDATE staff SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(w.id)
  const token = jwt.sign(
    { workerId: w.id, role: 'avs_kiosk', full_name: w.full_name },
    SECRET,
    { expiresIn: '4h' }
  )
  return { token, worker: { id: w.id, full_name: w.full_name, role_label: w.role_label } }
}

export function setKioskPin(personnelId, newPin) {
  if (!newPin || !/^\d{4}$/.test(newPin)) return { error: 'PIN 4 haneli rakam olmalıdır', status: 400 }
  const db = getDB()
  const p = db.prepare('SELECT id FROM personnel WHERE id=?').get(personnelId)
  if (!p) return { error: 'Personel bulunamadı', status: 404 }
  const hash = bcrypt.hashSync(newPin, 10)
  db.prepare('UPDATE personnel SET kiosk_pin=? WHERE id=?').run(hash, personnelId)
  return { ok: true }
}

export function changeKioskPin(personnelId, currentPin, newPin) {
  if (!newPin || !/^\d{4}$/.test(newPin)) return { error: 'Yeni PIN 4 haneli rakam olmalıdır', status: 400 }
  const db = getDB()
  const p = db.prepare('SELECT * FROM personnel WHERE id=?').get(personnelId)
  if (!p) return { error: 'Personel bulunamadı', status: 404 }
  if (!p.kiosk_pin) return { error: 'Mevcut PIN yok. Yöneticinizden PIN alın.', status: 403 }
  if (!bcrypt.compareSync(currentPin, p.kiosk_pin)) return { error: 'Mevcut PIN hatalı', status: 401 }
  const hash = bcrypt.hashSync(newPin, 10)
  db.prepare('UPDATE personnel SET kiosk_pin=? WHERE id=?').run(hash, personnelId)
  return { ok: true }
}

// AVS kiosk — staff kendi PIN'ini değiştirir (changeKioskPin'in staff tablosu versiyonu)
export function changeStaffKioskPin(staffId, currentPin, newPin) {
  if (!currentPin) return { error: 'Mevcut PIN gerekli', status: 400 }
  if (!newPin || !/^\d{4}$/.test(newPin)) return { error: 'Yeni PIN 4 haneli rakam olmalıdır', status: 400 }
  const db = getDB()
  const s = db.prepare('SELECT id, kiosk_pin FROM staff WHERE id=?').get(staffId)
  if (!s) return { error: 'Çalışan bulunamadı', status: 404 }
  if (!s.kiosk_pin) return { error: 'Mevcut PIN yok. Yöneticinizden PIN alın.', status: 403 }
  if (!bcrypt.compareSync(currentPin, s.kiosk_pin)) return { error: 'Mevcut PIN hatalı', status: 401 }
  const hash = bcrypt.hashSync(newPin, 10)
  db.prepare('UPDATE staff SET kiosk_pin=? WHERE id=?').run(hash, staffId)
  return { ok: true }
}

export function verifyToken(token) {
  const payload = jwt.verify(token, SECRET)
  if (isBlacklisted(payload.jti)) throw new Error('Token iptal edildi')
  return payload
}

// /api/auth/me — geçerli cookie/token varsa user bilgisi döndür
export function getMe(token) {
  try {
    const payload = verifyToken(token)
    if (!payload.id) return { error: 'Kiosk token', status: 403 }
    const db = getDB()
    const user = db.prepare('SELECT id, role, username, full_name FROM users WHERE id=?').get(payload.id)
    if (!user) return { error: 'Kullanıcı bulunamadı', status: 401 }
    return { user: { id: user.id, role: user.role, username: user.username, full_name: user.full_name } }
  } catch {
    return { error: 'Geçersiz oturum', status: 401 }
  }
}

// Logout — token'ı blacklist'e ekle, cookie'yi temizle (route tarafında)
export function logoutToken(token) {
  try {
    const payload = jwt.decode(token)
    if (payload?.jti && payload?.exp) {
      blacklistJti(payload.jti, payload.exp)
    }
  } catch { /* token parse edilemezse sessizce geç */ }
}

// Expire olmuş blacklist kayıtlarını temizle (cron'dan çağrılır)
export function pruneTokenBlacklist() {
  const db = getDB()
  const now = Math.floor(Date.now() / 1000)
  const result = db.prepare('DELETE FROM token_blacklist WHERE expires_at <= ?').run(now)
  return result.changes
}

// Expired token'i en fazla 24 saat icinde yenilemeye izin ver. Daha eski token'lar
// (calinmis veya unutulmus oturumlar) reddedilir — kullanici tekrar login olmali.
const REFRESH_GRACE_MS = 24 * 60 * 60 * 1000

export function refreshToken(oldToken) {
  let payload
  try {
    payload = jwt.verify(oldToken, SECRET)
    // Geçerli token yenilenebilir — eski jti'yi blacklist'e ekle
    if (payload.jti && payload.exp) blacklistJti(payload.jti, payload.exp)
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      payload = jwt.decode(oldToken)
      if (payload?.exp && Date.now() - payload.exp * 1000 > REFRESH_GRACE_MS) {
        return { error: 'Token suresi cok uzun zaman once doldu, lutfen tekrar giris yapin', status: 401 }
      }
    } else {
      return { error: 'Geçersiz token', status: 401 }
    }
  }
  if (!payload) return { error: 'Token payload boş', status: 401 }
  if (payload.role === 'kiosk') return { error: 'Kiosk token yenilenemiyor', status: 403 }
  const db = getDB()
  const user = db.prepare('SELECT id, role, username, full_name FROM users WHERE id=?').get(payload.id)
  if (!user) return { error: 'Kullanıcı bulunamadı', status: 401 }
  const { token: newToken, jti } = makeToken({ id: user.id, role: user.role, username: user.username, full_name: user.full_name })
  return { token: newToken, jti, user: { id: user.id, role: user.role, username: user.username, full_name: user.full_name } }
}

export function changeOwnPassword(userId, currentPassword, newPassword) {
  const db = getDB()
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId)
  if (!user) return { error: 'Kullanıcı bulunamadı', status: 404 }
  const pwCheck = validatePassword(newPassword, { username: user.username })
  if (!pwCheck.ok) {
    return { error: pwCheck.errors.join(' · '), status: 400 }
  }
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return { error: 'Mevcut şifre hatalı', status: 401 }
  }
  const hash = bcrypt.hashSync(newPassword, 10)
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, userId)
  return { ok: true }
}
