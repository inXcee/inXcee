import { createHash, timingSafeEqual } from 'crypto'

// Harici yapay zekâ ajanı (Hermes Agent vb.) için ayrı kimlik: kullanıcı JWT'si
// DEĞİL. Ajan ele geçirilirse (ör. Telegram hesabı) yalnız /api/agent altındaki
// salt-okunur, kişisel veri içermeyen özetlere erişebilsin diye.
// AGENT_API_TOKEN boşsa veya kısaysa uç kapalıdır (503) — zayıf token kabul edilmez.
export const AGENT_TOKEN_MIN_LENGTH = 32

const digest = (value) => createHash('sha256').update(value).digest()

export function requireAgentToken(req, res, next) {
  const expected = process.env.AGENT_API_TOKEN
  if (!expected || expected.length < AGENT_TOKEN_MIN_LENGTH) {
    return res.status(503).json({ error: 'agent api disabled' })
  }
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' })
  // Özetler eşit uzunlukta — timingSafeEqual uzunluk farkında atmaz, süre sızdırmaz.
  if (!timingSafeEqual(digest(header.slice(7)), digest(expected))) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}
