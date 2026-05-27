// Job handler map: { 'job.type': async (payload, ctx) => result }
// Hata firlatirsa retry edilir. err.permanent=true ise retry edilmez (is bitti say).
// Yeni handler eklemek icin bu map'e satir ekle.

import webpush from 'web-push'
import { getDB } from '../db/index.js'
import { logger } from '../logger.js'

const PUBLIC = process.env.VAPID_PUBLIC_KEY
const PRIVATE = process.env.VAPID_PRIVATE_KEY
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:berkayinxce@gmail.com'
if (PUBLIC && PRIVATE) {
  try { webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE) }
  catch (e) { logger.error('[Jobs/push] VAPID hata:', e.message) }
}

function permanentError(message) {
  const e = new Error(message)
  e.permanent = true
  return e
}

// Tablo adı sabit (kullanıcı girdisi değil) — push_subscriptions | avs_push_subscriptions.
async function deliverPush(table, { subscriptionId, payload }) {
  const db = getDB()
  const sub = db.prepare(
    `SELECT id, endpoint, p256dh_key, auth_key FROM ${table} WHERE id=?`
  ).get(subscriptionId)
  if (!sub) throw permanentError('subscription not found')

  const json = typeof payload === 'string' ? payload : JSON.stringify(payload)
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
      json,
    )
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      db.prepare(`DELETE FROM ${table} WHERE id=?`).run(sub.id)
      throw permanentError(`subscription gone (${e.statusCode})`)
    }
    throw e  // transient — retry
  }
}

const sendPushJob = (payload) => deliverPush('push_subscriptions', payload)
const sendWorkerPushJob = (payload) => deliverPush('avs_push_subscriptions', payload)

export const handlers = {
  'push.send': sendPushJob,
  'push.worker': sendWorkerPushJob,
}
