import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'
import { verifyToken } from './service.js'
import { getDB } from '../db/index.js'
import { avsRoleGroup } from './avsRoles.js'

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

export function requireLaundryKioskOperator(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role === 'campus_manager') {
      req.laundryOperator = {
        type: 'user',
        id: req.user.id || req.user.userId,
        name: req.user.full_name || 'Kampüs yöneticisi',
      }
      return next()
    }
    if (req.user.role !== 'avs_kiosk' || !req.user.workerId) {
      return res.status(403).json({ error: 'Çamaşır kiosk yetkisi gerekli' })
    }
    try {
      const worker = getDB().prepare(`
        SELECT s.id, s.full_name, d.name AS department_name
        FROM staff s
        LEFT JOIN departments d ON d.id=s.department_id
        WHERE s.id=? AND s.is_active=1
      `).get(req.user.workerId)
      if (!worker || avsRoleGroup(worker.department_name) !== 'laundry') {
        return res.status(403).json({ error: 'Bu ekran yalnız çamaşırhane personeli içindir' })
      }
      req.laundryOperator = { type: 'worker', id: worker.id, name: worker.full_name }
      return next()
    } catch {
      return res.status(500).json({ error: 'Yetki doğrulanamadı' })
    }
  })
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

// Kiosk cihaz anahtarı yüksek entropili ve yalnız kayıt anında gösterilir.
// Sunucuda raw anahtar değil SHA-256 özeti tutulur; iptal edilmiş cihaz kabul edilmez.
export function requireKioskDevice(req, res, next) {
  const key = req.headers['x-kiosk-device-key']
  if (!key || typeof key !== 'string') return res.status(401).json({ error: 'Kiosk cihaz anahtarı gerekli' })
  try {
    const tokenHash = createHash('sha256').update(key).digest('hex')
    const device = getDB().prepare(`
      SELECT * FROM kiosk_devices
      WHERE token_hash=? AND is_active=1 AND status<>'revoked'
    `).get(tokenHash)
    if (!device) return res.status(401).json({ error: 'Geçersiz kiosk cihaz anahtarı' })
    req.kioskDevice = device
    next()
  } catch {
    res.status(500).json({ error: 'Kiosk cihaz doğrulama hatası' })
  }
}
