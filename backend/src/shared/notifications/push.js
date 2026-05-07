// Web Push notification servisi.
//
// VAPID anahtarlari env'den okunur (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT). Anahtar yoksa push silently disabled — uygulama calisir
// ama push gonderilmez.
//
// generate-vapid-keys.js ile uretilir, .env'e elle eklenir.

import webpush from 'web-push'
import { getDB } from '../db/index.js'

const PUBLIC = process.env.VAPID_PUBLIC_KEY
const PRIVATE = process.env.VAPID_PRIVATE_KEY
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:berkayinxce@gmail.com'

let configured = false
if (PUBLIC && PRIVATE) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE)
    configured = true
  } catch (e) {
    console.error('[Push] VAPID konfigurasyon hatasi:', e.message)
  }
}

export function isPushConfigured() {
  return configured
}

export function getVapidPublicKey() {
  return PUBLIC || null
}

export function saveSubscription({ userId, endpoint, p256dh, auth, userAgent }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO push_subscriptions(user_id, endpoint, p256dh_key, auth_key, user_agent)
    VALUES(?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id=excluded.user_id,
      p256dh_key=excluded.p256dh_key,
      auth_key=excluded.auth_key,
      user_agent=excluded.user_agent,
      last_seen_at=datetime('now')
  `).run(userId, endpoint, p256dh, auth, userAgent || null)
}

export function deleteSubscription(endpoint) {
  const db = getDB()
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint)
}

export async function sendPushToUser(userId, payload) {
  if (!configured) return { sent: 0, skipped: 'not_configured' }
  const db = getDB()
  const subs = db.prepare('SELECT id, endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_id=?').all(userId)
  return await sendToSubscriptions(subs, payload)
}

export async function sendPushToRole(role, payload) {
  if (!configured) return { sent: 0, skipped: 'not_configured' }
  const db = getDB()
  const subs = db.prepare(`
    SELECT ps.id, ps.endpoint, ps.p256dh_key, ps.auth_key
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    WHERE u.role=?
  `).all(role)
  return await sendToSubscriptions(subs, payload)
}

async function sendToSubscriptions(subs, payload) {
  if (subs.length === 0) return { sent: 0 }
  const db = getDB()
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload)
  let sent = 0
  let removed = 0
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } },
        json,
      )
      sent++
    } catch (e) {
      // 404 / 410 = subscription expired veya kullanici izni iptal — sil
      if (e.statusCode === 404 || e.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(s.id)
        removed++
      } else {
        console.error('[Push] gonderim hatasi:', e.statusCode, e.body || e.message)
      }
    }
  }))
  return { sent, removed }
}
