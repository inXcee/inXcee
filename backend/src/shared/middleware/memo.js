// In-memory TTL memoization — sadece read-only fonksiyonlar için.
// 100 user'ın aynı anda dashboard refresh etmesi 100 SQL set'i değil 1 set olsun.
// Test ortamında devre dışı (deterministik test için).
const cache = new Map()

export function memoize(fn, ttlMs) {
  return (...args) => {
    if (process.env.NODE_ENV === 'test') return fn(...args)
    const key = `${fn.name}:${JSON.stringify(args)}`
    const hit = cache.get(key)
    const now = Date.now()
    if (hit && hit.expires > now) return hit.value
    const value = fn(...args)
    cache.set(key, { value, expires: now + ttlMs })
    return value
  }
}

// Belirli bir fn için tüm cache entry'leri sil — yazı sonrası invalidation.
export function invalidate(fnName) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${fnName}:`)) cache.delete(key)
  }
}

export function clearAllMemo() {
  cache.clear()
}
