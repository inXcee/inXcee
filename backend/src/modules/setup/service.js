import bcrypt from 'bcryptjs'
import { hasAnyUserQuery, createFirstAdminQuery } from './queries.js'

export function getSetupStatusService() {
  return { needs_setup: !hasAnyUserQuery() }
}

export function initSetupService({ username, password, full_name, email }) {
  if (hasAnyUserQuery()) {
    return { error: 'Sistem zaten kurulmuş — kurulum tekrar çalıştırılamaz', status: 409 }
  }
  const u = (username || '').trim()
  const fn = (full_name || '').trim()
  const em = (email || '').trim() || null
  if (u.length < 3) return { error: 'Kullanıcı adı en az 3 karakter olmalı', status: 400 }
  if (!/^[a-zA-Z0-9_.-]+$/.test(u)) return { error: 'Kullanıcı adı sadece harf, rakam, _ . - içerebilir', status: 400 }
  if (!password || password.length < 8) return { error: 'Şifre en az 8 karakter olmalı', status: 400 }
  if (fn.length < 2) return { error: 'Ad Soyad gerekli', status: 400 }
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return { error: 'Geçersiz e-posta', status: 400 }

  const hash = bcrypt.hashSync(password, 10)
  const id = createFirstAdminQuery({ username: u, password_hash: hash, full_name: fn, email: em })
  return { ok: true, id, username: u }
}
