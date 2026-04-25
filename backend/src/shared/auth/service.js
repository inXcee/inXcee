import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDB } from '../db/index.js'

const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  console.error('[Auth] JWT_SECRET env değişkeni tanımlı değil! Sunucu başlatılamaz.')
  process.exit(1)
}

export function login(username, password) {
  const db = getDB()
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username)
  if (!user) return null
  if (!bcrypt.compareSync(password, user.password_hash)) return null
  const token = jwt.sign(
    { id: user.id, role: user.role, username: user.username, full_name: user.full_name },
    SECRET,
    { expiresIn: '12h' }
  )
  return { token, user: { id: user.id, role: user.role, username: user.username, full_name: user.full_name } }
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
     FROM avs_workers WHERE is_active=1 AND full_name LIKE ?
     ORDER BY full_name LIMIT 10`
  ).all(`%${q}%`)
}

export function loginAvsKiosk(workerId, pin) {
  const db = getDB()
  const w = db.prepare('SELECT * FROM avs_workers WHERE id=? AND is_active=1').get(workerId)
  if (!w) return { error: 'Çalışan bulunamadı veya pasif', status: 401 }
  if (!w.kiosk_pin) return { error: 'PIN tanımlı değil. Yöneticinizden PIN alın.', status: 403 }
  if (w.pin_locked_until && new Date(w.pin_locked_until) > new Date()) {
    return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
  }
  if (!bcrypt.compareSync(pin, w.kiosk_pin)) {
    const attempts = (w.pin_attempts || 0) + 1
    if (attempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      db.prepare('UPDATE avs_workers SET pin_attempts=?, pin_locked_until=? WHERE id=?').run(attempts, lockedUntil, w.id)
      return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
    }
    db.prepare('UPDATE avs_workers SET pin_attempts=? WHERE id=?').run(attempts, w.id)
    return { error: 'PIN hatalı', status: 401 }
  }
  db.prepare('UPDATE avs_workers SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(w.id)
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

export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}

export function refreshToken(oldToken) {
  let payload
  try {
    payload = jwt.verify(oldToken, SECRET)
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      payload = jwt.decode(oldToken)
    } else {
      return { error: 'Geçersiz token', status: 401 }
    }
  }
  if (!payload) return { error: 'Token payload boş', status: 401 }
  if (payload.role === 'kiosk') return { error: 'Kiosk token yenilenemiyor', status: 403 }
  const db = getDB()
  const user = db.prepare('SELECT id, role, username, full_name FROM users WHERE id=?').get(payload.id)
  if (!user) return { error: 'Kullanıcı bulunamadı', status: 401 }
  const newToken = jwt.sign(
    { id: user.id, role: user.role, username: user.username, full_name: user.full_name },
    SECRET,
    { expiresIn: '12h' }
  )
  return { token: newToken, user: { id: user.id, role: user.role, username: user.username, full_name: user.full_name } }
}

export function changeOwnPassword(userId, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    return { error: 'Yeni şifre en az 8 karakter olmalı', status: 400 }
  }
  const db = getDB()
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId)
  if (!user) return { error: 'Kullanıcı bulunamadı', status: 404 }
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return { error: 'Mevcut şifre hatalı', status: 401 }
  }
  const hash = bcrypt.hashSync(newPassword, 10)
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, userId)
  return { ok: true }
}
