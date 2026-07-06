import { verifyToken } from '../../shared/auth/service.js'
import { logger } from '../../shared/logger.js'

const MOBILE_ROLES = new Set(['housekeeper', 'technical', 'laundry', 'shift_supervisor', 'campus_manager'])

export function requireMobile(...roles) {
  const allowed = roles.length ? new Set(roles) : MOBILE_ROLES
  return (req, res, next) => {
    const h = req.headers.authorization
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' })
    try {
      req.user = verifyToken(h.slice(7))
      if (!allowed.has(req.user.role)) return res.status(403).json({ error: 'Yetkisiz' })
      next()
    } catch (e) {
      logger.warn('[MobileAuth] Token verification failed:', e.message)
      res.status(401).json({ error: 'Geçersiz token' })
    }
  }
}
