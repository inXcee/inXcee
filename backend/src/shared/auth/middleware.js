import { verifyToken } from './service.js'

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
    next()
  } catch {
    res.status(401).json({ error: 'Geçersiz token' })
  }
}
