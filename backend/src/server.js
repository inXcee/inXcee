import app from './app.js'
import { initDB, getDB } from './shared/db/index.js'
import { initProdDB } from './shared/db/initProd.js'
import { startCronJobs } from './shared/cron/index.js'
import { seedDev } from './shared/db/seed.js'

// Zorunlu env kontrolü (Task 1'de eklendi)
if (!process.env.JWT_SECRET) {
  console.error('[Startup] HATA: JWT_SECRET env değişkeni tanımlı değil.')
  console.error('[Startup] .env dosyanıza JWT_SECRET=guclu-rastgele-deger ekleyin.')
  process.exit(1)
}

process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err)
  process.exit(1)
})

initDB()

if (process.env.NODE_ENV === 'production') {
  initProdDB()
} else {
  seedDev()
}

startCronJobs()

const port = process.env.PORT || 3001
const server = app.listen(port, () => console.log(`YYS Backend http://localhost:${port}`))

process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM alındı, bağlantılar kapatılıyor...')
  server.close(() => {
    try { getDB().close() } catch { /* ignore */ }
    console.log('[Shutdown] Tamamlandı')
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10000)
})
