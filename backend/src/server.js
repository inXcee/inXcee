import { initSentry } from './shared/sentry.js'
import { initDB, getDB } from './shared/db/index.js'
import { initProdDB } from './shared/db/initProd.js'
import { startCronJobs } from './shared/cron/index.js'
import { seedDev } from './shared/db/seed.js'
import { logger } from './shared/logger.js'
import { startWorker, stopWorker } from './shared/jobs/index.js'

// ESM statik importlari modul govdesinden once calisir. App'i dinamik yukleyerek
// Express Sentry hata middleware'inin init sonrasinda kurulmasini garanti et.
initSentry()
const { default: app } = await import('./app.js')

// Zorunlu env kontrolü (Task 1'de eklendi)
if (!process.env.JWT_SECRET) {
  logger.error('[Startup] HATA: JWT_SECRET env değişkeni tanımlı değil.')
  logger.error('[Startup] .env dosyanıza JWT_SECRET=guclu-rastgele-deger ekleyin.')
  process.exit(1)
}

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, '[UnhandledRejection]')
})
process.on('uncaughtException', (err) => {
  logger.fatal(err, '[UncaughtException]')
  process.exit(1)
})

initDB()

if (process.env.NODE_ENV === 'production') {
  initProdDB()
} else {
  seedDev()
}

startCronJobs()
startWorker()

const port = process.env.PORT || 3001
const server = app.listen(port, () => logger.info({ port }, `YYS Backend http://localhost:${port}`))

// Reverse proxy ile uyum: Render/AWS ALB default 60sn idle, nginx default 75sn.
// keepAliveTimeout proxy'den BÜYÜK olmalı yoksa yarış durumunda 502 gelir.
// headersTimeout > keepAliveTimeout kuralı (Node.js best practice).
// SSE bağlantıları için requestTimeout=0 (sınırsız) — 60sn'de bildirim akışı kopmasın.
server.keepAliveTimeout = 65_000
server.headersTimeout = 66_000
server.requestTimeout = 0

process.on('SIGTERM', () => {
  logger.info('[Shutdown] SIGTERM alındı, bağlantılar kapatılıyor...')
  stopWorker()
  server.close(() => {
    try { getDB().close() } catch { /* ignore */ }
    logger.info('[Shutdown] Tamamlandı')
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10000)
})
