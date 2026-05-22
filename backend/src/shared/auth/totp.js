import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDB } from '../db/index.js'

const SECRET = process.env.JWT_SECRET
const ISSUER = 'YYS'

authenticator.options = { window: 1 }

export function generateTotpSetup(username) {
  const secret = authenticator.generateSecret()
  const uri = authenticator.keyuri(username, ISSUER, secret)
  return { secret, uri }
}

export async function generateQrDataUrl(uri) {
  return QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', width: 200 })
}

export function verifyTotp(token, secret) {
  if (!token || !secret) return false
  return authenticator.verify({ token: String(token).replace(/\s/g, ''), secret })
}

export function get2faStatus(userId) {
  const db = getDB()
  const u = db.prepare('SELECT totp_enabled FROM users WHERE id=?').get(userId)
  return { enabled: !!u?.totp_enabled }
}

export function start2faSetup(userId) {
  const db = getDB()
  const u = db.prepare('SELECT username, totp_enabled FROM users WHERE id=?').get(userId)
  if (!u) return { error: 'Kullanıcı bulunamadı', status: 404 }
  if (u.totp_enabled) return { error: '2FA zaten aktif', status: 400 }
  const { secret, uri } = generateTotpSetup(u.username)
  db.prepare('UPDATE users SET totp_secret=?, totp_enabled=0 WHERE id=?').run(secret, userId)
  return { secret, uri }
}

export async function start2faSetupWithQr(userId) {
  const res = start2faSetup(userId)
  if (res.error) return res
  res.qr = await generateQrDataUrl(res.uri)
  return res
}

// Tek kullanımlık 10 adet yedek kodu oluştur, hash'lenmiş olarak kaydet, plain kodları döndür.
export function generateBackupCodes(userId) {
  const db = getDB()
  const codes = Array.from({ length: 10 }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase() // 10 hex char
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}` // XXXXX-XXXXX formatı
    return formatted
  })
  const deleteStmt = db.prepare('DELETE FROM totp_backup_codes WHERE user_id=?')
  const insertStmt = db.prepare('INSERT INTO totp_backup_codes(user_id, code_hash) VALUES(?,?)')
  db.transaction(() => {
    deleteStmt.run(userId)
    for (const code of codes) {
      insertStmt.run(userId, bcrypt.hashSync(code.replace('-', ''), 10))
    }
  })()
  return codes
}

// Yedek kodu doğrula ve kullanıldı olarak işaretle (tek kullanımlık)
export function verifyBackupCode(userId, rawCode) {
  const db = getDB()
  const normalized = rawCode.replace(/[-\s]/g, '').toUpperCase()
  const rows = db.prepare('SELECT id, code_hash FROM totp_backup_codes WHERE user_id=? AND used_at IS NULL').all(userId)
  for (const row of rows) {
    if (bcrypt.compareSync(normalized, row.code_hash)) {
      db.prepare('UPDATE totp_backup_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id)
      return true
    }
  }
  return false
}

export function enable2fa(userId, code) {
  const db = getDB()
  const u = db.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id=?').get(userId)
  if (!u?.totp_secret) return { error: 'Önce 2FA kurulumu başlatın', status: 400 }
  if (u.totp_enabled) return { error: '2FA zaten aktif', status: 400 }
  if (!verifyTotp(code, u.totp_secret)) return { error: 'Kod hatalı', status: 401 }
  db.prepare('UPDATE users SET totp_enabled=1 WHERE id=?').run(userId)
  const backupCodes = generateBackupCodes(userId)
  return { ok: true, backup_codes: backupCodes }
}

export function disable2fa(userId, code) {
  const db = getDB()
  const u = db.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id=?').get(userId)
  if (!u?.totp_enabled) return { error: '2FA aktif değil', status: 400 }
  if (!verifyTotp(code, u.totp_secret)) return { error: 'Kod hatalı', status: 401 }
  db.prepare('UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE id=?').run(userId)
  return { ok: true }
}

export function userHas2fa(userId) {
  const db = getDB()
  return !!db.prepare('SELECT totp_enabled FROM users WHERE id=?').get(userId)?.totp_enabled
}

export function verifyUserTotp(userId, code) {
  const db = getDB()
  const u = db.prepare('SELECT totp_secret FROM users WHERE id=? AND totp_enabled=1').get(userId)
  if (!u) return false
  return verifyTotp(code, u.totp_secret)
}

export function makeTotpChallengeToken(userId) {
  return jwt.sign({ pendingUserId: userId, kind: 'totp_challenge' }, SECRET, { expiresIn: '5m' })
}

export function consumeTotpChallengeToken(token) {
  try {
    const p = jwt.verify(token, SECRET)
    if (p.kind !== 'totp_challenge') return null
    return p.pendingUserId
  } catch { return null }
}
