import bcrypt from 'bcryptjs'
import { getDB } from './index.js'
import crypto from 'crypto'

/**
 * Production-only initialization.
 * Eğer hiç campus_manager yoksa, rastgele şifreli bir admin oluşturur
 * ve şifreyi konsola yazar (tek seferlik).
 */
export function initProdDB() {
  const db = getDB()
  const existingAdmin = db.prepare(
    "SELECT id FROM users WHERE role='campus_manager' LIMIT 1"
  ).get()

  if (existingAdmin) return // Zaten admin var, bir şey yapma

  const tempPassword = crypto.randomBytes(12).toString('base64url')
  const hash = bcrypt.hashSync(tempPassword, 12)

  db.prepare(
    "INSERT INTO users(username, password_hash, role, full_name) VALUES(?, ?, 'campus_manager', 'Admin')"
  ).run('admin', hash)

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  YYS İLK KURULUM                                   ║')
  console.log('║  Admin kullanıcı oluşturuldu:                      ║')
  console.log(`║  Kullanıcı adı : admin                             ║`)
  console.log(`║  Şifre         : ${tempPassword.padEnd(36)}║`)
  console.log('║  Giriş yaptıktan sonra şifrenizi değiştirin!       ║')
  console.log('╚════════════════════════════════════════════════════╝')
}
