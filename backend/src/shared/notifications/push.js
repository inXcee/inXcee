// Web Push notification servisi.
//
// VAPID anahtarlari env'den okunur (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT). Anahtar yoksa push silently disabled — uygulama calisir
// ama push gonderilmez.
//
// Gonderim modeli: dogrudan webpush API yerine job_queue'ya enqueue edilir.
// Worker arka planda (shared/jobs/) bireysel subscription'lari isler — request bloke olmaz.
// 404/410 (subscription gone) durumunda DB'den silinmesi handler'da olur.

import { getDB } from '../db/index.js'
import { enqueue } from '../jobs/index.js'

const PUBLIC = process.env.VAPID_PUBLIC_KEY
const PRIVATE = process.env.VAPID_PRIVATE_KEY

// VAPID setup'i handlers.js icinde yapilir (worker sendNotification cagirirken kullanir).
// Burada sadece configured flag'i tutuyoruz — VAPID key yoksa enqueue da yapmayalim.
const configured = !!(PUBLIC && PRIVATE)

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

// API surface eskisi gibi async — geriye uyumlu. Donus deger {sent, removed}
// shape'i korunur ama "sent" artik enqueue edilen job sayisi (asil gonderim worker'da),
// "removed" 0 (subscription temizligi handler'da, worker calistiginda).
export async function sendPushToUser(userId, payload) {
  if (!configured) return { sent: 0, skipped: 'not_configured' }
  const db = getDB()
  const subs = db.prepare('SELECT id FROM push_subscriptions WHERE user_id=?').all(userId)
  for (const s of subs) enqueue('push.send', { subscriptionId: s.id, payload })
  return { sent: subs.length, removed: 0 }
}

export async function sendPushToRole(role, payload) {
  if (!configured) return { sent: 0, skipped: 'not_configured' }
  const db = getDB()
  const subs = db.prepare(`
    SELECT ps.id
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    WHERE u.role=?
  `).all(role)
  for (const s of subs) enqueue('push.send', { subscriptionId: s.id, payload })
  return { sent: subs.length, removed: 0 }
}

// ── AVS kiosk worker (staff) abonelikleri — ayrı tablo + 'push.worker' job tipi ──

export function saveWorkerSubscription({ workerId, endpoint, p256dh, auth, userAgent }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO avs_push_subscriptions(worker_id, endpoint, p256dh_key, auth_key, user_agent)
    VALUES(?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET
      worker_id=excluded.worker_id,
      p256dh_key=excluded.p256dh_key,
      auth_key=excluded.auth_key,
      user_agent=excluded.user_agent,
      last_seen_at=datetime('now')
  `).run(workerId, endpoint, p256dh, auth, userAgent || null)
}

export function deleteWorkerSubscription(endpoint) {
  getDB().prepare('DELETE FROM avs_push_subscriptions WHERE endpoint=?').run(endpoint)
}

// AVS personeline push — telefonda abone olduysa. Paylaşılan terminalde abonelik
// olmaz, dolayısıyla no-op. VAPID yoksa hiç enqueue edilmez.
export async function sendPushToWorker(workerId, payload) {
  if (!configured) return { sent: 0, skipped: 'not_configured' }
  const db = getDB()
  const subs = db.prepare('SELECT id FROM avs_push_subscriptions WHERE worker_id=?').all(workerId)
  for (const s of subs) enqueue('push.worker', { subscriptionId: s.id, payload })
  return { sent: subs.length, removed: 0 }
}
