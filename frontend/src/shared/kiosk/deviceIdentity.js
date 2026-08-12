const DB_NAME = 'yys-kiosk-device'
const DB_VERSION = 1
const STORE_NAME = 'identity'
const CURRENT_KEY = 'current'
let cachedIdentity
let identityPromise

function openDeviceDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB kullanılamıyor'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Cihaz veritabanı açılamadı'))
  })
}

function runTransaction(mode, operation) {
  return openDeviceDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const request = operation(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error || new Error('Cihaz kimliği işlemi başarısız'))
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => db.close()
  }))
}

export function readDeviceIdentity() {
  return runTransaction('readonly', store => store.get(CURRENT_KEY))
}

export function readDeviceIdentityCached() {
  if (cachedIdentity !== undefined) return Promise.resolve(cachedIdentity)
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!identityPromise) {
    identityPromise = readDeviceIdentity()
      .then(identity => {
        cachedIdentity = identity || null
        identityPromise = null
        return cachedIdentity
      })
      .catch(() => {
        cachedIdentity = null
        identityPromise = null
        return null
      })
  }
  return identityPromise
}

export function saveDeviceIdentity(identity) {
  cachedIdentity = { ...identity, saved_at: new Date().toISOString() }
  return runTransaction('readwrite', store => store.put({
    ...cachedIdentity,
  }, CURRENT_KEY))
}

export function clearDeviceIdentity() {
  cachedIdentity = null
  if (typeof indexedDB === 'undefined') return Promise.resolve()
  return runTransaction('readwrite', store => store.delete(CURRENT_KEY))
}

export function detectDeviceCapabilities() {
  if (typeof window === 'undefined') return {}
  return {
    indexed_db: typeof indexedDB !== 'undefined',
    web_crypto: Boolean(globalThis.crypto?.subtle),
    service_worker: 'serviceWorker' in navigator,
    camera: Boolean(navigator.mediaDevices?.getUserMedia),
    touch: navigator.maxTouchPoints > 0,
    online: navigator.onLine,
  }
}

export function clearAuthenticatedApiCache() {
  if (typeof navigator === 'undefined') return
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_API_CACHE' })
}
