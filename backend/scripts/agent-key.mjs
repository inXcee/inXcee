// Ajan (Hermes) API anahtarları — sunucuda elle. Belge: docs/hermes-entegrasyon.md
//
//   node --env-file=../.env scripts/agent-key.mjs create hermes --user mudur            (tam yetki: o kullanıcının rolü)
//   node --env-file=../.env scripts/agent-key.mjs create hermes --service               ("hermes" adlı servis hesabı açar, müdür rolü)
//   node --env-file=../.env scripts/agent-key.mjs create rapor --user vardiya --read    (salt-okur)
//   node --env-file=../.env scripts/agent-key.mjs list
//   node --env-file=../.env scripts/agent-key.mjs revoke 3
//
// Anahtar yalnız oluşturulurken bir kez yazılır (stdout'a, tek satır); veritabanında SHA-256 özeti tutulur.
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

const out = s => process.stdout.write(`${s}\n`)
const err = s => process.stderr.write(`${s}\n`)
const usage = () => {
  err('kullanım: agent-key.mjs create <ad> (--user <kullanıcı adı> | --service) [--read] [--days N] | list | revoke <id>')
  process.exit(2)
}

const args = process.argv.slice(2)
const cmd = args[0]
if (!process.env.DB_PATH) { err('DB_PATH gerekli (--env-file=../.env)'); process.exit(2) }
if (!['create', 'list', 'revoke'].includes(cmd)) usage()

const { initDB, getDB } = await import('../src/shared/db/index.js')
const { createAgentKey, listAgentKeys, revokeAgentKey } = await import('../src/shared/auth/agentKeys.js')
await initDB()
const db = getDB()

// Servis hesabı: müdür rolünde, şifresi kimsenin bilmediği rastgele bir değer — web'den giriş yapılamaz,
// yalnız anahtarla çalışır. Denetim günlüğünde ajanın işleri bu ad altında, insanlardan ayrı görünür.
function serviceUser(name) {
  const username = name.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'hermes'
  const existing = db.prepare('SELECT id, role FROM users WHERE username=?').get(username)
  if (existing) return existing.id
  const hash = bcrypt.hashSync(randomBytes(32).toString('base64url'), 10)
  const info = db.prepare(`INSERT INTO users(role, username, password_hash, full_name) VALUES('campus_manager', ?, ?, ?)`)
    .run(username, hash, `${name[0].toUpperCase()}${name.slice(1)} (ajan)`)
  err(`servis hesabı açıldı: ${username}`)
  return Number(info.lastInsertRowid)
}

if (cmd === 'create') {
  const name = args[1]
  if (!name || name.startsWith('--')) usage()
  const flag = f => args.includes(f)
  const value = f => (args.includes(f) ? args[args.indexOf(f) + 1] : null)
  let userId
  if (flag('--service')) userId = serviceUser(name)
  else {
    const username = value('--user')
    if (!username) usage()
    userId = db.prepare('SELECT id FROM users WHERE username=?').get(username)?.id
    if (!userId) { err(`kullanıcı bulunamadı: ${username}`); process.exit(1) }
  }
  const days = Number(value('--days'))
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null
  try {
    const k = createAgentKey({ name, userId, access: flag('--read') ? 'read' : 'write', expiresAt })
    err(`anahtar #${k.id} — ${k.user.username} (${k.user.role}), erişim: ${k.access}${k.expires_at ? `, bitiş: ${k.expires_at}` : ''}`)
    err('Aşağıdaki satır anahtardır; yalnız bir kez gösterilir:')
    out(k.key)
  } catch (e) { err(e.message); process.exit(1) }
} else if (cmd === 'list') {
  out(JSON.stringify(listAgentKeys(), null, 1))
} else {
  out(revokeAgentKey(Number(args[1])) ? 'iptal edildi' : 'bulunamadı / zaten iptal')
}
