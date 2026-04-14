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
  if (!bcrypt.compareSync(pin, p.kiosk_pin)) return { error: 'PIN hatalı', status: 401 }
  const token = jwt.sign(
    { personnelId: p.id, role: 'kiosk', full_name: p.full_name },
    SECRET,
    { expiresIn: '1h' }
  )
  return { token, personnel: { id: p.id, full_name: p.full_name } }
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
