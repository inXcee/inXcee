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

  // Şifre stdout yerine stderr'e yazılır — uygulama log akışından ayrı tutulur
  process.stderr.write('╔════════════════════════════════════════════════════╗\n')
  process.stderr.write('║  YYS İLK KURULUM                                   ║\n')
  process.stderr.write('║  Admin kullanıcı oluşturuldu:                      ║\n')
  process.stderr.write(`║  Kullanıcı adı : admin                             ║\n`)
  process.stderr.write(`║  Şifre         : ${tempPassword.padEnd(36)}║\n`)
  process.stderr.write('║  Giriş yaptıktan sonra şifrenizi değiştirin!       ║\n')
  process.stderr.write('╚════════════════════════════════════════════════════╝\n')
}
