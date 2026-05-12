import { getDB } from '../db/index.js'
import { isNotificationEnabledForUser } from '../../modules/notification-prefs/service.js'
import { sendPushToUser, sendPushToRole, isPushConfigured } from './push.js'
import { sendWhatsAppToUser, isWhatsAppConfigured } from './whatsapp-send.js'
import { isValidEventKind, moduleFromEventKind, DEFAULT_SEVERITY, renderLinkTemplate } from './events.js'

const MAX_SSE_CLIENTS = 500
const MAX_PER_USER = 4 // bir user max 4 sekme; fazlası eski bağlantıyı düşürür
// Heartbeat: Nginx/proxy idle bağlantıyı 60-90s sonra koparıyor.
// 30s'de bir comment frame (`:\n\n`) gönder — istemciye görünmez ama bağlantı canlı kalır.
const HEARTBEAT_MS = 30_000
// Map<res, {res, userId, role, hb}> — userId/role ile filtrelenmiş SSE broadcast için
const sseClients = new Map()

const MANAGEMENT_ROLES = new Set(['campus_manager', 'shift_supervisor'])

export function addSSEClient(res, userId, role) {
  // Aynı user'ın eski bağlantılarını say; limit aşıldıysa en eskisini düşür
  let userConnections = []
  for (const [key, val] of sseClients) {
    if (val.userId === userId) userConnections.push(key)
  }
  while (userConnections.length >= MAX_PER_USER) {
    const oldest = userConnections.shift()
    const meta = sseClients.get(oldest)
    if (meta?.hb) clearInterval(meta.hb)
    try { oldest.end() } catch { /* ignore */ }
    sseClients.delete(oldest)
  }

  // Global limit — en eskiyi düşür (fairness için sıralı Map iteration)
  if (sseClients.size >= MAX_SSE_CLIENTS) {
    const oldest = sseClients.keys().next().value
    const meta = sseClients.get(oldest)
    if (meta?.hb) clearInterval(meta.hb)
    try { oldest.end() } catch { /* bağlantı zaten kapalı */ }
    sseClients.delete(oldest)
  }

  // Heartbeat — 30s'de bir comment frame; client'a görünmez ama proxy timeout'u önler
  const hb = setInterval(() => {
    try { res.write(':\n\n') } catch {
      clearInterval(hb)
      sseClients.delete(res)
    }
  }, HEARTBEAT_MS)
  // Test ortamında Node event loop'u kilitlemesin
  if (typeof hb.unref === 'function') hb.unref()

  sseClients.set(res, { res, userId, role, hb })
}
export function removeSSEClient(res) {
  const meta = sseClients.get(res)
  if (meta?.hb) clearInterval(meta.hb)
  sseClients.delete(res)
}

export function createNotification({
  message, type, severity, module, target_role, target_user_id, dedup_key,
  event_kind, entity_type, entity_id, link,
}) {
  const db = getDB()

  // event_kind whitelist (varsa kontrol et)
  if (event_kind && !isValidEventKind(event_kind)) {
    console.warn('[Notif] geçersiz event_kind reddedildi:', event_kind)
    return null
  }
  // Module çıkarımı (verilmediyse event_kind'tan)
  if (!module && event_kind) module = moduleFromEventKind(event_kind)
  // Severity: önce explicit, sonra type (geriye uyum), sonra event_kind default, sonra 'info'
  const effSeverity = severity || type || (event_kind && DEFAULT_SEVERITY[event_kind]) || 'info'
  // type kolonu hâlâ CHECK constraint'li — severity ile aynı tutalım (geriye uyum)
  const effType = effSeverity
  // Link otomatik render
  const effLink = link || (event_kind ? renderLinkTemplate(event_kind, { entity_id }) : null)

  if (dedup_key) {
    const existing = db.prepare(
      "SELECT id FROM notifications WHERE dedup_key=? AND date(created_at)=date('now')"
    ).get(dedup_key)
    if (existing) return null
  }

  const r = db.prepare(
    `INSERT INTO notifications
     (message, type, severity, module, target_role, target_user_id, dedup_key,
      event_kind, entity_type, entity_id, link)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    message, effType, effSeverity, module || null,
    target_role || null, target_user_id || null, dedup_key || null,
    event_kind || null, entity_type || null,
    entity_id != null ? entity_id : null, effLink || null,
  )

  const notif = db.prepare('SELECT * FROM notifications WHERE id=?').get(r.lastInsertRowid)
  sseClients.forEach(({ res: client, userId: uid, role }, resKey) => {
    if (notif.target_user_id && notif.target_user_id !== uid) return
    if (notif.target_role && notif.target_role !== role) return
    // Kullanıcı bu modül için bildirim almak istemiyorsa SSE'de de gönderme
    if (notif.module && !isNotificationEnabledForUser(uid, notif.module)) return
    try { client.write(`data: ${JSON.stringify(notif)}\n\n`) } catch { sseClients.delete(resKey) }
  })

  // Web Push (fire-and-forget — SSE pasifken kullaniciya bildirim ulastirir)
  if (isPushConfigured()) {
    const payload = {
      title: notif.message, type: notif.type, severity: notif.severity,
      module: notif.module, id: notif.id,
      event_kind: notif.event_kind, url: notif.link,
    }
    if (notif.target_user_id) {
      sendPushToUser(notif.target_user_id, payload).catch(e => console.error('[Push] user:', e.message))
    } else if (notif.target_role) {
      sendPushToRole(notif.target_role, payload).catch(e => console.error('[Push] role:', e.message))
    }
  }

  // WhatsApp — sadece critical severity + targeted user icin (fire-and-forget)
  // Faz 9'da kanal tercih matrix'ine bağlanacak
  if (isWhatsAppConfigured() && notif.severity === 'critical' && notif.target_user_id) {
    sendWhatsAppToUser(notif.target_user_id, `[YYS] ${notif.message}`)
      .catch(e => console.error('[WA] user:', e.message))
  }

  return notif
}

export function getNotifications(userId, role) {
  const db = getDB()
  const rows = db.prepare(`
    SELECT * FROM notifications
    WHERE (target_user_id=? OR target_role=? OR (target_user_id IS NULL AND target_role IS NULL))
    ORDER BY created_at DESC LIMIT 50
  `).all(userId, role)
  // Kullanıcı tercihlerine göre devre dışı modülleri filtrele
  return rows.filter(n => !n.module || isNotificationEnabledForUser(userId, n.module))
}

export function markRead(id) {
  const db = getDB()
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=?').run(id)
}

export function broadcastOccupancy() {
  const db = getDB()
  const blocks = db.prepare(`
    SELECT r.block,
      SUM(r.active_beds) as total_beds,
      COALESCE(SUM(cnt.c), 0) as occupied
    FROM rooms r
    LEFT JOIN (
      SELECT room_id, COUNT(*) as c FROM room_assignments WHERE check_out_at IS NULL GROUP BY room_id
    ) cnt ON cnt.room_id=r.id
    WHERE r.status='active'
    GROUP BY r.block
  `).all()

  const totals = blocks.reduce((acc, b) => {
    acc.total_beds += b.total_beds
    acc.occupied += b.occupied
    return acc
  }, { total_beds: 0, occupied: 0 })

  const data = { blocks, totals }
  const payload = `event: occupancy\ndata: ${JSON.stringify(data)}\n\n`

  // Doluluk verisi sadece yönetim rollerine gönderilir
  sseClients.forEach(({ res: client, role }, resKey) => {
    if (!MANAGEMENT_ROLES.has(role)) return
    try { client.write(payload) } catch { sseClients.delete(resKey) }
  })
}
