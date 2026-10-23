import { useEffect, useRef } from 'react'

// EventSource native API'si Authorization header taşımadığı için fetch + ReadableStream
// kullanıyoruz. Token URL query'de gözükmez — access log/referer/history sızıntısı yok.
// credentials: 'include' ile httpOnly cookie de gönderilir (staff login).
//
// onEvent({ event: 'message' | <named>, data: parsed JSON })
//
// Aynı akışa (url + token) bağlanan tüm kancalar TEK bağlantıyı paylaşır; son kanca ayrılınca kapanır.
// Eskiden her kanca (kenar menüsü, zil, panel, doluluk, çamaşır, kampüs haritası) ayrı akış açıyordu: panel
// sekmesi tek başına 4 akış — sunucunun kişi başı 4 bağlantı sınırı ikinci sekmede aşılıyor, sunucu en eskiyi
// kesiyor, kanca yeniden bağlanıp bir başkasını düşürüyordu (11 Eki 2026: bir günde 2.755 bağlantı).
// Bağlantı koparsa yeniden bağlanır; hemen kopan bağlantıda bekleme 5 → 10 → 20 … 60 sn'ye katlanır,
// en az 30 sn sağlam kalan bağlantıdan sonra yeniden 5 sn olur.
const RETRY_MIN_MS = 5_000
const RETRY_MAX_MS = 60_000
const STABLE_MS = 30_000

const streams = new Map()

function parseChunk(chunk) {
  let event = 'message'
  let data = null
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7).trim()
    else if (line.startsWith('data: ')) {
      try { data = JSON.parse(line.slice(6)) } catch { /* ignore */ }
    }
  }
  return data === null ? null : { event, data }
}

function openStream(url, token) {
  const stream = { listeners: new Set(), abortCtrl: null, retryTimeout: null, delay: RETRY_MIN_MS, closed: false }

  async function connect() {
    const abortCtrl = new AbortController()
    stream.abortCtrl = abortCtrl
    const startedAt = Date.now()
    try {
      const headers = { Accept: 'text/event-stream' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(url, { headers, credentials: 'include', signal: abortCtrl.signal })
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (!stream.closed) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const chunks = buf.split('\n\n')
        buf = chunks.pop()
        for (const chunk of chunks) {
          const message = parseChunk(chunk)
          if (!message) continue
          for (const listener of [...stream.listeners]) {
            try { listener(message) } catch { /* bir dinleyicinin hatası diğerlerini bozmasın */ }
          }
        }
      }
    } catch { /* ağ kopması veya 401 — retry */ }

    if (stream.closed) return
    if (Date.now() - startedAt >= STABLE_MS) stream.delay = RETRY_MIN_MS
    const wait = stream.delay
    stream.delay = Math.min(stream.delay * 2, RETRY_MAX_MS)
    stream.retryTimeout = setTimeout(connect, wait)
  }

  connect()
  return stream
}

function subscribe(url, token, listener) {
  const key = `${url}|${token || ''}`
  let stream = streams.get(key)
  if (!stream) {
    stream = openStream(url, token)
    streams.set(key, stream)
  }
  stream.listeners.add(listener)
  return () => {
    stream.listeners.delete(listener)
    if (stream.listeners.size) return
    stream.closed = true
    clearTimeout(stream.retryTimeout)
    try { stream.abortCtrl?.abort() } catch { /* ignore */ }
    if (streams.get(key) === stream) streams.delete(key)
  }
}

export function useEventStream(url, token, onEvent) {
  // Her olayda en güncel onEvent çağrılır: kapanış değişince bağlantıyı yeniden kurmaya gerek yok.
  const handler = useRef(onEvent)
  useEffect(() => { handler.current = onEvent })
  useEffect(() => subscribe(url, token, message => handler.current(message)), [url, token])
}
