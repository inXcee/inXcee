const DB_NAME = 'yys-db'
const DB_VERSION = 1
let _db = null
// Blob referans önbelleği — fake-indexeddb serialize eder, toBe testi için orijinali sakla
const _blobCache = new Map()

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = ({ target }) => {
      const db = target.result
      if (!db.objectStoreNames.contains('offline_queue'))
        db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('offline_blobs'))
        db.createObjectStore('offline_blobs', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('form_drafts'))
        db.createObjectStore('form_drafts', { keyPath: 'key' })
    }
    req.onsuccess = ({ target }) => { _db = target.result; resolve(_db) }
    req.onerror = () => reject(req.error)
  })
}

function p(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueue(type, payload, blobs = []) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const stores = blobs.length > 0 ? ['offline_queue', 'offline_blobs'] : ['offline_queue']
    const tx = db.transaction(stores, 'readwrite')
    const qStore = tx.objectStore('offline_queue')

    if (blobs.length === 0) {
      const req = qStore.add({ type, payload, blobIds: [], ts: Date.now(), retries: 0 })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      return
    }

    const bStore = tx.objectStore('offline_blobs')
    const blobIds = new Array(blobs.length)
    let pending = blobs.length

    blobs.forEach((blob, i) => {
      const req = bStore.add({ blob })
      req.onsuccess = () => {
        const blobId = req.result
        _blobCache.set(blobId, blob)
        blobIds[i] = blobId
        if (--pending === 0) {
          const qReq = qStore.add({ type, payload, blobIds, ts: Date.now(), retries: 0 })
          qReq.onsuccess = () => resolve(qReq.result)
          qReq.onerror = () => reject(qReq.error)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function dequeue(id) {
  const db = await openDB()
  const item = await new Promise((resolve, reject) => {
    const tx = db.transaction('offline_queue', 'readonly')
    const req = tx.objectStore('offline_queue').get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  if (!item) return
  await new Promise((resolve, reject) => {
    const stores = (item.blobIds?.length > 0) ? ['offline_queue', 'offline_blobs'] : ['offline_queue']
    const tx = db.transaction(stores, 'readwrite')
    item.blobIds.forEach(bid => {
      tx.objectStore('offline_blobs').delete(bid)
      _blobCache.delete(bid)
    })
    tx.objectStore('offline_queue').delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getQueue() {
  const db = await openDB()
  return p(db.transaction('offline_queue', 'readonly').objectStore('offline_queue').getAll())
}

export async function getBlob(id) {
  if (_blobCache.has(id)) return _blobCache.get(id)
  const db = await openDB()
  const record = await p(db.transaction('offline_blobs', 'readonly').objectStore('offline_blobs').get(id))
  return record?.blob ?? null
}

export async function updateRetries(id, retries) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_queue', 'readwrite')
    const store = tx.objectStore('offline_queue')
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      if (!getReq.result) { resolve(); return }
      const putReq = store.put({ ...getReq.result, retries })
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

export async function saveDraft(key, data) {
  const db = await openDB()
  return p(db.transaction('form_drafts', 'readwrite').objectStore('form_drafts').put({ key, data, ts: Date.now() }))
}

export async function loadDraft(key) {
  const db = await openDB()
  const record = await p(db.transaction('form_drafts', 'readonly').objectStore('form_drafts').get(key))
  return record?.data ?? null
}

export async function clearDraft(key) {
  const db = await openDB()
  return p(db.transaction('form_drafts', 'readwrite').objectStore('form_drafts').delete(key))
}

// Yalnızca testlerde kullan — modül state'ini ve DB'yi sıfırlar
export function _resetForTests() {
  _blobCache.clear()
  return new Promise(resolve => {
    if (_db) { _db.close(); _db = null }
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}
