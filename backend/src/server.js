import app from './app.js'
import { initDB } from './shared/db/index.js'
import { startCronJobs } from './shared/cron/index.js'
import { seedDev } from './shared/db/seed.js'

// Zorunlu env kontrolü
if (!process.env.JWT_SECRET) {
  console.error('[Startup] HATA: JWT_SECRET env değişkeni tanımlı değil.')
  console.error('[Startup] .env dosyanıza JWT_SECRET=guclu-rastgele-deger ekleyin.')
  process.exit(1)
}

initDB()
seedDev()
startCronJobs()

const port = process.env.PORT || 3001
app.listen(port, () => console.log(`YYS Backend http://localhost:${port}`))
