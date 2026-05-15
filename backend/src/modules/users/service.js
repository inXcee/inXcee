import bcrypt from 'bcryptjs'
import * as queries from './queries.js'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'
import { validatePassword } from '../../shared/auth/password-policy.js'

const VALID_ROLES = ['campus_manager', 'shift_supervisor', 'technical', 'laundry', 'housekeeper']

export function listUsers() {
  return queries.getAllUsers()
}

export function getUser(id) {
  return queries.getUserById(id)
}

export function addUser(data, createdBy) {
  if (!data.username || !data.password || !data.role || !data.full_name) {
    return { error: 'Kullanıcı adı, şifre, rol ve ad soyad gerekli', status: 400 }
  }
  if (!VALID_ROLES.includes(data.role)) {
    return { error: 'Geçersiz rol', status: 400 }
  }
  if (data.username.length < 3) {
    return { error: 'Kullanıcı adı en az 3 karakter olmalı', status: 400 }
  }
  const pwCheck = validatePassword(data.password, { username: data.username })
  if (!pwCheck.ok) {
    return { error: pwCheck.errors.join(' · '), status: 400 }
  }
  if (queries.usernameExists(data.username)) {
    return { error: 'Bu kullanıcı adı zaten mevcut', status: 409 }
  }

  const password_hash = bcrypt.hashSync(data.password, 10)
  const id = queries.createUser({ ...data, password_hash })
  logAudit(createdBy, 'user_create', 'users', id, `${data.username} (${data.role})`)
  return { id }
}

export function editUser(id, data, updatedBy) {
  if (!VALID_ROLES.includes(data.role)) {
    return { error: 'Geçersiz rol', status: 400 }
  }
  const existing = queries.getUserById(id)
  if (!existing) return { error: 'Kullanıcı bulunamadı', status: 404 }

  queries.updateUser(id, data)
  logAudit(updatedBy, 'user_update', 'users', id, `${existing.username}: ${data.role}`)
  return { ok: true }
}

export function changePassword(id, newPassword, changedBy) {
  const existing = queries.getUserById(id)
  if (!existing) return { error: 'Kullanıcı bulunamadı', status: 404 }
  const pwCheck = validatePassword(newPassword, { username: existing.username })
  if (!pwCheck.ok) {
    return { error: pwCheck.errors.join(' · '), status: 400 }
  }

  const password_hash = bcrypt.hashSync(newPassword, 10)
  queries.updatePassword(id, password_hash)
  logAudit(changedBy, 'user_password_change', 'users', id, existing.username)
  return { ok: true }
}

export function removeUser(id, removedBy) {
  const existing = queries.getUserById(id)
  if (!existing) return { error: 'Kullanıcı bulunamadı', status: 404 }
  if (existing.id === removedBy) return { error: 'Kendinizi silemezsiniz', status: 400 }

  queries.deleteUser(id)
  logAudit(removedBy, 'user_delete', 'users', id, existing.username)
  return { ok: true }
}

export function setMobilePinService(userId, pin, actorId) {
  const db = getDB()
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(userId)
  if (!user) return { error: 'Kullanıcı bulunamadı', status: 404 }
  if (pin === null || pin === '') {
    db.prepare('UPDATE users SET mobile_pin=NULL WHERE id=?').run(userId)
    return { ok: true }
  }
  if (!/^\d{4}$/.test(pin)) return { error: 'PIN 4 haneli rakam olmalı', status: 400 }
  const hashed = bcrypt.hashSync(pin, 10)
  db.prepare('UPDATE users SET mobile_pin=? WHERE id=?').run(hashed, userId)
  return { ok: true }
}
