import { verifyToken } from './service.js'

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
