import {
  insertErrorLogQuery, listErrorLogsQuery, getErrorLogQuery,
  deleteErrorLogQuery, clearErrorLogQuery, countErrorLogsQuery,
} from './queries.js'

const VALID_SOURCES = new Set(['frontend', 'backend'])
const VALID_SEVERITIES = new Set(['error', 'warning'])

export function reportErrorService({ source, severity, message, stack, url, user_id, user_agent, context }) {
  if (!VALID_SOURCES.has(source)) return { error: 'Geçersiz source', status: 400 }
  if (severity && !VALID_SEVERITIES.has(severity)) return { error: 'Geçersiz severity', status: 400 }
  if (!message || String(message).trim().length === 0) return { error: 'Mesaj zorunlu', status: 400 }
  try {
    const id = insertErrorLogQuery({ source, severity, message, stack, url, user_id, user_agent, context })
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
