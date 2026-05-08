import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDB } from '../../shared/db/index.js'

const SECRET = process.env.JWT_SECRET

const MOBILE_ROLES = new Set(['housekeeper', 'technical', 'laundry', 'shift_supervisor', 'campus_manager'])
const MAX_PIN_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

export function loginMobile(pin, role) {
  if (!MOBILE_ROLES.has(role)) return { error: 'Geçersiz rol', status: 400 }
  if (!pin || !/^\d{4}$/.test(pin)) return { error: 'PIN 4 haneli rakam olmalı', status: 400 }

  const db = getDB()
  const users = db.prepare(
    'SELECT * FROM users WHERE role=? AND mobile_pin IS NOT NULL'
  ).all(role)

  // Kilitli kullaniciyi PIN denemelerinden tamamen cikar — onun PIN'ini denemek bile riskli
  const now = Date.now()
  const eligible = users.filter(u => !u.pin_locked_until || new Date(u.pin_locked_until).getTime() <= now)

  const matched = eligible.find(u => bcrypt.compareSync(pin, u.mobile_pin))
  if (!matched) {
    // Hangi user'a saldiri yapildi bilemiyoruz (PIN pool model). Yine de
    // her uygun kullanicinin attempts sayacini artirip, esige varan herkesi
    // 15dk kilitle. Bu PIN kombinasyonlarinin tamamini exhaust etmeyi
    // pratikte imkansiz kilar.
    const incr = db.prepare('UPDATE users SET pin_attempts = COALESCE(pin_attempts,0) + 1 WHERE id = ?')
    const lock = db.prepare('UPDATE users SET pin_attempts = 0, pin_locked_until = ? WHERE id = ?')
    const lockedUntil = new Date(now + LOCKOUT_MS).toISOString()
    db.transaction(() => {
      for (const u of eligible) {
        incr.run(u.id)
        if ((u.pin_attempts || 0) + 1 >= MAX_PIN_ATTEMPTS) lock.run(lockedUntil, u.id)
      }
    })()
    return { error: 'PIN hatalı veya mobil erişim tanımlı değil', status: 401 }
  }

  // Basarili giris — kullanicinin sayacini sifirla
  db.prepare('UPDATE users SET pin_attempts = 0, pin_locked_until = NULL WHERE id = ?').run(matched.id)

  const token = jwt.sign(
    { id: matched.id, role: matched.role, full_name: matched.full_name },
    SECRET,
    { expiresIn: '8h' }
  )
  return { token, user: { id: matched.id, role: matched.role, full_name: matched.full_name } }
}

export function getMobileMe(userId) {
  const db = getDB()
  const u = db.prepare('SELECT id, role, full_name FROM users WHERE id=?').get(userId)
  return u || null
}
