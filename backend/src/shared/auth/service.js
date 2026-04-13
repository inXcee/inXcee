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

export function loginKiosk(tcNo) {
  const db = getDB()
  const p = db.prepare('SELECT * FROM personnel WHERE tc_no=? AND check_out_date IS NULL').get(tcNo)
  if (!p) return null
  const token = jwt.sign(
    { personnelId: p.id, role: 'kiosk', full_name: p.full_name },
    SECRET,
    { expiresIn: '1h' }
  )
  return { token, personnel: { id: p.id, full_name: p.full_name } }
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}
