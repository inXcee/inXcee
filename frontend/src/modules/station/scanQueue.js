import { enqueue, getBlob, getQueue, updateQueueItem } from '../../shared/utils/offlineDB.js'

const LEGACY_KEY = 'yys_station_scan_queue'
const ACTION_TYPE = 'station_scan'

export async function migrateLegacyStationQueue() {
  let legacy = []
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]')
    legacy = Array.isArray(parsed) ? parsed : []
  } catch {
    return { migrated: 0, failed: 1 }
  }
  if (!legacy.length) return { migrated: 0, failed: 0 }
  let migrated = 0
  for (const entry of legacy) {
    try {
      await enqueue(ACTION_TYPE, entry, [], {
        idempotencyKey: entry.client_action_id || `legacy-station-${entry.scanned_at || migrated}`,
        occurredAt: entry.scanned_at || new Date().toISOString(),
      })
      migrated += 1
    } catch {
      return { migrated, failed: legacy.length - migrated }
    }
  }
  localStorage.removeItem(LEGACY_KEY)
  return { migrated, failed: 0 }
}

export async function loadQueue() {
  return (await getQueue()).filter(item => item.type === ACTION_TYPE)
}

export async function enqueueScan({ raw_uid, meal_type = null, photo = null, station = null }) {
  const clientActionId = globalThis.crypto?.randomUUID?.() || `station-${Date.now()}-${Math.random().toString(16).slice(2)}`
  await enqueue(ACTION_TYPE, {
    raw_uid,
    meal_type,
    scanned_at: new Date().toISOString(),
    client_action_id: clientActionId,
  }, photo ? [photo] : [], {
    idempotencyKey: clientActionId,
    deviceId: station?.device_id || (station?.id ? `station:${station.id}` : null),
  })
  return (await loadQueue()).length
}

export async function queueLength() {
  return (await loadQueue()).length
}

export async function flushQueue(stationKey, fetcher = (...args) => fetch(...args)) {
  const queue = await loadQueue()
  if (queue.length === 0) return { sent: 0, conflicts: 0, rejected: 0, remaining: 0 }
  let sent = 0
  let conflicts = 0
  let rejected = 0
  for (const item of queue.filter(entry => ['pending', 'sending'].includes(entry.status || 'pending'))) {
    try {
      await updateQueueItem(item.id, { status: 'sending', last_attempt_at: new Date().toISOString() })
      const formData = new FormData()
      formData.append('raw_uid', item.payload.raw_uid)
      if (item.payload.meal_type) formData.append('meal_type', item.payload.meal_type)
      formData.append('scanned_at', item.payload.scanned_at)
      formData.append('client_action_id', item.payload.client_action_id || item.id)
      const photo = item.blobIds?.[0] ? await getBlob(item.blobIds[0]) : null
      if (photo) formData.append('photo', photo, 'scan.jpg')
      const response = await fetcher('/api/stations/scan', {
        method: 'POST',
        headers: { 'X-Station-Key': stationKey, 'X-Idempotency-Key': item.id },
        body: formData,
      })
      if (response.ok) {
        let serverResult = null
        try { serverResult = await response.clone().json() } catch { /* gövde opsiyonel */ }
        await updateQueueItem(item.id, { status: 'synced', error: null, server_result: serverResult })
        sent += 1
        continue
      }
      const status = response.status === 409 ? 'conflict' : response.status >= 400 && response.status < 500 ? 'rejected' : 'pending'
      await updateQueueItem(item.id, { status, retries: (item.retries || 0) + 1, error: `HTTP ${response.status}` })
      if (status === 'conflict') conflicts += 1
      if (status === 'rejected') rejected += 1
    } catch (error) {
      const retries = (item.retries || 0) + 1
      await updateQueueItem(item.id, {
        status: retries >= 3 ? 'manual_review' : 'pending',
        retries,
        error: error?.message || 'Ağ hatası',
        last_attempt_at: new Date().toISOString(),
      })
      break
    }
  }
  return { sent, conflicts, rejected, remaining: (await loadQueue()).length }
}
