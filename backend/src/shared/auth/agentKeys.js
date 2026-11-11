// Ajan API anahtarları (Hermes vb.) — bkz. docs/hermes-entegrasyon.md, migration 127.
// Anahtar bir KULLANICIYA bağlıdır ve o kullanıcının rolüyle çalışır: her uç kendi rol kuralını aynen uygular.
// Ham anahtar yalnız oluşturulurken bir kez döner; tabloda SHA-256 özeti tutulur.
import { createHash, randomBytes } from 'node:crypto'
import { getDB } from '../db/index.js'

export const AGENT_KEY_PREFIX = 'yysa_'
const STAFF_ROLES = new Set(['campus_manager', 'shift_supervisor', 'technical', 'laundry', 'housekeeper'])
const TOUCH_INTERVAL_MS = 60_000
const lastTouch = new Map()

const hashKey = raw => createHash('sha256').update(raw).digest('hex')
const fail = (message, status) => Object.assign(new Error(message), { status, statusCode: status })

export function isAgentKey(token) {
  return typeof token === 'string' && token.startsWith(AGENT_KEY_PREFIX)
}

// İstek başlığındaki ajan anahtarı (yoksa null). Çerez oturumu önceliklidir: tarayıcıdan gelen istek ajan sayılmaz.
export function agentKeyFromRequest(req) {
  if (req.cookies?.yys_session) return null
  const h = req.headers?.authorization
  if (!h?.startsWith('Bearer ')) return null
  const token = h.slice(7).trim()
  return isAgentKey(token) ? token : null
}

export function createAgentKey({ name, userId, access = 'write', expiresAt = null, createdBy = null }) {
  const cleanName = String(name || '').trim()
  if (cleanName.length < 2 || cleanName.length > 60) throw fail('Anahtar adı 2–60 karakter olmalı', 400)
  if (!['read', 'write'].includes(access)) throw fail('Erişim read ya da write olmalı', 400)
  if (expiresAt != null && Number.isNaN(Date.parse(expiresAt))) throw fail('Geçersiz bitiş tarihi', 400)
  const db = getDB()
  const user = db.prepare('SELECT id, username, full_name, role, is_active FROM users WHERE id=?').get(userId)
  if (!user) throw fail('Kullanıcı bulunamadı', 404)
  if (user.is_active === 0) throw fail('Askıdaki kullanıcıya anahtar verilemez', 409)
  if (!STAFF_ROLES.has(user.role)) throw fail('Anahtar yalnız personel hesabına bağlanabilir', 400)
  const key = AGENT_KEY_PREFIX + randomBytes(32).toString('base64url')
  const prefix = key.slice(0, AGENT_KEY_PREFIX.length + 6)
  const expires = expiresAt ? new Date(expiresAt).toISOString() : null
  const info = db.prepare(`
    INSERT INTO agent_api_keys(name, key_prefix, key_hash, user_id, access, created_by, expires_at)
    VALUES(?,?,?,?,?,?,?)
  `).run(cleanName, prefix, hashKey(key), user.id, access, createdBy, expires)
  return {
    id: Number(info.lastInsertRowid), name: cleanName, key, key_prefix: prefix, access,
    expires_at: expires, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
  }
}

export function listAgentKeys() {
  return getDB().prepare(`
    SELECT k.id, k.name, k.key_prefix, k.access, k.created_at, k.expires_at, k.last_used_at, k.use_count,
           k.revoked_at, k.user_id, u.username, u.full_name, u.role, u.is_active AS user_active
    FROM agent_api_keys k JOIN users u ON u.id=k.user_id
    ORDER BY k.revoked_at IS NOT NULL, k.id DESC
  `).all()
}

export function revokeAgentKey(id) {
  const info = getDB().prepare(`
    UPDATE agent_api_keys SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL
  `).run(id)
  return info.changes > 0
}

// Ham anahtar → oturum yükü (JWT yüküyle aynı alanlar + agent). Geçersizse hata fırlatır.
export function verifyAgentKey(raw) {
  const db = getDB()
  const row = db.prepare(`
    SELECT k.id AS key_id, k.name, k.access, k.expires_at, k.revoked_at,
           u.id, u.username, u.full_name, u.role, u.is_active
    FROM agent_api_keys k JOIN users u ON u.id=k.user_id
    WHERE k.key_hash=?
  `).get(hashKey(raw))
  if (!row) throw new Error('Geçersiz ajan anahtarı')
  if (row.revoked_at) throw new Error('Ajan anahtarı iptal edilmiş')
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) throw new Error('Ajan anahtarının süresi dolmuş')
  if (row.is_active === 0) throw new Error('Hesap askıya alındı')
  if (!STAFF_ROLES.has(row.role)) throw new Error('Hesap rolü ajan erişimine uygun değil')
  // Her istekte yazmamak için kullanım damgası dakikada bir güncellenir.
  const now = Date.now()
  if (now - (lastTouch.get(row.key_id) || 0) >= TOUCH_INTERVAL_MS) {
    lastTouch.set(row.key_id, now)
    try {
      db.prepare('UPDATE agent_api_keys SET last_used_at=CURRENT_TIMESTAMP, use_count=use_count+1 WHERE id=?').run(row.key_id)
    } catch { /* kullanım damgası yazılamazsa istek bozulmasın */ }
  }
  return {
    id: row.id, role: row.role, username: row.username, full_name: row.full_name,
    agent: { key_id: row.key_id, name: row.name, access: row.access },
  }
}

export function _resetAgentKeyCacheForTests() { lastTouch.clear() }
