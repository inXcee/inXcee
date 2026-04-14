import { verifyToken } from './service.js'

const STAFF_ROLES = new Set(['campus_manager', 'shift_supervisor', 'technical', 'laundry', 'housekeeper'])

export function requireAuth(req, res, next) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' })
  try {
    req.user = verifyToken(h.slice(7))
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
