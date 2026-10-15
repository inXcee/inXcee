// Hermes Agent API sunucusu istemcisi (yalnız sunucu içi: 127.0.0.1:8642).
// Anahtar .env'de DEĞİL, root'a ait dosyada durur (varsayılan /etc/avskamp/hermes-api.key, 600) — aynı anahtar
// Hermes'in ~/.hermes/config.yaml → platforms.api_server.key alanında. Dosya yoksa özellik kapalı sayılır (503).
import { readFileSync } from 'node:fs'

const DEFAULT_URL = 'http://127.0.0.1:8642'
const DEFAULT_KEY_FILE = '/etc/avskamp/hermes-api.key'

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode })

export function hermesConfig() {
  const baseUrl = (process.env.HERMES_API_URL || DEFAULT_URL).replace(/\/+$/, '')
  let key = ''
  try { key = readFileSync(process.env.HERMES_API_KEY_FILE || DEFAULT_KEY_FILE, 'utf8').trim() } catch { /* yok */ }
  return { baseUrl, key, configured: key.length >= 16 }
}

// Hermes oturum / çalıştırma kimlikleri yola girer → yalnız güvenli karakterler.
export const SAFE_ID = /^[A-Za-z0-9_.:-]{1,128}$/

export async function hermesFetch(path, { method = 'GET', body, signal, timeoutMs = 15_000 } = {}) {
  const { baseUrl, key, configured } = hermesConfig()
  if (!configured) throw fail('Sesli Hermes bu sunucuda yapılandırılmamış', 503)
  const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : null
  const signals = [signal, timeout].filter(Boolean)
  let res
  try {
    res = await fetch(baseUrl + path, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw fail('Hermes\'e ulaşılamıyor', 502)
  }
  if (!res.ok) {
    let detail = ''
    try { const j = await res.json(); detail = j?.error?.message || j?.error || j?.message || '' } catch { /* gövde yok */ }
    const status = res.status === 429 ? 429 : res.status === 404 ? 404 : res.status === 400 ? 400 : 502
    throw fail(status === 429 ? 'Hermes şu an başka bir işle meşgul, biraz sonra tekrar dene'
      : `Hermes yanıtı ${res.status}${detail ? `: ${String(detail).slice(0, 200)}` : ''}`, status)
  }
  return res
}

export async function hermesHealth() {
  try {
    const res = await hermesFetch('/health', { timeoutMs: 3000 })
    return (await res.json())?.status === 'ok'
  } catch { return false }
}

export async function createHermesSession(title) {
  const res = await hermesFetch('/api/sessions', { method: 'POST', body: { title } })
  const j = await res.json()
  const id = j?.session?.id || j?.id
  if (!id || !SAFE_ID.test(id)) throw fail('Hermes oturum açamadı', 502)
  return id
}

// Tek tur, SSE akışı. Uzun araç zincirleri dakikalar sürebilir → zaman aşımı yok; iptal sinyalle.
export function hermesChatStream(sessionId, { input, instructions }, { signal } = {}) {
  return hermesFetch(`/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`, {
    method: 'POST', body: { input, instructions }, signal, timeoutMs: 0,
  })
}

export async function hermesRunApproval(runId, { choice, request_id }) {
  const res = await hermesFetch(`/v1/runs/${encodeURIComponent(runId)}/approval`, {
    method: 'POST', body: { choice, ...(request_id ? { request_id } : {}) },
  })
  return res.json()
}

export async function hermesRunStop(runId) {
  const res = await hermesFetch(`/v1/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST', body: {} })
  return res.json()
}
