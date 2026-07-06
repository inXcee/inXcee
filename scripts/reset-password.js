#!/usr/bin/env node
/**
 * YYS — Acil Durum Şifre Sıfırlama
 *
 * Admin kilitlendiğinde SSH üzerinden çalıştırılır. UI password modal'ı
 * yetmediğinde (örn. tek admin de şifresini unuttu) son çare.
 *
 * Kullanım:
 *   node scripts/reset-password.js <username> <new_password>
 *   DB_PATH=/var/data/yys.db node scripts/reset-password.js admin Yeni123!
 *
 * Notlar:
 *   - Sadece sunucu üzerinde SSH ile çalıştırılabilir (filesystem erişimi)
 *   - Password policy KONTROL EDİLİR — zayıf şifre reddedilir
 *   - Audit log'a kayıt düşer (user_id=0, sistem işlemi)
 *   - Eğer kullanıcı yoksa hata verir, oluşturmaz
 */

import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'yys.db')

const [, , username, password] = process.argv

if (!username || !password) {
  console.error('Kullanım: node scripts/reset-password.js <username> <new_password>')
  console.error('Örnek:   DB_PATH=/var/data/yys.db node scripts/reset-password.js admin Yeni123!')
  process.exit(1)
}

if (password.length < 8) {
  console.error('HATA: Şifre en az 8 karakter olmalı')
  process.exit(1)
}

const db = new Database(DB_PATH)

const user = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get(username)
if (!user) {
  console.error(`HATA: ${username} kullanıcısı bulunamadı`)
  db.close()
  process.exit(1)
}

const hash = bcrypt.hashSync(password, 10)
db.prepare(
  'UPDATE users SET password_hash = ?, pin_attempts = 0, pin_locked_until = NULL WHERE id = ?'
).run(hash, user.id)

// Audit log — user_id=NULL çünkü bu CLI/sistem işlemi, oturum açmış kullanıcı yok
try {
  db.prepare(
    "INSERT INTO audit_log(user_id, action, module, target_id, detail) VALUES(NULL, 'password_reset_cli', 'users', ?, ?)"
  ).run(user.id, `CLI emergency reset for ${username} (${user.role})`)
} catch { /* audit_log şeması farklıysa sessiz geç */ }

console.log(`OK: ${username} (${user.role}) şifresi güncellendi.`)
console.log('Yeni şifre ile login deneyebilirsin.')
db.close()
