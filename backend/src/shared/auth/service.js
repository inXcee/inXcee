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

// Oturum, kullanıcı çıkış yapana kadar açık kalır. Web tarafında 30 gün sonra
// yeniden giriş istenir; kiosk cihazları vardiya boyunca (ve gece boyunca) açık
// kaldığı için pratikte süresizdir.
//
// "Süresiz" yerine çok uzun ama SONLU bir süre kullanıyoruz: exp'siz token'da
// logoutToken blacklist satırını yazamaz (aşağıda exp gerekiyor) ve
// pruneTokenBlacklist neyi ne zaman sileceğini bilemez — yani çıkış düğmesi
// sessizce işlevsiz kalırdı.
export const WEB_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 gün
export const KIOSK_TOKEN_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000 // ~10 yıl

const asSeconds = (ms) => Math.floor(ms / 1000)

// `ims` = milisaniye hassasiyetli üretim damgası. Standart `iat` saniye
// çözünürlüğünde olduğu için, PIN'ini değiştirip hemen tekrar giren kullanıcı
// kendi yeni oturumunu kaybedebiliyordu (bkz. assertPrincipalActive).
function makeToken(payload) {
  return signSession(payload, WEB_TOKEN_TTL_MS)
}

// Kiosk token'ı da jti taşır — süresiz bir token ancak iptal edilebiliyorsa
// güvenlidir; çıkış düğmesi bu jti'yi blacklist'e yazarak oturumu gerçekten kapatır.
function makeKioskToken(payload) {
  return signSession(payload, KIOSK_TOKEN_TTL_MS)
}

// Token üretiminin tek noktası: jti + ims verir ve oturumu kaydeder. Kayıt
// burada olduğu için hiçbir giriş yolu listeden düşmez.
function signSession(payload, ttlMs) {
  const jti = crypto.randomUUID()
  const expiresAt = Math.floor((Date.now() + ttlMs) / 1000)
  const token = jwt.sign({ ...payload, jti, ims: Date.now() }, SECRET, { expiresIn: asSeconds(ttlMs) })
  recordSession(jti, payload, expiresAt)
  return { token, jti }
}

// Rolden hangi tabloya ait olduğunu türetiyoruz; payload alan adları da role göre
// değişiyor (workerId / personnelId / id).
function principalOf(payload) {
  if (payload.role === 'avs_kiosk') return { kind: 'staff', id: payload.workerId }
  if (payload.role === 'kiosk') return { kind: 'personnel', id: payload.personnelId }
  if (payload.id) return { kind: 'user', id: payload.id }
  return null
}

function recordSession(jti, payload, expiresAt) {
  const principal = principalOf(payload)
  if (!principal?.id) return
  try {
    getDB().prepare(`
      INSERT INTO auth_sessions(jti, principal_kind, principal_id, full_name, role, expires_at)
      VALUES(?,?,?,?,?,?)
    `).run(jti, principal.kind, principal.id, payload.full_name || null, payload.role || null, expiresAt)
  } catch { /* kayıt tutulamazsa giriş akışı bozulmasın */ }
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
    'SELECT id, username, role, full_name, password_hash, totp_enabled, is_active FROM users WHERE username=?'
  ).get(username)
  if (!user) return null
  if (!bcrypt.compareSync(password, user.password_hash)) return null
  // Askıya alınmış hesap: şifre doğru olsa da giriş yok.
  if (user.is_active === 0) return null
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

// Yanlış PIN kullanıcıyı bekletmez. Kiosk paylaşımlı bir cihaz ve tek kişinin
// yanlış yazması bütün vardiyayı durduruyordu; kilit kaldırıldı.
//
// Engellemek yerine görünür kılıyoruz: deneme sayacı artar ve eşiği aşınca log'a
// uyarı düşer. Otomatik deneme trafiği IP limitinde durur (bkz. auth/routes.js).
const FAILED_PIN_WARN_AT = 10

function noteFailedPin(table, id, fullName) {
  const db = getDB()
  try {
    db.prepare(`UPDATE ${table === 'staff' ? 'staff' : 'personnel'} SET pin_attempts=COALESCE(pin_attempts,0)+1 WHERE id=?`).run(id)
    const row = db.prepare(`SELECT pin_attempts FROM ${table === 'staff' ? 'staff' : 'personnel'} WHERE id=?`).get(id)
    if (row?.pin_attempts && row.pin_attempts % FAILED_PIN_WARN_AT === 0) {
      logger.warn({ table, id, attempts: row.pin_attempts, fullName }, '[Auth] Üst üste hatalı PIN denemesi')
    }
  } catch { /* sayaç tutulamazsa giriş akışı bozulmasın */ }
  return { error: 'PIN hatalı', status: 401 }
}

export function loginKiosk(tcNo, pin) {
  const db = getDB()
  const p = db.prepare('SELECT * FROM personnel WHERE tc_no=? AND check_out_date IS NULL').get(tcNo)
  if (!p) return { error: 'TC No bulunamadı veya çıkış yapılmış', status: 401 }
  if (!p.kiosk_pin) return { error: 'PIN tanımlı değil. Yöneticinizden PIN alın.', status: 403 }
  if (!bcrypt.compareSync(pin, p.kiosk_pin)) {
    return noteFailedPin('personnel', p.id, p.full_name)
  }
  db.prepare('UPDATE personnel SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(p.id)
  const { token } = makeKioskToken({ personnelId: p.id, role: 'kiosk', full_name: p.full_name })
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
  if (!bcrypt.compareSync(pin, p.kiosk_pin)) {
    return noteFailedPin('personnel', p.id, p.full_name)
  }
  db.prepare('UPDATE personnel SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(p.id)
  const { token } = makeKioskToken({ personnelId: p.id, role: 'kiosk', full_name: p.full_name })
  return { token, personnel: { id: p.id, full_name: p.full_name } }
}

export function searchAvsWorkers(q) {
  const db = getDB()
  return db.prepare(
    `SELECT id, full_name, role_label, kiosk_pin IS NOT NULL as has_pin
     FROM staff
     WHERE is_active=1 AND full_name LIKE ?
     ORDER BY full_name LIMIT 10`
  ).all(`%${q}%`)
}

export function loginAvsKiosk(workerId, pin) {
  const db = getDB()
  const w = db.prepare('SELECT * FROM staff WHERE id=? AND is_active=1').get(workerId)
  if (!w) return { error: 'Çalışan bulunamadı veya pasif', status: 401 }
  if (!w.kiosk_pin) return { error: 'PIN tanımlı değil. Yöneticinizden PIN alın.', status: 403 }
  if (!bcrypt.compareSync(pin, w.kiosk_pin)) {
    return noteFailedPin('staff', w.id, w.full_name)
  }
  db.prepare('UPDATE staff SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(w.id)
  const { token } = makeKioskToken({ workerId: w.id, role: 'avs_kiosk', full_name: w.full_name })
  return { token, worker: { id: w.id, full_name: w.full_name, role_label: w.role_label } }
}

export function setKioskPin(personnelId, newPin) {
  if (!newPin || !/^\d{4}$/.test(newPin)) return { error: 'PIN 4 haneli rakam olmalıdır', status: 400 }
  const db = getDB()
  const p = db.prepare('SELECT id FROM personnel WHERE id=?').get(personnelId)
  if (!p) return { error: 'Personel bulunamadı', status: 404 }
  const hash = bcrypt.hashSync(newPin, 10)
  db.prepare('UPDATE personnel SET kiosk_pin=? WHERE id=?').run(hash, personnelId)
  revokeSessionsFor('personnel', personnelId)
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
  revokeSessionsFor('personnel', personnelId)
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
  revokeSessionsFor('staff', staffId)
  return { ok: true }
}

// Token'ın imzası geçerli olsa bile arkasındaki hesap hâlâ geçerli mi?
//
// Kiosk token'ları pratikte süresiz olduğu için "nasılsa süresi dolar" artık bir
// güvenlik ağı değil: işten ayrılan personelin veya çıkış yapan sakinin erişimi
// yalnızca bu kontrolle kapanır. verifyToken tek geçiş noktası olduğundan kontrol
// burada duruyor — dört ayrı middleware'e dağıtılsa biri unutulurdu.
function assertPrincipalActive(payload) {
  const db = getDB()
  let row
  if (payload.role === 'avs_kiosk') {
    row = db.prepare('SELECT sessions_valid_from FROM staff WHERE id=? AND is_active=1').get(payload.workerId)
    if (!row) throw new Error('Personel kaydı pasif')
  } else if (payload.role === 'kiosk') {
    row = db.prepare('SELECT sessions_valid_from FROM personnel WHERE id=? AND check_out_date IS NULL').get(payload.personnelId)
    if (!row) throw new Error('Personel çıkış yapmış')
  } else if (payload.id) {
    // Web ve mobil oturumlar: satır silinmiş VEYA hesap askıya alınmışsa token ölmeli.
    row = db.prepare('SELECT sessions_valid_from, is_active FROM users WHERE id=?').get(payload.id)
    if (!row) throw new Error('Kullanıcı bulunamadı')
    if (row.is_active === 0) throw new Error('Hesap askıya alındı')
  } else {
    return
  }
  // PIN/şifre değişikliği bu damgayı ileri alır; damgadan önce üretilmiş her
  // token ölür. Karşılaştırma milisaniye üzerinden — `ims` taşımayan eski
  // token'lar için `iat`e düşeriz (onlar zaten iptal edilecek olanlar).
  if (row.sessions_valid_from) {
    const issuedMs = payload.ims ?? (payload.iat ? payload.iat * 1000 : null)
    if (issuedMs !== null && issuedMs < row.sessions_valid_from) {
      throw new Error('Oturum iptal edildi, tekrar giriş yapın')
    }
  }
}

// Kimlik bilgisi değiştiğinde çağrılır: o kişinin bütün açık oturumlarını kapatır.
// jti listesi tutmaya gerek yok — tek damga tüm eski token'ları geçersizler.
const REVOCABLE_TABLES = { user: 'users', staff: 'staff', personnel: 'personnel' }

// Kimlik bilgisini değiştiren kullanıcıya, iptalden SONRA geçerli yeni bir oturum
// verir; böylece "diğer cihazlarımı kapat" işlemi kendi ekranını düşürmez.
export function issueSessionFor(userId) {
  const user = getDB().prepare('SELECT id, role, username, full_name FROM users WHERE id=?').get(userId)
  if (!user) return null
  const { token, jti } = makeToken({ id: user.id, role: user.role, username: user.username, full_name: user.full_name })
  return { token, jti, user }
}

// Kiosk karşılıkları: PIN'ini değiştiren personel, önünde durduğu kiosktan
// atılmasın. PIN doğrulaması çağıran tarafta zaten yapıldı.
export function issueAvsKioskSession(workerId) {
  const w = getDB().prepare('SELECT id, full_name, role_label FROM staff WHERE id=? AND is_active=1').get(workerId)
  if (!w) return null
  const { token } = makeKioskToken({ workerId: w.id, role: 'avs_kiosk', full_name: w.full_name })
  return { token, worker: { id: w.id, full_name: w.full_name, role_label: w.role_label } }
}

export function issuePersonnelKioskSession(personnelId) {
  const p = getDB().prepare('SELECT id, full_name FROM personnel WHERE id=? AND check_out_date IS NULL').get(personnelId)
  if (!p) return null
  const { token } = makeKioskToken({ personnelId: p.id, role: 'kiosk', full_name: p.full_name })
  return { token, personnel: { id: p.id, full_name: p.full_name } }
}

// "Şu an kim içeride" — oturum değil KİŞİ bazında. last_seen_at ~5 dakikada bir
// yazıldığı için varsayılan pencere ondan geniş tutuluyor (bkz. touchSession).
export function listActiveUsers({ withinMinutes = 15 } = {}) {
  const esik = new Date(Date.now() - withinMinutes * 60_000).toISOString().replace('T', ' ').slice(0, 19)
  return getDB().prepare(`
    SELECT principal_kind, principal_id,
           MAX(full_name) AS full_name,
           MAX(role) AS role,
           COUNT(*) AS session_count,
           MAX(COALESCE(last_seen_at, created_at)) AS last_seen_at
    FROM auth_sessions
    WHERE revoked_at IS NULL AND expires_at > ?
      AND COALESCE(last_seen_at, created_at) >= ?
    GROUP BY principal_kind, principal_id
    ORDER BY last_seen_at DESC
  `).all(Math.floor(Date.now() / 1000), esik)
}

// Hesabı askıya al: girişi kapatır ve mevcut token'ları anında geçersizler.
// Silmek yerine bu — audit ve atamalar korunur, geri alınabilir.
export function suspendUser(userId, { reason = null, byUserId = null } = {}) {
  const db = getDB()
  const user = db.prepare('SELECT id, role FROM users WHERE id=?').get(userId)
  if (!user) return { error: 'Kullanıcı bulunamadı', status: 404 }
  if (byUserId && Number(byUserId) === Number(userId)) {
    return { error: 'Kendi hesabınızı askıya alamazsınız', status: 400 }
  }
  db.prepare("UPDATE users SET is_active=0, suspended_at=datetime('now'), suspended_reason=? WHERE id=?")
    .run(reason, userId)
  revokeSessionsFor('user', userId)
  return { ok: true }
}

export function unsuspendUser(userId) {
  const db = getDB()
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(userId)) {
    return { error: 'Kullanıcı bulunamadı', status: 404 }
  }
  db.prepare('UPDATE users SET is_active=1, suspended_at=NULL, suspended_reason=NULL WHERE id=?').run(userId)
  return { ok: true }
}

// Açık oturumlar — yöneticiye "hangi cihazda kim açık" görünümü.
export function listActiveSessions({ limit = 200 } = {}) {
  return getDB().prepare(`
    SELECT jti, principal_kind, principal_id, full_name, role, created_at, last_seen_at
    FROM auth_sessions
    WHERE revoked_at IS NULL AND expires_at > ?
    ORDER BY COALESCE(last_seen_at, created_at) DESC
    LIMIT ?
  `).all(Math.floor(Date.now() / 1000), limit)
}

// Tek bir oturumu kapatır. Zorlama blacklist üzerinden yürür; auth_sessions
// yalnızca listede görünmemesi için işaretlenir.
export function revokeSession(jti) {
  if (!jti) return false
  const db = getDB()
  const row = db.prepare('SELECT expires_at FROM auth_sessions WHERE jti=? AND revoked_at IS NULL').get(jti)
  if (!row) return false
  blacklistJti(jti, row.expires_at)
  db.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE jti=?").run(jti)
  return true
}

// Son görülme damgası. Her istekte yazmamak için süreç içi bir eşik tutuyoruz
// (PM2 tek instance); böylece oturum başına ~5 dakikada bir yazım oluyor.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000
const lastTouched = new Map()

export function touchSession(jti) {
  if (!jti) return
  const now = Date.now()
  const previous = lastTouched.get(jti)
  if (previous && now - previous < TOUCH_INTERVAL_MS) return
  lastTouched.set(jti, now)
  // Harita sınırsız büyümesin — kapanan oturumlar burada birikmesin.
  if (lastTouched.size > 5000) lastTouched.clear()
  try {
    getDB().prepare("UPDATE auth_sessions SET last_seen_at=datetime('now') WHERE jti=?").run(jti)
  } catch { /* istek akışını bozma */ }
}

export function revokeSessionsFor(kind, id) {
  const table = REVOCABLE_TABLES[kind]
  if (!table || !id) return
  // table sabit whitelist'ten gelir (kullanıcı girdisi değil); id parametreli.
  const db = getDB()
  // Kayıtlı her oturumu jti bazında iptal et. Zaman damgası tek başına yetmiyordu:
  // iptal, token'ın üretildiği milisaniyeye denk gelirse o token hayatta kalıyordu.
  // jti kesin; ayrıca iptalden sonra üretilen yeni token yeni jti aldığı için
  // "kendini dışarı atma" sorunu da doğmuyor.
  const acik = db.prepare(
    'SELECT jti, expires_at FROM auth_sessions WHERE principal_kind=? AND principal_id=? AND revoked_at IS NULL'
  ).all(kind, id)
  for (const oturum of acik) blacklistJti(oturum.jti, oturum.expires_at)

  // Damga, auth_sessions'tan önce üretilmiş (kaydı olmayan) eski token'lar için kalıyor.
  db.prepare(`UPDATE ${table} SET sessions_valid_from=? WHERE id=?`).run(Date.now(), id)
  db.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE principal_kind=? AND principal_id=? AND revoked_at IS NULL")
    .run(kind, id)
}

export function verifyToken(token) {
  const payload = jwt.verify(token, SECRET)
  if (isBlacklisted(payload.jti)) throw new Error('Token iptal edildi')
  assertPrincipalActive(payload)
  touchSession(payload.jti)
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
      getDB().prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE jti=?").run(payload.jti)
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
  // Kiosk token'ları zaten süresiz; yenilemeye gerek yok. Buraya düşerlerse net
  // 403 dönmeli — aksi halde aşağıdaki users sorgusu boş döner ve 401 ile
  // frontend oturumu gereksiz yere kapatır.
  if (payload.role === 'kiosk' || payload.role === 'avs_kiosk') {
    return { error: 'Kiosk oturumu yenilenmez, çıkış yapılana dek geçerlidir', status: 403 }
  }
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
  revokeSessionsFor('user', userId)
  return { ok: true }
}
