const url = process.env.BACKEND_HEALTH_URL || 'http://localhost:3001/api/health'
const timeoutMs = Number(process.env.BACKEND_WAIT_TIMEOUT_MS || 30000)
const intervalMs = Number(process.env.BACKEND_WAIT_INTERVAL_MS || 500)
const startedAt = Date.now()

async function waitForBackend() {
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1500)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)

      if (res.ok) {
        const body = await res.json().catch(() => ({}))
        if (!body.status || body.status === 'ok') {
          console.log(`[dev] Backend hazir: ${url}`)
          return
        }
      }
    } catch {
      // Backend is still booting.
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  console.error(`[dev] Backend ${timeoutMs}ms icinde hazir olmadi: ${url}`)
  process.exit(1)
}

await waitForBackend()
