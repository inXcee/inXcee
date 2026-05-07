const CACHE_NAME = 'yys-v1'
const PRECACHE = ['/', '/index.html']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const { request } = e

  // Skip non-GET and API requests
  if (request.method !== 'GET' || request.url.includes('/api/')) return

  e.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
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
