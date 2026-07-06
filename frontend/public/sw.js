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

  // Cross-origin (Google Fonts, harita tile, CDN) SW'ye takılmasın: SW içinden
  // yapılan fetch SW'nin kendi CSP'sine (connect-src 'self') tabidir — sayfa
  // CSP'si o origin'e izin verse bile SW üzerinden geçen istek bloklanır.
  if (url.origin !== self.location.origin) return

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

// ── Web Push (A→Z Bildirim Faz 8) ────────────────────────────────────────
const SEV_ICON = { info: 'ℹ', warning: '⚠', critical: '🚨' }

self.addEventListener('push', event => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch { payload = { title: event.data.text() } }
  const severity = payload.severity || payload.type || 'info'
  const isCritical = severity === 'critical'
  const titlePrefix = SEV_ICON[severity] || ''
  const title = titlePrefix ? `${titlePrefix} ${payload.title || 'YYS Bildirim'}` : (payload.title || 'YYS Bildirim')
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.event_kind || payload.module || 'yys',
    renotify: isCritical, // kritik bildirimde aynı tag bile yeni gösterim
    data: {
      url: payload.url || '/notifications',
      id: payload.id, module: payload.module,
      event_kind: payload.event_kind, severity,
    },
    requireInteraction: isCritical,
    vibrate: isCritical ? [300, 100, 300, 100, 300] : [80],
    actions: payload.url ? [
      { action: 'open', title: 'Aç' },
      { action: 'read', title: 'Okundu' },
    ] : [
      { action: 'read', title: 'Okundu' },
    ],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  const action = event.action
  const data = event.notification.data || {}
  event.notification.close()

  if (action === 'read') {
    // Fire-and-forget okundu işaretleme (auth cookie/token tarayıcıdadır)
    event.waitUntil(
      fetch(`/api/notifications/${data.id}/read`, { method: 'PATCH', credentials: 'include' }).catch(() => {})
    )
    return
  }
  const targetUrl = data.url || '/notifications'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(targetUrl) && 'focus' in c) return c.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
