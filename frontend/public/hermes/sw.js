// Sesli Hermes service worker — kapsam /hermes/ (kökteki YYS SW'sinden daha özel → bu sayfaları o yönetmez).
// Yalnız sayfa açılışını ele alır: ağ yoksa kısa bir "bağlantı yok" sayfası. API / akış isteklerine dokunmaz,
// hiçbir şey önbelleğe almaz (yanıtlar kişiye özel ve sayfa küçük).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

const OFFLINE = '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Hermes</title><body><h1>Hermes</h1><p>Bağlantı yok. İnternet gelince yeniden aç.</p></body></html>'

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, {
    status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })))
})
