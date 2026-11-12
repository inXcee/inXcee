// Ajan anahtarıyla gelen her /api isteğinin ön kapısı. Rol kuralları uçlarda aynen çalışır; burası yalnız
// ajana özgü üç şeyi yapar: (1) salt-okur anahtarı yazmadan alıkoyar, (2) ajanın hiç dokunmaması gereken
// birkaç ucu kapatır, (3) ajanın yaptığı her yazmayı denetim günlüğüne (module='agent') düşer.
import { agentKeyFromRequest, verifyAgentKey } from '../../shared/auth/agentKeys.js'
import { logAudit } from '../../shared/audit.js'

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Ajanın çağıramayacağı uçlar (yol /api'ye göre, küçük harf). Gerekçe: kimlik bilgisi/oturum yönetimi,
// kendi anahtarını çoğaltma, sahibin kişisel alanları ve geri dönüşü olmayan veritabanı işlemleri
// bir sohbet mesajıyla (ya da mesaja gömülü bir talimatla) tetiklenememeli.
const BLOCKED = [
  { test: (p, m) => p.startsWith('/auth/') && !(m === 'GET' && p === '/auth/me'), reason: 'Oturum, şifre ve 2FA işlemleri ajan anahtarıyla yapılamaz' },
  { test: (p, m) => p.startsWith('/mobile/auth/') && !READ_METHODS.has(m), reason: 'Mobil PIN işlemleri ajan anahtarıyla yapılamaz' },
  { test: p => p === '/agent/keys' || p.startsWith('/agent/keys/'), reason: 'Ajan anahtarları yalnız web oturumundan yönetilir' },
  { test: p => p === '/hermes' || p.startsWith('/hermes/'), reason: 'Sesli Hermes uçları ajana kapalıdır' },
  { test: p => p === '/pf' || p.startsWith('/pf/'), reason: 'Özel finans kasası ajan anahtarıyla değil kendi anahtarıyla (X-PF-Key; Hermes\'te `yys kasa`) açılır' },
  { test: (p, m) => p === '/backup/restore' || (m === 'DELETE' && p.startsWith('/backup/')), reason: 'Yedek geri yükleme/silme yalnız web oturumundan yapılır' },
]

function normalizedPath(req) {
  let p = req.path || '/'
  try { p = decodeURIComponent(p) } catch { /* bozuk kodlama: ham yol üzerinden denetle */ }
  p = p.toLowerCase().replace(/\/{2,}/g, '/')
  return p.length > 1 ? p.replace(/\/+$/, '') : p
}

export function agentBlockReason(path, method) {
  return BLOCKED.find(rule => rule.test(path, method))?.reason || null
}

export function agentGate(req, res, next) {
  const raw = agentKeyFromRequest(req)
  if (!raw) return next()
  let user
  try { user = verifyAgentKey(raw) } catch (e) {
    return res.status(401).json({ error: e.message, code: 'AGENT_KEY_INVALID' })
  }
  req.agentKey = user.agent
  const path = normalizedPath(req)
  const reason = agentBlockReason(path, req.method)
  if (reason) return res.status(403).json({ error: reason, code: 'AGENT_BLOCKED' })
  if (!READ_METHODS.has(req.method)) {
    if (user.agent.access !== 'write') {
      return res.status(403).json({ error: 'Bu ajan anahtarı salt-okur; değişiklik yapamaz', code: 'AGENT_READ_ONLY' })
    }
    res.on('finish', () => {
      logAudit(user.id, `${req.method} ${req.baseUrl}${req.path}`.slice(0, 240), 'agent', user.agent.key_id,
        `anahtar=${user.agent.name} durum=${res.statusCode}`)
    })
  }
  next()
}
