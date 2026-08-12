const DB_NAME = 'yys-db'
const DB_VERSION = 3
const QUEUE_STORE = 'offline_queue'
const BLOB_STORE = 'offline_blobs'
const DRAFT_STORE = 'form_drafts'
const KEY_STORE = 'crypto_keys'
const CURRENT_KEY = 'offline-aes-gcm-v1'

export const OFFLINE_QUEUE_WARNING = 400
export const OFFLINE_QUEUE_LIMIT = 500

let databasePromise = null
let cryptoKeyPromise = null
let enqueueSequence = 0
let offlineContext = {}
const blobCache = new Map()

export function setOfflineContext(context = {}) {
  offlineContext = { ...offlineContext, ...context }
}

export function clearOfflineContext() {
  offlineContext = {}
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB işlemi iptal edildi'))
  })
}

function openDB() {
  if (databasePromise) return databasePromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Güvenli çevrimdışı depolama bu cihazda kullanılamıyor'))
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const queueStore = db.objectStoreNames.contains(QUEUE_STORE)
        ? request.transaction.objectStore(QUEUE_STORE)
        : db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
      if (!queueStore.indexNames.contains('status')) queueStore.createIndex('status', 'status', { unique: false })
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      databasePromise = null
      reject(request.error)
    }
  })
  return databasePromise
}

function webCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error('Bu cihaz güvenli çevrimdışı şifrelemeyi desteklemiyor')
  return globalThis.crypto
}

async function getCryptoKey() {
  if (cryptoKeyPromise) return cryptoKeyPromise
  cryptoKeyPromise = (async () => {
    const db = await openDB()
    const existing = await requestResult(db.transaction(KEY_STORE, 'readonly').objectStore(KEY_STORE).get(CURRENT_KEY))
    if (existing) return existing
    const key = await webCrypto().subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const tx = db.transaction(KEY_STORE, 'readwrite')
    tx.objectStore(KEY_STORE).put(key, CURRENT_KEY)
    await transactionDone(tx)
    return key
  })().catch(error => {
    cryptoKeyPromise = null
    throw error
  })
  return cryptoKeyPromise
}

function randomId(prefix = 'offline') {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function blobBytes(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

function aadFor(id, type, schemaVersion = 1) {
  return new TextEncoder().encode(`${id}|${type}|${schemaVersion}`)
}

async function encryptBytes(bytes, aad) {
  const iv = webCrypto().getRandomValues(new Uint8Array(12))
  const encrypted = await webCrypto().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await getCryptoKey(), bytes)
  return { iv, encrypted }
}

async function decryptBytes(record, aad) {
  return webCrypto().subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv, additionalData: aad },
    await getCryptoKey(),
    record.encrypted,
  )
}

async function encryptJson(value, aad) {
  return encryptBytes(new TextEncoder().encode(JSON.stringify(value ?? null)), aad)
}

async function decryptJson(record, aad) {
  const bytes = await decryptBytes(record, aad)
  return JSON.parse(new TextDecoder().decode(bytes))
}

function notifyQueueChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('yys-queue-changed'))
}

async function rawQueue() {
  const db = await openDB()
  return requestResult(db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll())
}

async function activeQueueCount() {
  const db = await openDB()
  const transaction = db.transaction(QUEUE_STORE, 'readonly')
  const statusIndex = transaction.objectStore(QUEUE_STORE).index('status')
  const requests = ['pending', 'sending', 'conflict', 'rejected', 'manual_review']
    .map(status => requestResult(statusIndex.count(status)))
  const counts = await Promise.all(requests)
  return counts.reduce((total, count) => total + count, 0)
}

async function decryptQueueRecord(record) {
  if (!record.encrypted_payload) return record
  try {
    const payload = await decryptJson(record.encrypted_payload, aadFor(record.id, record.type, record.schema_version))
    return { ...record, payload, blobIds: record.blob_ids || [], encrypted_payload: undefined, blob_ids: undefined }
  } catch {
    return {
      ...record,
      payload: null,
      blobIds: record.blob_ids || [],
      status: 'manual_review',
      error: 'Şifreli kayıt çözülemedi; kayıt silinmedi',
      encrypted_payload: undefined,
      blob_ids: undefined,
    }
  }
}

export async function enqueue(type, payload, blobs = [], options = {}) {
  if (await activeQueueCount() >= OFFLINE_QUEUE_LIMIT) {
    throw new Error(`Çevrimdışı kuyruk üst sınıra ulaştı (${OFFLINE_QUEUE_LIMIT}); bağlantı kurulmadan yeni işlem alınamaz`)
  }

  const context = { ...offlineContext, ...options }
  const id = context.idempotencyKey || randomId(type)
  const schemaVersion = Number(context.schemaVersion || 1)
  const encryptedPayload = await encryptJson(payload, aadFor(id, type, schemaVersion))
  const blobIds = []
  const encryptedBlobs = []
  for (let index = 0; index < blobs.length; index += 1) {
    const blob = blobs[index]
    if (!blob) continue
    const blobId = `${id}:blob:${index}`
    const encrypted = await encryptBytes(await blobBytes(blob), aadFor(blobId, type, schemaVersion))
    blobIds.push(blobId)
    encryptedBlobs.push({ id: blobId, type, schema_version: schemaVersion, mime_type: blob.type || 'application/octet-stream', ...encrypted })
    blobCache.set(blobId, blob)
  }

  const db = await openDB()
  const stores = encryptedBlobs.length ? [QUEUE_STORE, BLOB_STORE] : [QUEUE_STORE]
  const tx = db.transaction(stores, 'readwrite')
  tx.objectStore(QUEUE_STORE).add({
    id,
    type,
    action_type: type,
    schema_version: schemaVersion,
    device_id: context.deviceId || null,
    principal: context.principal || null,
    occurred_at: context.occurredAt || new Date().toISOString(),
    created_at: new Date().toISOString(),
    created_order: Date.now() * 1000 + (enqueueSequence++ % 1000),
    status: 'pending',
    retries: 0,
    error: null,
    depends_on: context.dependsOn || null,
    blob_ids: blobIds,
    encrypted_payload: encryptedPayload,
  })
  for (const record of encryptedBlobs) tx.objectStore(BLOB_STORE).add(record)
  await transactionDone(tx)
  notifyQueueChanged()
  return id
}

export async function getQueue({ includeCompleted = false } = {}) {
  const records = await rawQueue()
  const visible = includeCompleted ? records : records.filter(record => record.status !== 'synced')
  const decrypted = await Promise.all(visible.map(decryptQueueRecord))
  return decrypted.sort((a, b) => (a.created_order || a.ts || 0) - (b.created_order || b.ts || 0))
}

export async function getQueueSummary() {
  const queue = await getQueue()
  const statuses = queue.reduce((result, item) => ({ ...result, [item.status || 'pending']: (result[item.status || 'pending'] || 0) + 1 }), {})
  return {
    total: queue.length,
    warning: queue.length >= OFFLINE_QUEUE_WARNING,
    blocked: queue.length >= OFFLINE_QUEUE_LIMIT,
    statuses,
  }
}

export async function updateQueueItem(id, changes = {}) {
  const allowed = ['status', 'retries', 'error', 'last_attempt_at', 'server_result']
  const safe = Object.fromEntries(Object.entries(changes).filter(([key]) => allowed.includes(key)))
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  const store = tx.objectStore(QUEUE_STORE)
  const current = await requestResult(store.get(id))
  if (current) store.put({ ...current, ...safe })
  await transactionDone(tx)
  notifyQueueChanged()
}

export async function updateRetries(id, retries) {
  return updateQueueItem(id, { retries, last_attempt_at: new Date().toISOString() })
}

export async function dequeue(id) {
  const db = await openDB()
  const existing = await requestResult(db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).get(id))
  if (!existing) return
  const stores = existing.blob_ids?.length ? [QUEUE_STORE, BLOB_STORE] : [QUEUE_STORE]
  const tx = db.transaction(stores, 'readwrite')
  tx.objectStore(QUEUE_STORE).delete(id)
  for (const blobId of existing.blob_ids || []) {
    tx.objectStore(BLOB_STORE).delete(blobId)
    blobCache.delete(blobId)
  }
  await transactionDone(tx)
  notifyQueueChanged()
}

export async function getBlob(id) {
  if (blobCache.has(id)) return blobCache.get(id)
  const db = await openDB()
  const record = await requestResult(db.transaction(BLOB_STORE, 'readonly').objectStore(BLOB_STORE).get(id))
  if (!record) return null
  if (record.blob) return record.blob
  try {
    const bytes = await decryptBytes(record, aadFor(record.id, record.type, record.schema_version))
    const blob = new Blob([bytes], { type: record.mime_type })
    blobCache.set(id, blob)
    return blob
  } catch {
    return null
  }
}

export async function saveDraft(key, data) {
  const db = await openDB()
  const encryptedData = await encryptJson(data, aadFor(key, 'draft', 1))
  const tx = db.transaction(DRAFT_STORE, 'readwrite')
  tx.objectStore(DRAFT_STORE).put({ key, encrypted_data: encryptedData, schema_version: 1, ts: Date.now() })
  await transactionDone(tx)
}

export async function loadDraft(key) {
  const db = await openDB()
  const record = await requestResult(db.transaction(DRAFT_STORE, 'readonly').objectStore(DRAFT_STORE).get(key))
  if (!record) return null
  if (!record.encrypted_data) return record.data ?? null
  try { return await decryptJson(record.encrypted_data, aadFor(key, 'draft', record.schema_version || 1)) }
  catch { return null }
}

export async function clearDraft(key) {
  const db = await openDB()
  const tx = db.transaction(DRAFT_STORE, 'readwrite')
  tx.objectStore(DRAFT_STORE).delete(key)
  await transactionDone(tx)
}

export async function _getRawQueueForTests() {
  return rawQueue()
}

export function _resetForTests() {
  blobCache.clear()
  enqueueSequence = 0
  offlineContext = {}
  cryptoKeyPromise = null
  return new Promise(resolve => {
    Promise.resolve(databasePromise).catch(() => null).then(db => db?.close()).finally(() => {
      databasePromise = null
      const request = indexedDB.deleteDatabase(DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  })
}
