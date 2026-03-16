import app from './app.js'
import { initDB } from './shared/db/index.js'
import { startCronJobs } from './shared/cron/index.js'
import { seedDev } from './shared/db/seed.js'

initDB()
seedDev()
startCronJobs()

app.listen(3001, () => console.log('YYS Backend http://localhost:3001'))
