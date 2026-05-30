import bcrypt from 'bcryptjs'
import { verifyToken } from './service.js'
import { getDB } from '../db/index.js'

const STAFF_ROLES = new Set(['campus_manager', 'shift_supervisor', 'technical', 'laundry', 'housekeeper'])
const COOKIE_NAME = 'yys_session'

function extractToken(req) {
  // 1) httpOnly cookie (staff web login)
  const cookieToken = req.cookies?.[COOKIE_NAME]
  if (cookieToken) return cookieToken
  // 2) Authorization header (kiosk, mobile, API clients)
  const h = req.headers.authorization
  if (h?.startsWith('Bearer ')) return h.slice(7)
  return null
}

export function requireAuth(req, res, next) {
  const token = extractToken(req)
  if (!token) return res.status(401).json({ error: 'Token gerekli' })
  try {
    req.user = verifyToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Geçersiz token' })
  }
}

// SSE endpoint'leri — cookie + header + query string destekli.
// fetch() API credentials:include ile cookie gönderir; EventSource için query fallback.
export function requireSSEAuth(req, res, next) {
  const cookieToken = req.cookies?.[COOKIE_NAME]
  const headerToken = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null
  const token = cookieToken || headerToken || queryToken
  if (!token) return res.status(401).json({ error: 'Token gerekli' })
  try {
    req.user = verifyToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Geçersiz token' })
  }
}

export function requireRole(...roles) {
  return [requireAuth, (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Yetkisiz' })
    next()
  }]
}

export function requireAvsKiosk(req, res, next) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' })
  try {
    req.user = verifyToken(h.slice(7))
    if (req.user.role !== 'avs_kiosk') return res.status(403).json({ error: 'AVS kiosk token gerekli' })
    next()
  } catch {
    res.status(401).json({ error: 'Geçersiz token' })
  }
}

export function requireKioskOrStaff(req, res, next) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' })
  try {
    req.user = verifyToken(h.slice(7))
    if (req.user.role !== 'kiosk' && !STAFF_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: 'Kiosk veya personel token gerekli' })
    }
    next()
  } catch {
    res.status(401).json({ error: 'Geçersiz token' })
  }
}

// İstasyon kimlik doğrulama (insansız cihaz): X-Station-Key header'daki raw key,
// aktif scan_stations.api_key_hash (bcrypt) ile karşılaştırılır. JWT'den bağımsız.
// İstasyon sayısı az olduğundan aktif istasyonlar üzerinde lineer bcrypt karşılaştırma yeterli.
export function requireStation(req, res, next) {
  const key = req.headers['x-station-key']
  if (!key || typeof key !== 'string') return res.status(401).json({ error: 'İstasyon anahtarı gerekli' })
  try {
    const stations = getDB().prepare('SELECT * FROM scan_stations WHERE is_active = 1').all()
    const match = stations.find(s => bcrypt.compareSync(key, s.api_key_hash))
    if (!match) return res.status(401).json({ error: 'Geçersiz istasyon anahtarı' })
    req.station = match
    next()
  } catch {
    res.status(500).json({ error: 'İstasyon doğrulama hatası' })
  }
}
