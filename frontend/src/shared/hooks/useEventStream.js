import { useEffect } from 'react'

// EventSource native API'si Authorization header taşımadığı için fetch + ReadableStream
// kullanıyoruz. Token URL query'de gözükmez — access log/referer/history sızıntısı yok.
// credentials: 'include' ile httpOnly cookie de gönderilir (staff login).
//
// onEvent({ event: 'message' | <named>, data: parsed JSON })
// Bağlantı koparsa 5sn sonra otomatik reconnect. Component unmount'ta kapanır.
export function useEventStream(url, token, onEvent, deps = []) {
  useEffect(() => {
    // token yoksa cookie ile devam — her iki auth yöntemi desteklenir
    let active = true
    let retryTimeout = null
    let abortCtrl = null

    async function connect() {
      abortCtrl = new AbortController()
      try {
        const headers = { Accept: 'text/event-stream' }
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch(url, {
          headers,
          credentials: 'include',
          signal: abortCtrl.signal,
        })
        if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (active) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const chunks = buf.split('\n\n')
          buf = chunks.pop()
          for (const chunk of chunks) {
            let event = 'message'
            let data = null
            for (const line of chunk.split('\n')) {
              if (line.startsWith('event: ')) event = line.slice(7).trim()
              else if (line.startsWith('data: ')) {
                try { data = JSON.parse(line.slice(6)) } catch { /* ignore */ }
              }
            }
            if (data !== null) onEvent({ event, data })
          }
        }
      } catch { /* ağ kopması veya 401 — retry */ }

      if (active) retryTimeout = setTimeout(connect, 5000)
    }

    connect()
    return () => {
      active = false
      clearTimeout(retryTimeout)
      try { abortCtrl?.abort() } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token, ...deps])
}
