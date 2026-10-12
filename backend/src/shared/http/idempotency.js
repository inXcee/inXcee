// Tekil işlem anahtarı (X-Idempotency-Key) — yazma uçları için.
// Anahtar, işin yazdığı kayıtlarla aynı SQLite transaction'ında saklanır; iş hata atarsa
// ikisi birlikte geri alınır ve istemci aynı anahtarla güvenle yeniden deneyebilir.
// Anahtar (kullanıcı, kapsam) başına tekildir. Saklama süresi 90 gün.
import { createHash } from 'node:crypto'
import { getDB } from '../db/index.js'

const RETENTION = '-90 days'

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status, statusCode: status })
}

// work() → { status, body }. Dönüş: { status, body, replayed }.
export function runIdempotent(req, scope, work) {
  const key = req.get?.('X-Idempotency-Key') ?? req.headers?.['x-idempotency-key']
  if (key == null || key === '') return { ...work(), replayed: false }
  if (typeof key !== 'string' || key.length < 8 || key.length > 160) {
    throw httpError('Geçersiz işlem anahtarı (8–160 karakter)', 400)
  }
  const db = getDB()
  const userId = req.user?.id ?? null
  const hash = createHash('sha256').update(stableStringify(req.body)).digest('hex')
  return db.transaction(() => {
    const existing = db.prepare(`
      SELECT request_hash, status_code, response FROM api_idempotency_keys
      WHERE user_id IS ? AND scope=? AND idem_key=?
    `).get(userId, scope, key)
    if (existing) {
      if (existing.request_hash !== hash) {
        throw httpError('Bu işlem anahtarı farklı içerikli bir istekte kullanılmış', 422)
      }
      return { status: existing.status_code, body: JSON.parse(existing.response), replayed: true }
    }
    const result = work()
    db.prepare(`
      INSERT INTO api_idempotency_keys(user_id, scope, idem_key, request_hash, status_code, response)
      VALUES(?,?,?,?,?,?)
    `).run(userId, scope, key, hash, result.status, JSON.stringify(result.body))
    db.prepare(`DELETE FROM api_idempotency_keys WHERE created_at < datetime('now', ?)`).run(RETENTION)
    return { ...result, replayed: false }
  })()
}

export function sendIdempotent(res, result) {
  if (result.replayed) res.setHeader('X-Idempotent-Replay', '1')
  return res.status(result.status).json(result.body)
}
