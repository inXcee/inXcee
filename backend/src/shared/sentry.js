// Sentry error tracking — env-driven, test ortaminda no-op.
// PII scrubbing: request.data, headers, cookies, user.ip_address/email/username silinir.
//
// Sentry v9 API kullanir. Auto-instrumentation (OpenTelemetry) devre disi —
// sadece error tracking + manuel captureException icin yeterli, daha hafif.

import * as Sentry from '@sentry/node'
import { logger } from './logger.js'

let initialized = false

export function _scrubEvent(event) {
  if (event?.request) {
    delete event.request.data
    delete event.request.headers
    delete event.request.cookies
  }
  if (event?.user) {
    delete event.user.ip_address
    delete event.user.email
    delete event.user.username
  }
  return event
}

export function initSentry() {
  if (process.env.NODE_ENV === 'test') return false
  if (!process.env.SENTRY_DSN) {
    logger.info('[Sentry] SENTRY_DSN yok — error tracking devre disi')
    return false
  }
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    sendDefaultPii: false,
    // Auto-instrumentation kapali — request body/headers'in Sentry'ye gitmesini
    // engellemenin en kestirme yolu. Sadece manuel captureException + Express
    // error handler kullaniyoruz.
    defaultIntegrations: false,
    beforeSend: _scrubEvent,
  })
  initialized = true
  logger.info('[Sentry] error tracking aktif')
  return true
}

export function captureError(err, ctx = {}) {
  if (!initialized) return
  Sentry.withScope(scope => {
    if (ctx.userId) scope.setUser({ id: String(ctx.userId) })
    if (ctx.module) scope.setTag('module', ctx.module)
    Sentry.captureException(err)
  })
}

// Express app'e error handler bagla. initSentry() cagrilmadiysa no-op.
// shouldHandleError: sadece 5xx hatalari Sentry'ye gider, 4xx normal akis.
export function setupExpressErrorHandler(app) {
  if (!initialized) return
  Sentry.setupExpressErrorHandler(app, {
    shouldHandleError: (err) => {
      const status = err.status || err.statusCode || 500
      return status >= 500
    },
  })
}
