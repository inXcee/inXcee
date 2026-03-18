import app from './app.js'
import { initDB } from './shared/db/index.js'
import { startCronJobs } from './shared/cron/index.js'
import { seedDev } from './shared/db/seed.js'

initDB()
seedDev()
startCronJobs()

const port = process.env.PORT || 3001
app.listen(port, () => console.log(`YYS Backend http://localhost:${port}`))
