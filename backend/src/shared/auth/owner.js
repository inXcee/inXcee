// Sistem SAHİBİ (users.is_owner=1) — kişisel özellikler (özel finans kasası, sesli Hermes) yalnız ona açık.
// Erişim ROL ile değil KULLANICI bayrağıyla verilir: canlıda birden çok müdür aynı rolde (campus_manager);
// bayrak yalnız migration/elle SQL ile verilir, kullanıcı yönetiminden değiştirilemez (bkz. 111_owner_flag.sql).
import { verifyToken } from './service.js'
import { getDB } from '../db/index.js'

const COOKIE_NAME = 'yys_session'

// Çerez (web) ya da Bearer (API/test) oturumu → token yükü; geçersiz/yoksa null. Hata fırlatmaz.
export function sessionUser(req) {
  const h = req.headers.authorization
  const token = req.cookies?.[COOKIE_NAME] || (h?.startsWith('Bearer ') ? h.slice(7) : null)
  if (!token) return null
  try { return verifyToken(token) } catch { return null }
}

export function isOwner(user) {
  // Kiosk/cihaz token'larının id'si users tablosuyla çakışabilir → rol de şart.
  if (!user?.id || user.role !== 'campus_manager') return false
  return Boolean(getDB().prepare('SELECT 1 FROM users WHERE id=? AND is_owner=1 AND is_active=1').get(user.id))
}
