import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDB } from '../../shared/db/index.js'
import { WEB_TOKEN_TTL_MS } from '../../shared/auth/service.js'

const SECRET = process.env.JWT_SECRET

const MOBILE_ROLES = new Set(['housekeeper', 'technical', 'laundry', 'shift_supervisor', 'campus_manager'])

export function loginMobile(pin, role) {
  if (!MOBILE_ROLES.has(role)) return { error: 'Geçersiz rol', status: 400 }
  if (!pin || !/^\d{4}$/.test(pin)) return { error: 'PIN 4 haneli rakam olmalı', status: 400 }

  const db = getDB()
  const users = db.prepare(
    'SELECT * FROM users WHERE role=? AND mobile_pin IS NOT NULL'
  ).all(role)

  const matched = users.find(u => bcrypt.compareSync(pin, u.mobile_pin))
  if (!matched) {
    // Kilit yok: yanlış PIN kullanıcıyı bekletmez, yalnızca "yanlış" denir.
    // Sayaç izleme için tutulur; otomatik deneme trafiği IP limitinde durur.
    const incr = db.prepare('UPDATE users SET pin_attempts = COALESCE(pin_attempts,0) + 1 WHERE id = ?')
    db.transaction(() => { for (const u of users) incr.run(u.id) })()
    return { error: 'PIN hatalı veya mobil erişim tanımlı değil', status: 401 }
  }

  // Basarili giris — kullanicinin sayacini sifirla
  db.prepare('UPDATE users SET pin_attempts = 0, pin_locked_until = NULL WHERE id = ?').run(matched.id)

  // Oturum çıkış yapılana kadar açık kalır — web paneliyle aynı süre.
  const token = jwt.sign(
    { id: matched.id, role: matched.role, full_name: matched.full_name },
    SECRET,
    { expiresIn: Math.floor(WEB_TOKEN_TTL_MS / 1000) }
  )
  return { token, user: { id: matched.id, role: matched.role, full_name: matched.full_name } }
}

export function getMobileMe(userId) {
  const db = getDB()
  const u = db.prepare('SELECT id, role, full_name FROM users WHERE id=?').get(userId)
  return u || null
}
