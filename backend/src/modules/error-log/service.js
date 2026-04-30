import {
  insertErrorLogQuery, listErrorLogsQuery, getErrorLogQuery,
  deleteErrorLogQuery, clearErrorLogQuery, countErrorLogsQuery,
} from './queries.js'

const VALID_SOURCES = new Set(['frontend', 'backend'])
const VALID_SEVERITIES = new Set(['error', 'warning'])

// Anonim POST endpoint'i flood'a karsi savunma — alanlari sinirla.
const MAX_MESSAGE = 500
const MAX_STACK = 4000
const MAX_URL = 500
const MAX_UA = 500
const MAX_CONTEXT_JSON = 2000

const truncate = (val, max) => {
  if (val == null) return val
  const s = String(val)
  return s.length > max ? s.slice(0, max) : s
}

export function reportErrorService({ source, severity, message, stack, url, user_id, user_agent, context }) {
  if (!VALID_SOURCES.has(source)) return { error: 'Geçersiz source', status: 400 }
  if (severity && !VALID_SEVERITIES.has(severity)) return { error: 'Geçersiz severity', status: 400 }
  if (!message || String(message).trim().length === 0) return { error: 'Mesaj zorunlu', status: 400 }

  let contextJson = context
  if (context && typeof context === 'object') {
    try {
      const json = JSON.stringify(context)
      contextJson = json.length > MAX_CONTEXT_JSON ? json.slice(0, MAX_CONTEXT_JSON) : context
    } catch { contextJson = null }
  } else if (typeof context === 'string') {
    contextJson = truncate(context, MAX_CONTEXT_JSON)
  }

  try {
    const id = insertErrorLogQuery({
      source, severity,
      message: truncate(message, MAX_MESSAGE),
      stack: truncate(stack, MAX_STACK),
      url: truncate(url, MAX_URL),
      user_id,
      user_agent: truncate(user_agent, MAX_UA),
      context: contextJson,
    })
    return { ok: true, id }
  } catch (e) {
    // Hata kaydederken hata atarsak konsola yaz, response yine ok dön (loop'a girmesin)
    console.error('[ErrorLog] insert hatası:', e.message)
    return { ok: false }
  }
}

export function listErrorsService(filters) {
  return {
    items: listErrorLogsQuery(filters),
    total: countErrorLogsQuery(filters),
  }
}

export function getErrorService(id) {
  const row = getErrorLogQuery(id)
  if (!row) return { error: 'Kayıt bulunamadı', status: 404 }
  return row
}

export function deleteErrorService(id) {
  deleteErrorLogQuery(id)
  return { ok: true }
}

export function clearErrorsService() {
  const r = clearErrorLogQuery()
  return { ok: true, deleted: r.changes }
}
