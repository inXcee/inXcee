// Frontend hatalarını backend'e gönderir.
// - Aynı hatayı 60sn içinde tekrar göndermez (signature: message+stack[0..200])
// - Network/CORS hatası varsa sessiz başarısız olur (loop'a girmesin)
// - axios kullanmıyor: bağımlılık zincirini sade tut, axios interceptor recursion riski yok

const RECENT = new Map() // signature -> timestamp
const COOLDOWN = 60_000

function signature(message, stack) {
  return `${message || ''}::${(stack || '').slice(0, 200)}`
}

function shouldSend(sig) {
  const now = Date.now()
  const last = RECENT.get(sig)
  if (last && now - last < COOLDOWN) return false
  RECENT.set(sig, now)
  // Map büyümesin
  if (RECENT.size > 50) {
    const first = RECENT.keys().next().value
    RECENT.delete(first)
  }
  return true
}

export function reportError({ message, stack, url, severity = 'error', context }) {
  if (!message) return
  const sig = signature(message, stack)
  if (!shouldSend(sig)) return

  const token = (() => {
    try { return JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token } catch { return null }
  })()

  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  // Fire-and-forget — hata loglarken hata olursa sus
  fetch('/api/error-log', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source: 'frontend',
      severity,
      message: String(message).slice(0, 1000),
      stack: stack ? String(stack).slice(0, 4000) : undefined,
      url: url || (typeof window !== 'undefined' ? window.location.pathname : undefined),
      context,
    }),
    keepalive: true,
  }).catch(() => { /* sessiz */ })
}

export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return
  if (window.__yysErrorHandlersInstalled) return
  window.__yysErrorHandlersInstalled = true

  window.addEventListener('error', (event) => {
    // ResourceLoadError gibi script hatalarını da yakala
    const msg = event.message || event.error?.message || 'Bilinmeyen hata'
    reportError({
      message: msg,
      stack: event.error?.stack,
      context: { line: event.lineno, col: event.colno, source: event.filename },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const msg = reason?.message || (typeof reason === 'string' ? reason : 'Unhandled promise rejection')
    reportError({
      message: msg,
      stack: reason?.stack,
      context: { type: 'unhandledrejection' },
    })
  })
}
