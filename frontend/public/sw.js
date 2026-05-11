const STATIC_CACHE = 'yys-static-v2'
const API_CACHE = 'yys-api-v2'
const PRECACHE = ['/', '/index.html']

// API endpoint'leri ki cache'lenmez:
//   - SSE streaming (canli baglanti)
//   - Auth (security — token leak olmasin)
//   - Push subscribe (state degisikligi)
const NO_CACHE_API = [
  '/api/notifications/stream',
  '/api/mobile/auth',
  '/api/auth',
  '/api/push',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== STATIC_CACHE && k !== API_CACHE)
        .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const { request } = e

  // Sadece GET istekleri cache'lenir (POST/PATCH/DELETE offline queue tarafindan halledilir)
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isApi = url.pathname.startsWith('/api/')
  const isExcludedApi = NO_CACHE_API.some(p => url.pathname.startsWith(p))

  if (isExcludedApi) return // SW intercept etmesin

  if (isApi) {
    // API GET: network-first, cache fallback (offline'da son bilinen veriyi goster)
    e.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(API_CACHE).then(cache => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request).then(r => r || new Response(
          JSON.stringify({ error: 'Cevrimdisi - cache bos' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )))
    )
    return
  }

  // Statik asset (JS/CSS/HTML/img): network first, cache fallback
  e.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})

// Logout / kullanici degisikliginde cache temizleme - useMobileAuth icin
self.addEventListener('message', e => {
  if (e.data?.type === 'CLEAR_API_CACHE') {
    e.waitUntil(caches.delete(API_CACHE))
  }
})

// ── Web Push (Faz 3.b / M10) ─────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch { payload = { title: event.data.text() } }
  const title = payload.title || 'YYS Bildirim'
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.module || 'yys',
    data: { url: payload.url || '/mobile', id: payload.id, module: payload.module },
    requireInteraction: payload.type === 'critical',
    vibrate: payload.type === 'critical' ? [200, 100, 200] : [80],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/mobile'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(targetUrl) && 'focus' in c) return c.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
