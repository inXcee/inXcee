import { useEffect, useRef } from 'react'
import { useMobileAuth } from '../../modules/mobile/auth/useMobileAuth.js'

export function useMobileSSE(onEvent) {
  const token = useMobileAuth(s => s.token)
  // onEvent referansını ref'le tut — re-render'da useEffect tetiklenmesin
  const onEventRef = useRef(onEvent)
  useEffect(() => { onEventRef.current = onEvent }, [onEvent])

  useEffect(() => {
    if (!token) return
    let active = true
    let retryTimeout = null
    const abortCtrl = new AbortController()

    async function connect() {
      try {
        const res = await fetch('/api/notifications/stream', {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortCtrl.signal,
        })
        if (!res.ok || !res.body) throw new Error('SSE connect failed')

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
            for (const line of chunk.split('\n')) {
              if (line.startsWith('data: ')) {
                try { onEventRef.current(JSON.parse(line.slice(6))) } catch { /* malformed event */ }
              }
            }
          }
        }
      } catch { /* abort/network — sessizce retry */ }

      if (active) retryTimeout = setTimeout(connect, 5000)
    }

    connect()
    return () => {
      active = false
      clearTimeout(retryTimeout)
      // fetch stream'i abort et — yoksa background'da reader.read() devam eder
      abortCtrl.abort()
    }
  }, [token])
}
