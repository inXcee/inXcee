import { useEffect } from 'react'
import { useMobileAuth } from '../../modules/mobile/auth/useMobileAuth.js'

export function useMobileSSE(onEvent) {
  const token = useMobileAuth(s => s.token)

  useEffect(() => {
    if (!token) return
    let active = true
    let retryTimeout = null

    async function connect() {
      try {
        const res = await fetch('/api/notifications/stream', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || !res.body) throw new Error('SSE connect failed')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (active) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          // SSE events are separated by double newline
          const chunks = buf.split('\n\n')
          buf = chunks.pop()
          for (const chunk of chunks) {
            for (const line of chunk.split('\n')) {
              if (line.startsWith('data: ')) {
                try { onEvent(JSON.parse(line.slice(6))) } catch {}
              }
            }
          }
        }
      } catch {}

      if (active) retryTimeout = setTimeout(connect, 5000)
    }

    connect()
    return () => { active = false; clearTimeout(retryTimeout) }
  }, [token])
}
