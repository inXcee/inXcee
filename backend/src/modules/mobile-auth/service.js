import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDB } from '../../shared/db/index.js'

const SECRET = process.env.JWT_SECRET

const MOBILE_ROLES = new Set(['housekeeper', 'technical'])

export function loginMobile(pin, role) {
  if (!MOBILE_ROLES.has(role)) return { error: 'Geçersiz rol', status: 400 }
  if (!pin || !/^\d{4}$/.test(pin)) return { error: 'PIN 4 haneli rakam olmalı', status: 400 }

  const db = getDB()
  const users = db.prepare(
    'SELECT * FROM users WHERE role=? AND mobile_pin IS NOT NULL'
  ).all(role)

  const matched = users.find(u => bcrypt.compareSync(pin, u.mobile_pin))
  if (!matched) return { error: 'PIN hatalı veya mobil erişim tanımlı değil', status: 401 }

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
