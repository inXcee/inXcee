import {
  enqueue,
  getBlob,
  getQueue,
  updateQueueItem,
  OFFLINE_QUEUE_LIMIT,
  OFFLINE_QUEUE_WARNING,
} from '../../shared/utils/offlineDB.js'

const LEGACY_KEY = 'kiosk-offline-bags'
const ACTION_TYPE = 'laundry_intake'

export const MAX_QUEUE = OFFLINE_QUEUE_LIMIT
export const QUEUE_WARNING = OFFLINE_QUEUE_WARNING

export function dataUrlToBlob(dataUrl) {
  const [head, encoded] = String(dataUrl || '').split(',')
  const mime = (head?.match(/data:(.*?);/) || [])[1] || 'image/jpeg'
  const binary = atob(encoded || '')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

export async function migrateLegacyLaundryQueue() {
  let legacy = []
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]')
    legacy = Array.isArray(parsed) ? parsed : []
  } catch {
    return { migrated: 0, failed: 1 }
  }
  if (!legacy.length) return { migrated: 0, failed: 0 }

  const existing = new Set((await getQueue({ includeCompleted: true })).map(item => item.id))
  let migrated = 0
  for (const entry of legacy) {
    const payload = entry?.payload || {}
    const idempotencyKey = payload.client_request_id || `legacy-laundry-${entry.queued_at || migrated}`
    if (existing.has(idempotencyKey)) continue
    try {
      await enqueue(ACTION_TYPE, { ...payload, _label: entry.label || 'Eski çamaşır kabulü' }, [], {
        idempotencyKey,
        occurredAt: entry.queued_at || new Date().toISOString(),
      })
      migrated += 1
    } catch {
      return { migrated, failed: legacy.length - migrated }
    }
  }
  localStorage.removeItem(LEGACY_KEY)
  return { migrated, failed: 0 }
}

export async function listQueued() {
  const queue = await getQueue()
  return queue.filter(item => item.type === ACTION_TYPE)
}

export async function enqueueBag(entry, options = {}) {
  const { photoDataUrl, payload = {}, label = 'Çamaşır kabulü' } = entry
  const blobs = photoDataUrl ? [dataUrlToBlob(photoDataUrl)] : []
  await enqueue(ACTION_TYPE, { ...payload, _label: label }, blobs, {
    ...options,
    idempotencyKey: payload.client_request_id || options.idempotencyKey,
  })
  return (await listQueued()).length
}

export function buildBagFormData(payload, photo) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(payload || {})) {
    if (key.startsWith('_') || value === null || value === undefined || value === '') continue
    formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  }
  if (photo) formData.append('photo', typeof photo === 'string' ? dataUrlToBlob(photo) : photo, 'torba.jpg')
  return formData
}

export async function flushQueue(postFn) {
  const queue = await listQueued()
  let sent = 0
  const rejected = []
  const conflicts = []
  for (const item of queue.filter(entry => ['pending', 'sending'].includes(entry.status || 'pending'))) {
    try {
      await updateQueueItem(item.id, { status: 'sending', last_attempt_at: new Date().toISOString() })
      const photo = item.blobIds?.[0] ? await getBlob(item.blobIds[0]) : null
      const result = await postFn(buildBagFormData(item.payload, photo), item.id)
      await updateQueueItem(item.id, {
        status: 'synced',
        error: null,
        server_result: result?.data || { synced_at: new Date().toISOString() },
      })
      sent += 1
    } catch (error) {
      const retries = (item.retries || 0) + 1
      const httpStatus = error?.response?.status
      const status = httpStatus === 409
        ? 'conflict'
        : httpStatus >= 400 && httpStatus < 500
          ? 'rejected'
          : retries >= 3 ? 'manual_review' : 'pending'
      const reason = error?.response?.data?.error || error?.message || 'Senkronizasyon başarısız'
      await updateQueueItem(item.id, { status, retries, error: reason, last_attempt_at: new Date().toISOString() })
      if (status === 'conflict') conflicts.push({ label: item.payload?._label, error: reason })
      if (status === 'rejected' || status === 'manual_review') rejected.push({ label: item.payload?._label, error: reason, status })
      if (!httpStatus) break
    }
  }
  const remaining = await listQueued()
  return { sent, rejected, conflicts, remaining: remaining.length }
}
