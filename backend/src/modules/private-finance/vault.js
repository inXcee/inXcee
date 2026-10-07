// Özel finans kasası — ayrı SQLite dosyası (finance-vault.db).
//
// FinansApp (React) verisini zustand store'ları halinde JSON blok olarak tutar
// ("finance-storage", "trade-storage" ...). Kasa bu blokları sürümlü saklar:
//  - PUT iyimser eşzamanlılık kullanır (base_version uyuşmazsa 409) — telefon,
//    web ve Hermes aynı anda yazarsa sessiz veri kaybı olmaz.
//  - Her yazımdan önce eski sürüm geçmişe atılır (son HISTORY_KEEP sürüm), geri
//    yüklenebilir.
// Hermes gibi makine istemcileri kullanıcı oturumu yerine kapsamlı API anahtarı
// kullanır; anahtar yalnız SHA-256 özeti olarak saklanır.
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { resolveDatabasePath } from '../../shared/db/index.js'

export const HISTORY_KEEP = 50
export const MAX_BLOB_BYTES = 20 * 1024 * 1024
export const STORE_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
export const KEY_SCOPES = Object.freeze(['read', 'write'])

let vault = null
let openedPath = null

export function vaultPath() {
  if (process.env.PRIVATE_FINANCE_DB_PATH) return process.env.PRIVATE_FINANCE_DB_PATH
  const main = process.env.DB_PATH
  if (main === ':memory:') return ':memory:'
  // Aynı klasörde birden çok ortam olabilir (/var/data/yys.db + yys-staging.db): kasa adı ana
  // DB'den türetilir ki staging canlının kasasını açmasın. yys.db → finance-vault.db.
  const mainPath = resolveDatabasePath(main)
  const stem = path.basename(mainPath, path.extname(mainPath))
  return path.join(path.dirname(mainPath), stem === 'yys' ? 'finance-vault.db' : `finance-vault.${stem}.db`)
}

export function getVault() {
  const wanted = vaultPath()
  // Testler DB_PATH'i ':memory:' yapar; yol değişirse kasa yeniden açılır.
  if (vault && openedPath === wanted) return vault
  vault?.close()
  vault = new Database(wanted)
  openedPath = wanted
  vault.pragma('journal_mode = WAL')
  vault.pragma('busy_timeout = 5000')
  vault.exec(`
    CREATE TABLE IF NOT EXISTS pf_state (
      store_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      device_id TEXT,
      actor TEXT
    );
    CREATE TABLE IF NOT EXISTS pf_state_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_key TEXT NOT NULL,
      version INTEGER NOT NULL,
      data TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      actor TEXT,
      UNIQUE(store_key, version)
    );
    CREATE TABLE IF NOT EXISTS pf_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      scopes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    );
  `)
  restrictPermissions(wanted)
  return vault
}

// Kasa kişisel veridir: sunucudaki diğer Linux kullanıcıları (ör. hermes) dosyayı okuyamasın.
// WAL/SHM yan dosyaları da ana dosyanın içeriğini taşır.
function restrictPermissions(file) {
  if (file === ':memory:') return
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    try { fs.chmodSync(f, 0o600) } catch { /* yan dosya henüz yok */ }
  }
}

export function resetVaultForTests() {
  vault?.close()
  vault = null
  openedPath = null
}

const now = () => new Date().toISOString()
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { statusCode: status, ...extra })

export function assertStoreKey(key) {
  if (typeof key !== 'string' || !STORE_KEY_RE.test(key)) throw fail(400, 'Geçersiz store anahtarı')
}

export function listStates() {
  return getVault().prepare(
    'SELECT store_key, version, updated_at, device_id, actor, length(data) AS bytes FROM pf_state ORDER BY store_key',
  ).all()
}

export function getState(key) {
  assertStoreKey(key)
  const row = getVault().prepare('SELECT * FROM pf_state WHERE store_key=?').get(key)
  if (!row) return null
  return { store_key: row.store_key, version: row.version, updated_at: row.updated_at, device_id: row.device_id,
    actor: row.actor, data: JSON.parse(row.data) }
}

export function putState(key, data, { baseVersion, deviceId = null, actor = null, force = false } = {}) {
  assertStoreKey(key)
  if (data === undefined) throw fail(400, 'data gerekli')
  const text = JSON.stringify(data)
  if (Buffer.byteLength(text) > MAX_BLOB_BYTES) throw fail(413, 'Veri çok büyük')
  const db = getVault()
  return db.transaction(() => {
    const cur = db.prepare('SELECT * FROM pf_state WHERE store_key=?').get(key)
    const curVersion = cur?.version ?? 0
    if (!force && (baseVersion ?? 0) !== curVersion) {
      throw fail(409, 'Sürüm çakışması — önce güncel veriyi çekin', { current_version: curVersion, updated_at: cur?.updated_at ?? null })
    }
    if (cur && cur.data === text) return { store_key: key, version: curVersion, updated_at: cur.updated_at, unchanged: true }
    const ts = now()
    if (cur) {
      db.prepare('INSERT OR IGNORE INTO pf_state_history(store_key, version, data, saved_at, actor) VALUES(?,?,?,?,?)')
        .run(key, cur.version, cur.data, cur.updated_at, cur.actor)
      db.prepare(`DELETE FROM pf_state_history WHERE store_key=? AND version NOT IN
        (SELECT version FROM pf_state_history WHERE store_key=? ORDER BY version DESC LIMIT ?)`).run(key, key, HISTORY_KEEP)
    }
    const version = curVersion + 1
    db.prepare(`INSERT INTO pf_state(store_key, data, version, updated_at, device_id, actor) VALUES(?,?,?,?,?,?)
      ON CONFLICT(store_key) DO UPDATE SET data=excluded.data, version=excluded.version, updated_at=excluded.updated_at,
      device_id=excluded.device_id, actor=excluded.actor`).run(key, text, version, ts, deviceId, actor)
    return { store_key: key, version, updated_at: ts }
  })()
}

export function stateHistory(key) {
  assertStoreKey(key)
  return getVault().prepare(
    'SELECT version, saved_at, actor, length(data) AS bytes FROM pf_state_history WHERE store_key=? ORDER BY version DESC',
  ).all(key)
}

export function restoreState(key, version, actor = null) {
  assertStoreKey(key)
  const db = getVault()
  const old = db.prepare('SELECT data FROM pf_state_history WHERE store_key=? AND version=?').get(key, version)
  if (!old) throw fail(404, 'Sürüm bulunamadı')
  return putState(key, JSON.parse(old.data), { force: true, actor: actor ? `${actor} (geri yükleme v${version})` : `geri yükleme v${version}` })
}

const hashKey = secret => createHash('sha256').update(String(secret)).digest('hex')

export function createApiKey(name, scopes = ['read']) {
  if (!name?.trim()) throw fail(400, 'Anahtar adı gerekli')
  const bad = scopes.filter(s => !KEY_SCOPES.includes(s))
  if (!scopes.length || bad.length) throw fail(400, `Geçersiz kapsam: ${bad.join(',') || '(boş)'}`)
  const secret = `pfk_${randomBytes(24).toString('base64url')}`
  const id = getVault().prepare('INSERT INTO pf_api_keys(name, key_hash, scopes, created_at) VALUES(?,?,?,?)')
    .run(name.trim(), hashKey(secret), scopes.join(','), now()).lastInsertRowid
  return { id, name: name.trim(), scopes, secret }
}

export function verifyApiKey(secret) {
  if (typeof secret !== 'string' || !secret.startsWith('pfk_')) return null
  const db = getVault()
  const row = db.prepare('SELECT * FROM pf_api_keys WHERE key_hash=? AND revoked_at IS NULL').get(hashKey(secret))
  if (!row) return null
  db.prepare('UPDATE pf_api_keys SET last_used_at=? WHERE id=?').run(now(), row.id)
  return { id: row.id, name: row.name, scopes: row.scopes.split(',') }
}

export function listApiKeys() {
  return getVault().prepare('SELECT id, name, scopes, created_at, last_used_at, revoked_at FROM pf_api_keys ORDER BY id').all()
}

export function revokeApiKey(id) {
  return getVault().prepare('UPDATE pf_api_keys SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(now(), id).changes > 0
}
